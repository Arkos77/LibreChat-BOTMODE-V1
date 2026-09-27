const mockTaskStore = {
  configureTaskControlTransport: jest.fn().mockResolvedValue(undefined),
  configureActivityStream: jest.fn(),
  prepareActivityForShutdown: jest.fn(),
  destroyTaskControlTransport: jest.fn().mockResolvedValue(undefined),
  destroyActivityStream: jest.fn(),
};
const mockCompletionWakeupHandler = jest.fn().mockResolvedValue(undefined);

jest.mock('@librechat/api', () => ({
  cacheConfig: { USE_REDIS: true, REDIS_KEY_PREFIX: 'test:' },
  ioredisClient: { duplicate: jest.fn() },
  registerShutdownTask: jest.fn(),
  duplicateIoRedisClient: jest.fn(),
  createSubagentThreadTaskStore: jest.fn(() => mockTaskStore),
  createSubagentCompletionWakeupHandler: jest.fn(() => mockCompletionWakeupHandler),
  RedisSubagentTaskControlTransport: jest.fn(),
  RedisEventTransport: jest.fn(),
  SubagentActivityStream: jest.fn(),
}));

jest.mock('~/models', () => ({
  acquireSubagentThreadLease: jest.fn(),
  claimSubagentTaskResult: jest.fn(),
  releaseSubagentTaskResultClaim: jest.fn(),
  countActiveSubagentThreadLeases: jest.fn(),
  deleteConvos: jest.fn(),
  deleteMessages: jest.fn(),
  getConvo: jest.fn(),
  getSubagentTaskControlReplay: jest.fn(),
  getMessages: jest.fn(),
  listActiveSubagentThreadLeases: jest.fn(),
  recordSubagentTaskControlReceipt: jest.fn(),
  releaseSubagentThreadLease: jest.fn(),
  reserveSubagentThread: jest.fn(),
  renewSubagentThreadLease: jest.fn(),
  saveConvo: jest.fn(),
  saveMessage: jest.fn(),
  recordImprovementCandidate: jest.fn(),
  recordImprovementLifecycleEvent: jest.fn(),
  isSubagentOwnerAdmissible: jest.fn(),
  fenceSubagentAdmission: jest.fn(),
  renewSubagentAdmission: jest.fn(),
  releaseSubagentAdmission: jest.fn(),
}));

jest.mock('../../Agents/triggers', () => ({
  enqueueAgentTrigger: jest.fn(),
}));

const {
  ioredisClient,
  registerShutdownTask,
  duplicateIoRedisClient,
  createSubagentThreadTaskStore,
} = require('@librechat/api');
const subagentThreadTaskStore = require('./subagentThreadStore');
const { configureSubagentTaskRouting } = subagentThreadTaskStore;
jest.mock('./improvementCandidate', () => ({ observeStepLimitImprovementCandidate: jest.fn() }));
jest.mock('./improvementValidation', () => ({ validateStepLimitImprovementCandidate: jest.fn() }));
jest.mock('./subagentToolObservation', () => ({ observeSubagentToolCompletion: jest.fn() }));
const taskStoreOptions = createSubagentThreadTaskStore.mock.calls[0][1];
const taskStoreMethods = createSubagentThreadTaskStore.mock.calls[0][0];
const db = require('~/models');
const { observeSubagentToolCompletion } = require('./subagentToolObservation');
const { observeStepLimitImprovementCandidate } = require('./improvementCandidate');
const { validateStepLimitImprovementCandidate } = require('./improvementValidation');
const { observeMtoEvent } = require('./mtoObservation');
const activityPrepareRegistration = registerShutdownTask.mock.calls.find(
  ([name]) => name === 'subagent activity streams prepare',
);
const taskStoreShutdownRegistration = registerShutdownTask.mock.calls.find(
  ([name]) => name === 'subagent task store',
);

