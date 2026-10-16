import type { NativeMissionEffectIdentity } from '~/stream/nativeMissionEffectReceipts';
import type { NativeMissionEffectReceiptStore } from './nativeMissionEffectExecution';
import {
  executeNativeMissionEffectFenced,
  NativeMissionEffectUncertainError,
} from './nativeMissionEffectExecution';

/** An inner PTC invocation. Its sequence is ephemeral, NOT a durable operation ID. */
export interface NativeMissionPtcInvocation {
  parentToolCallId: string;
  name: string;
  sequence: number;
  input: unknown;
  config: unknown;
  invoke: () => Promise<unknown>;
}

/** The host must derive this identity from a persisted mission plan / checkpoint.
 * It must NOT use the local invocation sequence or the current process ID.
 */
export interface NativeMissionPtcGuardDependencies {
  store: NativeMissionEffectReceiptStore;
  resolvePersistedIdentity: (
    call: NativeMissionPtcInvocation,
  ) => Promise<NativeMissionEffectIdentity | null>;
  assertAuthorized: (call: NativeMissionPtcInvocation) => Promise<void>;
  persistResult: (
    call: NativeMissionPtcInvocation,
    result: unknown,
  ) => Promise<{
    resultRef: string;
    resultDigest: string;
  }>;
  loadCommittedResult: (
    call: NativeMissionPtcInvocation,
    resultRef: string,
    resultDigest: string,
  ) => Promise<unknown>;
}

/** An injection for ToolExecuteOptions.guardPtcEffect, NOT an optional telemetry hook.
 * Failure to resolve a persisted identity never permits the underlying tool
 * to run. The executor additionally rejects uncertain or stale Redis receipts.
 */
export function createNativeMissionPtcEffectGuard(deps: NativeMissionPtcGuardDependencies) {
  return async (call: NativeMissionPtcInvocation): Promise<unknown> => {
    if (
      !deps ||
      !deps.store ||
      typeof deps.resolvePersistedIdentity !== 'function' ||
      typeof deps.assertAuthorized !== 'function' ||
      typeof deps.persistResult !== 'function' ||
      typeof deps.loadCommittedResult !== 'function'
    ) {
      throw new NativeMissionEffectUncertainError();
    }
    await deps.assertAuthorized(call);
    const identity = await deps.resolvePersistedIdentity(call);
    if (
      !identity ||
      typeof identity.streamId !== 'string' ||
      !identity.streamId ||
      !Number.isSafeInteger(identity.createdAt) ||
      identity.createdAt <= 0 ||
      typeof identity.checkpointNamespace !== 'string' ||
      !identity.checkpointNamespace ||
      typeof identity.providerExecutionId !== 'string' ||
      !identity.providerExecutionId ||
      typeof identity.recoveryOwnerToken !== 'string' ||
      typeof identity.operationKey !== 'string' ||
      !/^[a-f0-9]{64}$/.test(identity.operationKey) ||
      typeof identity.argumentsDigest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(identity.argumentsDigest)
    ) {
      throw new NativeMissionEffectUncertainError();
    }
    return executeNativeMissionEffectFenced({
      store: deps.store,
      identity,
      assertAuthorized: () => deps.assertAuthorized(call),
      execute: call.invoke,
      persistResult: (result) => deps.persistResult(call, result),
      loadCommittedResult: (ref, digest) => deps.loadCommittedResult(call, ref, digest),
    });
  };
}
