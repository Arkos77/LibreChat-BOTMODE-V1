import type { OpenAIClientOptions, FallbackConfig } from '@librechat/agents';
import type { OracleRequirement } from './types';

type Options = OpenAIClientOptions & { fallbacks?: FallbackConfig[] };
type ScalarSchema = { type: string | string[]; description?: string };

/** Parameter support is mandatory for native OpenRouter mission phases. */
export function requireNativeParameters(provider: string, original: Options): Options {
  if (provider.toLowerCase() !== 'openrouter') return original;
  const preferences = original.modelKwargs?.provider;
  if (preferences != null && (typeof preferences !== 'object' || Array.isArray(preferences))) {
    throw new Error('BOTMODE_PROVIDER_PARAMETERS_INVALID');
  }
  return {
    ...original,
    modelKwargs: {
      ...original.modelKwargs,
      provider: { ...preferences, require_parameters: true },
    },
  };
}

function taskFormat(requirements: readonly OracleRequirement[]) {
  const research = requirements.some((requirement) =>
    ['research-v1', 'research-v2'].includes(requirement.outputContract ?? ''),
  );
  const separateSources =
    requirements.some((requirement) => requirement.outputContract === 'research-v2') &&
    !requirements.some((requirement) => requirement.outputContract === 'research-v1');
  const properties = new Map<string, ScalarSchema>([
    [
      'result',
      {
        type: 'string',
        description: separateSources
          ? 'Report the actual findings, limitations and uncertainty honestly. The host displays the separately verified sources.'
          : 'Report the actual findings, limitations and uncertainty honestly. Cite observed source URLs when research is required.',
      },
    ],
  ]);
  if (research)
    properties.set('sources', {
      type: 'string',
      description: separateSources
        ? 'Newline-separated absolute URLs returned by completed web_search calls. The host displays these verified sources separately. Never invent sources.'
        : 'Newline-separated absolute URLs returned by completed web_search calls, cited in result. Never invent sources.',
    });
  for (const requirement of requirements) {
    for (const { field, expected } of requirement.criteria) {
      if (field === 'result' || (research && field === 'sources')) continue;
      const allowedTypes =
        expected === null ? ['string', 'number', 'boolean', 'null'] : [typeof expected, 'null'];
      const existing = properties.get(field)?.type ?? [];
      const types = new Set([...[existing].flat(), ...allowedTypes]);
      properties.set(field, { type: [...types] });
    }
  }
  const schemaName = research ? 'botmode_research_v1' : 'botmode_result_v1';
  return {
    type: 'json_schema',
    json_schema: {
      name: separateSources ? 'botmode_research_v2' : schemaName,
      strict: true,
      schema: {
        type: 'object',
        properties: Object.fromEntries(properties),
        required: [...properties.keys()],
        additionalProperties: false,
      },
    },
  };
}

/** Schema shape constrains transport, never the truth of an Oracle criterion. */
export function structuredTaskOptions(
  provider: string,
  original: Options | undefined,
  requirements: readonly OracleRequirement[],
): Options | undefined {
  if (
    !requirements.some((requirement) => requirement.outputContract != null) ||
    !['openai', 'openrouter'].includes(provider.toLowerCase()) ||
    original?.useResponsesApi === true
  )
    return original;
  const format = original?.modelKwargs?.response_format;
  const options = requireNativeParameters(provider, {
    ...original,
    modelKwargs: {
      ...original?.modelKwargs,
      response_format: format?.type === 'json_schema' ? format : taskFormat(requirements),
    },
    ...(original?.fallbacks != null && {
      fallbacks: original.fallbacks.map((fallback) => ({
        ...fallback,
        clientOptions: structuredTaskOptions(
          fallback.provider,
          fallback.clientOptions as Options,
          requirements,
        ),
      })) as FallbackConfig[],
    }),
  });
  return options;
}
