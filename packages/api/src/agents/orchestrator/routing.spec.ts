import { Providers } from '@librechat/agents';
import type { AgentInputs } from '@librechat/agents';
import {
  rankAuthorizedResources,
  routeAuthorizedModelBindings,
  type AuthorizedModelCandidate,
  type AuthorizedResourceCandidate,
  type DecisionProvider,
} from './routing';

function binding(model: string, provider = Providers.OPENAI): AgentInputs {
  return {
    agentId: 'logical-agent',
    provider,
    instructions: 'shared logical agent instructions',
    clientOptions: { model },
    toolDefinitions: [],
  } as unknown as AgentInputs;
}

function resource(
  id: string,
  overrides: Partial<AuthorizedResourceCandidate> = {},
): AuthorizedResourceCandidate {
  return {
    id,
    capabilities: ['coding'],
    executionMode: 'model',
    providerId: 'provider-a',
    modelId: id,
    ...overrides,
    signals: {
      available: true,
      contextWindow: 128_000,
      estimatedCost: 10,
      latencyMs: 100,
      qualityScore: 0.5,
      privacy: 'cloud',
      ...(overrides.signals ?? {}),
    },
  };
}

function modelCandidate(
  id: string,
  overrides: Partial<AuthorizedModelCandidate> = {},
): AuthorizedModelCandidate {
  return {
    ...resource(id),
    binding: binding(id),
    ...overrides,
    signals: {
      ...resource(id).signals,
      ...(overrides.signals ?? {}),
    },
  } as AuthorizedModelCandidate;
}

describe('rankAuthorizedResources', () => {
  it('fails closed when there are no candidates', async () => {
    await expect(rankAuthorizedResources([])).rejects.toThrow('No authorized resource candidates');
  });

  it('routes generic execution modes without requiring AgentInputs', async () => {
    const result = await rankAuthorizedResources([
      resource('tool', { executionMode: 'tool', signals: { qualityScore: 0.7 } }),
      resource('workflow', { executionMode: 'workflow', signals: { qualityScore: 0.9 } }),
      resource('local', { executionMode: 'local-runtime', signals: { qualityScore: 0.8 } }),
    ]);
    expect(result.orderedCandidateIds).toEqual(['workflow', 'local', 'tool']);
  });

  it('applies hard capability, execution-mode, availability, context, budget, latency and privacy constraints', async () => {
    const result = await rankAuthorizedResources(
      [
        resource('wrong-cap', { capabilities: ['research'] }),
        resource('wrong-mode', { executionMode: 'external-provider' }),
        resource('unavailable', { signals: { available: false } }),
        resource('small-context', { signals: { contextWindow: 10 } }),
        resource('too-expensive', { signals: { estimatedCost: 999 } }),
        resource('too-slow', { signals: { latencyMs: 999 } }),
        resource('wrong-privacy', { signals: { privacy: 'local' } }),
        resource('ok'),
      ],
      {
        constraints: {
          requiredCapabilities: ['coding'],
          allowedExecutionModes: ['model'],
          requiredContextTokens: 100,
          maxEstimatedCost: 100,
          maxLatencyMs: 500,
          allowedPrivacy: ['cloud'],
        },
      },
    );
    expect(result.selectedCandidateId).toBe('ok');
    expect(result.rejected).toEqual([
      { candidateId: 'wrong-cap', code: 'CAPABILITY' },
      { candidateId: 'wrong-mode', code: 'EXECUTION_MODE' },
      { candidateId: 'unavailable', code: 'UNAVAILABLE' },
      { candidateId: 'small-context', code: 'CONTEXT_WINDOW' },
      { candidateId: 'too-expensive', code: 'BUDGET' },
      { candidateId: 'too-slow', code: 'LATENCY' },
      { candidateId: 'wrong-privacy', code: 'PRIVACY' },
    ]);
  });

  it('orders deterministically and prefers known metrics over unknown metrics', async () => {
    const known = resource('known', {
      signals: { qualityScore: 0.8, estimatedCost: 5, latencyMs: 50 },
    });
    const unknown = resource('unknown', { signals: {} });
    const a = await rankAuthorizedResources([unknown, known]);
    const b = await rankAuthorizedResources([known, unknown]);
    expect(a.orderedCandidateIds).toEqual(['known', 'unknown']);
    expect(b.orderedCandidateIds).toEqual(['known', 'unknown']);
  });

  it('rejects an inadmissible candidate returned by a Decision Provider', async () => {
    const provider: DecisionProvider = { decide: () => ['blocked'] };
    await expect(
      rankAuthorizedResources(
        [resource('allowed'), resource('blocked', { signals: { available: false } })],
        {},
        provider,
      ),
    ).rejects.toThrow('Decision provider returned inadmissible candidate blocked');
  });

  it('falls back to deterministic ordering when a Decision Provider abstains', async () => {
    const provider: DecisionProvider = { decide: () => undefined };
    const result = await rankAuthorizedResources(
      [
        resource('expensive', { signals: { qualityScore: 0.5, estimatedCost: 20 } }),
        resource('cheap', { signals: { qualityScore: 0.5, estimatedCost: 1 } }),
      ],
      {},
      provider,
    );
    expect(result.source).toBe('deterministic');
    expect(result.selectedCandidateId).toBe('cheap');
  });

  it('sanitizes Decision Provider input and rejects duplicate identities/selections', async () => {
    let seen: unknown;
    const provider: DecisionProvider = {
      decide: (input) => {
        seen = input;
        return undefined;
      },
    };
    await rankAuthorizedResources([resource('visible')], {}, provider);
    expect(seen).toEqual({
      candidates: [
        {
          id: 'visible',
          capabilities: ['coding'],
          executionMode: 'model',
          providerId: 'provider-a',
          modelId: 'visible',
          signals: {
            available: true,
            contextWindow: 128_000,
            estimatedCost: 10,
            latencyMs: 100,
            qualityScore: 0.5,
            privacy: 'cloud',
          },
        },
      ],
      context: { constraints: undefined },
    });
    await expect(rankAuthorizedResources([resource('dup'), resource('dup')])).rejects.toThrow(
      'Authorized resource candidate identities must be unique',
    );
    const duplicateProvider: DecisionProvider = { decide: () => ['a', 'a'] };
    await expect(
      rankAuthorizedResources([resource('a'), resource('b')], {}, duplicateProvider),
    ).rejects.toThrow('Decision provider returned duplicate candidate a');
  });
});

