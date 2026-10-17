'use strict';
const assert = require('node:assert/strict');
const {
  resolveAuthorizedAgentConversation,
} = require('../../api/server/services/Endpoints/agents/resolveAuthorizedAgentConversation');
(async () => {
  let reads = 0;
  const getConvo = async (uid, cid) => {
    reads++;
    assert.equal(uid, 'owner');
    assert.equal(cid, 'conv');
    return { conversationId: 'conv', agent_id: 'primary' };
  };
  const input = { userId: 'owner', conversationId: 'conv', getConvo };
  const saved = await resolveAuthorizedAgentConversation(input);
  assert.equal(saved.agent_id, 'primary');
  assert.equal(reads, 1);
  const preResolved = { conversationId: 'conv', agent_id: 'primary' };
  assert.equal(
    await resolveAuthorizedAgentConversation({ ...input, preResolved, allowPreResolved: true }),
    preResolved,
  );
  assert.equal(reads, 1);
  preResolved[Symbol.for('librechat.resolvedConversation.partial')] = true;
  await resolveAuthorizedAgentConversation({ ...input, preResolved, allowPreResolved: true });
  assert.equal(reads, 2);
  await resolveAuthorizedAgentConversation({ ...input, preResolved });
  assert.equal(reads, 3);
  for (const change of [{ userId: '' }, { conversationId: '' }, { getConvo: null }]) {
    await assert.rejects(
      resolveAuthorizedAgentConversation({ ...input, ...change }),
      /AUTHORITY_MISSING/,
    );
  }
  await assert.rejects(
    resolveAuthorizedAgentConversation({
      ...input,
      getConvo: async () => ({ conversationId: 'other' }),
    }),
    /OWNER_SCOPE_DENIED/,
  );
  console.log('BOTMODE_AUTHORIZED_CONVERSATION_RESOLVER=PASS');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
