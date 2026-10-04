import {
  qualifyOpportunity,
  type Opportunity,
  type OpportunityQualification,
} from '../opportunity';
import {
  createDecisionRecord,
  type DecisionContext,
  type DecisionOption,
  type DecisionProvider,
  type DecisionRecord,
} from './decision';

export interface OpportunityExecutionIntent {
  opportunityId: string;
  actionId: string;
  description: string;
  capability: string;
  scope: string;
  requiresHumanApproval: boolean;
}

export interface OpportunityExecutionBridgeResult {
  status: 'HOLD' | 'DECIDED';
  opportunity: Opportunity;
  intent?: OpportunityExecutionIntent;
  decision?: DecisionRecord;
}

function assertIntent(intent: OpportunityExecutionIntent): void {
  if (!intent.opportunityId || !intent.actionId || !intent.capability || !intent.scope) {
    throw new Error('Opportunity execution intent identity and capability are required');
  }
}

export async function decideQualifiedOpportunityAction(
  opportunity: Opportunity,
  qualification: OpportunityQualification,
  intent: OpportunityExecutionIntent,
  provider: DecisionProvider,
  context: DecisionContext,
): Promise<OpportunityExecutionBridgeResult> {
  assertIntent(intent);
  if (intent.opportunityId !== opportunity.opportunityId) {
    throw new Error('Opportunity execution intent does not match the opportunity');
  }
  const qualified = qualifyOpportunity(opportunity, qualification);

  if (qualified.status !== 'VERIFIED') {
    return { status: 'HOLD', opportunity: qualified };
  }

  const options: DecisionOption[] = [
    { id: 'EXECUTE', description: intent.description },
    { id: 'HOLD', description: 'Do not execute the opportunity action' },
  ];
  const decision = await provider.decide(
    {
      ...context,
      objective: qualified.title,
      policyContext: 'opportunity:' + qualified.opportunityId,
    },
    options,
  );
  const record = createDecisionRecord({
    ...decision,
    options,
    context: {
      ...decision.context,
      traceId: context.traceId,
      ...(context.taskId === undefined ? {} : { taskId: context.taskId }),
      ...(context.agentId === undefined ? {} : { agentId: context.agentId }),
      objective: qualified.title,
      policyContext: 'opportunity:' + qualified.opportunityId,
    },
  });

  return { status: 'DECIDED', opportunity: qualified, intent, decision: record };
}