describe('routeAuthorizedModelBindings', () => {
  it('rejects hidden native fallbacks inside a candidate binding', async () => {
    const hidden = modelCandidate('hidden', {
      binding: {
        ...binding('hidden'),
        clientOptions: {
          model: 'hidden',
          fallbacks: [{ provider: Providers.ANTHROPIC, clientOptions: { model: 'claude-hidden' } }],
        },
      } as unknown as AgentInputs,
    });
    await expect(routeAuthorizedModelBindings([hidden])).rejects.toThrow(
      'Authorized model candidate hidden contains hidden native fallbacks',
    );
  });

  it('rejects candidates that do not share one logical agent binding', async () => {
    const first = modelCandidate('first', {
      binding: { ...binding('first'), agentId: 'agent-a' },
    });
    const second = modelCandidate('second', {
      binding: { ...binding('second'), agentId: 'agent-b' },
    });
    await expect(routeAuthorizedModelBindings([first, second])).rejects.toThrow(
      'Authorized model candidates must share one logical agent binding',
    );
  });

  it('rejects a model binding without a logical agent identity', async () => {
    const missing = modelCandidate('missing', {
      binding: { ...binding('model-missing'), agentId: undefined } as unknown as AgentInputs,
    });
    await expect(routeAuthorizedModelBindings([missing])).rejects.toThrow(/logical agent binding/);
  });

  it('maps selected ordering to SDK-native fallbacks without mutating source bindings', async () => {
    const provider: DecisionProvider = { id: 'Jev', decide: () => ['second'] };
    const second = modelCandidate('second', { binding: binding('model-second') });
    const first = modelCandidate('first', {
      binding: binding('model-first'),
      signals: { qualityScore: 0.9 },
    });
    const originalFirst = structuredClone(first.binding.clientOptions);
    const originalSecond = structuredClone(second.binding.clientOptions);
    const result = await routeAuthorizedModelBindings([first, second], {}, provider);
    expect(result.source).toBe('decision-provider');
    expect(result.decisionProviderId).toBe('Jev');
    expect(result.orderedCandidateIds).toEqual(['second', 'first']);
    expect(result.selectedCandidateId).toBe('second');
    const clientOptions = result.binding.clientOptions as {
      model?: string;
      fallbacks?: Array<{ provider?: string; clientOptions?: { model?: string } }>;
    };
    expect(clientOptions.model).toBe('model-second');
    expect(clientOptions.fallbacks).toHaveLength(1);
    expect(clientOptions.fallbacks?.[0].clientOptions?.model).toBe('model-first');
    expect(first.binding.clientOptions).toEqual(originalFirst);
    expect(second.binding.clientOptions).toEqual(originalSecond);
  });

  it('never exposes secret-bearing bindings to Decision Providers', async () => {
    const secretBinding = {
      ...binding('secret-model'),
      clientOptions: {
        model: 'secret-model',
        apiKey: 'DO_NOT_EXPOSE',
        defaultHeaders: { Authorization: 'Bearer secret' },
      },
    } as unknown as AgentInputs;
    let seen: unknown;
    const provider: DecisionProvider = {
      decide: (input) => {
        seen = input;
        return undefined;
      },
    };
    await routeAuthorizedModelBindings(
      [
        modelCandidate('secret', {
          providerId: 'provider-visible',
          modelId: 'model-visible',
          binding: secretBinding,
        }),
      ],
      {},
      provider,
    );
    expect(JSON.stringify(seen)).not.toContain('DO_NOT_EXPOSE');
    expect(JSON.stringify(seen)).not.toContain('Authorization');
  });
});
