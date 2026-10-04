import type { OpportunityExecutionIntent } from './opportunityExecutionBridge';
import { dispatchAuthorizedOpportunityTask } from './opportunityTaskDispatcher';

const intent: OpportunityExecutionIntent = {
  opportunityId: 'opp-1',
  actionId: 'draft',
  description: 'Prepare outreach draft',
  capability: 'outreach',
  scope: 'draft-only',
  requiresHumanApproval: false,
};

const baseAuthorization = {
  authorizationId: 'auth-1',
  traceId: 'trace-1',
  taskId: 'task-1',
  actorId: 'agent-1',
  capability: 'outreach',
  scope: 'draft-only',
  policyVersion: 'p1',
  decision: 'ALLOW' as const,
  timestamp: '2026-10-04T00:00:00.000Z',
};

describe('opportunity task dispatcher', () => {
  it('dispatches only after matching ALLOW authorization', async () => {
    const dispatcher = jest.fn(async () => ({}));
    await expect(
      dispatchAuthorizedOpportunityTask(
        {
          opportunityId: 'opp-1',
          taskId: 'task-1',
          traceId: 'trace-1',
          intent,
          authorization: baseAuthorization,
        },
        dispatcher,
      ),
    ).resolves.toMatchObject({
      taskId: 'task-1',
      opportunityId: 'opp-1',
      authorizationId: 'auth-1',
      status: 'DISPATCHED',
      event: { type: 'DISPATCHED' },
    });
    expect(dispatcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['DENY', { ...baseAuthorization, decision: 'DENY' as const }],
    ['HUMAN_APPROVAL_REQUIRED', { ...baseAuthorization, decision: 'HUMAN_APPROVAL_REQUIRED' as const }],
  ])('rejects authorization state %s', async (_label, authorization) => {
    await expect(
      dispatchAuthorizedOpportunityTask(
        {
          opportunityId: 'opp-1',
          taskId: 'task-1',
          traceId: 'trace-1',
          intent,
          authorization,
        },
        jest.fn(),
      ),
    ).rejects.toThrow(/requires ALLOW authorization/);
  });

  it('rejects mismatched task, capability or scope', async () => {
    await expect(
      dispatchAuthorizedOpportunityTask(
        {
          opportunityId: 'opp-1',
          taskId: 'task-1',
          traceId: 'trace-1',
          intent,
          authorization: { ...baseAuthorization, taskId: 'other-task' },
        },
        jest.fn(),
      ),
    ).rejects.toThrow(/task does not match/);

    await expect(
      dispatchAuthorizedOpportunityTask(
        {
          opportunityId: 'opp-1',
          taskId: 'task-1',
          traceId: 'trace-1',
          intent,
          authorization: { ...baseAuthorization, capability: 'payment' },
        },
        jest.fn(),
      ),
    ).rejects.toThrow(/capability does not match/);

    await expect(
      dispatchAuthorizedOpportunityTask(
        {
          opportunityId: 'opp-1',
          taskId: 'task-1',
          traceId: 'trace-1',
          intent,
          authorization: { ...baseAuthorization, scope: 'purchase' },
        },
        jest.fn(),
      ),
    ).rejects.toThrow(/scope does not match/);
  });

  it('requires resolved human approval when the intent requires HITL', async () => {
    await expect(
      dispatchAuthorizedOpportunityTask(
        {
          opportunityId: 'opp-1',
          taskId: 'task-1',
          traceId: 'trace-1',
          intent: { ...intent, requiresHumanApproval: true },
          authorization: { ...baseAuthorization, humanApproval: { required: true } },
        },
        jest.fn(),
      ),
    ).rejects.toThrow(/resolved human approval/);

    await expect(
      dispatchAuthorizedOpportunityTask(
        {
          opportunityId: 'opp-1',
          taskId: 'task-1',
          traceId: 'trace-1',
          intent: { ...intent, requiresHumanApproval: true },
          authorization: { ...baseAuthorization, humanApproval: { required: false, approvalId: 'appr-1' } },
        },
        jest.fn(async () => ({})),
      ),
    ).resolves.toMatchObject({ status: 'DISPATCHED' });
  });

  it('does not dispatch on authorization mismatch', async () => {
    const dispatcher = jest.fn();
    await expect(
      dispatchAuthorizedOpportunityTask(
        {
          opportunityId: 'opp-1',
          taskId: 'task-1',
          traceId: 'trace-other',
          intent,
          authorization: baseAuthorization,
        },
        dispatcher,
      ),
    ).rejects.toThrow(/trace does not match/);
    expect(dispatcher).not.toHaveBeenCalled();
  });
});
