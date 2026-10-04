import type { OpportunityExecutionIntent } from './opportunityExecutionBridge';
import type { OpportunityTaskDispatchRequest } from './opportunityTaskDispatcher';
import { executeOpportunityAction } from './opportunityActionAdapter';

const intent: OpportunityExecutionIntent = {
  opportunityId: 'opp-1',
  actionId: 'draft',
  description: 'Prepare outreach draft',
  capability: 'outreach',
  scope: 'draft-only',
  requiresHumanApproval: false,
};

const request = {
  opportunityId: 'opp-1',
  taskId: 'task-1',
  traceId: 'trace-1',
  intent,
  authorization: {
    authorizationId: 'auth-1',
    traceId: 'trace-1',
    taskId: 'task-1',
    actorId: 'agent-1',
    capability: 'outreach',
    scope: 'draft-only',
    policyVersion: 'p1',
    decision: 'ALLOW' as const,
    timestamp: '2026-10-04T00:00:00.000Z',
  },
} satisfies OpportunityTaskDispatchRequest;

describe('opportunity action adapter', () => {
  it('maps draft action to the governed create_file tool', async () => {
    const invoke = jest.fn(async (toolName, input) => ({ toolName, input }));
    await expect(
      executeOpportunityAction(
        request,
        { path: 'opportunities/opp-1/outreach.md', content: 'Hello', overwrite: false },
        invoke,
      ),
    ).resolves.toEqual({
      tool: 'create_file',
      output: {
        toolName: 'create_file',
        input: {
          path: 'opportunities/opp-1/outreach.md',
          content: 'Hello',
          overwrite: false,
        },
      },
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported actions before invoking any tool', async () => {
    const invoke = jest.fn(async () => 'unexpected');
    await expect(
      executeOpportunityAction(
        {
          ...request,
          intent: { ...intent, actionId: 'send' },
        },
        { path: 'outreach.md', content: 'Hello' },
        invoke,
      ),
    ).rejects.toThrow(/Unsupported opportunity action/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects workspace escape paths before invocation', async () => {
    const invoke = jest.fn(async () => 'unexpected');
    await expect(
      executeOpportunityAction(
        request,
        { path: '../outside.md', content: 'Hello' },
        invoke,
      ),
    ).rejects.toThrow(/escape/);
    expect(invoke).not.toHaveBeenCalled();
  });
});
