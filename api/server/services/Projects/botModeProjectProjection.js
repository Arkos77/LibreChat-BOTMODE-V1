const MAX_PROJECT_CONVERSATIONS = 100;
const MAX_MESSAGES_PER_CONVERSATION = 200;
const MAX_MTO_OBSERVATIONS_PER_TRACE = 100;

const EMPTY_USAGE = Object.freeze({
  input: 0,
  output: 0,
  cacheWrite: 0,
  cacheRead: 0,
  cost: 0,
  costKnown: true,
});

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function publicUsage(value) {
  const usage = value && typeof value === 'object' ? value : {};
  return {
    input: finite(usage.input),
    output: finite(usage.output),
    cacheWrite: finite(usage.cacheWrite),
    cacheRead: finite(usage.cacheRead),
    cost: finite(usage.cost),
    costKnown: typeof usage.cost === 'number',
  };
}

function addUsage(target, usage) {
  target.input += usage.input;
  target.output += usage.output;
  target.cacheWrite += usage.cacheWrite;
  target.cacheRead += usage.cacheRead;
  target.cost += usage.cost;
  target.costKnown = target.costKnown && usage.costKnown;
}

function publicObservation(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }
  const observation = {
    traceId: record.traceId,
    traceEventId: record.traceEventId,
    type: record.type,
    source: record.source,
    timestamp: record.timestamp,
    payload: record.payload,
  };
  if (record.identity !== undefined) {
    observation.identity = record.identity;
  }
  return observation;
}

function publicPlan(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return {
    planId: value.planId,
    planVersion: value.planVersion,
    supersedesPlanId: value.supersedesPlanId,
    strategy: value.strategy,
    objective: value.objective,
    tasks: Array.isArray(value.tasks)
      ? value.tasks.map((task) => ({
          taskId: task?.taskId,
          parentTaskId: task?.parentTaskId,
          objective: task?.objective,
          requiredCapabilities: Array.isArray(task?.requiredCapabilities)
            ? task.requiredCapabilities
            : [],
          dependsOn: Array.isArray(task?.dependsOn) ? task.dependsOn : [],
          canRunInParallel: task?.canRunInParallel === true,
        }))
      : [],
  };
}

async function createBotModeProjectProjection({ userId, tenantId, projectId, deps }) {
  const project = await deps.getChatProject(userId, projectId);
  if (!project) {
    return null;
  }

  const { conversations, nextCursor } = await deps.getConvosByCursor(userId, {
    projectId,
    limit: MAX_PROJECT_CONVERSATIONS,
  });

  const projectedConversations = [];
  const totals = { ...EMPTY_USAGE };

  for (const conversation of conversations) {
    const conversationId = conversation?.conversationId;
    if (typeof conversationId !== 'string' || conversationId === '') {
      continue;
    }

    const messages = await deps.getMessages(
      { user: userId, conversationId },
      'messageId conversationId isCreatedByUser metadata',
      { sort: { createdAt: 1 }, limit: MAX_MESSAGES_PER_CONVERSATION },
    );

    const usage = { ...EMPTY_USAGE };
    const traces = [];
    const plans = [];

    for (const message of messages) {
      if (message?.isCreatedByUser === true) {
        continue;
      }

      const messageUsage = publicUsage(message?.metadata?.usage);
      addUsage(usage, messageUsage);

      const plan = publicPlan(message?.metadata?.botModePlan);
      if (plan) {
        plans.push({
          messageId: message.messageId,
          plan,
        });
      }

      const traceId = message?.metadata?.mtoTraceId;
      if (typeof traceId !== 'string' || traceId.trim() === '') {
        continue;
      }

      const observations = await deps.listMtoObservations({
        user: userId,
        ...(tenantId === undefined ? {} : { tenantId }),
        traceId: traceId.trim(),
        limit: MAX_MTO_OBSERVATIONS_PER_TRACE,
      });

      traces.push({
        messageId: message.messageId,
        traceId: traceId.trim(),
        observations: observations.map(publicObservation).filter(Boolean),
      });
    }

    addUsage(totals, usage);
    projectedConversations.push({
      conversationId,
      usage,
      traces,
      plans,
    });
  }

  return {
    projectId,
    conversations: projectedConversations,
    totals,
    nextCursor,
  };
}

module.exports = {
  createBotModeProjectProjection,
  MAX_PROJECT_CONVERSATIONS,
  MAX_MESSAGES_PER_CONVERSATION,
  MAX_MTO_OBSERVATIONS_PER_TRACE,
};
