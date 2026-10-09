import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Constants,
  QueryKeys,
  dataService,
  EModelEndpoint,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import type { TConversation, TPreset, Agent } from 'librechat-data-provider';
import useGetConversation from '~/hooks/Conversations/useGetConversation';
import useDefaultConvo from '~/hooks/Conversations/useDefaultConvo';
import { useAgentsMapContext } from '~/Providers/AgentsMapContext';
import useNewConvo from '~/hooks/useNewConvo';
import { logger } from '~/utils';

export default function useSelectAgent() {
  const queryClient = useQueryClient();
  const agentsMap = useAgentsMapContext();
  const getDefaultConversation = useDefaultConvo();
  const { newConversation } = useNewConvo();
  const getConversation = useGetConversation(0);

  const updateConversation = useCallback(
    async (
      agent: Partial<Agent>,
      template: Partial<TPreset | TConversation>,
      /** The passes that follow the first one only carry freshly fetched agent details into the
       * composer the first pass opened, so a paste started meanwhile keeps its draft. */
      keepComposerState = false,
    ) => {
      const conversation = await getConversation();
      logger.log('conversation', 'Updating conversation with agent', agent);
      if (isAssistantsEndpoint(conversation?.endpoint)) {
        newConversation({
          template: { ...(template as Partial<TConversation>) },
          preset: template as Partial<TPreset>,
          keepComposerState,
        });
        return;
      }
      const currentConvo = getDefaultConversation({
        conversation: { ...(conversation ?? {}), agent_id: agent.id },
        preset: template,
      });
      newConversation({
        template: currentConvo,
        preset: template as Partial<TPreset>,
        keepComposerState,
      });
    },
    [getConversation, getDefaultConversation, newConversation],
  );

  const onSelect = useCallback(
    async (value: string) => {
      // The builder can fetch an agent before the shared agents map hydrates.
      // Never silently ignore an explicit selection in that window. Fetching
      // by ID also preserves authorization: a missing/revoked agent cannot
      // become the active conversation simply because the panel displayed it.
      const cachedAgent = agentsMap?.[value];
      let agent = cachedAgent;
      if (!agent) {
        try {
          agent = await queryClient.fetchQuery([QueryKeys.agent, value], () =>
            dataService.getAgentById({ agent_id: value }),
          );
        } catch (error) {
          if (!(error as { silent?: boolean } | undefined)?.silent) {
            console.error('Error loading agent for selection:', error);
          }
          return;
        }
      }
      if (agent?.id !== value) {
        return;
      }

      const template: Partial<TPreset | TConversation> = {
        endpoint: EModelEndpoint.agents,
        agent_id: agent.id,
        conversationId: Constants.NEW_CONVO as string,
      };

      await updateConversation({ id: agent.id }, template);

      try {
        const fullAgent = cachedAgent
          ? await queryClient.fetchQuery([QueryKeys.agent, agent.id], () =>
              dataService.getAgentById({ agent_id: agent.id }),
            )
          : agent;
        if (fullAgent?.id === agent.id) {
          await updateConversation(fullAgent, { ...template, agent_id: fullAgent.id }, true);
        }
      } catch (error) {
        if ((error as { silent: boolean } | undefined)?.silent) {
          console.warn('Current fetch was cancelled');
          return;
        }
        console.error('Error fetching full agent data:', error);
        await updateConversation({}, { ...template, agent_id: undefined }, true);
      }
    },
    [agentsMap, updateConversation, queryClient],
  );

  return { onSelect };
}
