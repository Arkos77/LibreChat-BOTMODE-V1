import { createHash } from 'crypto';
import type { Model, Types } from 'mongoose';
import type {
  IMtoObservationRecord,
  ListMtoObservationsInput,
  MtoObservationSnapshot,
  RecordMtoObservationInput,
} from '~/types/mtoObservation';

const TYPES = new Set(['DECIDED', 'AUTHORIZED', 'DENIED', 'HUMAN_APPROVAL_REQUIRED']);
const IDENTITY_KEYS = new Set([
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
]);
const EVENT_KEYS = new Set([
  'traceId',
  'traceEventId',
  'type',
  'source',
  'timestamp',
  'identity',
  'payload',
]);
const MAX_READ = 100;
export class MtoObservationConflictError extends Error {
  constructor(id: string) {
    super(`MTO observation idempotency conflict: ${id}`);
    this.name = 'MtoObservationConflictError';
  }
}
function text(name: string, value: unknown, max = 256): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > max)
    throw new Error(`MTO durable ${name} is invalid`);
  return value.trim();
}
function plain(value: unknown): value is Record<string, unknown> {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
function exactKeys(value: Record<string, unknown>, allowed: Set<string>, name: string): void {
  if (Object.keys(value).some((key) => !allowed.has(key)))
    throw new Error(`MTO durable ${name} contains unknown fields`);
}
function normalize(event: MtoObservationSnapshot): MtoObservationSnapshot {
  if (!plain(event)) throw new Error('MTO durable event is invalid');
  exactKeys(event, EVENT_KEYS, 'event');
  const traceId = text('traceId', event.traceId);
  const traceEventId = text('traceEventId', event.traceEventId);
  if (!TYPES.has(event.type) || event.source !== 'host')
    throw new Error('MTO durable event type or source is invalid');
  const timestamp = text('timestamp', event.timestamp, 64);
  if (Number.isNaN(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp)
    throw new Error('MTO durable timestamp is invalid');
  let identity: MtoObservationSnapshot['identity'];
  if (event.identity !== undefined) {
    if (!plain(event.identity)) throw new Error('MTO durable identity is invalid');
    exactKeys(event.identity, IDENTITY_KEYS, 'identity');
    identity = {};
    for (const key of IDENTITY_KEYS) {
      if (event.identity[key] !== undefined)
        identity[key as keyof typeof identity] = text(`identity.${key}`, event.identity[key]);
    }
  }
  if (!plain(event.payload)) throw new Error('MTO durable payload is invalid');
  let payload: Record<string, string | number>;
  if (event.type === 'DECIDED') {
    exactKeys(
      event.payload,
      new Set(['decisionId', 'selectedOption', 'provider', 'confidence']),
      'payload',
    );
    const confidence = event.payload.confidence;
    if (
      confidence !== undefined &&
      (typeof confidence !== 'number' ||
        !Number.isFinite(confidence) ||
        confidence < 0 ||
        confidence > 1)
    )
      throw new Error('MTO durable payload confidence is invalid');
    payload = {
      decisionId: text('payload.decisionId', event.payload.decisionId),
      selectedOption: text('payload.selectedOption', event.payload.selectedOption),
      provider: text('payload.provider', event.payload.provider),
      ...(confidence === undefined ? {} : { confidence }),
    };
  } else {
    exactKeys(
      event.payload,
      new Set(['authorizationId', 'decision', 'capability', 'policyVersion']),
      'payload',
    );
    const decision = {
      AUTHORIZED: 'ALLOW',
      DENIED: 'DENY',
      HUMAN_APPROVAL_REQUIRED: 'HUMAN_APPROVAL_REQUIRED',
    }[event.type];
    if (event.payload.decision !== decision)
      throw new Error('MTO durable payload decision is invalid');
    payload = {
      authorizationId: text('payload.authorizationId', event.payload.authorizationId),
      decision,
      capability: text('payload.capability', event.payload.capability),
      policyVersion: text('payload.policyVersion', event.payload.policyVersion),
    };
  }
  return {
    traceId,
    traceEventId,
    type: event.type,
    source: 'host',
    timestamp,
    ...(identity === undefined ? {} : { identity }),
    payload,
  };
}
function duplicate(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

export interface MtoObservationMethods {
  recordMtoObservation: (
    input: RecordMtoObservationInput,
  ) => Promise<{ record: IMtoObservationRecord; replayed: boolean }>;
  listMtoObservations: (input: ListMtoObservationsInput) => Promise<IMtoObservationRecord[]>;
}

export function createMtoObservationMethods(
  mongoose: typeof import('mongoose'),
): MtoObservationMethods {
  function model(): Model<IMtoObservationRecord> {
    return mongoose.models.MtoObservation as Model<IMtoObservationRecord>;
  }
  function owner(user: Types.ObjectId | string): Types.ObjectId {
    if (user instanceof mongoose.Types.ObjectId) return user;
    if (!mongoose.isObjectIdOrHexString(user)) throw new Error('MTO durable user is invalid');
    return new mongoose.Types.ObjectId(user);
  }
  let indexPromise: Promise<unknown> | null = null;
  function ensureIndexes(): Promise<unknown> {
    if (!indexPromise)
      indexPromise = model()
        .createIndexes()
        .catch((error) => {
          indexPromise = null;
          throw error;
        });
    return indexPromise;
  }
  function assertReplay(
    record: IMtoObservationRecord,
    digest: string,
    id: string,
  ): { record: IMtoObservationRecord; replayed: true } {
    if (record.eventDigest !== digest) throw new MtoObservationConflictError(id);
    return { record, replayed: true as const };
  }
  async function recordMtoObservation(input: RecordMtoObservationInput) {
    const user = owner(input.user);
    const tenantId = normalizeTenant(input.tenantId);
    const tenantKey = tenantId ?? '';
    const event = normalize(input.event);
    const eventDigest = createHash('sha256').update(JSON.stringify(event)).digest('hex');
    const scope = { user, tenantKey, traceId: event.traceId, traceEventId: event.traceEventId };
    await ensureIndexes();
    const existing = await model().findOne(scope).lean<IMtoObservationRecord>();
    if (existing) return assertReplay(existing, eventDigest, event.traceEventId);
    try {
      const record = await model().create({
        user,
        ...(tenantId === undefined ? {} : { tenantId }),
        tenantKey,
        ...event,
        eventDigest,
        persistedAt: new Date(),
      });
      return { record: record.toObject() as IMtoObservationRecord, replayed: false as const };
    } catch (error) {
      if (!duplicate(error)) throw error;
      const raced = await model().findOne(scope).lean<IMtoObservationRecord>();
      if (!raced) throw error;
      return assertReplay(raced, eventDigest, event.traceEventId);
    }
  }
  async function listMtoObservations(
    input: ListMtoObservationsInput,
  ): Promise<IMtoObservationRecord[]> {
    const user = owner(input.user);
    const tenantId = normalizeTenant(input.tenantId);
    const traceId = text('traceId', input.traceId);
    const limit = input.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_READ)
      throw new Error('MTO durable limit is invalid');
    let after: { timestamp: string; traceEventId: string } | undefined;
    if (input.after !== undefined) {
      if (!plain(input.after)) throw new Error('MTO durable cursor is invalid');
      exactKeys(input.after, new Set(['timestamp', 'traceEventId']), 'cursor');
      const timestamp = text('cursor.timestamp', input.after.timestamp, 64);
      if (Number.isNaN(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp)
        throw new Error('MTO durable cursor timestamp is invalid');
      after = { timestamp, traceEventId: text('cursor.traceEventId', input.after.traceEventId) };
    }
    return model()
      .find({
        user,
        tenantKey: tenantId ?? '',
        traceId,
        ...(after === undefined
          ? {}
          : {
              $or: [
                { timestamp: { $gt: after.timestamp } },
                { timestamp: after.timestamp, traceEventId: { $gt: after.traceEventId } },
              ],
            }),
      })
      .sort({ timestamp: 1, traceEventId: 1 })
      .limit(limit)
      .lean<IMtoObservationRecord[]>();
  }
  return { recordMtoObservation, listMtoObservations };
}

function normalizeTenant(value: unknown): string | undefined {
  return value === undefined ? undefined : text('tenantId', value);
}
