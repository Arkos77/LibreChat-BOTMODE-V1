import { createHash } from 'crypto';
import type {
  AgentInputs,
  BaseGraphState,
  FallbackConfig,
  OpenAIClientOptions,
} from '@librechat/agents';
import type { AIMessage } from '@librechat/agents/langchain/messages';
import type { PlannedTask } from './types';
import { buildWebSearchContext } from '~/tools/toolkits/web';
import { requireNativeParameters } from './schema';

export const isResearchTask = (task: Pick<PlannedTask, 'validation'>): boolean =>
  task.validation.some((requirement) =>
    ['research-v1', 'research-v2'].includes(requirement.outputContract ?? ''),
  );

/** Derived execution identity, not a new business task or authorization. */
export const researchObservationNodeId = (nodeId: string): string =>
  `p6r_${createHash('sha256').update(`web-observation:${nodeId}`).digest('hex')}`;

/**
 * A conservative host-owned comparison policy. It recognizes two explicit
 * named topics in the research goal, not arbitrary instructions in a web page
 * or an LLM-generated tool argument. Unknown/ambiguous goals use the existing
 * single-query path; they are never silently treated as complete.
 */
export function nativeResearchComparisonQueries(objective: string): string[] {
  if (typeof objective !== 'string' || objective.length > 12000) return [];
  const goal = objective.split(/\bRECHERCHE\s*:/i)[0].slice(0, 700);
  if (!/\b(compar(?:e|er|aison)|versus|vs\.?|diff[eé]rence)\b/i.test(goal)) return [];
  const camel = [
    ...new Set(
      [...goal.matchAll(/\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b/g)].map((match) => match[0]),
    ),
  ];
  let subjects = camel.slice(0, 3);
  if (subjects.length < 2) {
    const pair = goal.match(
      /\b([A-Z][A-Za-z0-9_-]{2,})\s+(?:vs\.?|versus|contre|et)\s+([A-Z][A-Za-z0-9_-]{2,})\b/i,
    );
    subjects = pair == null ? [] : [pair[1], pair[2]];
  }
  if (
    subjects.length < 2 ||
    new Set(subjects.map((item) => item.toLowerCase())).size !== subjects.length
  ) {
    return [];
  }
  const prefix = /\bMDN\b/i.test(goal) ? 'MDN Web Docs' : 'official documentation';
  return subjects.map((subject) => `${prefix} ${subject}`);
}

type Phase = 'observation' | 'result';
type Options = OpenAIClientOptions & { fallbacks?: FallbackConfig[] };

/**
 * Native mission research must not inherit an LLM-invented freshness window.
 * A date filter such as "last 24 hours" silently excludes evergreen reference
 * material even when the user requested no recency restriction. Keep the tool
 * itself and its provenance untouched; restrict only its model-facing schema.
 *
 * An explicit host-owned recency policy can restore this field in a later,
 * separately validated feature; the LLM cannot grant one implicitly.
 */
function omitUnrequestedSearchDate<T extends { parameters?: unknown }>(tool: T): T {
  const parameters = tool.parameters;
  if (parameters == null || typeof parameters !== 'object' || Array.isArray(parameters)) {
    return tool;
  }
  const schema = parameters as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  if (
    schema.properties == null ||
    !Object.prototype.hasOwnProperty.call(schema.properties, 'date')
  ) {
    return tool;
  }
  const properties = Object.fromEntries(
    Object.entries(schema.properties).filter(([name]) => name !== 'date'),
  );
  return {
    ...tool,
    parameters: {
      ...parameters,
      properties,
      ...(Array.isArray(schema.required) && {
        required: schema.required.filter((name) => name !== 'date'),
      }),
    },
  };
}

function isWebTool(tool: unknown): boolean {
  if (tool == null || typeof tool !== 'object') return false;
  if ('name' in tool) return tool.name === 'web_search';
  const definition = 'function' in tool ? tool.function : undefined;
  return (
    definition != null &&
    typeof definition === 'object' &&
    'name' in definition &&
    definition.name === 'web_search'
  );
}

function phaseOptions(provider: string, original: Options | undefined, phase: Phase): Options {
  if (!['openai', 'openrouter'].includes(provider.toLowerCase()) || original?.useResponsesApi) {
    throw new Error('BOTMODE_RESEARCH_PROVIDER_UNSUPPORTED');
  }
  original = requireNativeParameters(provider, original ?? {});
  const choice = original?.modelKwargs?.tool_choice;
  if (
    choice != null &&
    choice !== 'auto' &&
    choice !== 'required' &&
    !(
      typeof choice === 'object' &&
      choice.type === 'function' &&
      choice.function?.name === 'web_search'
    )
  ) {
    throw new Error('BOTMODE_RESEARCH_TOOL_POLICY_CONFLICT');
  }
  const { response_format, ...kwargs } = original?.modelKwargs ?? {};
  const jsonFormat =
    response_format?.type === 'json_object' || response_format?.type === 'json_schema'
      ? response_format
      : { type: 'json_object' as const };
  return {
    ...original,
    modelKwargs: {
      ...kwargs,
      ...(phase === 'result' && { response_format: jsonFormat }),
      tool_choice:
        phase === 'observation' ? { type: 'function', function: { name: 'web_search' } } : 'auto',
    },
    ...(original?.fallbacks != null && {
      fallbacks: original.fallbacks.map((fallback) => ({
        ...fallback,
        clientOptions: phaseOptions(fallback.provider, fallback.clientOptions as Options, phase),
      })) as FallbackConfig[],
    }),
  };
}

