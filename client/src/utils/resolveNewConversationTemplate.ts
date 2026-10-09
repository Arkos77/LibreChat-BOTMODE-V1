import { Constants, isAgentsEndpoint } from 'librechat-data-provider';
import type { TConversation, TPreset } from 'librechat-data-provider';

/**
 * New-conversation param endpoints normally discard template fields so only
 * the requested endpoint is carried into schema initialization. An explicitly
 * selected agent must keep its identity even when that initialization is
 * intentionally skipped. Otherwise "agents" loses its agent_id and the
 * composer silently falls back to "Select a model".
 *
 * A matching agent preset is required: URL parameters or stale template
 * fields alone cannot restore an unauthorized agent selection.
 */
export function resolveNewConversationTemplate({
  template,
  preset,
  paramEndpoint,
}: {
  template: Partial<TConversation>;
  preset?: Partial<TPreset>;
  paramEndpoint: boolean;
}): Partial<TConversation> {
  if (!paramEndpoint || template.conversationId !== Constants.NEW_CONVO) {
    return template;
  }

  const sanitized: Partial<TConversation> = {
    endpoint: template.endpoint,
    chatProjectId: template.chatProjectId,
  };

  if (
    isAgentsEndpoint(template.endpoint) &&
    isAgentsEndpoint(preset?.endpoint) &&
    template.agent_id &&
    template.agent_id === preset?.agent_id
  ) {
    sanitized.agent_id = template.agent_id;
  }

  return sanitized;
}
