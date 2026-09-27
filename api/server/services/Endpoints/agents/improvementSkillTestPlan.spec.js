const { getHostSkillTestsForSkill } = require('./improvementSkillTestPlan');

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
  it('rejects malformed or oversized host configuration', () => {
    expect(() => getHostSkillTestsForSkill('skill-1', '{bad')).toThrow(/configuration/i);
    expect(() => getHostSkillTestsForSkill('skill-1', 'x'.repeat(70000))).toThrow(/configuration/i);
  });
});
