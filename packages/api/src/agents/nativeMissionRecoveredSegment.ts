/**
 * Owner-fenced segment of an already qualified native mission recovery.
 * This does not authorize replay: callers MUST rebuild the authentic graph,
 * fence ALL effect paths and check current permissions before entering it.
 * Kept separate from server registration until those obligations are met.
 */
export interface RecoveredSegmentStore {
  beginRecoveredMissionProviderExecution(
    streamId: string,
    createdAt: number,
    owner: string,
    provider: string,
    namespace: string,
    leaseMs: number,
  ): Promise<boolean>;
  heartbeatRecoveredMissionProvider(
    streamId: string,
    createdAt: number,
    owner: string,
    provider: string,
    namespace: string,
    leaseMs: number,
  ): Promise<boolean>;
  transitionRecoveredMissionToComplete(
    streamId: string,
    createdAt: number,
    owner: string,
    provider: string,
    namespace: string,
  ): Promise<boolean>;
}

export interface RecoveredSegmentIdentity {
  streamId: string;
  createdAt: number;
  ownerToken: string;
  providerExecutionId: string;
  checkpointNamespace: string;
}

/** Fatal ownership loss must be propagated to the caller, not turned into success. */
export class RecoveredSegmentOwnershipLost extends Error {
  constructor() {
    super('NATIVE_MISSION_RECOVERY_OWNERSHIP_LOST');
  }
}

export async function executeRecoveredMissionSegment({
  store,
  identity,
  assertAuthorized,
  assertEffectFencesReady,
  continueGraph,
  verifyOracle,
  publishTerminal,
  leaseMs = 15000,
  heartbeatMs = 4000,
}: {
  store: RecoveredSegmentStore;
  identity: RecoveredSegmentIdentity;
  assertAuthorized: () => Promise<void>;
  assertEffectFencesReady: () => Promise<void>;
  continueGraph: (signal: AbortSignal) => Promise<void>;
  verifyOracle: () => Promise<void>;
  publishTerminal: () => Promise<void>;
  leaseMs?: number;
  heartbeatMs?: number;
}): Promise<void> {
  if (
    !store ||
    !identity ||
    !identity.streamId ||
    !identity.ownerToken ||
    !identity.providerExecutionId ||
    !identity.checkpointNamespace ||
    !Number.isSafeInteger(identity.createdAt) ||
    identity.createdAt <= 0 ||
    !Number.isSafeInteger(leaseMs) ||
    leaseMs < 3000 ||
    !Number.isSafeInteger(heartbeatMs) ||
    heartbeatMs <= 0 ||
    heartbeatMs * 2 >= leaseMs ||
    typeof assertAuthorized !== 'function' ||
    typeof assertEffectFencesReady !== 'function' ||
    typeof continueGraph !== 'function' ||
    typeof verifyOracle !== 'function' ||
    typeof publishTerminal !== 'function' ||
    typeof store.beginRecoveredMissionProviderExecution !== 'function' ||
    typeof store.heartbeatRecoveredMissionProvider !== 'function' ||
    typeof store.transitionRecoveredMissionToComplete !== 'function'
  )
    throw new RecoveredSegmentOwnershipLost();

  const args = [
    identity.streamId,
    identity.createdAt,
    identity.ownerToken,
    identity.providerExecutionId,
    identity.checkpointNamespace,
  ] as const;
  await assertAuthorized();
  await assertEffectFencesReady();
  if (!(await store.beginRecoveredMissionProviderExecution(...args, leaseMs))) {
    throw new RecoveredSegmentOwnershipLost();
  }
  const abort = new AbortController();
  let failed: unknown;
  let inFlight: Promise<void> | null = null;
  const pulse = (): Promise<void> => {
    if (failed) return Promise.reject(failed);
    // A concurrent timer heartbeat must be joined before terminal CAS:
    // returning early while it is still checking ownership is not safe.
    if (inFlight) return inFlight;
    const attempt = (async () => {
      try {
        if (!(await store.heartbeatRecoveredMissionProvider(...args, leaseMs))) {
          throw new RecoveredSegmentOwnershipLost();
        }
      } catch (error) {
        failed = error;
        abort.abort();
        throw error;
      }
    })();
    inFlight = attempt;
    void attempt
      .finally(() => {
        if (inFlight === attempt) inFlight = null;
      })
      .catch(() => {});
    return attempt;
  };
  const interval = setInterval(() => {
    void pulse().catch(() => {});
  }, heartbeatMs);
  try {
    await continueGraph(abort.signal);
    if (failed || abort.signal.aborted) throw failed ?? new RecoveredSegmentOwnershipLost();
    await assertAuthorized();
    await assertEffectFencesReady();
    await verifyOracle();
    // Oracle can perform asynchronous work. Its verdict does not preserve
    // permissions or tool replay safety across that time window.
    await assertAuthorized();
    await assertEffectFencesReady();
    await pulse();
    if (failed || abort.signal.aborted) throw failed ?? new RecoveredSegmentOwnershipLost();
    // Only a still-owned, Oracle-approved generation can become terminal.
    // The caller's publication barrier must independently prevent duplicates.
    if (!(await store.transitionRecoveredMissionToComplete(...args))) {
      throw new RecoveredSegmentOwnershipLost();
    }
    await publishTerminal();
  } finally {
    clearInterval(interval);
    abort.abort();
  }
}

