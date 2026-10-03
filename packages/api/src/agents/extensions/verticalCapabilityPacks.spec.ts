import { createVerticalCapabilityPack, HOSPITALITY_INTELLIGENCE_PACK } from './verticalCapabilityPacks';

describe('vertical capability packs', () => {
  it('defines hospitality intelligence as a disabled-by-default governed pack', () => {
    expect(HOSPITALITY_INTELLIGENCE_PACK.kind).toBe('vertical');
    expect(HOSPITALITY_INTELLIGENCE_PACK.enabled).toBe(false);
    expect(HOSPITALITY_INTELLIGENCE_PACK.domainRules).toContain('same-property');
  });

  it('requires domain rules and default skills', () => {
    expect(() => createVerticalCapabilityPack({
      ...HOSPITALITY_INTELLIGENCE_PACK,
      domainRules: [],
    })).toThrow('Vertical pack requires domain rules');
    expect(() => createVerticalCapabilityPack({
      ...HOSPITALITY_INTELLIGENCE_PACK,
      defaultSkills: [],
    })).toThrow('Vertical pack requires default skills');
  });
});
