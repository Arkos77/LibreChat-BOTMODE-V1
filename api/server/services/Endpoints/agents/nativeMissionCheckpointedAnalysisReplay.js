'use strict';
const {
  assertNativeMissionCapabilityAttestation,
} = require('./nativeMissionCapabilityAttestation');

// This is deliberately narrower than general receipts_required replay.
// Only a completed, checkpointed predecessor and ONE pending tool-free model
// node can be continued; research's historical web_search is never replayed.
// Any non-read-only predecessor tool or unknown execution surface is refused.
const toolKeys = [
  'tools', 'graphTools', 'toolDefinitions', 'toolRegistry', 'toolMap',
  'toolOptions', 'tool_options', 'toolResources', 'tool_resources',
];
const extraEffectKeys = [
  'skills', 'files', 'attachments', 'requestAttachments',
  'agentContextAttachments', 'primedCodeFiles', 'subagentConfigs',
  'subagentAgentConfigs', 'lazySubagentConfigs', 'deferredToolDefinitions',
  'mcpAvailableTools', 'mcpToolAliases', 'requestScopedConnections',
  'backgroundToolNames', 'alwaysApplySkillPrimes',
];
function names(value) {
  if (value == null) return [];
  const entries = value instanceof Map ? [...value.keys()]
    : value instanceof Set ? [...value]
      : Array.isArray(value) ? value
        : typeof value === 'object' ? Object.keys(value) : [value];
  return entries.map((entry) => typeof entry === 'string'
    ? entry : String(entry?.name ?? entry?.function?.name ?? 'UNKNOWN'));
}
function requireAllowedSurface(agent, webSearchAllowed) {
  if (!agent || extraEffectKeys.some((key) => names(agent[key]).length) ||
      agent.subagents?.enabled === true ||
      names(agent.subagents?.agent_ids).length ||
      agent.skills_enabled === true || agent.hasDeferredTools === true ||
      agent.actionsEnabled === true || agent.memoryToolsRegistered === true ||
      agent.codeEnvAvailable === true || agent.skillAuthoringAvailable === true ||
      (Number(agent.skillCount) || 0) !== 0) {
    throw new Error('NATIVE_COLD_ANALYSIS_EFFECT_SURFACE_UNSUPPORTED');
  }
  const observed = toolKeys.flatMap((key) => names(agent[key]));
  if (observed.some((name) => !webSearchAllowed || name !== 'web_search')) {
    throw new Error('NATIVE_COLD_ANALYSIS_EFFECT_SURFACE_UNSUPPORTED');
  }
}

/** Read-only original checkpoint admission. This is NOT a tool receipt for
 * an incomplete Research node and cannot authorize a replay of Research.
 * The independent native-graph model receipt remains separately mandatory.
 */
