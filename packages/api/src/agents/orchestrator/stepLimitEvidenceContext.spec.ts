import { createStepLimitEvidenceContext } from './stepLimitEvidenceContext';

describe('P10 step-limit evidence context', () => {
  it('preserves all explicit identity dimensions without merging them', () => {
    expect(
      createStepLimitEvidenceContext({
        traceId: 'trace-1',
        responseMessageId: 'response-1',
        taskId: 'task-1',
        producerAgentId: 'producer-agent',
        toolCallId: 'tool-call-1',
        toolName: 'verify_skill_target',
        toolAgentId: 'checker-agent',
        runId: 'run-1',
        threadId: 'thread-1',
      }),
    ).toEqual({
      source: 'native_step_limit',
      signal: 'tool_call_limit',
      traceId: 'trace-1',
      responseMessageId: 'response-1',
      taskId: 'task-1',
      producerAgentId: 'producer-agent',
      toolCallId: 'tool-call-1',
      toolName: 'verify_skill_target',
      toolAgentId: 'checker-agent',
      runId: 'run-1',
      threadId: 'thread-1',
    });
  });

  it('requires only the host step-limit correlation identities', () => {
    expect(() =>
      createStepLimitEvidenceContext({ traceId: ' ', responseMessageId: 'response-2' }),
    ).toThrow('traceId');

    expect(() =>
      createStepLimitEvidenceContext({ traceId: 'trace-2', responseMessageId: '' }),
    ).toThrow('responseMessageId');
  });

  it('omits unavailable optional identities instead of inventing substitutes', () => {
    expect(
      createStepLimitEvidenceContext({
        traceId: 'trace-3',
        responseMessageId: 'response-3',
        taskId: ' ',
        producerAgentId: '',
        toolCallId: ' ',
        toolName: '',
        toolAgentId: ' ',
        runId: '',
        threadId: ' ',
      }),
    ).toEqual({
      source: 'native_step_limit',
      signal: 'tool_call_limit',
      traceId: 'trace-3',
      responseMessageId: 'response-3',
    });
  });

  it('contains no raw output, arguments, artifacts, verdict, authorization or reasoning', () => {
    const result = createStepLimitEvidenceContext({
      traceId: 'trace-4',
      responseMessageId: 'response-4',
      toolCallId: 'tool-call-4',
      toolName: 'verify_skill_target',
    });

    expect(result).not.toHaveProperty('output');
    expect(result).not.toHaveProperty('content');
    expect(result).not.toHaveProperty('arguments');
    expect(result).not.toHaveProperty('artifact');
    expect(result).not.toHaveProperty('reasoning');
    expect(result).not.toHaveProperty('verdict');
    expect(result).not.toHaveProperty('authorized');
    expect(result).not.toHaveProperty('publishable');
    expect(result).not.toHaveProperty('confidence');
  });

  it('keeps the step-limit signal fixed and host-owned', () => {
    const result = createStepLimitEvidenceContext({
      traceId: 'trace-5',
      responseMessageId: 'response-5',
    });

    expect(result.source).toBe('native_step_limit');
    expect(result.signal).toBe('tool_call_limit');
  });
});
