import { createHash } from 'node:crypto';
import type { NativeMissionPtcInvocation } from './nativeMissionPtcEffectGuard';
import { createNativeMissionPtcEffectGuard } from './nativeMissionPtcEffectGuard';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const identity = {
  streamId: 'mission',
  createdAt: 1700000000000,
  checkpointNamespace: 'checkpoint-v2',
  providerExecutionId: 'provider',
  recoveryOwnerToken: '',
  operationKey: digest('persisted-operation'),
  argumentsDigest: digest('persisted-arguments'),
};

function fixture() {
  const receipts = new Map<string, { state: string; resultRef?: string; resultDigest?: string }>();
  const results = new Map<string, unknown>();
  const invoke = jest.fn(async () => ({ content: 'applied' }));
  const call = {
    parentToolCallId: 'parent', name: 'write', sequence: 0,
    input: { value: 'ok' }, config: {}, invoke,
  };
  const deps = {
    store: {
      reserveNativeMissionEffect: jest.fn(async () => {
        const prior = receipts.get(identity.operationKey);
        if (prior) return { accepted: false, reason: prior.state === 'committed' ? 'already_committed' : 'uncertain' };
        receipts.set(identity.operationKey, { state: 'started' });
        return { accepted: true, reason: 'reserved' };
      }),
      commitNativeMissionEffect: jest.fn(async (receipt: { resultRef: string; resultDigest: string }) => {
        receipts.set(identity.operationKey, { state: 'committed', ...receipt });
        return { accepted: true, reason: 'committed' };
      }),
      readNativeMissionEffect: jest.fn(async () => {
        const result = receipts.get(identity.operationKey);
        return result?.state === 'committed'
          ? { accepted: true, reason: 'committed', ...result }
          : { accepted: false, reason: 'uncertain' };
      }),
    },
    resolvePersistedIdentity: jest.fn(async () => identity),
    assertAuthorized: jest.fn(async () => undefined),
    persistResult: jest.fn(async (_call: NativeMissionPtcInvocation, result: unknown) => {
      results.set('private-result', result);
      return { resultRef: 'private-result', resultDigest: digest(JSON.stringify(result)) };
    }),
    loadCommittedResult: jest.fn(async (_call: NativeMissionPtcInvocation, ref: string, expected: string) => {
      const result = results.get(ref);
      if (!result || digest(JSON.stringify(result)) !== expected) throw new Error('RESULT_DIGEST_MISMATCH');
      return result;
    }),
  };
  return { call, deps, receipts, results, invoke };
}

describe('native mission PTC durable effect guard', () => {
  it('reuses a committed result without repeating the external action', async () => {
    const { call, deps, invoke } = fixture();
    const guard = createNativeMissionPtcEffectGuard(deps);
    await expect(guard(call)).resolves.toEqual({ content: 'applied' });
    await expect(guard(call)).resolves.toEqual({ content: 'applied' });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(deps.loadCommittedResult).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed persisted identity without reserving or invoking', async () => {
    const { call, deps, invoke } = fixture();
    deps.resolvePersistedIdentity.mockResolvedValueOnce({ ...identity, operationKey: 'invalid' });
    await expect(createNativeMissionPtcEffectGuard(deps)(call)).rejects.toThrow('UNCERTAIN');
    expect(deps.store.reserveNativeMissionEffect).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('authorizes before resolving the persisted identity', async () => {
    const { call, deps, invoke } = fixture();
    deps.assertAuthorized.mockRejectedValueOnce(new Error('ACCESS_DENIED'));
    await expect(createNativeMissionPtcEffectGuard(deps)(call)).rejects.toThrow('ACCESS_DENIED');
    expect(deps.resolvePersistedIdentity).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('never replays a started but uncommitted effect', async () => {
    const { call, deps, receipts, invoke } = fixture();
    receipts.set(identity.operationKey, { state: 'started' });
    await expect(createNativeMissionPtcEffectGuard(deps)(call)).rejects.toThrow('UNCERTAIN');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('never repeats an effect when its committed result is missing', async () => {
    const { call, deps, results, invoke } = fixture();
    const guard = createNativeMissionPtcEffectGuard(deps);
    await guard(call);
    results.clear();
    await expect(guard(call)).rejects.toThrow('RESULT_DIGEST_MISMATCH');
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
