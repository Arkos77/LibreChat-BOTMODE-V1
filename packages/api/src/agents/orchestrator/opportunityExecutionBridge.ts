import {
  qualifyOpportunity,
  type Opportunity,
  type OpportunityQualification,
} from '../opportunity';
import { createDecisionRecord, type DecisionContext, type DecisionRecord } from './decision';
import type { DecisionProvider } from './routing';

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

  const candidateId = intent.actionId;
  const selected = await provider.decide({
    candidates: [
      {
        id: candidateId,
        capabilities: [intent.capability],
        executionMode: 'workflow',
      },
    ],
    context: {
      constraints: {
        requiredCapabilities: [intent.capability],
      },
    },
  });

  const selectedOption = selected?.[0];
  if (selectedOption !== candidateId) {
    return {
      status: 'DECIDED',
      opportunity: qualified,
      intent,
      decision: createDecisionRecord({
        decisionId: context.traceId + ':opportunity-decision',
        question: 'Should this opportunity action proceed?',
        options: [
          { id: 'EXECUTE', description: intent.description },
          { id: 'HOLD', description: 'Do not execute the opportunity action' },
        ],
        selectedOption: 'HOLD',
        provider: provider.id ?? 'decision-provider',
        context: {
          ...context,
          objective: qualified.title,
          policyContext: 'opportunity:' + qualified.opportunityId,
        },
        timestamp: new Date().toISOString(),
      }),
    };
  }

  return {
    status: 'DECIDED',
    opportunity: qualified,
    intent,
    decision: createDecisionRecord({
      decisionId: context.traceId + ':opportunity-decision',
      question: 'Should this opportunity action proceed?',
      options: [
        { id: 'EXECUTE', description: intent.description },
        { id: 'HOLD', description: 'Do not execute the opportunity action' },
      ],
      selectedOption: 'EXECUTE',
      provider: provider.id ?? 'decision-provider',
      context: {
        ...context,
        objective: qualified.title,
        policyContext: 'opportunity:' + qualified.opportunityId,
      },
      timestamp: new Date().toISOString(),
    }),
  };
}