function createNativeMissionCheckpointedAnalysisReplay({ manager }) {
  if (typeof manager?.getJobStore !== 'function') {
    throw new Error('NATIVE_COLD_ANALYSIS_STORE_MISSING');
  }
  const verify = async ({ client, graph, candidate, claim, assertAuthorized }) => {
    if (!client?.options?.nativeMissionRecoveryRequiresReceipts ||
        typeof client.options.nativeGraphModelFetchFactory !== 'function' ||
        typeof client.getReachableMissionAgents !== 'function' ||
        typeof graph?.getState !== 'function' ||
        !candidate?.streamId || !candidate.checkpointId ||
        candidate.createdAt !== claim?.createdAt ||
        candidate.streamId !== claim?.streamId ||
        candidate.checkpointNamespace !== claim?.checkpointNamespace ||
        candidate.checkpointId !== claim?.checkpointId ||
        typeof claim.ownerToken !== 'string' || claim.ownerToken.length < 16 ||
        typeof assertAuthorized !== 'function') {
      throw new Error('NATIVE_COLD_ANALYSIS_IDENTITY_DENIED');
    }
    await assertAuthorized();
    const store = manager.getJobStore();
    const job = await store.getJob(candidate.streamId);
    const plan = job?.orchestratorPlan;
    if (job?.createdAt !== candidate.createdAt ||
        job?.checkpointNamespace !== candidate.checkpointNamespace ||
        job?.status !== 'running' || job.pendingAction != null ||
        JSON.stringify(client.orchestratorPlan) !== JSON.stringify(plan) ||
        client.options.agent?.id !== job.agent_id ||
        client.conversationId !== candidate.streamId ||
        client.jobCreatedAt !== candidate.createdAt ||
        client.checkpointNamespace !== candidate.checkpointNamespace ||
        client.options.subagentTasks != null ||
        !Array.isArray(plan?.tasks) || plan.tasks.length !== 2 ||
        job.nativeMissionCapabilityAttestation?.mode !== 'receipts_required' ||
        job.nativeMissionCapabilityAttestation.hostEffectPathsPresent === true) {
      throw new Error('NATIVE_COLD_ANALYSIS_ORIGINAL_MISSION_DENIED');
    }
    const [research, analysis] = plan.tasks;
    if (!research?.key || !research?.nodeId || !research?.agentId ||
        !analysis?.key || !analysis?.nodeId || !analysis?.agentId ||
        !Array.isArray(research.dependsOn) || research.dependsOn.length !== 0 ||
        !Array.isArray(analysis.dependsOn) ||
        analysis.dependsOn.length !== 1 || analysis.dependsOn[0] !== research.key ||
        research.nodeId === analysis.nodeId ||
        research.agentId === analysis.agentId) {
      throw new Error('NATIVE_COLD_ANALYSIS_PLAN_DENIED');
    }
    const agents = client.getReachableMissionAgents();
    assertNativeMissionCapabilityAttestation({
      recorded: job.nativeMissionCapabilityAttestation,
      plan, agents, subagentTasks: client.options.subagentTasks,
    });
    const predecessor = agents.filter((agent) => agent.id === research.agentId);
    const pending = agents.filter((agent) => agent.id === analysis.agentId);
    if (predecessor.length !== 1 || pending.length !== 1) {
      throw new Error('NATIVE_COLD_ANALYSIS_AGENT_IDENTITY_DENIED');
    }
    requireAllowedSurface(predecessor[0], true);
    requireAllowedSurface(pending[0], false);
    await assertAuthorized();
    const state = await graph.getState({
      configurable: {
        thread_id: candidate.streamId, checkpoint_ns: '',
        __librechat_checkpoint_ns: candidate.checkpointNamespace,
        __librechat_mission_sync: true,
      },
    });
    const config = state?.config?.configurable;
    const outputs = state?.values?.agentOutputs;
    if (config?.thread_id !== candidate.streamId ||
        config?.__librechat_checkpoint_ns !== candidate.checkpointNamespace ||
        config?.checkpoint_id !== candidate.checkpointId ||
        !Array.isArray(state?.next) || state.next.length !== 1 ||
        state.next[0] !== analysis.nodeId ||
        !Array.isArray(state?.tasks) || state.tasks.length !== 1 ||
        state.tasks[0]?.name !== analysis.nodeId ||
        !Array.isArray(state.tasks[0].interrupts) ||
        state.tasks[0].interrupts.length !== 0 ||
        state.tasks[0].error != null ||
        !outputs || typeof outputs !== 'object' || Array.isArray(outputs) ||
        Object.hasOwn(outputs, analysis.nodeId) ||
        typeof outputs[research.nodeId]?.content !== 'string' ||
        !outputs[research.nodeId].content.trim()) {
      throw new Error('NATIVE_COLD_ANALYSIS_PREDECESSOR_NOT_DURABLE');
    }
    await assertAuthorized();
    if (manager.getJobStore() !== store) {
      throw new Error('NATIVE_COLD_ANALYSIS_STORE_CHANGED');
    }
    return analysis.nodeId;
  };
  return {
    verify,
    effectFences: async (context) => async () => {
      await verify(context);
      return true;
    },
    replaySafety: async (context) => async (pendingNodes) => {
      const analysisNode = await verify(context);
      if (!Array.isArray(pendingNodes) ||
          pendingNodes.length !== 1 || pendingNodes[0] !== analysisNode) {
        throw new Error('NATIVE_COLD_ANALYSIS_PENDING_NODE_DENIED');
      }
      return true;
    },
  };
}
module.exports = { createNativeMissionCheckpointedAnalysisReplay };
