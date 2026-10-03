export interface UncensoredAiProviderProfile {
  id: 'provider:uncensored-ai';
  modelId: 'UncensoredAI v1.2';
  status: 'PENDING_CREDENTIALS_AND_ENDPOINT';
  toolMode: 'UNKNOWN_UNTIL_LIVE_TEST';
  roles: readonly ['analysis','writing','freeform'];
  apiStyle: 'openai-compatible';
  evidenceRefs: readonly ['web:uncensored-ai:api'];
  activationRequirements: readonly ['UNCENSORED_AI_API_KEY','UNCENSORED_AI_BASE_URL','API_CREDITS'];
}

export const UNCENSORED_AI_PROFILE: UncensoredAiProviderProfile = {
  id: 'provider:uncensored-ai',
  modelId: 'UncensoredAI v1.2',
  status: 'PENDING_CREDENTIALS_AND_ENDPOINT',
  toolMode: 'UNKNOWN_UNTIL_LIVE_TEST',
  roles: ['analysis', 'writing', 'freeform'],
  apiStyle: 'openai-compatible',
  evidenceRefs: ['web:uncensored-ai:api'],
  activationRequirements: ['UNCENSORED_AI_API_KEY', 'UNCENSORED_AI_BASE_URL', 'API_CREDITS'],
};

export function canActivateUncensoredAi(input: {
  apiKey?: string;
  baseUrl?: string;
  creditsAvailable: boolean;
}): boolean {
  return Boolean(input.apiKey?.trim() && input.baseUrl?.trim() && input.creditsAvailable);
}
