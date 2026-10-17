/** Resolve the existing conversation through the current owner's database
 * scope. A trusted pre-resolved request may be partial, but a cold recovery
 * must always request a complete owner-scoped document from persistence.
 */
async function resolveAuthorizedAgentConversation({
  userId,
  conversationId,
  getConvo,
  preResolved,
  allowPreResolved = false,
}) {
  if (
    typeof userId !== 'string' ||
    !userId ||
    typeof conversationId !== 'string' ||
    !conversationId ||
    typeof getConvo !== 'function'
  ) {
    throw new Error('AGENT_CONVERSATION_AUTHORITY_MISSING');
  }
  const partial =
    preResolved != null &&
    preResolved[Symbol.for('librechat.resolvedConversation.partial')] === true;
  const conversation =
    allowPreResolved && preResolved != null && !partial
      ? preResolved
      : await getConvo(userId, conversationId);
  if (!conversation || conversation.conversationId !== conversationId) {
    throw new Error('AGENT_CONVERSATION_OWNER_SCOPE_DENIED');
  }
  return conversation;
}
module.exports = { resolveAuthorizedAgentConversation };
