import { resolveToolEvidenceIntent } from './toolEvidenceIntent';

describe('P10 tool evidence intent contract', () => {
  it('resolves an exact host-owned tool declaration', () => {
    expect(
      resolveToolEvidenceIntent({
        toolName: 'verify_skill_target',
        declarations: [
          {
            toolName: 'verify_skill_target',
            criterionId: 'target',
            expectedValue: 'skill',
          },
        ],
      }),
    ).toEqual({ criterionId: 'target', value: 'skill', declaredByHost: true });
  });

  it('returns undefined when the host did not declare semantics for the tool', () => {
    expect(
      resolveToolEvidenceIntent({
        toolName: 'generic_web_search',
        declarations: [
          {
            toolName: 'verify_skill_target',
            criterionId: 'target',
            expectedValue: 'skill',
          },
        ],
      }),
    ).toBeUndefined();
  });

  it('fails closed when multiple declarations make the semantics ambiguous', () => {
    expect(() =>
      resolveToolEvidenceIntent({
        toolName: 'verify_target',
        declarations: [
          { toolName: 'verify_target', criterionId: 'target', expectedValue: 'skill' },
          { toolName: 'verify_target', criterionId: 'target', expectedValue: 'workflow' },
        ],
      }),
    ).toThrow('unambiguous');
  });

  it('rejects blank declaration identities instead of inferring them', () => {
    expect(() =>
      resolveToolEvidenceIntent({
        toolName: 'verify_target',
        declarations: [{ toolName: ' ', criterionId: 'target', expectedValue: 'skill' }],
      }),
    ).toThrow('declaration.toolName');
  });

  it('does not accept raw output, tool arguments, artifact or producer text as inputs', () => {
    const result = resolveToolEvidenceIntent({
      toolName: 'verify_target',
      declarations: [{ toolName: 'verify_target', criterionId: 'target', expectedValue: true }],
    });
    expect(result).toEqual({ criterionId: 'target', value: true, declaredByHost: true });
    expect(result).not.toHaveProperty('output');
    expect(result).not.toHaveProperty('artifact');
    expect(result).not.toHaveProperty('arguments');
    expect(result).not.toHaveProperty('reasoning');
  });
});
