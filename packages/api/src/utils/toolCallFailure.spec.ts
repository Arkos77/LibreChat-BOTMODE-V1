import { isToolCallFailurePrefix } from './toolCallFailure';

describe('serialized tool-call failure detection', () => {
  it.each([
    'Error: [execute_code] tool call failed: boom',
    'Error: [research] [executor] tool call failed: denied',
    'Error: tool call failed: failed',
    'error: [test-tool] TOOL CALL FAILED: bad',
  ])('recognizes host-authored tool failures: %s', (message) => {
    expect(isToolCallFailurePrefix(message)).toBe(true);
  });

  it.each([
    'Error processing tool',
    'Error: [test-tool] returned successfully',
    'ordinary tool output',
    'Error: [test-tool tool call failed: missing bracket',
  ])('does not flag ordinary tool output: %s', (message) => {
    expect(isToolCallFailurePrefix(message)).toBe(false);
  });

  it('rejects repeated bracket groups without exponential backtracking', () => {
    const nonMatching = `Error: ${'[tool] '.repeat(32)}not a tool failure`;
    expect(isToolCallFailurePrefix(nonMatching)).toBe(false);
    expect(isToolCallFailurePrefix(`Error: ${'[tool] '.repeat(32)}tool call failed: boom`)).toBe(
      true,
    );
  });
});
