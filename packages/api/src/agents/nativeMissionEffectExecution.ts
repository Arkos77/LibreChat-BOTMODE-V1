import type {
  NativeMissionEffectIdentity,
  NativeMissionEffectCommit,
  NativeMissionEffectOutcome,
} from '~/stream/nativeMissionEffectReceipts';

/**
 * Fail-closed executor seam for ONE already-authorized native mission effect.
 *
 * This is deliberately NOT connected to arbitrary tools yet. A recovered
 * mission cannot execute until EVERY tool path (ordinary, code/PTC, detached,
 * host file actions) uses the same durable receipt and replay policy.
 *
 * The authorizer must verify current user, tenant, agent permissions and tool
 * grants. The private result store MUST persist a complete immutable result,
 * and loadCommittedResult MUST authenticate and verify resultDigest before
 * returning it. No raw tool args or outputs are stored in the Redis hash.
 *
 * A "started" receipt without commit may represent an effect that occurred
 * just before SIGKILL. Never retry it, even after another owner takes over.
 */
export class NativeMissionEffectUncertainError extends Error {
  constructor() {
    super('NATIVE_MISSION_EFFECT_UNCERTAIN_RECONCILIATION_REQUIRED');
    this.name = 'NativeMissionEffectUncertainError';
  }
}

export interface NativeMissionEffectReceiptStore {
  reserveNativeMissionEffect(
    identity: NativeMissionEffectIdentity,
  ): Promise<NativeMissionEffectOutcome>;
  commitNativeMissionEffect(
    receipt: NativeMissionEffectCommit,
  ): Promise<NativeMissionEffectOutcome>;
  readNativeMissionEffect(
    identity: NativeMissionEffectIdentity,
  ): Promise<NativeMissionEffectOutcome & { resultRef?: string; resultDigest?: string }>;
}

export interface NativeMissionEffectExecutionOptions<T> {
  store: NativeMissionEffectReceiptStore;
  identity: NativeMissionEffectIdentity;
  /** Must re-evaluate CURRENT rights; never reuse checkpointed grants. */
  assertAuthorized: () => Promise<void>;
  /** Only invoked after Redis atomically reserves the intent. */
  execute: () => Promise<T>;
  /** Durably persist an immutable private result BEFORE committing its receipt. */
  persistResult: (result: T) => Promise<{ resultRef: string; resultDigest: string }>;
  /** Return only authenticated, digest-verified persisted results. */
  loadCommittedResult: (resultRef: string, resultDigest: string) => Promise<T>;
}

export async function executeNativeMissionEffectFenced<T>({
  store,
  identity,
  assertAuthorized,
  execute,
  persistResult,
  loadCommittedResult,
}: NativeMissionEffectExecutionOptions<T>): Promise<T> {
  if (
    !store ||
    typeof store.reserveNativeMissionEffect !== 'function' ||
    typeof store.commitNativeMissionEffect !== 'function' ||
    typeof store.readNativeMissionEffect !== 'function' ||
    typeof assertAuthorized !== 'function' ||
    typeof execute !== 'function' ||
    typeof persistResult !== 'function' ||
    typeof loadCommittedResult !== 'function'
  ) {
    throw new NativeMissionEffectUncertainError();
  }
  await assertAuthorized();
  const reserved = await store.reserveNativeMissionEffect(identity);

  if (!reserved.accepted) {
    if (reserved.reason !== 'already_committed') {
      throw new NativeMissionEffectUncertainError();
    }
    // The external effect must NOT run again. Reuse only a verified immutable
    // output from the private durable result store.
    const prior = await store.readNativeMissionEffect(identity);
    if (
      !prior.accepted ||
      prior.reason !== 'committed' ||
      typeof prior.resultRef !== 'string' ||
      prior.resultRef.length === 0 ||
      typeof prior.resultDigest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(prior.resultDigest)
    ) {
      throw new NativeMissionEffectUncertainError();
    }
    await assertAuthorized();
    return loadCommittedResult(prior.resultRef, prior.resultDigest);
  }
  if (reserved.reason !== 'reserved') {
    throw new NativeMissionEffectUncertainError();
  }

  // From here an exception does NOT make it safe to call execute again.
  // The persistent receipt must remain "started"/uncertain in that case.
  await assertAuthorized();
  const result = await execute();
  const saved = await persistResult(result);
  if (
    !saved ||
    typeof saved.resultRef !== 'string' ||
    saved.resultRef.length === 0 ||
    saved.resultRef.length > 256 ||
    typeof saved.resultDigest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(saved.resultDigest)
  ) {
    throw new NativeMissionEffectUncertainError();
  }
  const committed = await store.commitNativeMissionEffect({ ...identity, ...saved });
  if (!committed.accepted || committed.reason !== 'committed') {
    throw new NativeMissionEffectUncertainError();
  }
  await assertAuthorized();
  return result;
}
