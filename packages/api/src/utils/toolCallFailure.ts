/**
 * Match the SDK's serialized tool-failure prefix with an unambiguous bracket
 * group. The old repeated lazy dot pattern could backtrack exponentially on
 * repeated bracket tokens when the "tool call failed:" suffix was absent.
 */
const TOOL_CALL_FAILURE_PREFIX = /^Error:\s*(?:\[[^\]\r\n]*\]\s*)*tool call failed:/i;

export function isToolCallFailurePrefix(value: string): boolean {
  return TOOL_CALL_FAILURE_PREFIX.test(value);
}
