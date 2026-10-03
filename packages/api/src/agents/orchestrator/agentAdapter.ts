export interface AgentAdapterDescriptor {
  id: string;
  target: string;
  version?: string;
  capabilities: readonly string[];
  transport: 'process' | 'http' | 'mcp' | 'sdk';
  supportsJson: boolean;
  supportsInteractive: boolean;
  supportsCancellation: boolean;
  supportsInspection: boolean;
  trustLevel?: string;
}

export interface AgentAdapterRequest {
  taskId: string;
  objective: string;
  args: Readonly<Record<string, unknown>>;
}

export interface AgentAdapterResult {
  status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  output: unknown;
  artifactRefs: readonly string[];
  exitCode?: number;
}

export interface AgentAdapter {
  readonly descriptor: AgentAdapterDescriptor;
  inspect(): Promise<AgentAdapterDescriptor>;
  execute(request: AgentAdapterRequest): Promise<AgentAdapterResult>;
  cancel?(taskId: string): Promise<void>;
}

export interface AgentAdapterFactory {
  canCreate(target: string): boolean;
  create(target: string): Promise<AgentAdapter>;
}

export interface AdapterHarnessManifest {
  adapterId: string;
  target: string;
  contractVersion: number;
  checks: readonly ('discover' | 'inspect' | 'invoke' | 'json-output' | 'cancel' | 'artifact')[];
}

export function validateAdapterDescriptor(descriptor: AgentAdapterDescriptor): void {
  if (!descriptor.id || !descriptor.target) {
    throw new Error('Adapter descriptor requires id and target');
  }
  if (descriptor.capabilities.length === 0) {
    throw new Error('Adapter descriptor requires capabilities');
  }
  if (descriptor.supportsJson === false && descriptor.transport === 'process') {
    throw new Error('Process adapters must expose machine-readable output');
  }
}

export function validateHarnessManifest(manifest: AdapterHarnessManifest): void {
  if (!manifest.adapterId || !manifest.target) {
    throw new Error('Harness manifest requires adapterId and target');
  }
  if (manifest.contractVersion !== 1) {
    throw new Error('Unsupported adapter harness contract version');
  }
  if (!manifest.checks.includes('discover') || !manifest.checks.includes('inspect')) {
    throw new Error('Harness manifest requires discovery and inspection checks');
  }
}
