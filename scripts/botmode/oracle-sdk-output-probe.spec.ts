import { Run, Providers } from '@librechat/agents';
import { HumanMessage } from '@librechat/agents/langchain/messages';
import type { AgentInputs } from '@librechat/agents';
import { deterministicPlanner } from '../../packages/api/src/agents/orchestrator/planner';
import { compileNativePlan } from '../../packages/api/src/agents/orchestrator/native';
import { assertTerminalMissionTasksVerified } from '../../packages/api/src/agents/orchestrator/missionOracle';

/** This is compiled against the immutable PR14 candidate in isolated CI only.
 * It must not be copied into a production installation. */
describe('PR14 native terminal Oracle output binding smoke', () => {
  it('exposes exact task-node output after standard graph processStream', async () => {
    const mission = {
      missionId: 'ci-oracle-node-identity',
      taskId: 'ci-oracle-node-identity',
      objective: 'Return a JSON scalar value',
      constraints: [],
      requiredCapabilities: ['basic'],
      validation: { criteria: [{ id: 'ci-ok', field: 'ok', expected: true }] },
    };
    const agentId = 'ci-saved-worker';
    const plan = deterministicPlanner.planMission(mission, {
      worker: {
        id: 'ci-worker', agentId, role: 'worker',
        capabilities: ['basic'], constraints: [],
      },
      specialists: [],
    });
    const authorizedBindings = new Map<string, AgentInputs>([
      [agentId, {
        agentId, provider: Providers.OPENAI,
        instructions: 'Return JSON only', 
      }],
    ]);
    const native = compileNativePlan(plan, authorizedBindings);
    expect(native.graphConfig.type).toBe('standard');
    const run = await Run.create({runId: 'ci-native-smoke', graphConfig: native.graphConfig});
    if (!run.Graph) throw new Error('GRAPH_MISSING');
    run.Graph.overrideTestModel(['{"ok":true}']);
    await run.processStream({
      messages: [new HumanMessage('Return JSON {"ok":true}')]
    }, {version: 'v2'});
    const outputs = run.getAgentOutputs();
    console.log('CI_NATIVE_GRAPH_HALT='+String(run.getHaltReason() ?? 'none'));
    console.log('CI_NATIVE_OUTPUT_KEYS=' + Object.keys(outputs ?? {}).join(','));
    console.log('CI_NATIVE_EXPECTED_NODE_PRESENT=' +
      String(Object.prototype.hasOwnProperty.call(outputs ?? {}, plan.tasks[0].nodeId)));
    expect(outputs).toHaveProperty(plan.tasks[0].nodeId);
    const persisted = jest.fn(async () => undefined);
    await expect(assertTerminalMissionTasksVerified(plan, outputs ?? {}, undefined, persisted))
      .resolves.toBeUndefined();
    expect(persisted).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: plan.tasks[0].taskId,
        verdicts: [expect.objectContaining({status:'VERIFIED'})],
      }),
    );
    console.log('CI_NATIVE_ORACLE_EXACT_OUTPUT=PASS');
  });
});
