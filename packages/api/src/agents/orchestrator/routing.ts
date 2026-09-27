import type { AgentInputs, FallbackConfig } from '@librechat/agents';

export interface AuthorizedResourceSignals {
  /** Host-observed availability. Explicit false is inadmissible. */
  available?: boolean;
  /** Resolved context window when the resource exposes one. */
  contextWindow?: number;
  /** Host estimate in its own budget unit. Router never charges or reserves it. */
  estimatedCost?: number;
  /** Host-observed or estimated latency. */
  latencyMs?: number;
  /** Higher is better. May come from benchmarks or historical QA. */
  qualityScore?: number;
  /** Higher is better. Historical Oracle signal only; Oracle remains independent QA. */
  oracleScore?: number;
  /** Higher is better. Optional benchmark signal supplied by the host. */
  benchmarkScore?: number;
  /** Opaque host privacy class. */
  privacy?: string;
}

export type ResourceExecutionMode =
  | 'model'
  | 'agent'
  | 'tool'
  | 'workflow'
  | 'external-provider'
  | 'local-runtime';

/**
 * Authorization-neutral routing view. The host must authorize and resolve the
 * underlying resource before constructing this value; capabilities are hints,
 * never permissions.
 */
export interface AuthorizedResourceCandidate {
  id: string;
  capabilities?: readonly string[];
  executionMode?: ResourceExecutionMode;
  providerId?: string;
  modelId?: string;
  signals?: AuthorizedResourceSignals;
}

/**
 * Executable model/provider candidate. This adapter is intentionally narrower
 * than the generic resource router: native SDK fallbacks can replace only the
 * provider/model client, not an arbitrary tool/workflow/runtime implementation.
 */
export interface AuthorizedModelCandidate extends AuthorizedResourceCandidate {
  executionMode?: 'model' | 'agent' | 'external-provider';
  /** Fully resolved and already-authorized executable binding. */
  binding: AgentInputs;
}

export interface RoutingConstraints {
  requiredContextTokens?: number;
  maxEstimatedCost?: number;
  maxLatencyMs?: number;
  allowedPrivacy?: readonly string[];
  requiredCapabilities?: readonly string[];
  allowedExecutionModes?: readonly ResourceExecutionMode[];
}

export interface RoutingDecisionContext {
  constraints?: RoutingConstraints;
}

export interface DecisionCandidateView {
  id: string;
  capabilities?: readonly string[];
  executionMode?: ResourceExecutionMode;
  providerId?: string;
  modelId?: string;
  signals?: Readonly<AuthorizedResourceSignals>;
}

export const BUILTIN_DECISION_PROVIDER_IDS = [
  'Jev',
  'GIVE',
  'NanoJev',
  'RuleDecisionProvider',
  'LLMDecisionProvider',
] as const;

export type BuiltinDecisionProviderId = (typeof BUILTIN_DECISION_PROVIDER_IDS)[number];
export type DecisionProviderId = BuiltinDecisionProviderId | (string & {});

export interface DecisionProviderInput {
  /**
   * Sanitized admissible candidates only. Executable bindings/clientOptions are
   * excluded so Decision Providers never receive credentials, headers, tool
   * registries, or other secret-bearing runtime state.
   */
  candidates: ReadonlyArray<Readonly<DecisionCandidateView>>;
  context: Readonly<RoutingDecisionContext>;
}

export interface DecisionProvider {
  /** Stable non-secret identity for MTO/provenance. Known providers include Jev, GIVE, NanoJev, RuleDecisionProvider and LLMDecisionProvider. */
  id?: DecisionProviderId;
  /**
   * Returns candidate IDs in preferred order. `undefined`/empty means abstain.
   * The router validates every returned ID against the admissible set. A Decision
   * Provider can rank only already-authorized candidates and cannot grant permissions.
   */
  decide(
    input: DecisionProviderInput,
  ): Promise<readonly string[] | undefined> | readonly string[] | undefined;
}

export type RoutingRejectionCode =
  | 'UNAVAILABLE'
  | 'CONTEXT_WINDOW'
  | 'BUDGET'
  | 'LATENCY'
  | 'PRIVACY'
  | 'CAPABILITY'
  | 'EXECUTION_MODE';

export interface RoutingRejection {
  candidateId: string;
  code: RoutingRejectionCode;
}

export interface ResourceRoutingDecision {
  selectedCandidateId: string;
  orderedCandidateIds: string[];
  rejected: RoutingRejection[];
  source: 'deterministic' | 'decision-provider';
  /** Present only when a named Decision Provider supplied a non-empty ordering. */
  decisionProviderId?: DecisionProviderId;
}

export interface ModelRoutingDecision extends ResourceRoutingDecision {
  binding: AgentInputs;
}

