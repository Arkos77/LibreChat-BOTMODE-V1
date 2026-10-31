/**
 * Optional native child model transport attachment. The host MUST issue a
 * fresh, scoped, effect-fenced durable operation grant; this helper cannot
 * create one. It is inactive unless the authorized host passes a factory.
 *
 * A model-call callback cannot replace provider I/O. Install the fetch seam
 * into the original OpenAI-compatible model binding before SDK graph startup.
 */
export type NativeDetachedModelFetchBinding = Readonly<{
  agentId: string;
  provider: string;
  model: string;
}>;

export type NativeDetachedModelFetchFactory = (
  binding: NativeDetachedModelFetchBinding,
) => typeof fetch | undefined;

type ModelFetchCarrier = {
  configuration?: Record<string, unknown>;
  fallbacks?: unknown;
};

export function attachNativeDetachedBrokerModelFetch({
  clientOptions,
  binding,
  modelFetchFactory,
  originalMissionHasDelegation,
}: {
  clientOptions: object;
  binding: NativeDetachedModelFetchBinding;
  modelFetchFactory: NativeDetachedModelFetchFactory | undefined;
  originalMissionHasDelegation: boolean;
}): void {
  if (modelFetchFactory == null) return;
  if (
    originalMissionHasDelegation !== true ||
    typeof binding.agentId !== 'string' ||
    binding.agentId.length === 0 ||
    typeof binding.model !== 'string' ||
    binding.model.length === 0 ||
    typeof binding.provider !== 'string' ||
    !['openai', 'openrouter'].includes(binding.provider.toLowerCase())
  ) {
    throw new Error('NATIVE_BROKER_MODEL_BINDING_UNAUTHORIZED');
  }
  const transport = modelFetchFactory(Object.freeze({ ...binding }));
  if (transport == null) return;
  const carrier = clientOptions as ModelFetchCarrier;
  if (
    typeof transport !== 'function' ||
    (Array.isArray(carrier.fallbacks) && carrier.fallbacks.length > 0) ||
    (carrier.configuration != null &&
      (typeof carrier.configuration !== 'object' ||
        Array.isArray(carrier.configuration) ||
        carrier.configuration.fetch != null))
  ) {
    throw new Error('NATIVE_BROKER_MODEL_TRANSPORT_CONFLICT');
  }
  carrier.configuration = { ...(carrier.configuration ?? {}), fetch: transport };
}
