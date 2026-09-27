import { createImprovementPayloadDigest } from './improvementPayload';
import { runSkillContentTests } from './skillContentTests';

const update = {
  body: '# Revised\nMust include provenance.\n',
  description: 'Better research skill.',
};
const base = {
  candidateId: 'skill:task-1:call-1',
  producerAgentId: 'agent-producer',
  checkerAgentId: 'librechat:host-skill-tests',
  payloadDigest: createImprovementPayloadDigest(update),
  update,
  tests: [
    {
      id: 'provenance',
      field: 'body' as const,
      operator: 'includes' as const,
      expected: 'provenance',
    },
  ],
};
describe('host-declared independent skill content tests', () => {
  it('binds passing and failing assertions to the exact proposed payload', () => {
    expect(runSkillContentTests(base)).toMatchObject({
      status: 'VERIFIED',
      payloadDigest: base.payloadDigest,
      checks: [{ id: 'provenance', passed: true }],
    });
    expect(
      runSkillContentTests({
        ...base,
        tests: [{ id: 'missing', field: 'body', operator: 'includes', expected: 'citations' }],
      }),
    ).toMatchObject({ status: 'REJECTED', checks: [{ id: 'missing', passed: false }] });
  });
  it('fails closed on absent tests, same producer, or a stale payload digest', () => {
    expect(() => runSkillContentTests({ ...base, tests: [] })).toThrow(/test/i);
    expect(() => runSkillContentTests({ ...base, checkerAgentId: 'agent-producer' })).toThrow(
      /independent/i,
    );
    expect(() =>
      runSkillContentTests({
        ...base,
        payloadDigest: createImprovementPayloadDigest({ body: '# Other' }),
      }),
    ).toThrow(/digest/i);
  });
});