/**
 * Bridge between the durable Mongo head/Redis claim gate and the fenced
 * recovered-provider segment. Requires a reconstructed authentic graph and
 * live authorization/replay receipts supplied by the server. It deliberately
 * does not synthesize users, agent contexts, tools or Oracle verdicts.
 * Until every tool path and terminal publication callback is wired, the host
 * MUST NOT register this as its production recovery handler.
 */
export async function qualifyAndExecuteRecoveredMissionSegment({
  manager,
  claim,
  graph,
  assertAuthorized,
  assertReplaySafeForPendingNodes,
  assertEffectFencesReady,
  continueGraph,
  verifyOracle,
  publishTerminal,
}: {
  manager: {
    getJobStore: () => RecoveredSegmentStore;
    qualifyReconstructedGraphAndActivateClaim: (
      claim: Omit<RecoveredSegmentIdentity, 'providerExecutionId'> & { checkpointId: string },
      graph: { getState: (config: { configurable: Record<string, string> }) => Promise<unknown> },
      assertAuthorized: () => Promise<void>,
      assertReplaySafeForPendingNodes: (nodes: readonly string[]) => Promise<void>,
    ) => Promise<{ providerExecutionId: string } | null>;
  };
  claim: Omit<RecoveredSegmentIdentity, 'providerExecutionId'> & { checkpointId: string };
  graph: { getState: (config: { configurable: Record<string, string> }) => Promise<unknown> };
  assertAuthorized: () => Promise<void>;
  assertReplaySafeForPendingNodes: (nodes: readonly string[]) => Promise<void>;
  assertEffectFencesReady: () => Promise<void>;
  continueGraph: (signal: AbortSignal) => Promise<void>;
  verifyOracle: () => Promise<void>;
  publishTerminal: () => Promise<void>;
}): Promise<boolean> {
  if (
    !manager ||
    typeof manager.getJobStore !== 'function' ||
    typeof manager.qualifyReconstructedGraphAndActivateClaim !== 'function' ||
    !graph ||
    typeof graph.getState !== 'function' ||
    !claim ||
    typeof claim.checkpointId !== 'string' ||
    !claim.checkpointId ||
    typeof assertAuthorized !== 'function' ||
    typeof assertReplaySafeForPendingNodes !== 'function' ||
    typeof assertEffectFencesReady !== 'function' ||
    typeof continueGraph !== 'function' ||
    typeof verifyOracle !== 'function' ||
    typeof publishTerminal !== 'function'
  )
    return false;
  // The manager owns claim release on failed head/authority/receipt checks.
  const activated = await manager.qualifyReconstructedGraphAndActivateClaim(
    claim,
    graph,
    assertAuthorized,
    assertReplaySafeForPendingNodes,
  );
  if (!activated?.providerExecutionId) return false;
  await executeRecoveredMissionSegment({
    store: manager.getJobStore(),
    identity: { ...claim, providerExecutionId: activated.providerExecutionId },
    assertAuthorized,
    assertEffectFencesReady,
    continueGraph,
    verifyOracle,
    publishTerminal,
  });
  return true;
}
