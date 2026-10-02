function readHostSkillTestPlans(configured) {
  if (configured == null || configured === '') return undefined;
  if (typeof configured !== 'string' || Buffer.byteLength(configured, 'utf8') > 64 * 1024) {
    throw new Error('Skill test configuration exceeds the allowed size');
  }
  let plans;
  try {
    plans = JSON.parse(configured);
  } catch (_) {
    throw new Error('Skill test configuration is invalid JSON');
  }
  if (plans == null || typeof plans !== 'object' || Array.isArray(plans)) {
    throw new Error('Skill test configuration must map skill targets to test arrays');
  }
  return plans;
}

function getTests(plans, key) {
  if (plans === undefined) return undefined;
  const tests = Object.hasOwn(plans, key) ? plans[key] : undefined;
  if (tests === undefined) return undefined;
  if (!Array.isArray(tests) || tests.length < 1 || tests.length > 32) {
    throw new Error('Skill test configuration requires 1 to 32 tests per skill');
  }
  return structuredClone(tests);
}

/** Host-owned, per-existing-skill assertions. Missing plans never validate a proposal. */
function getHostSkillTestsForSkill(skillId, configured = process.env.BOT_MODE_SKILL_TEST_PLANS) {
  if (typeof skillId !== 'string' || skillId.trim() === '') {
    throw new Error('Skill test configuration requires a skill ID');
  }
  return getTests(readHostSkillTestPlans(configured), skillId.trim());
}

/** Host-owned assertions for a proposed create, keyed as `create:<normalized-name>`. */
function getHostSkillTestsForCreate(name, configured = process.env.BOT_MODE_SKILL_TEST_PLANS) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('Skill test configuration requires a skill name');
  }
  return getTests(readHostSkillTestPlans(configured), `create:${name.trim()}`);
}

module.exports = { getHostSkillTestsForSkill, getHostSkillTestsForCreate };
