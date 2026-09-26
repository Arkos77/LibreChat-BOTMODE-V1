import { createHash } from 'crypto';
import type { Model, Types } from 'mongoose';
import type {
  IImprovementLifecycleEventRecord,
  ImprovementLifecycleEventSnapshot,
  ListImprovementLifecycleEventsInput,
  RecordImprovementLifecycleEventInput,
} from '~/types/improvementLifecycleEvent';

interface DuplicateKeyError {
  code?: number;
}

const MAX_EVENT_DATA_BYTES = 32 * 1024;
const VALID_TYPES = new Set([
  'VALIDATING',
  'VERIFIED',
  'REJECTED',
  'UNKNOWN',
  'HUMAN_REVIEW',
  'AUTHORIZATION_REQUIRED',
  'AUTHORIZED',
  'DENIED',
  'PROPOSAL_ONLY',
  'COMMITTED',
]);
const VALID_ACTOR_TYPES = new Set(['host', 'agent', 'oracle', 'policy', 'human']);

export class ImprovementLifecycleEventConflictError extends Error {
  constructor(eventId: string) {
    super(`Improvement lifecycle event idempotency conflict: ${eventId}`);
    this.name = 'ImprovementLifecycleEventConflictError';
  }
}

export interface ImprovementLifecycleEventMethods {
  recordImprovementLifecycleEvent: (
    input: RecordImprovementLifecycleEventInput,
  ) => Promise<{ record: IImprovementLifecycleEventRecord; replayed: boolean }>;
  listImprovementLifecycleEvents: (
    input: ListImprovementLifecycleEventsInput,
  ) => Promise<IImprovementLifecycleEventRecord[]>;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function normalizeTenantId(tenantId?: string): string | undefined {
  if (typeof tenantId !== 'string') return undefined;
  const normalized = tenantId.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function requiredText(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Improvement lifecycle durable ${name} must be a non-empty string`);
  }
  return value.trim();
}

function assertJsonSafe(value: unknown, seen = new Set<object>()): void {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Improvement lifecycle durable data is invalid');
    return;
  }
  if (typeof value !== 'object') {
    throw new Error('Improvement lifecycle durable data is invalid');
  }
  if (seen.has(value)) throw new Error('Improvement lifecycle durable data must not be cyclic');
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertJsonSafe(item, seen);
  } else {
    for (const item of Object.values(value as Record<string, unknown>)) assertJsonSafe(item, seen);
  }
  seen.delete(value);
}

function normalizeEvent(
  event: ImprovementLifecycleEventSnapshot,
): ImprovementLifecycleEventSnapshot {
  if (event == null || typeof event !== 'object') {
    throw new Error('Improvement lifecycle durable event is invalid');
  }
  const eventId = requiredText('eventId', event.eventId);
  const candidateId = requiredText('candidateId', event.candidateId);
  const traceId = requiredText('traceId', event.traceId);
  const type = requiredText('type', event.type);
  if (!VALID_TYPES.has(type)) throw new Error('Improvement lifecycle durable type is invalid');
  const actorId = requiredText('actor.id', event.actor?.id);
  const actorType = requiredText('actor.type', event.actor?.type);
  if (!VALID_ACTOR_TYPES.has(actorType)) {
    throw new Error('Improvement lifecycle durable actor.type is invalid');
  }
  const occurredAt = requiredText('occurredAt', event.occurredAt);
  if (Number.isNaN(Date.parse(occurredAt))) {
    throw new Error('Improvement lifecycle durable occurredAt must be a valid date');
  }
  if (event.data !== undefined) {
    if (event.data == null || typeof event.data !== 'object' || Array.isArray(event.data)) {
      throw new Error('Improvement lifecycle durable data must be an object');
    }
    assertJsonSafe(event.data);
    if (Buffer.byteLength(stableStringify(event.data), 'utf8') > MAX_EVENT_DATA_BYTES) {
      throw new Error('Improvement lifecycle durable data exceeds bounded size');
    }
  }
  return {
    eventId,
    candidateId,
    traceId,
    type: type as ImprovementLifecycleEventSnapshot['type'],
    actor: {
      id: actorId,
      type: actorType as ImprovementLifecycleEventSnapshot['actor']['type'],
    },
    ...(event.data === undefined ? {} : { data: structuredClone(event.data) }),
    occurredAt,
  };
}

function digestEvent(event: ImprovementLifecycleEventSnapshot): string {
  return createHash('sha256').update(stableStringify(event)).digest('hex');
}

function isDuplicateKeyError(error: unknown): error is DuplicateKeyError {
  return typeof error === 'object' && error !== null && (error as DuplicateKeyError).code === 11000;
}

export function createImprovementLifecycleEventMethods(
  mongoose: typeof import('mongoose'),
): ImprovementLifecycleEventMethods {
  function model(): Model<IImprovementLifecycleEventRecord> {
    return mongoose.models.ImprovementLifecycleEvent as Model<IImprovementLifecycleEventRecord>;
  }

  function ownerId(user: Types.ObjectId | string): Types.ObjectId {
    if (user instanceof mongoose.Types.ObjectId) return user;
    if (!mongoose.isObjectIdOrHexString(user)) {
      throw new Error('Improvement lifecycle durable user must be a valid ObjectId');
    }
    return new mongoose.Types.ObjectId(user);
  }

  let indexPromise: Promise<unknown> | null = null;
  function ensureIndexes(): Promise<unknown> {
    if (!indexPromise) {
      indexPromise = model()
        .createIndexes()
        .catch((error) => {
          indexPromise = null;
          throw error;
        });
    }
    return indexPromise;
  }

  function assertReplay(
    record: IImprovementLifecycleEventRecord,
    eventDigest: string,
    eventId: string,
  ): { record: IImprovementLifecycleEventRecord; replayed: true } {
    if (record.eventDigest !== eventDigest) {
      throw new ImprovementLifecycleEventConflictError(eventId);
    }
    return { record, replayed: true };
  }

  async function recordImprovementLifecycleEvent(
    input: RecordImprovementLifecycleEventInput,
  ): Promise<{ record: IImprovementLifecycleEventRecord; replayed: boolean }> {
    const ImprovementLifecycleEvent = model();
    const user = ownerId(input.user);
    const tenantId = normalizeTenantId(input.tenantId);
    const tenantKey = tenantId ?? '';
    const event = normalizeEvent(input.event);
    const eventDigest = digestEvent(event);
    const scope = { user, tenantKey, eventId: event.eventId };

    const ImprovementCandidate = mongoose.models.ImprovementCandidate as Model<{
      traceId: string;
    }>;
    if (!ImprovementCandidate) {
      throw new Error('Improvement lifecycle durable candidate model is unavailable');
    }
    const candidate = await ImprovementCandidate.findOne({
      user,
      tenantKey,
      candidateId: event.candidateId,
    })
      .select({ traceId: 1 })
      .lean<{ traceId: string }>();
    if (!candidate) {
      throw new Error('Improvement lifecycle durable candidate not found in owner scope');
    }
    if (candidate.traceId !== event.traceId) {
      throw new Error('Improvement lifecycle durable candidate trace mismatch');
    }

    await ensureIndexes();
    const existing =
      await ImprovementLifecycleEvent.findOne(scope).lean<IImprovementLifecycleEventRecord>();
    if (existing) return assertReplay(existing, eventDigest, event.eventId);

    try {
      const record = await ImprovementLifecycleEvent.create({
        user,
        ...(tenantId === undefined ? {} : { tenantId }),
        tenantKey,
        ...event,
        eventDigest,
        persistedAt: new Date(),
      });
      return { record: record.toObject() as IImprovementLifecycleEventRecord, replayed: false };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const raced =
        await ImprovementLifecycleEvent.findOne(scope).lean<IImprovementLifecycleEventRecord>();
      if (!raced) throw error;
      return assertReplay(raced, eventDigest, event.eventId);
    }
  }

  async function listImprovementLifecycleEvents(
    input: ListImprovementLifecycleEventsInput,
  ): Promise<IImprovementLifecycleEventRecord[]> {
    const user = ownerId(input.user);
    const tenantId = normalizeTenantId(input.tenantId);
    const tenantKey = tenantId ?? '';
    const candidateId = requiredText('candidateId', input.candidateId);
    return model()
      .find({ user, tenantKey, candidateId })
      .sort({ occurredAt: 1, eventId: 1 })
      .lean<IImprovementLifecycleEventRecord[]>();
  }

  return { recordImprovementLifecycleEvent, listImprovementLifecycleEvents };
}
