#!/usr/bin/env node
'use strict';

// Deterministic test of the real project projection implementation with an
// explicit MongoDB-style field selection. No secrets, backend or provider needed.
const assert = require('node:assert/strict');
const {
  createBotModeProjectProjection,
} = require('../../api/server/services/Projects/botModeProjectProjection');

const persistedMessage = {
  messageId: 'oracle-final',
  conversationId: 'project-conversation',
  isCreatedByUser: false,
  content: [
    { type: 'text', text: 'Durable Oracle published outcome' },
    { type: 'thinking', text: 'DO_NOT_EXPOSE_PRIVATE_REASONING' },
    { type: 'tool', input: 'DO_NOT_EXPOSE_TOOL_PAYLOAD' },
  ],
  metadata: {},
};

async function project() {
  const requestedFields = [];
  const deps = {
    getChatProject: async (userId, projectId) =>
      userId === 'test-owner' && projectId === 'test-project' ? { id: projectId } : null,
    getConvosByCursor: async () => ({
      conversations: [{ conversationId: 'project-conversation' }],
      nextCursor: null,
    }),
    getMessages: async (filter, select) => {
      assert.equal(filter.user, 'test-owner');
      assert.equal(filter.conversationId, 'project-conversation');
      requestedFields.push(select);
      const fields = new Set(select.split(/\s+/));
      return [
        Object.fromEntries(Object.entries(persistedMessage).filter(([field]) => fields.has(field))),
      ];
    },
    getConvoFiles: async () => [],
    getUserMemories: async () => [],
    listMtoObservations: async () => [],
  };
  const projection = await createBotModeProjectProjection({
    userId: 'test-owner',
    projectId: 'test-project',
    deps,
  });
  assert.deepEqual(projection.conversations[0].results, [
    { messageId: 'oracle-final', content: 'Durable Oracle published outcome' },
  ]);
  assert.match(requestedFields[0], /\bcontent\b/);
  assert(!JSON.stringify(projection).includes('DO_NOT_EXPOSE'));
  assert.equal(
    await createBotModeProjectProjection({ userId: 'nonowner', projectId: 'test-project', deps }),
    null,
    'non-owner must not receive a projection',
  );
}

project()
  .then(() => {
    console.log('BOTMODE_PROJECT_PERSISTED_CONTENT_SELECTION=PASS');
    console.log('BOTMODE_PROJECT_PRIVATE_MESSAGE_PARTS_EXCLUDED=PASS');
    console.log('BOTMODE_PROJECT_NONOWNER_ISOLATION=PASS');
  })
  .catch((error) => {
    console.error('BOTMODE_PROJECT_CONTENT_REGRESSION=FAIL', error.message);
    process.exitCode = 1;
  });
