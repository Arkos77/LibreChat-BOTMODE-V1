/** Optional, host-owned native graph model transport.
 *
 * This supplies NO authorization or receipt by itself. The host factory must
 * bind the original generation, task, checkpoint and provider operation to an
 * independently persisted broker receipt. A missing host keeps ordinary SDK
 * model routing unchanged; an invalid opted-in binding fails closed.
 */
export type NativeGraphModelFetchBinding = Readonly<{
  agentId: string;
  nodeId: string;
  taskId: string;
  provider: string;
  model: string;
}>;

export type NativeGraphModelFetchFactory = (
  binding: NativeGraphModelFetchBinding,
) => typeof fetch | undefined;

type ClientOptions = {
  model?: string;
  useResponsesApi?: boolean;
  configuration?: Record<string, unknown>;
  fallbacks?: unknown;
};

/** Clone before changing the compiled node; never mutate a saved agent binding. */
export function attachNativeGraphBrokerModelFetch({
  clientOptions,
  binding,
  factory,
}: {
  clientOptions: ClientOptions | undefined;
  binding: NativeGraphModelFetchBinding;
  factory: NativeGraphModelFetchFactory | undefined;
}): ClientOptions | undefined {
  if (factory == null) return clientOptions;
  if (
    !binding ||
    !['openai', 'openrouter'].includes(binding.provider.toLowerCase()) ||
    [binding.agentId, binding.nodeId, binding.taskId, binding.model].some(
      (value) => typeof value !== 'string' || !value || value.length > 256,
    ) ||
    clientOptions?.model !== binding.model ||
    clientOptions.useResponsesApi === true
  ) {
    throw new Error('NATIVE_GRAPH_BROKER_MODEL_BINDING_UNAUTHORIZED');
  }
  // A failure to bind cannot fall back to direct provider IO. The factory may
  // return undefined ONLY if it deliberately declines before mission admission.
  const transport = factory(Object.freeze({ ...binding }));
  if (transport == null) {
    throw new Error('NATIVE_GRAPH_BROKER_TRANSPORT_UNAVAILABLE');
  }
  if (
    typeof transport !== 'function' ||
    (Array.isArray(clientOptions.fallbacks) && clientOptions.fallbacks.length > 0) ||
    (clientOptions.configuration != null &&
      (typeof clientOptions.configuration !== 'object' ||
        Array.isArray(clientOptions.configuration) ||
        clientOptions.configuration.fetch != null))
  ) {
    throw new Error('NATIVE_GRAPH_BROKER_MODEL_TRANSPORT_CONFLICT');
  }
  return {
    ...clientOptions,
    configuration: { ...(clientOptions.configuration ?? {}), fetch: transport },
  };
}
