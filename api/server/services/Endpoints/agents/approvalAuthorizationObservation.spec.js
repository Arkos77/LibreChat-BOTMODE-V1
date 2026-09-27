const { observeRequiredToolApproval } = require('./approvalAuthorizationObservation');

const action = {
  actionId: 'native-action-1',
  createdAt: 1780000000000,
  payload: { type: 'tool_approval', action_requests: [{ tool_call_id: 'call-1' }] },
};
const common = {
  userId: '507f1f77bcf86cd799439011',
  tenantId: 'tenant-a',
  traceId: 'trace-1',
  action,
};

describe('durable native human approval requirement observation', () => {
  it('records only the confirmed tool approval requirement and replays identically', async () => {
    const persist = jest.fn(async () => ({ replayed: false }));
    const sink = jest.fn();
    await observeRequiredToolApproval({ ...common, persist, sink });
    await observeRequiredToolApproval({ ...common, persist, sink });
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[0][0]).toEqual(persist.mock.calls[1][0]);
    expect(persist).toHaveBeenCalledWith({
      user: common.userId,
      tenantId: common.tenantId,
      event: expect.objectContaining({
        traceId: common.traceId,
        type: 'HUMAN_APPROVAL_REQUIRED',
        source: 'host',
        payload: expect.objectContaining({
          decision: 'HUMAN_APPROVAL_REQUIRED',
          capability: 'tool.execute',
        }),
      }),
    });
    const event = persist.mock.calls[0][0].event;
    expect(event.traceEventId).not.toBe(event.payload.authorizationId);
    expect(event.payload.authorizationId).not.toBe(action.actionId);
    expect(JSON.stringify(event)).not.toContain('call-1');
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ type: event.type }));
  });

  it('does not label ask_user_question as authorization required', async () => {
    const persist = jest.fn();
    await observeRequiredToolApproval({
      ...common,
      action: { ...action, payload: { type: 'ask_user_question' } },
      persist,
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it('does not observe missing trace or action identity', async () => {
    const persist = jest.fn();
    await observeRequiredToolApproval({ ...common, traceId: undefined, persist });
    await observeRequiredToolApproval({ ...common, action: { ...action, actionId: '' }, persist });
    expect(persist).not.toHaveBeenCalled();
  });

  it('contains observation store and sink failures', async () => {
    const persist = jest.fn().mockRejectedValueOnce(new Error('store down'));
    await expect(observeRequiredToolApproval({ ...common, persist })).resolves.toBeUndefined();
    persist.mockResolvedValueOnce({ replayed: false });
    const sink = jest.fn().mockRejectedValueOnce(new Error('sink down'));
    await expect(
      observeRequiredToolApproval({ ...common, persist, sink }),
    ).resolves.toBeUndefined();
  });
});
