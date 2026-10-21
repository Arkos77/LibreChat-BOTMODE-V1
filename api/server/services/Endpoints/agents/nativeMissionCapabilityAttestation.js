'use strict';
const { createHash } = require('node:crypto');

/**
 * Original host-observed agent execution surface, recorded with the native
 * mission plan BEFORE any model call. It is NOT a permission grant, replay
 * receipt or attestation that external effects were committed.
 *
 * Store only non-secret capability names and a SHA-256 fingerprint. No tool
 * arguments, provider credentials, file bytes or user content are retained.
 * Unknown/non-model-only surfaces must demand independent effect receipts.
 */
function createNativeMissionCapabilityAttestation({
  plan,
  agents,
  subagentTasks,
  hostEffectPathsPresent = false,
}) {
  if (
    !plan ||
    typeof plan.planId !== 'string' ||
    !plan.planId ||
    !Array.isArray(plan.tasks) ||
    !plan.tasks.length ||
    !Array.isArray(agents) ||
    !agents.length ||
    agents.length > 32
  ) {
    throw new Error('NATIVE_MISSION_CAPABILITY_BASELINE_INVALID');
  }
  const names = (values) => {
    if (values == null) return [];
    let list;
    if (values instanceof Map) {
      list = [...values.keys()];
    } else if (values instanceof Set) {
      list = [...values];
    } else if (Array.isArray(values)) {
      list = values;
    } else if (typeof values === 'object') {
      list = Object.keys(values);
    } else {
      list = [values];
    }
    return list
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (!entry || typeof entry !== 'object') return '?';
        return String(entry.name ?? entry.id ?? entry.toolName ?? '?');
      })
      .sort();
  };
  const nonempty = (value) => names(value).length > 0;
  const fingerprints = agents
    .map((agent) => {
      if (typeof agent?.id !== 'string' || !agent.id) {
        throw new Error('NATIVE_MISSION_CAPABILITY_AGENT_INVALID');
      }
      const capability = {
        tools: names(agent.tools),
        toolDefinitions: names(agent.toolDefinitions),
        toolRegistry: names(agent.toolRegistry),
        toolOptions: names(agent.tool_options),
        toolResources: names(agent.tool_resources),
        // Saved legacy agent-chain linkage is the host-authorized graph
        // binding, NOT an executable SDK subagent tool. Fingerprint it so a
        // deleted/repointed specialist relationship invalidates cold replay.
        graphBindingAgentIds: names(agent.agent_ids),
        skills: names(agent.skills),
        files:
          nonempty(agent.files) ||
          nonempty(agent.attachments) ||
          nonempty(agent.requestAttachments) ||
          nonempty(agent.agentContextAttachments) ||
          nonempty(agent.primedCodeFiles),
        delegation:
          agent.subagents?.enabled === true ||
          nonempty(agent.subagents?.agent_ids) ||
          nonempty(agent.subagentConfigs) ||
          nonempty(agent.subagentAgentConfigs) ||
          nonempty(agent.lazySubagentConfigs) ||
          nonempty(agent.subagentGraphConfigs) ||
          nonempty(agent.subagentGraphMemberMetadata),
        dynamicTools:
          agent.hasDeferredTools === true ||
          agent.skills_enabled === true ||
          // Warm discovery materializes legacy agent_ids into graph edges.
          // The explicit native MissionPlan supersedes those edges entirely;
          // treating topology metadata as an executable tool incorrectly
          // disables originally model-only Worker -> specialist recovery.
          nonempty(agent.deferredToolDefinitions) ||
          nonempty(agent.toolContextMap) ||
          nonempty(agent.dynamicToolContextMap) ||
          nonempty(agent.mcpAvailableTools) ||
          nonempty(agent.mcpToolAliases) ||
          nonempty(agent.requestScopedConnections) ||
          nonempty(agent.backgroundToolNames) ||
          // extensionCapabilityRegistry is a GLOBAL descriptive catalog. It
          // never grants execution; counting its advertised tools as a live
          // capability would mark every genuinely model-only agent unsafe.
          nonempty(agent.fileAuthoringToolNames) ||
          nonempty(agent.activeSkillNames) ||
          nonempty(agent.accessibleSkillIds) ||
          nonempty(agent.manualSkillPrimes) ||
          nonempty(agent.alwaysApplySkillPrimes) ||
          (Number(agent.skillCount) || 0) > 0 ||
          agent.actionsEnabled === true ||
          agent.memoryToolsRegistered === true ||
          agent.codeEnvAvailable === true ||
          agent.skillAuthoringAvailable === true,
      };
      const modelOnly =
        capability.tools.length === 0 &&
        capability.toolDefinitions.length === 0 &&
        capability.toolRegistry.length === 0 &&
        capability.toolOptions.length === 0 &&
        capability.toolResources.length === 0 &&
        capability.skills.length === 0 &&
        capability.files === false &&
        capability.delegation === false &&
        capability.dynamicTools === false &&
        typeof agent.provider === 'string' &&
        !!agent.provider &&
        typeof (agent.model ?? agent.model_parameters?.model) === 'string' &&
        !!(agent.model ?? agent.model_parameters?.model);
      return {
        id: agent.id,
        provider: typeof agent.provider === 'string' ? agent.provider : null,
        model:
          typeof (agent.model ?? agent.model_parameters?.model) === 'string'
            ? (agent.model ?? agent.model_parameters?.model)
            : null,
        capability,
        modelOnly,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id) || JSON.stringify(a).localeCompare(JSON.stringify(b)));
  // Multiple graph paths can hold byte-equivalent initialized snapshots of a
  // saved agent. Deduplicate ONLY identical observed execution surfaces.
  // Conflicting snapshots under the same ID remain separate and make replay
  // receipts mandatory; no more powerful variant may be silently discarded.
  const canonical = fingerprints.filter(
    (entry, index) =>
      index === 0 || JSON.stringify(entry) !== JSON.stringify(fingerprints[index - 1]),
  );
  const ids = [...new Set(canonical.map((item) => item.id))].sort();
  const duplicateBindings = canonical.length !== ids.length;
  const expected = new Set(plan.tasks.map((task) => task?.agentId));
  if (expected.has(undefined) || [...expected].some((id) => !ids.includes(id))) {
    throw new Error('NATIVE_MISSION_CAPABILITY_AGENT_SET_MISMATCH');
  }
  const hasBackgroundTasks = subagentTasks != null;
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        planId: plan.planId,
        agents: canonical,
        hasBackgroundTasks,
        hostEffectPathsPresent: hostEffectPathsPresent === true,
      }),
    )
    .digest('hex');
  return {
    version: 1,
    planId: plan.planId,
    agentIds: ids,
    mode:
      !hasBackgroundTasks &&
      !duplicateBindings &&
      hostEffectPathsPresent !== true &&
      canonical.every((item) => item.modelOnly)
        ? 'model_only'
        : 'receipts_required',
    digest,
    hostEffectPathsPresent: hostEffectPathsPresent === true,
  };
}

function assertNativeMissionCapabilityAttestation({ recorded, plan, agents, subagentTasks }) {
  if (
    !recorded ||
    recorded.version !== 1 ||
    !/^[a-f0-9]{64}$/.test(recorded.digest) ||
    (recorded.mode !== 'model_only' && recorded.mode !== 'receipts_required')
  ) {
    throw new Error('NATIVE_MISSION_CAPABILITY_BASELINE_MISSING');
  }
  const current = createNativeMissionCapabilityAttestation({
    plan,
    agents,
    subagentTasks,
    hostEffectPathsPresent: recorded.hostEffectPathsPresent === true,
  });
  if (JSON.stringify(recorded) !== JSON.stringify(current)) {
    throw new Error('NATIVE_MISSION_CAPABILITY_BASELINE_CHANGED');
  }
  return current;
}

module.exports = {
  createNativeMissionCapabilityAttestation,
  assertNativeMissionCapabilityAttestation,
};
