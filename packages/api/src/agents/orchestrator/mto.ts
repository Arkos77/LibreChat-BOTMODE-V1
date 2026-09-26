import type { SubagentUpdateEvent, SubagentUsageEvent } from '@librechat/agents';
import type { OracleEvent } from '../oracle';

/**
 * BOT MODE operational trace event names. This is an observation vocabulary,
 * never a task status, permission decision, scheduler command, or settlement.
 */
export type MtoEventType =
  | 'REQUESTED'
  | 'PLANNED'
  | 'DECIDED'
  | 'AUTHORIZED'
  | 'DENIED'
  | 'HUMAN_APPROVAL_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'ASSIGNED'
  | 'LEASED'
  | 'STARTED'
  | 'OBSERVED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'RETRY_REQUESTED'
  | 'FALLBACK_SELECTED'
  | 'REPLANNED'
  | 'ESCALATED'
  | 'PAUSED'
  | 'INTERRUPTED'
  | 'CHECKPOINT_WRITTEN'
  | 'CHECKPOINT_READ'
  | 'RECOVERED'
  | 'TAKEN_OVER'
  | 'RESUMED'
  | 'CANDIDATE'
  | 'VALIDATING'
  | 'VERIFIED'
  | 'COMMITTED'
  | 'SETTLED'
  | 'CANCELLED'
  | 'REVOKED'
  | 'ARTIFACT_CREATED'
  | 'PUBLISHED';

/** Identities remain distinct; consumers must not infer one from another. */
export interface MtoIdentity {
  traceId: string;
  traceEventId: string;
  parentTraceEventId?: string;
  causedByTraceEventId?: string;
  taskId?: string;
  rootRunId?: string;
  parentRunId?: string;
  runId?: string;
  subagentRunId?: string;
  threadId?: string;
  agentId?: string;
  parentAgentId?: string;
  memberAgentId?: string;
  parentToolCallId?: string;
}

export type MtoSource = 'host' | 'subagent-activity' | 'subagent-usage' | 'oracle';

export interface MtoSubagentActivityObservation {
  phase: SubagentUpdateEvent['phase'];
  subagentType: string;
  subagentKind?: SubagentUpdateEvent['subagentKind'];
  depth?: number;
  label?: string;
}

export interface MtoSubagentUsageObservation {
  usage: SubagentUsageEvent['usage'];
  model?: string;
  provider?: string;
  subagentType: string;
  subagentKind?: SubagentUsageEvent['subagentKind'];
  depth?: number;
}

export interface MtoOracleObservation {
  phase: OracleEvent['phase'];
  decision?: 'ACCEPT' | 'REJECT' | 'DEFER' | 'REQUEST_HUMAN_REVIEW';
  validator?: {
    id: string;
    type: 'deterministic' | 'tool' | 'source' | 'model' | 'human';
    agentId?: string;
  };
  reasonCodes?: string[];
  uncertainty?: string[];
  checkCount?: number;
  contradictionCount?: number;
  evidenceCount?: number;
}

export interface MtoEvent<TPayload = unknown> {
  type: MtoEventType;
  identity: MtoIdentity;
  source: MtoSource;
  timestamp: string;
  payload?: TPayload;
}

export interface MtoEventContext extends MtoIdentity {
  /** Host supplied event time when adapting sources that do not carry one. */
  timestamp?: string;
}

function requiredId(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`MTO ${name} must be a non-empty string`);
  }
  return value;
}

