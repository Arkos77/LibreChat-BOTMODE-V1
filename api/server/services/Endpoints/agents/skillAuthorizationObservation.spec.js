const { createObservedSkillEditCheck } = require('./skillAuthorizationObservation');

const req = { user: { id: '507f1f77bcf86cd799439011', tenantId: 'tenant-a', role: 'USER' } };
const traceId = 'trace-native-edit';
const skillId = '507f191e810c19729de860ea';

function setup(allowed) {
  const nativeCheck = jest.fn(async () => allowed);
  const persist = jest.fn(async () => ({ replayed: false }));
  const sink = jest.fn();
  const check = createObservedSkillEditCheck({
    req,
    traceId,
    nativeCheck,
    persist,
    sink,
    tenantId: req.user.tenantId,
  });
  return { check, nativeCheck, persist, sink };
}

describe('native skill EDIT authorization observation', () => {
  it.each([
    [true, 'ALLOW', 'AUTHORIZED'],
    [false, 'DENY', 'DENIED'],
  ])('records the native %s outcome without changing it', async (allowed, decision, type) => {
    const { check, nativeCheck, persist, sink } = setup(allowed);
    expect(await check({ req, skillId })).toBe(allowed);
    expect(nativeCheck).toHaveBeenCalledTimes(1);
    expect(nativeCheck).toHaveBeenCalledWith({ req, skillId });
    expect(persist).toHaveBeenCalledWith({
      user: req.user.id,
      tenantId: req.user.tenantId,
      event: expect.objectContaining({
        traceId,
        type,
        source: 'host',
        payload: expect.objectContaining({ decision, capability: 'skill.edit' }),
      }),
    });
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ type }));
    expect(JSON.stringify(persist.mock.calls)).not.toContain('role');
  });

  it('keeps an observation-store outage independent from native authorization', async () => {
    const { check, persist } = setup(false);
    persist.mockRejectedValueOnce(new Error('store unavailable'));
    expect(await check({ req, skillId })).toBe(false);
  });

  it('contains an asynchronous observation sink rejection', async () => {
    const { check, sink } = setup(true);
    sink.mockRejectedValueOnce(new Error('logger unavailable'));
    expect(await check({ req, skillId })).toBe(true);
  });

  it('does not invent a denial if the native ACL throws', async () => {
    const { check, nativeCheck, persist, sink } = setup(false);
    nativeCheck.mockRejectedValueOnce(new Error('ACL unavailable'));
    await expect(check({ req, skillId })).rejects.toThrow('ACL unavailable');
    expect(persist).not.toHaveBeenCalled();
    expect(sink).not.toHaveBeenCalled();
  });

  it('does not attribute a different request or absent trace to this owner', async () => {
    const { check, persist, sink } = setup(true);
    const otherReq = { user: { id: '507f191e810c19729de860eb', tenantId: 'tenant-b' } };
    expect(await check({ req: otherReq, skillId })).toBe(true);
    expect(persist).not.toHaveBeenCalled();
    expect(sink).not.toHaveBeenCalled();
    const withoutTrace = createObservedSkillEditCheck({
      req,
      traceId: undefined,
      nativeCheck: async () => false,
      persist,
      sink,
    });
    expect(await withoutTrace({ req, skillId })).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });
});
