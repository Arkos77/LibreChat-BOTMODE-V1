import { createImprovementPayloadDigest } from './improvementPayload';

export interface HostSkillContentTest {
  id: string;
  field: 'body' | 'description';
  operator: 'includes' | 'excludes' | 'equals';
  expected: string;
}
export interface SkillContentTestInput {
  candidateId: string;
  producerAgentId: string;
  checkerAgentId: string;
  payloadDigest: string;
  /** Exact immutable skill payload. `update` remains accepted for backward compatibility. */
  payload?: { body: string; description: string; [key: string]: unknown };
  update?: { body: string; description: string; [key: string]: unknown };
  tests: readonly HostSkillContentTest[];
}
export interface SkillContentTestResult {
  candidateId: string;
  payloadDigest: string;
  checkerAgentId: string;
  status: 'VERIFIED' | 'REJECTED';
  checks: Array<{ id: string; passed: boolean }>;
}
function required(value: string, name: string): string {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`Skill content test requires ${name}`);
  return value.trim();
}

/** Runs bounded, host-owned assertions over the exact immutable skill payload. */
export function runSkillContentTests(input: SkillContentTestInput): SkillContentTestResult {
  const candidateId = required(input.candidateId, 'candidateId');
  const producerAgentId = required(input.producerAgentId, 'producerAgentId');
  const checkerAgentId = required(input.checkerAgentId, 'checkerAgentId');
  const payloadDigest = required(input.payloadDigest, 'payloadDigest');
  if (producerAgentId === checkerAgentId)
    throw new Error('Skill tests require an independent checker');
  const payload = input.payload ?? input.update;
  if (createImprovementPayloadDigest(payload) !== payloadDigest)
    throw new Error('Skill tests payload digest mismatch');
  if (!Array.isArray(input.tests) || input.tests.length < 1 || input.tests.length > 32)
    throw new Error('Skill tests require a bounded host plan');
  const ids = new Set<string>();
  const checks = input.tests.map((test) => {
    const id = required(test.id, 'test id');
    if (id.length > 128 || ids.has(id)) throw new Error('Skill tests require unique bounded IDs');
    ids.add(id);
    if (
      !['body', 'description'].includes(test.field) ||
      !['includes', 'excludes', 'equals'].includes(test.operator) ||
      typeof test.expected !== 'string' ||
      test.expected.length < 1 ||
      test.expected.length > 1024
    )
      throw new Error('Skill test declaration is invalid');
    const actual = payload[test.field];
    if (typeof actual !== 'string') throw new Error('Skill test content field is invalid');
    let passed: boolean;
    if (test.operator === 'includes') {
      passed = actual.includes(test.expected);
    } else if (test.operator === 'excludes') {
      passed = !actual.includes(test.expected);
    } else {
      passed = actual === test.expected;
    }
    return { id, passed };
  });
  return {
    candidateId,
    payloadDigest,
    checkerAgentId,
    status: checks.every((check) => check.passed) ? 'VERIFIED' : 'REJECTED',
    checks,
  };
}
