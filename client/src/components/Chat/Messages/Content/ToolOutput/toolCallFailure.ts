/**
 * Tool-call error wrappers contain bracketed tool names. Exclude closing brackets
 * inside a name to avoid exponential backtracking of repeated lazy dot groups.
 */
export const TOOL_CALL_FAILURE_PREFIX = /^Error:\s*(?:\[[^\]\r\n]*\]\s*)*tool call failed:\s*/i;
