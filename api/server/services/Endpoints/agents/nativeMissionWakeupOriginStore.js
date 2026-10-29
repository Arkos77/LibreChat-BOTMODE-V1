'use strict';

const { createHash } = require('node:crypto');
const mongoose = require('mongoose');

/**
 * Immutable mission provenance, separate from GenerationJobManager's mutable
 * conversation slot. Nothing in this collection is exposed via chat APIs or
 * Meilisearch; all reads require the exact authenticated owner and parent.
 */
const originSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, maxlength: 256 },
    tenantId: { type: String, required: true, default: '', maxlength: 256 },
    conversationId: { type: String, required: true, maxlength: 256 },
    parentResponseMessageId: { type: String, required: true, maxlength: 256 },
    agentId: { type: String, required: true, maxlength: 256 },
    planId: { type: String, required: true, maxlength: 256 },
    originalCreatedAt: { type: Number, required: true, min: 1 },
    fingerprint: { type: String, required: true, minlength: 64, maxlength: 64 },
    botMode: { type: mongoose.Schema.Types.Mixed, select: false },
    orchestratorMission: { type: mongoose.Schema.Types.Mixed, required: true, select: false },
    plan: { type: mongoose.Schema.Types.Mixed, required: true, select: false },
    capabilityAttestation: { type: mongoose.Schema.Types.Mixed, required: true, select: false },
  },
  { strict: 'throw', timestamps: true, collection: 'native_mission_wakeup_origins' },
);
const UNIQUE = {
  userId: 1,
  tenantId: 1,
  conversationId: 1,
  parentResponseMessageId: 1,
};
originSchema.index(UNIQUE, { unique: true, name: 'original_parent_mission_unique' });
const model =
  mongoose.models.NativeMissionWakeupOrigin ||
  mongoose.model('NativeMissionWakeupOrigin', originSchema);
let ensureIndexPromise;
function ensureIndex() {
  if (!ensureIndexPromise) {
    ensureIndexPromise = model.collection
      .createIndex(UNIQUE, { unique: true, name: 'original_parent_mission_unique' })
      .catch((error) => {
        ensureIndexPromise = undefined;
        throw error;
      });
  }
  return ensureIndexPromise;
}
function requireScope(scope) {
  const fields = ['userId', 'conversationId', 'parentResponseMessageId', 'agentId'];
  if (
    scope == null ||
    fields.some((key) => typeof scope[key] !== 'string' || !scope[key] || scope[key].length > 256) ||
    (scope.tenantId != null && (typeof scope.tenantId !== 'string' || scope.tenantId.length > 256))
  ) {
    throw new Error('MISSION_ORIGIN_SCOPE_INVALID');
  }
  return {
    userId: scope.userId,
    tenantId: scope.tenantId ?? '',
    conversationId: scope.conversationId,
    parentResponseMessageId: scope.parentResponseMessageId,
  };
}

async function saveNativeMissionWakeupOrigin(input) {
  const key = requireScope(input);
  const { agentId, plan, orchestratorMission, capabilityAttestation, botMode, createdAt } = input;
  if (
    !plan?.planId ||
    !plan?.mission ||
    !orchestratorMission?.mission ||
    !capabilityAttestation ||
    !Number.isSafeInteger(createdAt) ||
    createdAt <= 0 ||
    plan.mission.missionId !== orchestratorMission.mission.missionId ||
    plan.mission.taskId !== orchestratorMission.mission.taskId ||
    plan.mission.objective !== orchestratorMission.mission.objective
  ) {
    throw new Error('MISSION_ORIGIN_PLAN_INVALID');
  }
  const data = {
    ...key,
    agentId,
    planId: plan.planId,
    originalCreatedAt: createdAt,
    ...(botMode != null && { botMode }),
    orchestratorMission,
    plan,
    capabilityAttestation,
  };
  const source = JSON.stringify(data);
  if (Buffer.byteLength(source, 'utf8') > 131_072) {
    throw new Error('MISSION_ORIGIN_TOO_LARGE');
  }
  const fingerprint = createHash('sha256').update(source).digest('hex');
  await ensureIndex();
  await model.updateOne(key, { $setOnInsert: { ...data, fingerprint } }, { upsert: true });
  const stored = await model.findOne(key).select('+botMode +orchestratorMission +plan +capabilityAttestation').lean();
  if (stored?.fingerprint !== fingerprint) {
    throw new Error('MISSION_ORIGIN_IMMUTABLE_CONFLICT');
  }
  return { planId: stored.planId, parentResponseMessageId: key.parentResponseMessageId };
}

async function getNativeMissionWakeupOrigin(scope) {
  const key = requireScope(scope);
  await ensureIndex();
  const record = await model
    .findOne({ ...key, agentId: scope.agentId })
    .select('+botMode +orchestratorMission +plan +capabilityAttestation')
    .lean();
  if (!record) {
    return null;
  }
  const {
    _id, __v, createdAt, updatedAt, fingerprint,
    ...source
  } = record;
  const observed = createHash('sha256').update(JSON.stringify(source)).digest('hex');
  if (observed !== fingerprint || record.plan?.planId !== record.planId) {
    throw new Error('MISSION_ORIGIN_INTEGRITY_FAILED');
  }
  return {
    ...source,
    originalCreatedAt: record.originalCreatedAt,
    fingerprint,
  };
}

/** Called only after the authorized conversation deletion fence. The scope is
 * mandatory even for delete-all, so a tenant cannot erase another owner's data. */
async function deleteNativeMissionWakeupOrigins({ userId, tenantId, conversationIds }) {
  if (typeof userId !== 'string' || !userId || userId.length > 256) {
    throw new Error('MISSION_ORIGIN_DELETE_SCOPE_INVALID');
  }
  if (tenantId != null && (typeof tenantId !== 'string' || tenantId.length > 256)) {
    throw new Error('MISSION_ORIGIN_DELETE_SCOPE_INVALID');
  }
  if (conversationIds != null && (!Array.isArray(conversationIds) ||
      conversationIds.some((id) => typeof id !== 'string' || !id || id.length > 256))) {
    throw new Error('MISSION_ORIGIN_DELETE_SCOPE_INVALID');
  }
  if (conversationIds != null && conversationIds.length === 0) return;
  await model.deleteMany({
    userId,
    tenantId: tenantId ?? '',
    ...(conversationIds == null ? {} : { conversationId: { $in: conversationIds } }),
  });
}

module.exports = {
  saveNativeMissionWakeupOrigin,
  getNativeMissionWakeupOrigin,
  deleteNativeMissionWakeupOrigins,
};
