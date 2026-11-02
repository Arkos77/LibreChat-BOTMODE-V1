'use strict';

const { canonicalMissionJson } = require('./nativeMissionWakeupOriginStore');

/**
 * Read-only Redis original-generation fence. This is only an admission
 * predicate for the independent broker, never a Redis lock or a replay grant.
 * The provider call store enforces the unique irreversible dispatch itself.
 */
function createNativeMissionIndependentGraphLeaseReader({ readOriginalJob }) {
  if (typeof readOriginalJob !== 'function') {
    throw new Error('NATIVE_GRAPH_LEASE_READER_DEPENDENCIES_MISSING');
  }
  return async (scope) => {
    if (
      !scope || typeof scope.conversationId !== 'string' || !scope.conversationId ||
      typeof scope.userId !== 'string' || !scope.userId ||
      typeof scope.checkpointNamespace !== 'string' || !scope.checkpointNamespace ||
      !Number.isSafeInteger(scope.createdAt) || scope.createdAt <= 0 ||
      !Array.isArray(scope.plan?.tasks) || scope.plan.tasks.length !== 2
    ) return false;
    const job = await readOriginalJob(scope.conversationId);
    if (!job || typeof job !== 'object') return false;
    let savedPlan;
    try {
      savedPlan = typeof job.orchestratorPlan === 'string'
        ? JSON.parse(job.orchestratorPlan) : null;
    } catch { return false; }
    return (
      job.status === 'running' &&
      job.userId === scope.userId &&
      (job.tenantId ?? '') === (scope.tenantId ?? '') &&
      job.agent_id === scope.workerAgentId &&
      job.responseMessageId === scope.responseMessageId &&
      String(job.createdAt) === String(scope.createdAt) &&
      job.checkpointNamespace === scope.checkpointNamespace &&
      String(job.generationProtocolVersion) === '2' &&
      job.providerDrained === '0' &&
      typeof job.providerExecutionId === 'string' &&
      job.providerExecutionId.length > 0 &&
      job.providerExecutionStartedId === job.providerExecutionId &&
      (!job.pendingAction || job.pendingAction === 'null') &&
      canonicalMissionJson(savedPlan) === canonicalMissionJson(scope.plan)
    );
  };
}

module.exports = { createNativeMissionIndependentGraphLeaseReader };
