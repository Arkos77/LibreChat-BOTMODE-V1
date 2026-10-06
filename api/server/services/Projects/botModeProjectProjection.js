const MAX_PROJECT_CONVERSATIONS = 100;
const MAX_MESSAGES_PER_CONVERSATION = 200;
const MAX_MTO_OBSERVATIONS_PER_TRACE = 100;
const MAX_PROJECT_MEMORIES = 100;
const MAX_PROJECT_SOURCES = 200;
const MAX_MODEL_RECEIPTS_PER_CONVERSATION = 20;

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

function publicModelReceipt(value) {
  if (!value || typeof value !== 'object') return null;
  const selectedProvider =
    typeof value.selectedProvider === 'string' ? value.selectedProvider : undefined;
  const selectedModel = typeof value.selectedModel === 'string' ? value.selectedModel : undefined;
  if (!selectedProvider || !selectedModel) return null;
  const total = value.total && typeof value.total === 'object' ? value.total : {};
  return {
    selectedProvider,
    selectedModel,
    ...(typeof value.resolvedProvider === 'string'
      ? { resolvedProvider: value.resolvedProvider }
      : {}),
    ...(typeof value.resolvedModel === 'string' ? { resolvedModel: value.resolvedModel } : {}),
    fallbackUsed: value.fallbackUsed === true,
    ...(typeof value.routingMode === 'string' ? { routingMode: value.routingMode } : {}),
    ...(typeof value.spendingPolicy === 'string' ? { spendingPolicy: value.spendingPolicy } : {}),
    total: {
      inputTokens: finite(total.inputTokens),
      outputTokens: finite(total.outputTokens),
      costUsd: finite(total.costUsd),
      costKnown: total.costKnown === true,
      latencyMs: finite(total.latencyMs),
      latencyKnown: total.latencyKnown === true,
    },
  };
}

function publicResultContent(value) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (!Array.isArray(value)) {
    return '';
  }
  return value
    .filter(
      (part) =>
        part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string',
    )
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function publicPlan(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return {
    planId: value.planId,
    planVersion: value.planVersion,
    ...(value.supersedesPlanId == null ? {} : { supersedesPlanId: value.supersedesPlanId }),
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
  const [memories, sourceIdsByConversation] = await Promise.all([
    typeof deps.getUserMemories === 'function' ? deps.getUserMemories({ userId, projectId }) : [],
    Promise.all(
      (conversations ?? []).map(async (conversation) => [
        conversation?.conversationId,
        typeof deps.getConvoFiles === 'function' && conversation?.conversationId
          ? await deps.getConvoFiles(conversation.conversationId)
          : [],
      ]),
    ),
  ]);
  const projectSourceIds = [
    ...new Set(
      sourceIdsByConversation.flatMap(([, fileIds]) =>
        Array.isArray(fileIds) ? fileIds.filter((id) => typeof id === 'string') : [],
      ),
    ),
  ].slice(0, MAX_PROJECT_SOURCES);
  const sources =
    projectSourceIds.length > 0 && typeof deps.getFiles === 'function'
      ? await deps.getFiles(
          { file_id: { $in: projectSourceIds }, user: userId },
          {},
          'file_id filename type size bytes',
        )
      : [];
  const memoryProjection = Array.isArray(memories)
    ? memories.slice(0, MAX_PROJECT_MEMORIES).map((memory) => ({
        id: memory?._id?.toString?.() ?? memory?._id,
        key: memory?.key,
        value: memory?.value,
        updatedAt: memory?.updated_at ?? null,
      }))
    : [];

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
    const results = [];
    const modelReceipts = [];

    for (const message of messages) {
      if (message?.isCreatedByUser === true) {
        continue;
      }

      const messageUsage = publicUsage(message?.metadata?.usage);
      addUsage(usage, messageUsage);

      const modelReceipt = publicModelReceipt(message?.metadata?.hostModelUsage);
      if (modelReceipt) {
        modelReceipts.push({
          messageId: message.messageId,
          receipt: modelReceipt,
        });
      }

      const plan = publicPlan(message?.metadata?.botModePlan);
      if (plan) {
        plans.push({
          messageId: message.messageId,
          plan,
        });
      }
      const resultContent = publicResultContent(message?.content);
      if (resultContent) {
        results.push({
          messageId: message.messageId,
          content: resultContent,
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
      results,
      modelReceipts: modelReceipts.slice(-MAX_MODEL_RECEIPTS_PER_CONVERSATION),
    });
  }

  return {
    projectId,
    conversations: projectedConversations,
    memories: memoryProjection,
    sources: Array.isArray(sources)
      ? sources.map((source) => ({
          fileId: source?.file_id,
          filename: source?.filename,
          type: source?.type,
          size: finite(source?.size ?? source?.bytes),
        }))
      : [],
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