function rejectCode(
  candidate: AuthorizedResourceCandidate,
  constraints: RoutingConstraints,
): RoutingRejectionCode | undefined {
  const signals = candidate.signals ?? {};
  if (
    constraints.requiredCapabilities != null &&
    constraints.requiredCapabilities.some(
      (capability) => !candidate.capabilities?.includes(capability),
    )
  ) {
    return 'CAPABILITY';
  }
  if (
    constraints.allowedExecutionModes != null &&
    constraints.allowedExecutionModes.length > 0 &&
    (candidate.executionMode == null ||
      !constraints.allowedExecutionModes.includes(candidate.executionMode))
  ) {
    return 'EXECUTION_MODE';
  }
  if (signals.available === false) {
    return 'UNAVAILABLE';
  }
  if (
    constraints.requiredContextTokens != null &&
    (signals.contextWindow == null || signals.contextWindow < constraints.requiredContextTokens)
  ) {
    return 'CONTEXT_WINDOW';
  }
  if (
    constraints.maxEstimatedCost != null &&
    (signals.estimatedCost == null || signals.estimatedCost > constraints.maxEstimatedCost)
  ) {
    return 'BUDGET';
  }
  if (
    constraints.maxLatencyMs != null &&
    (signals.latencyMs == null || signals.latencyMs > constraints.maxLatencyMs)
  ) {
    return 'LATENCY';
  }
  if (
    constraints.allowedPrivacy != null &&
    constraints.allowedPrivacy.length > 0 &&
    (signals.privacy == null || !constraints.allowedPrivacy.includes(signals.privacy))
  ) {
    return 'PRIVACY';
  }
  return undefined;
}

function compareDescending(left: number | undefined, right: number | undefined): number {
  const leftKnown = left != null && Number.isFinite(left);
  const rightKnown = right != null && Number.isFinite(right);
  if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
  if (!leftKnown || !rightKnown || left === right) return 0;
  return right - left;
}

function compareAscending(left: number | undefined, right: number | undefined): number {
  const leftKnown = left != null && Number.isFinite(left);
  const rightKnown = right != null && Number.isFinite(right);
  if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
  if (!leftKnown || !rightKnown || left === right) return 0;
  return left - right;
}

function deterministicOrder<T extends AuthorizedResourceCandidate>(
  candidates: ReadonlyArray<T>,
): T[] {
  return [...candidates].sort((left, right) => {
    let order = compareDescending(left.signals?.qualityScore, right.signals?.qualityScore);
    if (order !== 0) return order;
    order = compareDescending(left.signals?.oracleScore, right.signals?.oracleScore);
    if (order !== 0) return order;
    order = compareDescending(left.signals?.benchmarkScore, right.signals?.benchmarkScore);
    if (order !== 0) return order;
    order = compareAscending(left.signals?.estimatedCost, right.signals?.estimatedCost);
    if (order !== 0) return order;
    order = compareAscending(left.signals?.latencyMs, right.signals?.latencyMs);
    if (order !== 0) return order;
    return left.id.localeCompare(right.id);
  });
}

function sanitizedView(candidate: AuthorizedResourceCandidate): DecisionCandidateView {
  return {
    id: candidate.id,
    capabilities: candidate.capabilities ? [...candidate.capabilities] : undefined,
    executionMode: candidate.executionMode,
    providerId: candidate.providerId,
    modelId: candidate.modelId,
    signals: candidate.signals ? { ...candidate.signals } : undefined,
  };
}

function cloneContext(context: RoutingDecisionContext): RoutingDecisionContext {
  const constraints = context.constraints;
  if (!constraints) return { constraints: undefined };
  return {
    constraints: {
      ...constraints,
      allowedPrivacy: constraints.allowedPrivacy ? [...constraints.allowedPrivacy] : undefined,
      requiredCapabilities: constraints.requiredCapabilities
        ? [...constraints.requiredCapabilities]
        : undefined,
      allowedExecutionModes: constraints.allowedExecutionModes
        ? [...constraints.allowedExecutionModes]
        : undefined,
    },
  };
}

/**
 * Generic capability/resource ordering. It never sees executable bindings and
 * therefore can safely compare models, agents, tools, workflows, external
 * providers, and local runtimes using host-supplied authorized metadata.
 */