export function researchPhaseBinding(
  binding: AgentInputs,
  phase: Phase,
  separateSources = false,
): AgentInputs {
  const clientOptions = phaseOptions(binding.provider, binding.clientOptions as Options, phase);
  // Replace only the application-generated web context; owner instructions stay intact.
  const instructions =
    typeof binding.instructions === 'string'
      ? binding.instructions.replace(
          buildWebSearchContext(),
          buildWebSearchContext({
            citationFormat: separateSources ? 'sources-field' : 'direct-urls',
          }),
        )
      : binding.instructions;
  if (phase === 'result') {
    return {
      ...binding,
      // Preserve the SDK's authorized tool binding and routing contract.
      // Research finalization is a model instruction, not another tool-policy runtime.
      instructions: [
        instructions,
        'FINAL RESEARCH REPORT PHASE: web_search observations have already been recorded. Provide the completed report now, not a status update or future research plan.',
        'Return one JSON object with ok, result, and sources. result must contain substantive findings that address the mission objective, compare relevant evidence, and distinguish uncertainty from sourced facts.',
        'sources must contain one or more complete HTTP(S) URLs copied verbatim from actual successful web_search results, each on its own line. Do not substitute summaries such as "search done internally", search terms, or altered URLs.',
        'Do not make an extra web_search call unless you genuinely lack sufficient evidence for the objective. If the available results do not support a complete report, explain the gap and set ok to false.',
      ]
        .filter(Boolean)
        .join('\n'),
      toolEnd: false,
      clientOptions,
    };
  }
  const tools = binding.tools?.filter(isWebTool);
  const graphTools = binding.graphTools?.filter((tool) => tool.name === 'web_search');
  const toolDefinitions = binding.toolDefinitions
    ?.filter((tool) => tool.name === 'web_search' && tool.defer_loading !== true)
    .map(omitUnrequestedSearchDate);
  if (!tools?.length && !graphTools?.length && !toolDefinitions?.length) {
    throw new Error('BOTMODE_WEB_SEARCH_UNAVAILABLE');
  }
  return {
    ...binding,
    instructions: [
      instructions,
      'NATIVE RESEARCH SEARCH POLICY: Do not set the date parameter unless a future host-owned recency policy explicitly enables it. For reference documentation, search all publication dates. Do not silently restrict searches to the last 24 hours.',
      'COMPARATIVE COVERAGE: When the mission asks you to compare two or three distinct named subjects, make one separate web_search tool call per subject, in ONE assistant reply, with a short subject-specific query (maximum THREE calls total). This native mission explicitly authorizes up to three web_search calls together, overriding the generic once-per-reply suggestion. Do not repeat the same query or search only the first subject. For a single-subject mission, make just one call. If you cannot search each requested subject, report the missing evidence honestly in the final phase.',
    ]
      .filter(Boolean)
      .join('\n'),
    clientOptions,
    toolEnd: true,
    tools,
    graphTools,
    toolDefinitions,
    toolMap:
      binding.toolMap == null
        ? undefined
        : new Map([...binding.toolMap].filter(([name]) => name === 'web_search')),
    toolRegistry:
      binding.toolRegistry == null
        ? undefined
        : new Map([...binding.toolRegistry].filter(([name]) => name === 'web_search')),
    subagentConfigs: [],
  };
}

/** Only checkpointed, current-phase AI/tool pairs can unlock the result phase. */
export function requireResearchObservation(
  task: PlannedTask,
  onObserved?: (toolCallIds: readonly string[]) => Promise<void>,
) {
  const phaseId = researchObservationNodeId(task.nodeId);
  return async (state: BaseGraphState): Promise<void> => {
    const ai = state.agentOutputs?.[phaseId] as AIMessage | undefined;
    const calls = ai?.tool_calls ?? [];
    const reject = () => {
      throw new Error('BOTMODE_RESEARCH_OBSERVATION_REQUIRED');
    };
    if (
      !ai?.id ||
      !calls.length ||
      calls.length > 3 ||
      calls.some((call) => !call.id || call.name !== 'web_search') ||
      new Set(calls.map((call) => call.id)).size !== calls.length ||
      calls.some((call) => typeof call.args?.query !== 'string' || !call.args.query.trim()) ||
      new Set(calls.map((call) => call.args.query.trim().toLowerCase())).size !== calls.length
    )
      reject();
    const index = state.messages.findIndex(
      (message) => message.id === ai!.id && message.getType() === 'ai',
    );
    if (index < 0) reject();
    const following = state.messages.slice(index + 1);
    for (const call of calls) {
      const results = following.filter(
        (message) =>
          message.getType() === 'tool' &&
          'tool_call_id' in message &&
          message.tool_call_id === call.id,
      );
      if (
        results.length !== 1 ||
        results[0].name !== 'web_search' ||
        !('status' in results[0]) ||
        results[0].status !== 'success'
      )
        reject();
    }
    await onObserved?.(calls.map((call) => call.id!));
  };
}
