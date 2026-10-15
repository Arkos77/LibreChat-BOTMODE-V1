import { Constants, EModelEndpoint } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import { mergeChatSelectionParams } from '../createChatSearchParams';

const convo = (selection: Partial<TConversation>): TConversation =>
  ({ conversationId: Constants.NEW_CONVO, ...selection }) as TConversation;

describe('mergeChatSelectionParams', () => {
  it('replaces an obsolete OpenAI query with the actual selected agent on navigation', () => {
    const previous = new URLSearchParams('endpoint=openAI&model=gpt-5.6&projectId=abc&prompt=hi');
    const next = mergeChatSelectionParams(
      previous,
      convo({ endpoint: EModelEndpoint.agents, agent_id: 'agent_live', model: undefined }),
    );

    expect(next.get('agent_id')).toBe('agent_live');
    expect(next.has('endpoint')).toBe(false);
    expect(next.has('model')).toBe(false);
    expect(next.get('projectId')).toBe('abc');
    expect(next.get('prompt')).toBe('hi');
    expect(previous.get('model')).toBe('gpt-5.6');
  });

  it('lets an explicitly selected spec replace an older agent identity', () => {
    const previous = new URLSearchParams('agent_id=agent_old&endpoint=agents');
    const next = mergeChatSelectionParams(
      previous,
      convo({ endpoint: EModelEndpoint.openAI, model: 'gpt-5.6', spec: 'new-spec' }),
    );
    expect(next.toString()).toBe('spec=new-spec');
  });

  it('clears old agent identity when a fallback model becomes active', () => {
    const previous = new URLSearchParams('agent_id=agent_removed&spec=old-spec');
    const next = mergeChatSelectionParams(
      previous,
      convo({ endpoint: EModelEndpoint.openAI, model: 'gpt-5.6' }),
    );
    expect(next.has('agent_id')).toBe(false);
    expect(next.has('spec')).toBe(false);
    expect(next.get('endpoint')).toBe(EModelEndpoint.openAI);
    expect(next.get('model')).toBe('gpt-5.6');
  });
});
