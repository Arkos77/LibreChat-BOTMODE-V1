import { createHash } from 'crypto';
import type { Model, Types } from 'mongoose';
import type {
  IImprovementSkillProposalRecord,
  RecordImprovementSkillProposalInput,
  GetImprovementSkillProposalInput,
} from '~/types/improvementSkillProposal';

export interface ImprovementSkillProposalMethods {
  recordImprovementSkillProposal: (
    input: RecordImprovementSkillProposalInput,
  ) => Promise<{ record: IImprovementSkillProposalRecord; replayed: boolean }>;
  getImprovementSkillProposal: (
    input: GetImprovementSkillProposalInput,
  ) => Promise<IImprovementSkillProposalRecord | null>;
}

export function createImprovementSkillProposalMethods(
  mongoose: typeof import('mongoose'),
): ImprovementSkillProposalMethods {
  const model = () =>
    mongoose.models.ImprovementSkillProposal as Model<IImprovementSkillProposalRecord>;
  const ownerId = (user: Types.ObjectId | string) => {
    if (!mongoose.isObjectIdOrHexString(user))
      throw new Error('Skill proposal requires a valid owner');
    return new mongoose.Types.ObjectId(String(user));
  };
  const required = (value: unknown, name: string) => {
    if (typeof value !== 'string' || value.trim() === '')
      throw new Error(`Skill proposal requires ${name}`);
    return value.trim();
  };
  let indexPromise: Promise<unknown> | null = null;
  async function recordImprovementSkillProposal(
    input: RecordImprovementSkillProposalInput,
  ): Promise<{ record: IImprovementSkillProposalRecord; replayed: boolean }> {
    const user = ownerId(input.user);
    const tenantId =
      typeof input.tenantId === 'string' && input.tenantId.trim()
        ? input.tenantId.trim()
        : undefined;
    const tenantKey = tenantId ?? '';
    const conversationId = required(input.conversationId, 'conversationId');
    const proposal = input.proposal;
    const candidateId = required(proposal?.candidateId, 'candidateId');
    required(proposal.traceId, 'traceId');
    required(proposal.taskId, 'taskId');
    required(proposal.producerAgentId, 'producerAgentId');
    required(proposal.toolCallId, 'toolCallId');
    required(proposal.skillId, 'skillId');
    required(proposal.payloadDigest, 'payloadDigest');
    if (!Number.isSafeInteger(proposal.expectedVersion) || proposal.expectedVersion < 1)
      throw new Error('Skill proposal requires a positive expectedVersion');
    if (
      typeof proposal.diff !== 'string' ||
      typeof proposal.update?.body !== 'string' ||
      typeof proposal.update?.description !== 'string'
    )
      throw new Error('Skill proposal content is invalid');
    const serialized = JSON.stringify({ conversationId, proposal });
    if (Buffer.byteLength(serialized, 'utf8') > 512 * 1024)
      throw new Error('Skill proposal exceeds content limit');
    const snapshotDigest = createHash('sha256').update(serialized).digest('hex');
    /** Repeated native tool calls with exactly the same edit share one review. */
    const dedupeKey = createHash('sha256')
      .update(
        JSON.stringify({
          conversationId,
          traceId: proposal.traceId,
          taskId: proposal.taskId,
          producerAgentId: proposal.producerAgentId,
          skillId: proposal.skillId,
          expectedVersion: proposal.expectedVersion,
          payloadDigest: proposal.payloadDigest,
          diff: proposal.diff,
          update: proposal.update,
        }),
      )
      .digest('hex');
    const scope = { user, tenantKey, 'proposal.candidateId': candidateId };
    if (!indexPromise)
      indexPromise = model()
        .createIndexes()
        .catch((error) => {
          indexPromise = null;
          throw error;
        });
    await indexPromise;
    const replay = (record: IImprovementSkillProposalRecord) => {
      if (record.snapshotDigest !== snapshotDigest)
        throw new Error('Skill proposal idempotency conflict');
      return { record, replayed: true as const };
    };
    const existing = await model().findOne(scope).lean<IImprovementSkillProposalRecord>();
    if (existing) return replay(existing);
    const sameEditScope = { user, tenantKey, dedupeKey };
    const sameEdit = await model().findOne(sameEditScope).lean<IImprovementSkillProposalRecord>();
    if (sameEdit) return { record: sameEdit, replayed: true };
    try {
      const record = await model().create({
        user,
        tenantId,
        tenantKey,
        conversationId,
        proposal,
        snapshotDigest,
        dedupeKey,
      });
      return { record: record.toObject() as IImprovementSkillProposalRecord, replayed: false };
    } catch (error) {
      if ((error as { code?: number })?.code !== 11000) throw error;
      const raced = await model().findOne(scope).lean<IImprovementSkillProposalRecord>();
      if (raced) return replay(raced);
      const racedEdit = await model()
        .findOne(sameEditScope)
        .lean<IImprovementSkillProposalRecord>();
      if (!racedEdit) throw error;
      return { record: racedEdit, replayed: true };
    }
  }
  async function getImprovementSkillProposal(
    input: GetImprovementSkillProposalInput,
  ): Promise<IImprovementSkillProposalRecord | null> {
    return model()
      .findOne({
        user: ownerId(input.user),
        tenantKey: input.tenantId?.trim() ?? '',
        'proposal.candidateId': required(input.candidateId, 'candidateId'),
      })
      .lean<IImprovementSkillProposalRecord>();
  }
  return { recordImprovementSkillProposal, getImprovementSkillProposal };
}
