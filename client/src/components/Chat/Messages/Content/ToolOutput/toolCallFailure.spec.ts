import { TOOL_CALL_FAILURE_PREFIX } from './toolCallFailure';

describe('tool error prefix rendering', () => {
  it('recognizes and removes the normal tool wrapper without hiding the error details', () => {
    const text = 'Error: [execute_code] tool call failed: Permission denied';
    expect(TOOL_CALL_FAILURE_PREFIX.test(text)).toBe(true);
    expect(text.replace(TOOL_CALL_FAILURE_PREFIX, '')).toBe('Permission denied');
  });

  it('accepts multiple tool labels and case-insensitive wrappers', () => {
    expect(TOOL_CALL_FAILURE_PREFIX.test('error: [a] [b] TOOL CALL FAILED: boom')).toBe(true);
  });

  it('does not mistake ordinary output for a tool failure', () => {
    expect(TOOL_CALL_FAILURE_PREFIX.test('Error processing tool')).toBe(false);
    expect(TOOL_CALL_FAILURE_PREFIX.test('Error: [tool] success')).toBe(false);
  });

  it('handles repeated bracket groups without exponential backtracking', () => {
    const labels = '[tool] '.repeat(32);
    expect(TOOL_CALL_FAILURE_PREFIX.test(`Error: ${labels}other text`)).toBe(false);
    expect(TOOL_CALL_FAILURE_PREFIX.test(`Error: ${labels}tool call failed: details`)).toBe(true);
  });
});
