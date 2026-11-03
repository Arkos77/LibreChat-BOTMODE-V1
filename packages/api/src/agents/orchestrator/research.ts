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

type Phase = 'observation' | 'result';
type Options = OpenAIClientOptions & { fallbacks?: FallbackConfig[] };

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
        phase === 'observation' ? { type: 'function', function: { name: 'web_search' } } : 'none',
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
      // The web observation has already completed. The result node must write
      // a final report, never start a second search or delegate another agent.
      instructions: [
        instructions,
        'FINAL RESEARCH REPORT PHASE: web_search has already completed. Produce the final report now using the retrieved search results in the conversation, not a plan for later searches.',
        'Return one JSON object with ok, result, and sources. result must contain substantive findings, trade-offs, uncertainty, and an answer to the mission objective; do not output internal status notes such as "search done internally" or "now need to research".',
        'sources must contain at least one complete HTTP(S) URL copied verbatim from the preceding successful web_search tool response, one URL per line. Do not paraphrase, invent, shorten, or rewrite URLs.',
        'If the observed results lack a full URL or do not establish the requested findings, report the limitation and set ok to false; never mark an unfinished report as complete.',
      ]
        .filter(Boolean)
        .join('\n'),
      clientOptions,
      toolEnd: false,
      tools: [],
      graphTools: [],
      toolDefinitions: [],
      toolMap: new Map(),
      toolRegistry: new Map(),
      subagentConfigs: [],
    };
  }
  const tools = binding.tools?.filter(isWebTool);
  const graphTools = binding.graphTools?.filter((tool) => tool.name === 'web_search');
  const toolDefinitions = binding.toolDefinitions?.filter(
    (tool) => tool.name === 'web_search' && tool.defer_loading !== true,
  );
  if (!tools?.length && !graphTools?.length && !toolDefinitions?.length) {
    throw new Error('BOTMODE_WEB_SEARCH_UNAVAILABLE');
  }
  return {
    ...binding,
    instructions,
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
      calls.some((call) => !call.id || call.name !== 'web_search') ||
      new Set(calls.map((call) => call.id)).size !== calls.length
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
