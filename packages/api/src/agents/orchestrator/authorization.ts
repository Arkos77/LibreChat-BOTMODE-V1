import { createMtoEvent, type MtoEvent, type MtoEventType } from './mto';

export type AuthorizationDecision = 'ALLOW' | 'DENY' | 'HUMAN_APPROVAL_REQUIRED';

/** Host-owned outcome metadata. This record is an observation, never a permission token. */
export interface AuthorizationRecord {
  authorizationId: string;
  traceId: string;
  taskId?: string;
  actorId: string;
  capability: string;
  scope: string;
  policyVersion: string;
  decision: AuthorizationDecision;
  durationMs?: number;
  conditions?: string[];
  humanApproval?: { required: boolean; approvalId?: string };
  timestamp: string;
}

function required(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`AuthorizationRecord requires ${name}`);
  }
  return value;
}

export function createAuthorizationRecord(input: AuthorizationRecord): AuthorizationRecord {
  const authorizationId = required('authorizationId', input.authorizationId);
  const traceId = required('traceId', input.traceId);
  const actorId = required('actorId', input.actorId);
  const capability = required('capability', input.capability);
  const scope = required('scope', input.scope);
  const policyVersion = required('policyVersion', input.policyVersion);
  const timestamp = required('timestamp', input.timestamp);
  if (!['ALLOW', 'DENY', 'HUMAN_APPROVAL_REQUIRED'].includes(input.decision)) {
    throw new Error('AuthorizationRecord requires a valid decision');
  }
  if (input.taskId !== undefined) required('taskId', input.taskId);
  if (
    input.durationMs !== undefined &&
    (!Number.isFinite(input.durationMs) || input.durationMs <= 0)
  ) {
    throw new Error('AuthorizationRecord durationMs must be positive and finite');
  }
  if (
    input.conditions !== undefined &&
    (!Array.isArray(input.conditions) ||
      input.conditions.some(
        (condition) => typeof condition !== 'string' || condition.trim() === '',
      ))
  ) {
    throw new Error('AuthorizationRecord conditions must be non-empty strings');
  }
  if (
    input.humanApproval !== undefined &&
    (typeof input.humanApproval.required !== 'boolean' ||
      (input.humanApproval.approvalId !== undefined &&
        (typeof input.humanApproval.approvalId !== 'string' ||
          input.humanApproval.approvalId.trim() === '')))
  ) {
    throw new Error('AuthorizationRecord humanApproval is invalid');
  }
  return {
    authorizationId,
    traceId,
    actorId,
    capability,
    scope,
    policyVersion,
    decision: input.decision,
    ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
    ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
    ...(input.conditions === undefined ? {} : { conditions: [...input.conditions] }),
    ...(input.humanApproval === undefined
      ? {}
      : {
          humanApproval: {
            required: input.humanApproval.required,
            ...(input.humanApproval.approvalId === undefined
              ? {}
              : { approvalId: input.humanApproval.approvalId }),
          },
        }),
    timestamp,
  };
}

export interface MtoAuthorizationObservation {
  authorizationId: string;
  decision: AuthorizationDecision;
  capability: string;
  policyVersion: string;
}

/** Emits provenance only. The MTO event cannot authorize or execute an action. */
export function fromAuthorizationRecord(
  input: AuthorizationRecord,
  traceEventId: string,
): MtoEvent<MtoAuthorizationObservation> {
  const record = createAuthorizationRecord(input);
  let type: MtoEventType = 'HUMAN_APPROVAL_REQUIRED';
  if (record.decision === 'ALLOW') type = 'AUTHORIZED';
  if (record.decision === 'DENY') type = 'DENIED';
  return createMtoEvent(
    type,
    { traceId: record.traceId, traceEventId, taskId: record.taskId, timestamp: record.timestamp },
    'host',
    {
      authorizationId: record.authorizationId,
      decision: record.decision,
      capability: record.capability,
      policyVersion: record.policyVersion,
    },
  );
}
