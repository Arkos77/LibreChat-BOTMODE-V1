const mockCreateToolEvidenceDistillRequest = jest.fn();

jest.mock('@librechat/api', () => ({
  createToolEvidenceDistillRequest: (...args) => mockCreateToolEvidenceDistillRequest(...args),
}));

const { createImprovementToolEvidenceRequest } = require('./improvementToolEvidence');

const candidate = {
  candidateId: 'candidate-host-1',
  target: 'skill',
  status: 'CANDIDATE',
  traceId: 'trace-host-1',
  payloadDigest: 'digest-host-1',
};

beforeEach(() => {
  mockCreateToolEvidenceDistillRequest.mockReset();
  mockCreateToolEvidenceDistillRequest.mockReturnValue({ status: 'READY' });
});

describe('P10 host tool evidence seam', () => {
  it('passes only native identities plus explicit host context to the pure composition', () => {
    const declarations = [
      { toolName: 'verify_skill_target', criterionId: 'target', expectedValue: 'skill' },
    ];
    const result = createImprovementToolEvidenceRequest({
      toolEndData: {
        input: { ignored: true },
        output: {
          name: 'verify_skill_target',
          tool_call_id: 'call-host-1',
          content: 'raw output must not be promoted',
          artifact: { secret: 'ignored' },
        },
      },
      metadata: {
        run_id: 'run-host-1',
        thread_id: 'thread-host-1',
        executingAgentId: 'checker-agent',
        extra: 'ignored',
      },
      taskId: 'task-host-1',
      producerAgentId: 'producer-agent',
      candidate,
      declarations,
    });

    expect(result).toEqual({ status: 'READY' });
    expect(mockCreateToolEvidenceDistillRequest).toHaveBeenCalledWith({
      taskId: 'task-host-1',
      producerAgentId: 'producer-agent',
      candidate,
      toolName: 'verify_skill_target',
      toolCallId: 'call-host-1',
      toolAgentId: 'checker-agent',
      runId: 'run-host-1',
      declarations,
    });
    const forwarded = mockCreateToolEvidenceDistillRequest.mock.calls[0][0];
    expect(forwarded).not.toHaveProperty('output');
    expect(forwarded).not.toHaveProperty('artifact');
    expect(forwarded).not.toHaveProperty('threadId');
    expect(forwarded).not.toHaveProperty('arguments');
  });

  it('fails closed without a native tool_call_id', () => {
    expect(() =>
      createImprovementToolEvidenceRequest({
        toolEndData: { output: { name: 'verify_skill_target' } },
        metadata: { executingAgentId: 'checker-agent' },
        taskId: 'task-host-2',
        producerAgentId: 'producer-agent',
        candidate,
        declarations: [],
      }),
    ).toThrow('toolCallId');
    expect(mockCreateToolEvidenceDistillRequest).not.toHaveBeenCalled();
  });

  it('fails closed without a native tool name', () => {
    expect(() =>
      createImprovementToolEvidenceRequest({
        toolEndData: { output: { tool_call_id: 'call-host-3' } },
        metadata: { executingAgentId: 'checker-agent' },
        taskId: 'task-host-3',
        producerAgentId: 'producer-agent',
        candidate,
        declarations: [],
      }),
    ).toThrow('toolName');
    expect(mockCreateToolEvidenceDistillRequest).not.toHaveBeenCalled();
  });

  it('does not invent checker or run identity when native metadata omits them', () => {
    createImprovementToolEvidenceRequest({
      toolEndData: {
        output: { name: 'verify_skill_target', tool_call_id: 'call-host-4', content: 'x' },
      },
      metadata: {},
      taskId: 'task-host-4',
      producerAgentId: 'producer-agent',
      candidate,
      declarations: [],
    });

    expect(mockCreateToolEvidenceDistillRequest).toHaveBeenCalledWith({
      taskId: 'task-host-4',
      producerAgentId: 'producer-agent',
      candidate,
      toolName: 'verify_skill_target',
      toolCallId: 'call-host-4',
      declarations: [],
    });
  });
});
