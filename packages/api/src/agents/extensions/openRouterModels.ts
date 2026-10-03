export type OpenRouterModelStatus = 'ACTIVE' | 'CONDITIONAL';
export type OpenRouterToolMode = 'TOOL_CALLING' | 'TEXT_ONLY';

export interface OpenRouterModelProfile {
  id: string;
  family: string;
  status: OpenRouterModelStatus;
  toolMode: OpenRouterToolMode;
  roles: readonly ('research' | 'analysis' | 'code' | 'documents' | 'writing' | 'freeform')[];
  routingNotes: readonly string[];
  evidenceRefs: readonly string[];
}

export const OPENROUTER_MODEL_PROFILES: readonly OpenRouterModelProfile[] = [
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    family: 'Nemotron 3 Ultra', status: 'ACTIVE', toolMode: 'TOOL_CALLING',
    roles: ['research', 'analysis', 'code', 'documents', 'writing'],
    routingNotes: ['free-tier candidate', 'preferred when tools/subagents are required'],
    evidenceRefs: ['live:openrouter:2026-10-03'],
  },
  {
    id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition',
    family: 'Venice Uncensored / Dolphin Mistral 24B', status: 'CONDITIONAL', toolMode: 'TEXT_ONLY',
    roles: ['analysis', 'writing', 'freeform'],
    routingNotes: ['requires OpenRouter credits on current account', 'do not select for tool-driven tasks'],
    evidenceRefs: ['live:openrouter:402:2026-10-03'],
  },
  {
    id: 'thedrummer/cydonia-24b-v4.1',
    family: 'Cydonia 24B V4.1', status: 'CONDITIONAL', toolMode: 'TEXT_ONLY',
    roles: ['analysis', 'writing', 'freeform'],
    routingNotes: ['requires OpenRouter credits on current account', 'do not select for tool-driven tasks'],
    evidenceRefs: ['live:openrouter:402:2026-10-03'],
  },
];

export function selectOpenRouterModel(input: {
  toolCallingRequired: boolean;
  role: OpenRouterModelProfile['roles'][number];
  allowConditional?: boolean;
}): OpenRouterModelProfile {
  const candidates = OPENROUTER_MODEL_PROFILES.filter((profile) => profile.roles.includes(input.role));
  if (input.toolCallingRequired) {
    const agentic = candidates.find((profile) => profile.toolMode === 'TOOL_CALLING' && profile.status === 'ACTIVE');
    if (!agentic) throw new Error('No active OpenRouter model supports required tool calling');
    return agentic;
  }
  return candidates.find((profile) => profile.status === 'ACTIVE')
    ?? (input.allowConditional ? candidates.find((profile) => profile.status === 'CONDITIONAL') : undefined)
    ?? (() => { throw new Error('No usable OpenRouter model for requested role'); })();
}