export async function rankAuthorizedResources<T extends AuthorizedResourceCandidate>(
  candidates: ReadonlyArray<T>,
  context: RoutingDecisionContext = {},
  decisionProvider?: DecisionProvider,
): Promise<ResourceRoutingDecision> {
  if (candidates.length === 0) {
    throw new Error('No authorized resource candidates');
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate.id || seen.has(candidate.id)) {
      throw new Error('Authorized resource candidate identities must be unique');
    }
    seen.add(candidate.id);
  }

  const constraints = context.constraints ?? {};
  const rejected: RoutingRejection[] = [];
  const admissible: T[] = [];
  for (const candidate of candidates) {
    const code = rejectCode(candidate, constraints);
    if (code) rejected.push({ candidateId: candidate.id, code });
    else admissible.push(candidate);
  }

  if (admissible.length === 0) {
    throw new Error('No admissible authorized resource candidates');
  }

  const deterministic = deterministicOrder(admissible);
  let ordered = deterministic;
  let source: ResourceRoutingDecision['source'] = 'deterministic';
  let decisionProviderId: DecisionProviderId | undefined;

  if (decisionProvider) {
    const proposed = await decisionProvider.decide({
      candidates: admissible.map(sanitizedView),
      context: cloneContext(context),
    });

    if (proposed != null && proposed.length > 0) {
      const byId = new Map(admissible.map((candidate) => [candidate.id, candidate]));
      const providerSeen = new Set<string>();
      const preferred: T[] = [];
      for (const id of proposed) {
        const candidate = byId.get(id);
        if (!candidate) {
          throw new Error(`Decision provider returned inadmissible candidate ${id}`);
        }
        if (providerSeen.has(id)) {
          throw new Error(`Decision provider returned duplicate candidate ${id}`);
        }
        providerSeen.add(id);
        preferred.push(candidate);
      }
      ordered = [
        ...preferred,
        ...deterministic.filter((candidate) => !providerSeen.has(candidate.id)),
      ];
      source = 'decision-provider';
      decisionProviderId = decisionProvider.id;
    }
  }

  return {
    selectedCandidateId: ordered[0].id,
    orderedCandidateIds: ordered.map((candidate) => candidate.id),
    rejected,
    source,
    ...(decisionProviderId != null ? { decisionProviderId } : {}),
  };
}

function cloneClientOptions(value: AgentInputs['clientOptions']): AgentInputs['clientOptions'] {
  if (value == null || typeof value !== 'object') return value;
  return { ...value };
}

function cloneCandidateBinding(binding: AgentInputs): AgentInputs {
  // The SDK union correlates provider with clientOptions; spreading preserves that pair.
  return { ...binding, clientOptions: cloneClientOptions(binding.clientOptions) } as AgentInputs;
}

function assertModelCandidates(candidates: ReadonlyArray<AuthorizedModelCandidate>): void {
  if (
    candidates.some(
      (candidate) =>
        typeof candidate.binding.agentId !== 'string' || candidate.binding.agentId.trim() === '',
    )
  ) {
    throw new Error('Authorized model candidates must share one logical agent binding');
  }
  const bindingAgentIds = new Set(
    candidates
      .map((candidate) => candidate.binding.agentId)
      .filter((agentId): agentId is string => typeof agentId === 'string' && agentId.length > 0),
  );
  if (bindingAgentIds.size > 1) {
    throw new Error('Authorized model candidates must share one logical agent binding');
  }

  for (const candidate of candidates) {
    const clientOptions = candidate.binding.clientOptions as
      | ({ fallbacks?: unknown[] } & Record<string, unknown>)
      | undefined;
    if (Array.isArray(clientOptions?.fallbacks) && clientOptions.fallbacks.length > 0) {
      throw new Error(
        `Authorized model candidate ${candidate.id} contains hidden native fallbacks`,
      );
    }
  }
}

function fallbackFrom(binding: AgentInputs): FallbackConfig {
  return {
    provider: binding.provider,
    clientOptions: cloneClientOptions(binding.clientOptions),
    ...(binding.maxContextTokens != null ? { maxContextTokens: binding.maxContextTokens } : {}),
  } as FallbackConfig;
}

function bindingWithFallbacks(
  primary: AuthorizedModelCandidate,
  ordered: ReadonlyArray<AuthorizedModelCandidate>,
): AgentInputs {
  const binding = cloneCandidateBinding(primary.binding);
  const fallbacks = ordered
    .filter((candidate) => candidate.id !== primary.id)
    .map((candidate) => fallbackFrom(candidate.binding));
  if (fallbacks.length === 0) return binding;
  binding.clientOptions = {
    ...(binding.clientOptions ?? {}),
    fallbacks,
  } as unknown as AgentInputs['clientOptions'];
  return binding;
}

/**
 * Model/provider adapter over the generic resource router. Candidates must be
 * fully resolved and authorized by the host. The adapter never discovers
 * providers, validates permissions, resolves credentials, reserves budget, or
 * executes model calls; it only maps the chosen order to SDK-native fallbacks.
 */
export async function routeAuthorizedModelBindings(
  candidates: ReadonlyArray<AuthorizedModelCandidate>,
  context: RoutingDecisionContext = {},
  decisionProvider?: DecisionProvider,
): Promise<ModelRoutingDecision> {
  assertModelCandidates(candidates);
  const decision = await rankAuthorizedResources(candidates, context, decisionProvider);
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const ordered = decision.orderedCandidateIds.map((id) => {
    const candidate = byId.get(id);
    if (!candidate) throw new Error(`Missing authorized model candidate ${id}`);
    return candidate;
  });
  const selected = ordered[0];
  return {
    ...decision,
    binding: bindingWithFallbacks(selected, ordered),
  };
}
