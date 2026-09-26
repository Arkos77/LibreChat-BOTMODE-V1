import { createImprovementEvidenceContext } from './improvementEvidenceContext';

describe('P10 improvement evidence context', () => {
  it('preserves distinct host-owned native identities without merging them', () => {
    expect(
      createImprovementEvidenceContext({
        toolCallId: 'tool-call-1',
        toolName: 'verify_skill_target',
        producerAgentId: 'producer-agent',
        toolAgentId: 'checker-agent',
        taskId: 'task-1',
        traceId: 'trace-1',
        runId: 'run-1',
        threadId: 'thread-1',
      }),
    ).toEqual({
      source: 'native_tool_end',
      toolCallId: 'tool-call-1',
      toolName: 'verify_skill_target',
      producerAgentId: 'producer-agent',
      toolAgentId: 'checker-agent',
      taskId: 'task-1',
      traceId: 'trace-1',
      runId: 'run-1',
      threadId: 'thread-1',
    });
  });

  it('requires native tool and producer identities', () => {
    expect(() =>
      createImprovementEvidenceContext({
        toolCallId: ' ',
        toolName: 'verify_skill_target',
        producerAgentId: 'producer-agent',
      }),
    ).toThrow('toolCallId');

    expect(() =>
      createImprovementEvidenceContext({
        toolCallId: 'tool-call-2',
        toolName: ' ',
        producerAgentId: 'producer-agent',
      }),
    ).toThrow('toolName');

    expect(() =>
      createImprovementEvidenceContext({
        toolCallId: 'tool-call-3',
        toolName: 'verify_skill_target',
        producerAgentId: ' ',
      }),
    ).toThrow('producerAgentId');
  });

  it('omits unavailable optional identities instead of deriving substitutes', () => {
    expect(
      createImprovementEvidenceContext({
        toolCallId: 'tool-call-4',
        toolName: 'verify_skill_target',
        producerAgentId: 'producer-agent',
        toolAgentId: ' ',
        taskId: '',
        traceId: ' ',
        runId: '',
        threadId: ' ',
      }),
    ).toEqual({
      source: 'native_tool_end',
      toolCallId: 'tool-call-4',
      toolName: 'verify_skill_target',
      producerAgentId: 'producer-agent',
    });
  });

  it('contains no raw output, artifact, arguments, verdict, authorization or reasoning fields', () => {
    const result = createImprovementEvidenceContext({
      toolCallId: 'tool-call-5',
      toolName: 'verify_skill_target',
      producerAgentId: 'producer-agent',
    });

    expect(result).not.toHaveProperty('output');
    expect(result).not.toHaveProperty('content');
    expect(result).not.toHaveProperty('artifact');
    expect(result).not.toHaveProperty('arguments');
    expect(result).not.toHaveProperty('verdict');
    expect(result).not.toHaveProperty('authorized');
    expect(result).not.toHaveProperty('publishable');
    expect(result).not.toHaveProperty('reasoning');
    expect(result).not.toHaveProperty('confidence');
  });
});
