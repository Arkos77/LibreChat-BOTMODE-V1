import { Constants, EModelEndpoint } from 'librechat-data-provider';
import { resolveNewConversationTemplate } from './resolveNewConversationTemplate';

describe('resolveNewConversationTemplate', () => {
  const selection = {
    conversationId: Constants.NEW_CONVO,
    endpoint: EModelEndpoint.agents,
    agent_id: 'agent-authorized',
    chatProjectId: null,
    spec: 'old-soft-default',
  };

  it('keeps the explicitly selected agent on a parameterized New Chat', () => {
    expect(
      resolveNewConversationTemplate({
        template: selection,
        preset: { endpoint: EModelEndpoint.agents, agent_id: 'agent-authorized' },
        paramEndpoint: true,
      }),
    ).toEqual({
      endpoint: EModelEndpoint.agents,
      agent_id: 'agent-authorized',
      chatProjectId: null,
    });
  });

  it('rejects an agent id without a matching explicit preset', () => {
    for (const preset of [
      undefined,
      { endpoint: EModelEndpoint.agents, agent_id: 'agent-other' },
      { endpoint: EModelEndpoint.openAI, agent_id: 'agent-authorized' },
    ]) {
      expect(
        resolveNewConversationTemplate({
          template: selection,
          preset,
          paramEndpoint: true,
        }),
      ).toEqual({
        endpoint: EModelEndpoint.agents,
        chatProjectId: null,
      });
    }
  });

  it('does not carry an agent id into non-agent parameterized endpoints', () => {
    expect(
      resolveNewConversationTemplate({
        template: { ...selection, endpoint: EModelEndpoint.openAI },
        preset: { endpoint: EModelEndpoint.openAI, agent_id: 'agent-authorized' },
        paramEndpoint: true,
      }),
    ).toEqual({ endpoint: EModelEndpoint.openAI, chatProjectId: null });
  });

  it('leaves existing conversations and non-parameterized templates unchanged', () => {
    const existing = { ...selection, conversationId: 'convo-existing' };
    expect(
      resolveNewConversationTemplate({
        template: existing,
        preset: undefined,
        paramEndpoint: true,
      }),
    ).toBe(existing);
    expect(
      resolveNewConversationTemplate({
        template: selection,
        preset: undefined,
        paramEndpoint: false,
      }),
    ).toBe(selection);
  });
});
