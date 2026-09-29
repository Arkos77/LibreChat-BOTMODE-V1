import { Providers } from '@librechat/agents';
import type { AgentInputs } from '@librechat/agents';
import { evaluateSynthesisReadiness } from './synthesisReadiness';
import { deterministicOracle } from '~/agents/oracle';
import { deterministicPlanner } from './planner';
import { compileNativePlan } from './native';

const context = {
  worker: {
    id: 'worker',
    agentId: 'worker',
    role: 'general',
    capabilities: ['basic'],
    constraints: [],
  },
  specialists: [],
};

const bindings = new Map<string, AgentInputs>([
  [
    'worker',
    {
      agentId: 'worker',
      provider: Providers.OPENAI,
      instructions: 'Authorized instructions',
    },
  ],
]);

describe('P5 mission Oracle synthesis gate', () => {
  it('binds host criteria through native validation and blocks synthesis without independent proof', async () => {
    const mission = {
      missionId: 'mission-p5',
      taskId: 'root-p5',
      objective: 'Produce a critical checked result',
      requiredCapabilities: ['basic'],
      constraints: [],
      objectives: [
        {
          key: 'critical',
          objective: 'Produce checked scalar result',
          requiredCapabilities: ['basic'],
          dependsOn: [],
          validation: {
            criteria: [{ id: 'total', field: 'total', expected: 42, requireEvidence: true }],
            requireIndependentEvidence: true,
          },
        },
      ],
    };

    const plan = deterministicPlanner.planMission(mission, context);
    const native = compileNativePlan(plan, bindings);
    expect(native.validation).toHaveLength(1);

    const validation = native.validation[0];
    const requirement = validation.requirements[0];
    const candidate = '{"total":42}';

    const verified = await deterministicOracle.validate({
      taskId: validation.taskId,
      agentId: 'worker',
      candidate,
      criteria: requirement.criteria,
      evidence: [
        {
          id: 'calculator-check',
          criterionId: 'total',
          value: 42,
          source: { id: 'calculator', type: 'tool', agentId: 'checker' },
        },
      ],
      review: requirement.review,
    });
    expect(verified.status).toBe('VERIFIED');

    expect(
      evaluateSynthesisReadiness(
        [{ taskId: validation.taskId, nodeId: validation.nodeId }],
        [
          {
            taskId: validation.taskId,
            nodeId: validation.nodeId,
            oracle: { phase: 'VERIFIED', verdict: verified, decision: 'ACCEPT' },
          },
        ],
      ),
    ).toMatchObject({
      ready: true,
      status: 'READY',
      verifiedTaskIds: [validation.taskId],
      blockedTaskIds: [],
    });

    const unknown = await deterministicOracle.validate({
      taskId: validation.taskId,
      agentId: 'worker',
      candidate,
      criteria: requirement.criteria,
      evidence: [],
      review: requirement.review,
    });
    expect(unknown.status).toBe('UNKNOWN');
    expect(unknown.uncertainty).toContain('INDEPENDENT_EVIDENCE_MISSING');

    expect(
      evaluateSynthesisReadiness(
        [{ taskId: validation.taskId, nodeId: validation.nodeId }],
        [
          {
            taskId: validation.taskId,
            nodeId: validation.nodeId,
            oracle: { phase: 'UNKNOWN', verdict: unknown, decision: 'DEFER' },
          },
        ],
      ),
    ).toMatchObject({
      ready: false,
      status: 'BLOCKED_UNKNOWN',
      verifiedTaskIds: [],
      blockedTaskIds: [validation.taskId],
    });
  });
});
