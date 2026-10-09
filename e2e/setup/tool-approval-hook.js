/**
 * Dynamic approval-policy fixture for the mock Playwright suite.
 *
 * The `review` argument selects behavior that cannot be expressed by the static
 * ask list: a restricted decision set, or an authoritative argument rewrite.
 */
module.exports = () => () => async (input) => {
  if (input.toolInput.review === 'restricted') {
    return {
      decision: 'ask',
      reason: 'E2E approval offers approve or reject only.',
      allowedDecisions: ['approve', 'reject'],
    };
  }

  if (input.toolInput.review === 'rewrite') {
    const originalValue =
      typeof input.toolInput.value === 'string' ? input.toolInput.value : 'original-missing';
    return {
      decision: 'ask',
      reason: 'E2E approval reviews rewritten arguments.',
      updatedInput: {
        value: originalValue.replace(/^original-/, 'rewritten-'),
      },
    };
  }

  // The SDK requires an explicit authorization decision from every matching
  // PreToolUse hook. Returning {} causes AUTHORIZATION_DECISION_REQUIRED and
  // converts the intended HITL pause into a blocked tool result. This 'allow'
  // is only the fixture hook's vote: the static policy still returns 'ask'
  // for approval_probe, and the SDK's deny > ask > allow fold preserves it.
  return { decision: 'allow' };
};
