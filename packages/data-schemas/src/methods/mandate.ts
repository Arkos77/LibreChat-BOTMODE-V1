import { z } from 'zod';
import { randomUUID } from 'crypto';
import type {
  AutonomyMandate,
  MandateScope,
  MandateRules,
  MandateRevision,
} from '~/schema/mandate';
import { getTenantId, SYSTEM_TENANT_ID } from '~/config/tenantContext';
import { createAutonomyMandateModel } from '~/models/mandate';

const identity = z.string().trim().min(1).max(256);
const rulesSchema = z
  .object({
    allowedCapabilities: z.array(identity).max(256),
    deniedCapabilities: z.array(identity).max(256),
    validFrom: z.date(),
    expiresAt: z.date(),
    reason: z.string().trim().min(1).max(512),
  })
  .strict()
  .refine((r) => r.expiresAt > r.validFrom, 'Expiry must follow activation');
const scopeSchema = z.object({ userId: identity, tenantId: identity.optional() }).strict();

export interface AutonomyMandateMethods {
  createAutonomyMandate: (
    scope: MandateScope,
    binding: { actorId: string; conversationId: string },
    rules: MandateRules,
  ) => Promise<AutonomyMandate>;
  getAutonomyMandate: (scope: MandateScope, mandateId: string) => Promise<AutonomyMandate | null>;
  reviseAutonomyMandate: (
    scope: MandateScope,
    mandateId: string,
    expectedVersion: number,
    rules: MandateRules,
  ) => Promise<AutonomyMandate>;
  revokeAutonomyMandate: (
    scope: MandateScope,
    mandateId: string,
    expectedVersion: number,
    reason: string,
  ) => Promise<AutonomyMandate>;
}

/** Trusted server API only: scope comes from the authenticated owner, never a model/tool payload. */
export function createAutonomyMandateMethods(
  mongoose: typeof import('mongoose'),
): AutonomyMandateMethods {
  const model = createAutonomyMandateModel(mongoose);
  const validateScope = (scope: MandateScope): MandateScope => {
    const owner = scopeSchema.parse(scope);
    const tenant = getTenantId();
    if (tenant != null && tenant !== SYSTEM_TENANT_ID && tenant !== owner.tenantId)
      throw new Error('Mandate tenant scope mismatch');
    return owner;
  };

  const filter = (scope: MandateScope, mandateId: string) => {
    const owner = validateScope(scope);
    return {
      _id: identity.parse(mandateId),
      userId: owner.userId,
      $and: [{ tenantId: owner.tenantId ?? { $exists: false } }],
    };
  };
  const getAutonomyMandate: AutonomyMandateMethods['getAutonomyMandate'] = async (
    scope,
    mandateId,
  ) => model.findOne(filter(scope, mandateId)).read('primary').lean<AutonomyMandate>();

  const createAutonomyMandate: AutonomyMandateMethods['createAutonomyMandate'] = async (
    scope,
    binding,
    rules,
  ) => {
    const owner = validateScope(scope);
    const revision: MandateRevision = {
      ...rulesSchema.parse(rules),
      version: 1,
      status: 'active',
      changedBy: owner.userId,
      changedAt: new Date(),
    };
    const doc = await model.create({
      ...owner,
      _id: randomUUID(),
      actorId: identity.parse(binding.actorId),
      conversationId: identity.parse(binding.conversationId),
      version: 1,
      revisions: [revision],
    });
    return doc.toObject();
  };

  async function append(
    scope: MandateScope,
    mandateId: string,
    expectedVersion: number,
    rules: MandateRules | undefined,
    reason?: string,
  ): Promise<AutonomyMandate> {
    if (
      !Number.isSafeInteger(expectedVersion) ||
      expectedVersion < 1 ||
      (expectedVersion >= 256 && rules != null)
    )
      throw new Error('Invalid or exhausted mandate revision');
    const current = await getAutonomyMandate(scope, mandateId);
    const prior = current?.revisions[current.revisions.length - 1];
    if (
      !current ||
      current.version !== expectedVersion ||
      prior?.version !== expectedVersion ||
      prior.status !== 'active'
    )
      throw new Error('Mandate revision conflict');
    const nextRules =
      rules == null
        ? { ...prior, reason: z.string().trim().min(1).max(512).parse(reason) }
        : rulesSchema.parse(rules);
    const revision: MandateRevision = {
      ...nextRules,
      version: expectedVersion + 1,
      status: rules == null ? 'revoked' : 'active',
      changedBy: scope.userId,
      changedAt: new Date(),
    };
    const updated = await model
      .findOneAndUpdate(
        { ...filter(scope, mandateId), version: expectedVersion },
        { $inc: { version: 1 }, $push: { revisions: revision } },
        { new: true, runValidators: true },
      )
      .lean<AutonomyMandate>();
    if (!updated) throw new Error('Mandate revision conflict');
    return updated;
  }

  return {
    createAutonomyMandate,
    getAutonomyMandate,
    reviseAutonomyMandate: (scope, id, version, rules) => append(scope, id, version, rules),
    revokeAutonomyMandate: (scope, id, version, reason) =>
      append(scope, id, version, undefined, reason),
  };
}
