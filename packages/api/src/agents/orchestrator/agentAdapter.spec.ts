import {
  validateAdapterDescriptor,
  validateHarnessManifest,
  type AgentAdapter,
  type AgentAdapterFactory,
} from './agentAdapter';

const descriptor = (overrides = {}) => ({
  id: 'codex-cli',
  target: 'codex',
  capabilities: ['coding', 'filesystem'],
  transport: 'process' as const,
  supportsJson: true,
  supportsInteractive: true,
  supportsCancellation: true,
  supportsInspection: true,
  ...overrides,
});

describe('agent adapter contract', () => {
  it('accepts an agent-native descriptor with machine-readable process output', () => {
    expect(() => validateAdapterDescriptor(descriptor())).not.toThrow();
  });

  it('requires machine-readable output for process adapters', () => {
    expect(() => validateAdapterDescriptor(descriptor({ supportsJson: false }))).toThrow(
      'Process adapters must expose machine-readable output',
    );
  });

  it('requires a discover + inspect harness baseline', () => {
    expect(() =>
      validateHarnessManifest({
        adapterId: 'codex-cli',
        target: 'codex',
        contractVersion: 1,
        checks: ['discover', 'inspect', 'invoke', 'json-output', 'cancel', 'artifact'],
      }),
    ).not.toThrow();

    expect(() =>
      validateHarnessManifest({
        adapterId: 'codex-cli',
        target: 'codex',
        contractVersion: 1,
        checks: ['invoke'],
      }),
    ).toThrow('Harness manifest requires discovery and inspection checks');
  });

  it('rejects unsupported contract versions', () => {
    expect(() =>
      validateHarnessManifest({
        adapterId: 'codex-cli',
        target: 'codex',
        contractVersion: 2,
        checks: ['discover', 'inspect'],
      }),
    ).toThrow('Unsupported adapter harness contract version');
  });

  it('keeps factory creation separate from execution authority', async () => {
    const execute = jest.fn(async () => ({
      status: 'SUCCEEDED' as const,
      output: { ok: true },
      artifactRefs: ['artifact-1'],
    }));
    const adapter: AgentAdapter = {
      descriptor: descriptor(),
      inspect: async () => descriptor(),
      execute,
      cancel: async () => undefined,
    };
    const factory: AgentAdapterFactory = {
      canCreate: (target) => target === 'codex',
      create: async () => adapter,
    };

    expect(factory.canCreate('codex')).toBe(true);
    expect(factory.canCreate('unknown')).toBe(false);
    const created = await factory.create('codex');
    expect(created.descriptor.id).toBe('codex-cli');
    expect(execute).not.toHaveBeenCalled();
  });
});
