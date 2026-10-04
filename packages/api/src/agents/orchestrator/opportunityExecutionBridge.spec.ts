import {
  decideQualifiedOpportunityAction,
  type OpportunityExecutionIntent,
} from './opportunityExecutionBridge';
import type { Opportunity } from '../opportunity';
import type { DecisionProvider } from './routing';

describe('opportunity execution bridge', () => {
  const opportunity: Opportunity = {
    opportunityId: 'opp-1',
    title: 'Remote buyer opportunity',
    category: 'jobs',
    geography: 'EUROPE',
    status: 'QUALIFICATION',
    source: {
      sourceId: 'jobicy',
      name: 'Jobicy',
      provenance: 'PUBLIC',
      capturedAt: '2026-10-04T00:00:00.000Z',
    },
    value: {
      currency: 'EUR',
      totalValue: 1000,
      costs: 100,
      netValue: 900,
    },
    constraints: ['remote'],
    qualification: [],
    evidenceRefs: ['jobicy:1'],
  };

  const intent: OpportunityExecutionIntent = {
    opportunityId: 'opp-1',
    actionId: 'contact',
    description: 'Prepare a compliant outreach draft for the opportunity',
    capability: 'outreach',
    scope: 'draft-only',
    requiresHumanApproval: true,
  };

  const provider: DecisionProvider = {
    id: 'test-decision',
    decide: async ({ candidates }) => candidates.map((candidate) => candidate.id),
  };

  const context = {
    traceId: 'trace-opp-1',
    taskId: 'task-opp-1',
    agentId: 'agent-worker',
  };

  it.each([
    [{ eligible: 'UNKNOWN' as const, reasons: [] }],
    [{ eligible: 'NO' as const, reasons: ['not eligible'] }],
  ])('holds before Decision Layer for %s qualification', async (qualification) => {
    const result = await decideQualifiedOpportunityAction(
      opportunity,
      qualification,
      intent,
      provider,
      context,
    );
    expect(result.status).toBe('HOLD');
    expect(result.decision).toBeUndefined();
  });

  it('routes a verified opportunity into the Decision Layer', async () => {
    const result = await decideQualifiedOpportunityAction(
      opportunity,
      {
        eligible: 'YES',
        reasons: ['remote-compatible', 'positive value'],
        verifiedAt: '2026-10-04T00:00:00.000Z',
      },
      intent,
      provider,
      context,
    );
    expect(result.status).toBe('DECIDED');
    expect(result.opportunity.status).toBe('VERIFIED');
    expect(result.decision).toMatchObject({
      decisionId: 'trace-opp-1:opportunity-decision',
      selectedOption: 'EXECUTE',
      provider: 'test-decision',
      context: {
        traceId: 'trace-opp-1',
        taskId: 'task-opp-1',
        agentId: 'agent-worker',
        policyContext: 'opportunity:opp-1',
      },
    });
  });

  it('never manufactures authorization state', async () => {
    const result = await decideQualifiedOpportunityAction(
      opportunity,
      { eligible: 'YES', reasons: ['verified'] },
      intent,
      provider,
      context,
    );
    expect(JSON.stringify(result)).not.toMatch(/AUTHORIZED|authorizationId|permission|COMMITTED/);
    expect(result.intent?.requiresHumanApproval).toBe(true);
  });

  it('rejects an intent for another opportunity', async () => {
    await expect(
      decideQualifiedOpportunityAction(
        opportunity,
        { eligible: 'YES', reasons: ['verified'] },
        { ...intent, opportunityId: 'opp-other' },
        provider,
        context,
      ),
    ).rejects.toThrow(/does not match/);
  });
});
