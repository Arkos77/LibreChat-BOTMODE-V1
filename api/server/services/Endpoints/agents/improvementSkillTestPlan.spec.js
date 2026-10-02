const {
  getHostSkillTestsForSkill,
  getHostSkillTestsForCreate,
} = require('./improvementSkillTestPlan');

describe('host-owned skill test configuration', () => {
  it('selects only the exact skill plan and fails closed when absent', () => {
    const configured = JSON.stringify({
      'skill-1': [
        { id: 'required-section', field: 'body', operator: 'includes', expected: 'Evidence' },
      ],
    });
    expect(getHostSkillTestsForSkill('skill-1', configured)).toHaveLength(1);
    expect(getHostSkillTestsForSkill('skill-2', configured)).toBeUndefined();
    expect(getHostSkillTestsForSkill('skill-1', undefined)).toBeUndefined();
  });
  it('selects an exact create plan by proposed skill name without fabricating a skill id', () => {
    const configured = JSON.stringify({
      'create:new-skill': [
        { id: 'required-section', field: 'body', operator: 'includes', expected: 'Evidence' },
      ],
      'create:other-skill': [
        { id: 'other', field: 'body', operator: 'includes', expected: 'Other' },
      ],
    });
    expect(getHostSkillTestsForCreate('new-skill', configured)).toHaveLength(1);
    expect(getHostSkillTestsForCreate('missing-skill', configured)).toBeUndefined();
    expect(() => getHostSkillTestsForCreate('   ', configured)).toThrow(/name/i);
  });

  it('rejects malformed or oversized host configuration', () => {
    expect(() => getHostSkillTestsForSkill('skill-1', '{bad')).toThrow(/configuration/i);
    expect(() => getHostSkillTestsForSkill('skill-1', 'x'.repeat(70000))).toThrow(/configuration/i);
  });
});
