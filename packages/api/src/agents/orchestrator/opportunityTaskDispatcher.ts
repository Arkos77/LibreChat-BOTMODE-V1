import type { OpportunityExecutionIntent } from './opportunityExecutionBridge';
import { type AuthorizationRecord, createAuthorizationRecord } from './authorization';
import { createMtoEvent, type MtoEvent } from './mto';

export interface OpportunityTaskDispatchRequest {
  opportunityId: string;
  taskId: string;
  traceId: string;
  intent: OpportunityExecutionIntent;
  authorization: AuthorizationRecord;
}

export interface OpportunityTaskDispatchReceipt {
  taskId: string;
  opportunityId: string;
  traceId: string;
  authorizationId: string;
  status: 'DISPATCHED';
  event: MtoEvent;
}

export type OpportunityTaskDispatcher = (
  request: OpportunityTaskDispatchRequest,
) => Promise<{ event?: MtoEvent }>;

export async function dispatchAuthorizedOpportunityTask(
  request: OpportunityTaskDispatchRequest,
  dispatcher: OpportunityTaskDispatcher,
): Promise<OpportunityTaskDispatchReceipt> {
  const authorization = createAuthorizationRecord(request.authorization);

  if (authorization.traceId !== request.traceId) {
    throw new Error('Opportunity authorization trace does not match dispatch trace');
  }
  if (authorization.taskId !== undefined && authorization.taskId !== request.taskId) {
    throw new Error('Opportunity authorization task does not match dispatch task');
  }
  if (authorization.capability !== request.intent.capability) {
    throw new Error('Opportunity authorization capability does not match intent');
  }
  if (authorization.scope !== request.intent.scope) {
    throw new Error('Opportunity authorization scope does not match intent');
  }
  if (authorization.decision !== 'ALLOW') {
    throw new Error('Opportunity task dispatch requires ALLOW authorization');
  }
  if (request.intent.requiresHumanApproval && authorization.humanApproval?.required !== false) {
    throw new Error('Opportunity task dispatch requires resolved human approval');
  }

  const result = await dispatcher(request);
  const event =
    result.event ??
    createMtoEvent(
      'DISPATCHED',
      {
        traceId: request.traceId,
        traceEventId: request.authorization.authorizationId + ':dispatch',
        taskId: request.taskId,
        timestamp: authorization.timestamp,
      },
      'host',
      {
        opportunityId: request.opportunityId,
        authorizationId: authorization.authorizationId,
        capability: request.intent.capability,
      },
    );

  return {
    taskId: request.taskId,
    opportunityId: request.opportunityId,
    traceId: request.traceId,
    authorizationId: authorization.authorizationId,
    status: 'DISPATCHED',
    event,
  };
}
