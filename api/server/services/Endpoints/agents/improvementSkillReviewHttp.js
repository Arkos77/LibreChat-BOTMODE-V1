const { resolveRequestTenantId } = require('@librechat/api');
const db = require('~/models');
const { getSkillToolDeps } = require('./skillDeps');
const { publishImprovementSkillUpdateForRequest } = require('./improvementPublication');
const { observeMtoEvent } = require('./mtoObservation');
const {
  loadSkillImprovementReview,
  decideSkillImprovementReview,
} = require('./improvementSkillReview');

function dependencies(req) {
  return {
    req,
    tenantId: resolveRequestTenantId(req),
    candidateId: req.params.candidateId,
    getProposal: db.getImprovementSkillProposal,
    getCandidate: db.getImprovementCandidate,
    listEvents: db.listImprovementLifecycleEvents,
    recordEvent: db.recordImprovementLifecycleEvent,
    canView: getSkillToolDeps().canEditSkill,
    publish: publishImprovementSkillUpdateForRequest,
    mtoEventSink: observeMtoEvent,
  };
}
function handleFailure(res, error) {
  return res
    .status(error.status === 409 ? 409 : 500)
    .json({ error: error.status === 409 ? error.message : 'Skill review failed' });
}
async function getSkillImprovementReview(req, res) {
  try {
    const review = await loadSkillImprovementReview(dependencies(req));
    return res.json({
      candidateId: review.candidateId,
      skillId: review.skillId,
      expectedVersion: review.expectedVersion,
      diff: review.diff,
      payloadDigest: review.payloadDigest,
      snapshotDigest: review.snapshotDigest,
      quality: review.quality,
      reviewed: review.reviewed,
      checks: review.checks,
    });
  } catch (error) {
    return handleFailure(res, error);
  }
}
async function postSkillImprovementReview(req, res) {
  try {
    const result = await decideSkillImprovementReview({
      ...dependencies(req),
      decision: req.body?.decision,
      payloadDigest: req.body?.payloadDigest,
      snapshotDigest: req.body?.snapshotDigest,
    });
    return res.json(result);
  } catch (error) {
    return handleFailure(res, error);
  }
}
module.exports = { getSkillImprovementReview, postSkillImprovementReview };
