const mockCreateImprovementEvidenceContext = jest.fn();
const mockCreateToolEvidenceDistillRequest = jest.fn();

jest.mock('@librechat/api', () => ({
  createImprovementEvidenceContext: (...args) => mockCreateImprovementEvidenceContext(...args),
  createToolEvidenceDistillRequest: (...args) => mockCreateToolEvidenceDistillRequest(...args),
}));

const { createImprovementToolEvidenceRequest } = require('./improvementToolEvidence');

describe('P10 host tool evidence seam', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateImprovementEvidenceContext.mockImplementation((input) => ({
      source: 'native_tool_end',
      ...input,
    }));
    mockCreateToolEvidenceDistillRequest.mockReturnValue({ status: 'READY' });
  });

  it('builds a bounded native context before composing Distill evidence', () => {
    const candidate = { candidateId: 'candidate-1' };
    const declarations = [
      {
        toolName: 'verify_skill_target',
        criterionId: 'target',
        expectedValue: 'skill',
      },
    ];
    const result = createImprovementToolEvidenceRequest({
      toolEndData: {
        input: { secret: 'must-not-cross-boundary' },
        output: {
          name: 'verify_skill_target',
          tool_call_id: 'call-1',
          content: 'raw tool output',
          artifact: { private: true },
        },
      },
      metadata: {
        executingAgentId: 'checker-agent',
        run_id: 'run-1',
        thread_id: 'thread-1',
        ignored: 'must-not-cross-boundary',
      },
      taskId: 'task-1',
      traceId: 'trace-1',
      producerAgentId: 'producer-agent',
      candidate,
      declarations,
    });

    expect(mockCreateImprovementEvidenceContext).toHaveBeenCalledTimes(1);
    expect(mockCreateImprovementEvidenceContext).toHaveBeenCalledWith({
      toolName: 'verify_skill_target',
      toolCallId: 'call-1',
      producerAgentId: 'producer-agent',
      taskId: 'task-1',
      toolAgentId: 'checker-agent',
      traceId: 'trace-1',
      runId: 'run-1',
      threadId: 'thread-1',
    });
    expect(mockCreateImprovementEvidenceContext.mock.calls[0][0]).not.toHaveProperty('input');
    expect(mockCreateImprovementEvidenceContext.mock.calls[0][0]).not.toHaveProperty('content');
    expect(mockCreateImprovementEvidenceContext.mock.calls[0][0]).not.toHaveProperty('artifact');
    expect(mockCreateImprovementEvidenceContext.mock.calls[0][0]).not.toHaveProperty('ignored');

    expect(mockCreateToolEvidenceDistillRequest).toHaveBeenCalledTimes(1);
    expect(mockCreateToolEvidenceDistillRequest).toHaveBeenCalledWith({
      taskId: 'task-1',
      producerAgentId: 'producer-agent',
      candidate,
      toolName: 'verify_skill_target',
      toolCallId: 'call-1',
      toolAgentId: 'checker-agent',
      runId: 'run-1',
      declarations,
    });
    expect(result).toEqual({ status: 'READY' });
  });

  it('keeps trace and thread identity bounded to context instead of inventing Distill authority fields', () => {
    createImprovementToolEvidenceRequest({
      toolEndData: { output: { name: 'verify_skill_target', tool_call_id: 'call-2' } },
      metadata: { run_id: 'run-2', thread_id: 'thread-2' },
      taskId: 'task-2',
      traceId: 'trace-2',
      producerAgentId: 'producer-agent',
      candidate: { candidateId: 'candidate-2' },
      declarations: [],
    });

    const contextInput = mockCreateImprovementEvidenceContext.mock.calls[0][0];
    expect(contextInput).toMatchObject({
      taskId: 'task-2',
      traceId: 'trace-2',
      runId: 'run-2',
      threadId: 'thread-2',
    });

    const distillInput = mockCreateToolEvidenceDistillRequest.mock.calls[0][0];
    expect(distillInput).not.toHaveProperty('traceId');
    expect(distillInput).not.toHaveProperty('threadId');
    expect(distillInput).not.toHaveProperty('authorized');
    expect(distillInput).not.toHaveProperty('publishable');
  });

  it('fails closed without mandatory native or host identities', () => {
    const base = {
      metadata: {},
      taskId: 'task-3',
      producerAgentId: 'producer-agent',
      candidate: { candidateId: 'candidate-3' },
      declarations: [],
    };

    expect(() =>
      createImprovementToolEvidenceRequest({
        ...base,
        toolEndData: { output: { name: 'verify_skill_target' } },
      }),
    ).toThrow('toolCallId');

    expect(() =>
      createImprovementToolEvidenceRequest({
        ...base,
        toolEndData: { output: { tool_call_id: 'call-3' } },
      }),
    ).toThrow('toolName');

    expect(() =>
      createImprovementToolEvidenceRequest({
        ...base,
        taskId: ' ',
        toolEndData: { output: { name: 'verify_skill_target', tool_call_id: 'call-3' } },
      }),
    ).toThrow('taskId');

    expect(() =>
      createImprovementToolEvidenceRequest({
        ...base,
        producerAgentId: '',
        toolEndData: { output: { name: 'verify_skill_target', tool_call_id: 'call-3' } },
      }),
    ).toThrow('producerAgentId');
  });

  it('does not invent optional checker, trace, run or thread identities', () => {
    createImprovementToolEvidenceRequest({
      toolEndData: { output: { name: 'verify_skill_target', tool_call_id: 'call-4' } },
      metadata: {},
      taskId: 'task-4',
      producerAgentId: 'producer-agent',
      candidate: { candidateId: 'candidate-4' },
      declarations: [],
    });

    expect(mockCreateImprovementEvidenceContext).toHaveBeenCalledWith({
      toolName: 'verify_skill_target',
      toolCallId: 'call-4',
      producerAgentId: 'producer-agent',
      taskId: 'task-4',
      toolAgentId: undefined,
      traceId: undefined,
      runId: undefined,
      threadId: undefined,
    });

    expect(mockCreateToolEvidenceDistillRequest).toHaveBeenCalledWith({
      taskId: 'task-4',
      producerAgentId: 'producer-agent',
      candidate: { candidateId: 'candidate-4' },
      toolName: 'verify_skill_target',
      toolCallId: 'call-4',
      declarations: [],
    });
  });
});
