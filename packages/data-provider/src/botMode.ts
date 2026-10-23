import { z } from 'zod';

export const botModeSettingsSchema = z
  .object({
    version: z.literal(1),
    mode: z.enum(['fast', 'analyze', 'develop', 'watch']),
    selectionMode: z.enum(['auto', 'manual']),
    workerAgentId: z.string().min(1).max(128),
    agents: z
      .array(
        z
          .object({
            id: z.string().min(1).max(128),
            name: z.string().min(1).max(128),
          })
          .strict(),
      )
      .max(32),
  })
  .strict()
  .superRefine((settings, context) => {
    const ids = settings.agents.map((agent) => agent.id);
    if (new Set(ids).size !== ids.length || ids.includes(settings.workerAgentId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Ambiguous BOT MODE agents' });
    }
    if (settings.mode !== 'fast' && settings.agents.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Mission specialists required' });
    }
  });

export type TBotModeSettings = z.infer<typeof botModeSettingsSchema>;

export function resolveBotModeSearchParams(
  current: URLSearchParams,
  conversation?: {
    conversationId?: string | null;
    endpoint?: string | null;
    agent_id?: string;
    botMode?: TBotModeSettings;
  } | null,
): URLSearchParams {
  const next = new URLSearchParams(current);
  if (
    (current.has('botmode') && (current.get('botmode') !== '1' || current.has('botmode_mode'))) ||
    conversation?.endpoint !== 'agents' ||
    !conversation.conversationId ||
    conversation.conversationId === 'new'
  )
    return next;
  const parsed = botModeSettingsSchema.safeParse(conversation.botMode);
  if (!parsed.success || parsed.data.workerAgentId !== conversation.agent_id) return next;
  const settings = parsed.data;
  next.set('botmode', '1');
  next.set('botmode_mode', settings.mode);
  if (!next.has('botmode_agent_mode')) next.set('botmode_agent_mode', settings.selectionMode);
  if (!next.has('botmode_agent_bindings'))
    next.set('botmode_agent_bindings', JSON.stringify(settings.agents));
  if (!next.has('agent_id')) next.set('agent_id', settings.workerAgentId);
  return next;
}
