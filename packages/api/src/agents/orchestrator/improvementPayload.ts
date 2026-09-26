import { createHash } from 'crypto';

function canonicalizeImprovementPayload(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Improvement update payload numbers must be finite');
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeImprovementPayload(item, seen));
  }
  if (typeof value !== 'object') {
    if (value === undefined) {
      return undefined;
    }
    throw new TypeError('Improvement update payload contains an unsupported value');
  }
  if (seen.has(value)) {
    throw new TypeError('Improvement update payload cannot contain circular references');
  }

  seen.add(value);
  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const item = canonicalizeImprovementPayload(record[key], seen);
    if (item !== undefined) {
      normalized[key] = item;
    }
  }
  seen.delete(value);
  return normalized;
}

function assertUpdatePayload(update: unknown): asserts update is Record<string, unknown> {
  if (update === null || typeof update !== 'object' || Array.isArray(update)) {
    throw new TypeError('Improvement update payload must be an object');
  }
}

export function createImprovementPayloadDigest(update: unknown): string {
  assertUpdatePayload(update);
  const canonical = JSON.stringify(canonicalizeImprovementPayload(update, new WeakSet()));
  return createHash('sha256').update(canonical).digest('hex');
}

export function verifyImprovementPayloadDigest(update: unknown, expectedDigest: string): boolean {
  if (!expectedDigest) {
    return false;
  }
  return createImprovementPayloadDigest(update) === expectedDigest;
}
