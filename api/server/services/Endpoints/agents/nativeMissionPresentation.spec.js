const {
  prepareBotModeMission,
  deterministicPlanner,
  validateMissionTask,
  normalizeMissionOracleState,
  areMissionOracleResultsEquivalent,
  renderMissionPublication,
} = require('@librechat/api');
const {
  createNativeMissionModelOnlyRecoveryCallbacks,
} = require('./nativeMissionModelOnlyRecoveryCallbacks');
const {
  createNativeMissionDurablePublicationStage,
} = require('./nativeMissionDurablePublicationStage');

async function fixture() {
  const url = 'https://ci-source.invalid/report';
  const plan = deterministicPlanner.planMission(
    prepareBotModeMission(
      {
        missionId: 'presentation-host',
        taskId: 'root',
        objective: 'Research',
        constraints: [],
        requiredCapabilities: ['web_search'],
      },
      { researchContract: 'research-v2' },
    ),
    {
      worker: {
        id: 'worker',
        agentId: 'saved',
        role: 'worker',
        capabilities: ['web_search'],
        constraints: [],
      },
      specialists: [],
    },
  );
  const task = plan.tasks[0];
  const raw = JSON.stringify({ ok: true, result: 'Three checks passed.', sources: url });
  const observation = { toolCallId: 'native-search', urls: [url] };
  const result = await validateMissionTask({
    taskId: task.taskId,
    nodeId: task.nodeId,
    agentId: task.agentId,
    requirements: task.validation,
    candidate: raw,
    observedSources: [observation],
  });
  const oracle = {
    evidence: {},
    results: { [task.taskId]: result },
    sources: { [task.taskId]: [observation] },
  };
  const candidate = {
    streamId: 'thread',
    createdAt: 1,
    checkpointId: 'cp',
    checkpointNamespace: 'ns',
  };
  const claim = { ...candidate, ownerToken: 'owner' };
  const job = {
    ...candidate,
    status: 'running',
    orchestratorPlan: plan,
    missionOracleState: oracle,
    endpoint: 'agents',
    userId: 'user',
    agent_id: 'saved',
    userMessage: { messageId: 'request' },
    responseMessageId: 'response',
    providerExecutionId: 'provider',
    providerExecutionStartedId: 'provider',
  };
  const conversation = { conversationId: 'thread', agent_id: 'saved' };
  const messages = new Map([
    [
      'request',
      { messageId: 'request', conversationId: 'thread', user: 'user', isCreatedByUser: true },
    ],
  ]);
  const emitted = [];
  let casCalls = 0;
  const store = {
    getJob: async () => structuredClone(job),
    updateRecoveredMissionEvidence: async (_id, _at, owner, provider, updates) => {
      if (owner !== 'owner' || provider !== 'provider') return false;
      Object.assign(job, structuredClone(updates));
      return true;
    },
    finalizeRecoveredMissionTerminal: async (_id, _at, owner, provider, _ns, _message, frame) => {
      if (owner !== 'owner' || provider !== 'provider' || job.terminalPersistencePending !== true)
        return false;
      expect(messages.get('response').content).toEqual(JSON.parse(frame).responseMessage.content);
      job.terminalPersistencePending = false;
      casCalls++;
      return true;
    },
  };
  const manager = { getJobStore: () => store };
  const callbacks = createNativeMissionModelOnlyRecoveryCallbacks({
    manager,
    validateMissionTask,
    normalizeOracleState: normalizeMissionOracleState,
    areMissionOracleResultsEquivalent,
    getConversation: async () => conversation,
    getMessage: async ({ messageId }) => structuredClone(messages.get(messageId)),
    saveMessage: async (_options, message) => {
      messages.set(message.messageId, structuredClone(message));
      return message;
    },
    sanitizeMessage: (message) => message,
    emitDone: async (_id, frame) => emitted.push(frame),
  });
  const client = { orchestratorPlan: plan, options: {} };
  const graph = {
    getState: async () => ({
      next: [],
      tasks: [],
      values: { agentOutputs: { [task.nodeId]: { content: raw } } },
    }),
  };
  const publication = await callbacks.publication({
    client,
    graph,
    candidate,
    claim,
    assertAuthorized: async () => {},
  });
  return {
    plan,
    task,
    job,
    store,
    candidate,
    claim,
    oracle,
    raw,
    publication,
    messages,
    emitted,
    casCalls: () => casCalls,
  };
}

it('stages the same deterministic sources for resumed durable history and the single final frame', async () => {
  const f = await fixture();
  const before = JSON.stringify(f.oracle);
  const expected = await renderMissionPublication(f.plan, f.oracle);
  const candidate = await f.publication.getCandidate();
  expect(candidate.content).toEqual([{ type: 'text', text: expected }]);
  await createNativeMissionDurablePublicationStage({
    store: f.store,
    identity: { ...f.candidate, ownerToken: 'owner', providerExecutionId: 'provider' },
    getCandidate: f.publication.getCandidate,
  })();
  f.job.status = 'complete';
  f.job.terminalPersistencePending = true;
  await f.publication.publishTerminal();
  expect(f.messages.get('response').content).toEqual(candidate.content);
  expect(f.emitted[0].responseMessage.content).toEqual(candidate.content);
  expect(f.casCalls()).toBe(1);
  expect(f.emitted).toHaveLength(1);
  await expect(f.publication.publishTerminal()).rejects.toThrow();
  expect(f.emitted).toHaveLength(1);
  expect(JSON.stringify(f.oracle)).toBe(before);
});

it('refuses resumed presentation after native source evidence disappears', async () => {
  const f = await fixture();
  f.job.missionOracleState.sources = {};
  await expect(f.publication.getCandidate()).rejects.toThrow();
  expect(f.messages.has('response')).toBe(false);
  expect(f.emitted).toEqual([]);
});
