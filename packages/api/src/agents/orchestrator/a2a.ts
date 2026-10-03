export type A2aMessageKind = 'TASK_REQUEST' | 'TASK_RESULT' | 'TASK_CANCEL' | 'TASK_STATUS';
export type A2aTaskStatus = 'REQUESTED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface A2aEnvelope {
  messageId: string;
  idempotencyKey: string;
  correlationId: string;
  taskId: string;
  parentTaskId?: string;
  senderAgentId: string;
  receiverAgentId: string;
  kind: A2aMessageKind;
  createdAt: string;
  expiresAt: string;
}

export interface A2aTaskRequest extends A2aEnvelope {
  kind: 'TASK_REQUEST';
  objective: string;
  requiredCapabilities: readonly string[];
  constraints: readonly string[];
}

export interface A2aTaskResult extends A2aEnvelope {
  kind: 'TASK_RESULT';
  status: Exclude<A2aTaskStatus, 'REQUESTED' | 'RUNNING'>;
  output: unknown;
  artifactRefs: readonly string[];
}

export interface A2aTaskCancel extends A2aEnvelope {
  kind: 'TASK_CANCEL';
  reason: string;
}

function requireText(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be non-empty`);
  return value.trim();
}

function validDate(name: string, value: string): string {
  requireText(name, value);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${name} must be a valid date`);
  return value;
}

export function validateA2aEnvelope(envelope: A2aEnvelope): void {
  requireText('messageId', envelope.messageId);
  requireText('idempotencyKey', envelope.idempotencyKey);
  requireText('correlationId', envelope.correlationId);
  requireText('taskId', envelope.taskId);
  requireText('senderAgentId', envelope.senderAgentId);
  requireText('receiverAgentId', envelope.receiverAgentId);
  validDate('createdAt', envelope.createdAt);
  validDate('expiresAt', envelope.expiresAt);
  if (envelope.senderAgentId === envelope.receiverAgentId) throw new Error('A2A sender and receiver must differ');
  if (Date.parse(envelope.expiresAt) <= Date.parse(envelope.createdAt)) throw new Error('A2A expiry must be after creation');
}

export function createA2aTaskRequest(input: A2aTaskRequest): A2aTaskRequest {
  validateA2aEnvelope(input);
  if (input.kind !== 'TASK_REQUEST') throw new Error('A2A task request kind is invalid');
  if (!Array.isArray(input.requiredCapabilities) || input.requiredCapabilities.length === 0) throw new Error('A2A task request requires capabilities');
  return {
    ...input,
    objective: requireText('objective', input.objective),
    requiredCapabilities: [...new Set(input.requiredCapabilities.map((value) => requireText('capability', value)))],
    constraints: [...input.constraints].map((value) => requireText('constraint', value)),
  };
}

export function createA2aTaskCancel(input: A2aTaskCancel): A2aTaskCancel {
  validateA2aEnvelope(input);
  if (input.kind !== 'TASK_CANCEL') throw new Error('A2A task cancel kind is invalid');
  return { ...input, reason: requireText('reason', input.reason) };
}

/** A2A messages are transport/correlation contracts only; auth remains host-owned. */
export function a2aCarriesAuthorization(_message: A2aEnvelope): false {
  return false;
}