describe('subagent thread Redis lifecycle', () => {
  it('wires durable control receipt persistence into the host store', () => {
    expect(taskStoreMethods.recordSubagentTaskControlReceipt).toBe(
      db.recordSubagentTaskControlReceipt,
    );
    expect(taskStoreMethods.getSubagentTaskControlReplay).toBe(db.getSubagentTaskControlReplay);
  });

  it('routes child tool observations to MTO without evidence declarations', () => {
    const completion = {
      traceId: 'trace-1',
      taskId: 'task-1',
      toolCallId: 'call-1',
      toolName: 'verify',
    };
    taskStoreOptions.onTaskToolCompleted(completion);
    expect(observeSubagentToolCompletion).toHaveBeenCalledWith(completion, observeMtoEvent);
    expect(taskStoreOptions).not.toHaveProperty('improvementEvidenceDeclarations');
  });

  it('validates only after the native child candidate persists', async () => {
    const candidate = { candidateId: 'workflow-step-limit:trace-1:task-1' };
    observeStepLimitImprovementCandidate
      .mockResolvedValueOnce(candidate)
      .mockResolvedValueOnce(null);
    const failure = {
      userId: 'user-1',
      conversationId: 'thread-1',
      traceId: 'trace-1',
      taskId: 'task-1',
      producerAgentId: 'agent-1',
      responseMessageId: 'task-1:assistant',
      createdAt: '2026-09-27T18:00:00.000Z',
    };
    await taskStoreOptions.onTaskStepLimit(failure);
    expect(observeStepLimitImprovementCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        persistCandidate: db.recordImprovementCandidate,
      }),
    );
    expect(validateStepLimitImprovementCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate,
        taskId: 'task-1',
        producerAgentId: 'agent-1',
        persistLifecycleEvent: db.recordImprovementLifecycleEvent,
        mtoEventSink: observeMtoEvent,
      }),
    );
    validateStepLimitImprovementCandidate.mockClear();
    await taskStoreOptions.onTaskStepLimit(failure);
    expect(validateStepLimitImprovementCandidate).not.toHaveBeenCalled();
  });

  it('pre-registers completion wakeups for every prepared task', async () => {
    await taskStoreOptions.onTaskPrepared({ taskId: 'task-1' });

    expect(mockCompletionWakeupHandler).toHaveBeenCalledWith({ taskId: 'task-1' });
  });

  it('registers local task-store quiescence independently of optional Redis setup', () => {
    expect(taskStoreShutdownRegistration).toEqual([
      'subagent task store',
      expect.any(Function),
      { priority: 90 },
    ]);
  });

  it('closes activity SSE before drain and disconnects its subscriber after drain', async () => {
    const taskSubscriber = { disconnect: jest.fn() };
    const activitySubscriber = { disconnect: jest.fn() };
    const taskPublisher = { disconnect: jest.fn() };
    const activityPublisher = { disconnect: jest.fn() };
    ioredisClient.duplicate
      .mockReturnValueOnce(taskSubscriber)
      .mockReturnValueOnce(activitySubscriber);
    duplicateIoRedisClient
      .mockReturnValueOnce(taskPublisher)
      .mockReturnValueOnce(activityPublisher);

    await configureSubagentTaskRouting();

    expect(activityPrepareRegistration).toEqual([
      'subagent activity streams prepare',
      expect.any(Function),
      { phase: 'pre-drain', priority: 100 },
    ]);
    expect(taskStoreShutdownRegistration).toEqual([
      'subagent task store',
      expect.any(Function),
      { priority: 90 },
    ]);
    const prepare = activityPrepareRegistration[1];
    prepare();
    expect(mockTaskStore.prepareActivityForShutdown).toHaveBeenCalledTimes(1);

    const shutdown = taskStoreShutdownRegistration[1];
    await shutdown();

    expect(mockTaskStore.destroyTaskControlTransport).toHaveBeenCalledTimes(1);
    expect(mockTaskStore.destroyActivityStream).toHaveBeenCalledTimes(1);
    expect(taskPublisher.disconnect).toHaveBeenCalledTimes(1);
    expect(activitySubscriber.disconnect).toHaveBeenCalledTimes(1);
    expect(activityPublisher.disconnect).toHaveBeenCalledTimes(1);
  });
});
