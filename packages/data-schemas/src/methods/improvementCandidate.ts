import { createHash } from 'crypto';
import type { Model, Types } from 'mongoose';
import type {
  GetImprovementCandidateInput,
  IImprovementCandidateRecord,
  ImprovementCandidateSnapshot,
  RecordImprovementCandidateInput,
} from '~/types/improvementCandidate';

interface DuplicateKeyError {
  code?: number;
}

export class ImprovementCandidateConflictError extends Error {
  constructor(candidateId: string) {
    super(`Improvement candidate idempotency conflict: ${candidateId}`);
    this.name = 'ImprovementCandidateConflictError';
  }
}

export interface ImprovementCandidateMethods {
  recordImprovementCandidate: (
    input: RecordImprovementCandidateInput,
  ) => Promise<{ record: IImprovementCandidateRecord; replayed: boolean }>;
  getImprovementCandidate: (
    input: GetImprovementCandidateInput,
  ) => Promise<IImprovementCandidateRecord | null>;
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

function digestSnapshot(conversationId: string, candidate: ImprovementCandidateSnapshot): string {
  return createHash('sha256').update(stableStringify({ conversationId, candidate })).digest('hex');
}

function normalizeTenantId(tenantId?: string): string | undefined {
  if (typeof tenantId !== 'string') return undefined;
  const normalized = tenantId.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function requiredText(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Improvement candidate durable ${name} must be a non-empty string`);
  }
  return value.trim();
}

function requireNonNegativeInteger(name: string, value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error('Improvement candidate durable ' + name + ' must be a non-negative integer');
  }
  return Number(value);
}

function validateCountMap(name: string, value: unknown): void {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Improvement candidate durable ' + name + ' is invalid');
  }
  for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
    requiredText(name + ' key', key);
    requireNonNegativeInteger(name + '.' + key, count);
  }
}

function validateCandidateSnapshot(candidate: ImprovementCandidateSnapshot): void {
  if (candidate == null || typeof candidate !== 'object') {
    throw new Error('Improvement candidate durable snapshot is invalid');
  }
  const target = candidate.target;
  if (!['skill', 'agent', 'workflow', 'specialist'].includes(target)) {
    throw new Error('Improvement candidate durable target is invalid');
  }
  if (candidate.status !== 'CANDIDATE') {
    throw new Error('Improvement candidate durable status is invalid');
  }
  requiredText('candidateId', candidate.candidateId);
  requiredText('title', candidate.title);
  requiredText('summary', candidate.summary);
  requiredText('traceId', candidate.traceId);
  if (!Array.isArray(candidate.traceEventIds) || candidate.traceEventIds.length === 0) {
    throw new Error('Improvement candidate durable traceEventIds must be non-empty');
  }
  for (const traceEventId of candidate.traceEventIds) {
    requiredText('traceEventId', traceEventId);
  }
  if (target === 'skill') {
    requiredText('payloadDigest', candidate.payloadDigest);
  }
  const publication = candidate.publication;
  const expectedPath = target === 'skill' ? 'native-skill-authoring-required' : 'proposal-only';
  if (
    publication == null ||
    typeof publication !== 'object' ||
    publication.path !== expectedPath ||
    publication.requiresOracle !== true ||
    publication.requiresAuthorization !== true ||
    typeof publication.requiresHumanReview !== 'boolean'
  ) {
    throw new Error('Improvement candidate durable publication is invalid');
  }
  const signals = candidate.signals;
  if (signals == null || typeof signals !== 'object') {
    throw new Error('Improvement candidate durable signals are invalid');
  }
  requireNonNegativeInteger('signals.observationCount', signals.observationCount);
  if (signals.observationCount === 0) {
    throw new Error('Improvement candidate durable signals.observationCount must be positive');
  }
  validateCountMap('signals.sourceCounts', signals.sourceCounts);
  validateCountMap('signals.typeCounts', signals.typeCounts);
  if (signals.oracle == null || typeof signals.oracle !== 'object') {
    throw new Error('Improvement candidate durable signals.oracle is invalid');
  }
  requireNonNegativeInteger('signals.oracle.verified', signals.oracle.verified);
  requireNonNegativeInteger('signals.oracle.rejected', signals.oracle.rejected);
  requireNonNegativeInteger('signals.oracle.humanReview', signals.oracle.humanReview);
  requireNonNegativeInteger('signals.oracle.unknown', signals.oracle.unknown);
  validateCountMap('signals.oracle.reasonCodes', signals.oracle.reasonCodes);
  const createdAt = requiredText('createdAt', candidate.createdAt);
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new Error('Improvement candidate durable createdAt must be a valid date');
  }
}
function isDuplicateKeyError(error: unknown): error is DuplicateKeyError {
  return typeof error === 'object' && error !== null && (error as DuplicateKeyError).code === 11000;
}

export function createImprovementCandidateMethods(
  mongoose: typeof import('mongoose'),
): ImprovementCandidateMethods {
  function model(): Model<IImprovementCandidateRecord> {
    return mongoose.models.ImprovementCandidate as Model<IImprovementCandidateRecord>;
  }

  function ownerId(user: Types.ObjectId | string): Types.ObjectId {
    if (user instanceof mongoose.Types.ObjectId) return user;
    if (!mongoose.isObjectIdOrHexString(user)) {
      throw new Error('Improvement candidate durable user must be a valid ObjectId');
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
    record: IImprovementCandidateRecord,
    snapshotDigest: string,
    candidateId: string,
  ): { record: IImprovementCandidateRecord; replayed: true } {
    if (record.snapshotDigest !== snapshotDigest) {
      throw new ImprovementCandidateConflictError(candidateId);
    }
    return { record, replayed: true };
  }

  async function recordImprovementCandidate(
    input: RecordImprovementCandidateInput,
  ): Promise<{ record: IImprovementCandidateRecord; replayed: boolean }> {
    const ImprovementCandidate = model();
    validateCandidateSnapshot(input.candidate);
    const user = ownerId(input.user);
    const tenantId = normalizeTenantId(input.tenantId);
    const tenantKey = tenantId ?? '';
    const conversationId = requiredText('conversationId', input.conversationId);
    const candidateId = requiredText('candidateId', input.candidate?.candidateId);
    const snapshotDigest = digestSnapshot(conversationId, input.candidate);
    const scope = { user, tenantKey, candidateId };

    await ensureIndexes();
    const existing = await ImprovementCandidate.findOne(scope).lean<IImprovementCandidateRecord>();
    if (existing) return assertReplay(existing, snapshotDigest, candidateId);

    try {
      const record = await ImprovementCandidate.create({
        user,
        ...(tenantId !== undefined ? { tenantId } : {}),
        tenantKey,
        conversationId,
        ...input.candidate,
        candidateId,
        snapshotDigest,
        persistedAt: new Date(),
      });
      return { record: record.toObject() as IImprovementCandidateRecord, replayed: false };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const raced = await ImprovementCandidate.findOne(scope).lean<IImprovementCandidateRecord>();
      if (!raced) throw error;
      return assertReplay(raced, snapshotDigest, candidateId);
    }
  }

  async function getImprovementCandidate(
    input: GetImprovementCandidateInput,
  ): Promise<IImprovementCandidateRecord | null> {
    const user = ownerId(input.user);
    const tenantId = normalizeTenantId(input.tenantId);
    const tenantKey = tenantId ?? '';
    const candidateId = requiredText('candidateId', input.candidateId);
    return model().findOne({ user, tenantKey, candidateId }).lean<IImprovementCandidateRecord>();
  }

  return { recordImprovementCandidate, getImprovementCandidate };
}
