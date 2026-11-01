'use strict';
const { createNativeMissionCapabilityAttestation } =
  require('./nativeMissionCapabilityAttestation');

// Only the historical two-specialist graph, where Research was signed to
// web_search and Analyse was signed to have NO tools. This admission does not
// prove the original Research output or Analyse receipt: the checkpoint +
// broker receipt gates must establish both before graph.invoke is possible.
function committedResearchRecoveryShape({ job, documents }) {
  const plan = job?.orchestratorPlan;
  const [research, analysis] = Array.isArray(plan?.tasks) ? plan.tasks : [];
  const byId = new Map((documents ?? []).map((a) => [a.id, a]));
  const worker = byId.get(job?.agent_id);
  const researcher = byId.get(research?.agentId);
  const analyst = byId.get(analysis?.agentId);
  if (
    job?.nativeMissionCapabilityAttestation?.mode !== 'receipts_required' ||
    job.nativeMissionCapabilityAttestation.hostEffectPathsPresent === true ||
    plan.tasks.length !== 2 || plan.mission?.researchExecutionVersion !== 1 ||
    !research?.key || !analysis?.key || !research.nodeId || !analysis.nodeId ||
    research.agentId === analysis.agentId ||
    !Array.isArray(research.dependsOn) || research.dependsOn.length !== 0 ||
    !Array.isArray(analysis.dependsOn) || analysis.dependsOn.length !== 1 ||
    analysis.dependsOn[0] !== research.key ||
    !research.requiredCapabilities?.includes('web_search') ||
    !research.validation?.some((item) => item.outputContract === 'research-v1') ||
    analysis.requiredCapabilities?.includes('web_search') ||
    documents.length !== 3 || byId.size !== 3 || !worker || !researcher || !analyst ||
    worker.id === researcher.id || worker.id === analyst.id ||
    !Array.isArray(researcher.tools) || researcher.tools.length !== 1 ||
    researcher.tools[0] !== 'web_search' ||
    !Array.isArray(worker.tools ?? []) ||
    ((worker.tools?.length ?? 0) > 0 &&
      !(worker.tools.length === 1 && worker.tools[0] === 'web_search')) ||
    !Array.isArray(analyst.tools ?? []) ||
    (analyst.tools?.length ?? 0) !== 0 ||
    // No embedded tool configuration or hidden effect-capable agent surfaces.
    documents.some((a) =>
      Object.keys(a.tool_options ?? {}).length > 0 ||
      Object.keys(a.tool_resources ?? {}).length > 0 ||
      a.skills_enabled === true || (a.skills?.length ?? 0) > 0 ||
      (a.files?.length ?? 0) > 0 || (a.attachments?.length ?? 0) > 0 ||
      (a.subagentAgentConfigs?.length ?? 0) > 0 ||
      (a.lazySubagentConfigs?.length ?? 0) > 0 ||
      (a.subagentGraphConfigs?.length ?? 0) > 0 ||
      (a.subagents?.enabled === true && a.id !== worker.id)
    ) ||
    (worker.subagents?.enabled === true &&
      (!Array.isArray(worker.subagents.agent_ids) ||
        worker.subagents.agent_ids.length < 2 ||
        worker.subagents.agent_ids.length > 32 ||
        new Set(worker.subagents.agent_ids).size !== worker.subagents.agent_ids.length ||
        !worker.subagents.agent_ids.includes(researcher.id) ||
        !worker.subagents.agent_ids.includes(analyst.id)))
  ) return null;
  return Object.freeze({
    researchAgentId: researcher.id,
    // A Worker created through BOT MODE onboarding also has web_search.
    // It is NEVER an executable graph node in this two-specialist mission.
    historicalWebToolAgentIds: Object.freeze([
      ...(worker.tools?.length === 1 ? [worker.id] : []), researcher.id,
    ]),
  });
}

// The original run may have had a subagent task queue on its Worker. Record
// that ORIGINAL capability bit in a hash comparison only; NEVER reinstall a
// queue or an executable subagent tool during cold graph reconstruction.
function assertColdResearchCapabilityBaseline({
  recorded, plan, agents, historicalWebToolAgentIds,
}) {
  if (recorded?.mode !== 'receipts_required') {
    throw new Error('NATIVE_COLD_RESEARCH_CAPABILITY_MODE_DENIED');
  }
  // The initialized cold graph deliberately contains NO executable web tool.
  // For signature comparison alone, reconstruct the tool NAMES that were
  // authenticated from the original documents. No tool instance is created,
  // no search can execute and a changed original signature still fails.
  const baselineAgents = agents.map((agent) =>
    historicalWebToolAgentIds?.includes(agent.id) && (agent.tools?.length ?? 0) === 0
      ? { ...agent, tools: [{ name: 'web_search' }] }
      : agent);
  const matches = [undefined, Object.freeze({})].filter((tasks) => {
    const observed = createNativeMissionCapabilityAttestation({
      plan, agents: baselineAgents, subagentTasks: tasks,
      hostEffectPathsPresent: recorded.hostEffectPathsPresent === true,
    });
    return JSON.stringify(recorded) === JSON.stringify(observed);
  });
  if (matches.length !== 1) {
    throw new Error('NATIVE_COLD_RESEARCH_CAPABILITY_BASELINE_CHANGED');
  }
  return true;
}

module.exports = { committedResearchRecoveryShape, assertColdResearchCapabilityBaseline };