function cleanOptional(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

export function createMtoEvent<TPayload>(
  type: MtoEventType,
  context: MtoEventContext,
  source: MtoSource,
  payload?: TPayload,
): MtoEvent<TPayload> {
  const identity: MtoIdentity = {
    traceId: requiredId('traceId', context.traceId),
    traceEventId: requiredId('traceEventId', context.traceEventId),
  };
  const optionalKeys: Array<keyof Omit<MtoIdentity, 'traceId' | 'traceEventId'>> = [
    'parentTraceEventId',
    'causedByTraceEventId',
    'taskId',
    'rootRunId',
    'parentRunId',
    'runId',
    'subagentRunId',
    'threadId',
    'agentId',
    'parentAgentId',
    'memberAgentId',
    'parentToolCallId',
  ];
  for (const key of optionalKeys) {
    const value = cleanOptional(context[key] as string | undefined);
    if (value != null) identity[key] = value;
  }
  return {
    type,
    identity,
    source,
    timestamp: context.timestamp ?? new Date().toISOString(),
    ...(payload === undefined ? {} : { payload: structuredClone(payload) }),
  };
}

/**
 * Adapts the SDK's already-bounded child activity without changing its
 * authority. taskId remains host-supplied because SubagentUpdateEvent does
 * not own Task Engine identity.
 */
export function fromSubagentActivity(
  event: SubagentUpdateEvent,
  context: Pick<MtoEventContext, 'traceId' | 'traceEventId' | 'taskId' | 'threadId'>,
): MtoEvent<MtoSubagentActivityObservation> {
  const payload: MtoSubagentActivityObservation = {
    phase: event.phase,
    subagentType: event.subagentType,
    ...(event.subagentKind == null ? {} : { subagentKind: event.subagentKind }),
    ...(event.depth == null ? {} : { depth: event.depth }),
    ...(event.label == null ? {} : { label: event.label }),
  };
  return createMtoEvent(
    'OBSERVED',
    {
      ...context,
      timestamp: event.timestamp,
      rootRunId: event.runId,
      runId: event.runId,
      parentRunId: event.parentRunId,
      subagentRunId: event.subagentRunId,
      agentId: event.subagentAgentId,
      parentAgentId: event.parentAgentId,
      memberAgentId: event.memberAgentId,
      parentToolCallId: event.parentToolCallId,
    },
    'subagent-activity',
    payload,
  );
}

/** Model usage is observational only; provider/model/cost policy stays upstream. */
export function fromSubagentUsage(
  event: SubagentUsageEvent,
  context: Pick<MtoEventContext, 'traceId' | 'traceEventId' | 'taskId' | 'threadId'>,
): MtoEvent<MtoSubagentUsageObservation> {
  const payload: MtoSubagentUsageObservation = {
    usage: structuredClone(event.usage),
    subagentType: event.subagentType,
    ...(event.model == null ? {} : { model: event.model }),
    ...(event.provider == null ? {} : { provider: event.provider }),
    ...(event.subagentKind == null ? {} : { subagentKind: event.subagentKind }),
    ...(event.depth == null ? {} : { depth: event.depth }),
  };
  return createMtoEvent(
    'OBSERVED',
    {
      ...context,
      rootRunId: event.runId,
      runId: event.runId,
      parentRunId: event.parentRunId,
      subagentRunId: event.subagentRunId,
      agentId: event.subagentAgentId,
      memberAgentId: event.memberAgentId,
    },
    'subagent-usage',
    payload,
  );
}

function oracleType(event: OracleEvent): MtoEventType {
  if (event.phase === 'CANDIDATE') return 'CANDIDATE';
  if (event.phase === 'VALIDATING') return 'VALIDATING';
  if (event.phase === 'VERIFIED') return 'VERIFIED';
  if (event.phase === 'REJECTED') return 'REJECTED';
  if (event.phase === 'HUMAN_REVIEW') return 'HUMAN_APPROVAL_REQUIRED';
  return 'OBSERVED';
}

/** Oracle remains QA-only; this adapter records its event and never settles work. */
export function fromOracleEvent(
  event: OracleEvent,
  context: Pick<MtoEventContext, 'traceId' | 'traceEventId' | 'taskId' | 'threadId'>,
): MtoEvent<MtoOracleObservation> {
  const input =
    event.phase === 'CANDIDATE' || event.phase === 'VALIDATING' ? event.input : event.verdict.input;
  const payload: MtoOracleObservation =
    event.phase === 'CANDIDATE' || event.phase === 'VALIDATING'
      ? { phase: event.phase, evidenceCount: event.input.evidence.length }
      : {
          phase: event.phase,
          decision: event.decision,
          validator: { ...event.verdict.validator },
          reasonCodes: event.verdict.reasons.map((reason) => reason.code),
          uncertainty: [...event.verdict.uncertainty],
          checkCount: event.verdict.checks.length,
          contradictionCount: event.verdict.contradictions.length,
          evidenceCount: event.verdict.input.evidence.length,
        };
  return createMtoEvent(
    oracleType(event),
    {
      ...context,
      taskId: context.taskId ?? input.taskId,
      runId: input.runId,
      agentId: input.agentId,
    },
    'oracle',
    payload,
  );
}
