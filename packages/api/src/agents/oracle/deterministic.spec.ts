import type { OracleInput } from './types';
import { deterministicOracle } from './deterministic';

const input = (overrides: Partial<OracleInput> = {}): OracleInput => ({
  taskId: 'task-qa',
  runId: 'run-qa',
  agentId: 'producer',
  candidate: '{"total":42}',
  criteria: [{ id: 'total', field: 'total', expected: 42 }],
  evidence: [],
  ...overrides,
});

describe('deterministic Oracle', () => {
  it('verifies conformance with an independent, auditable comparison', async () => {
    const original = input();
    const verdict = await deterministicOracle.validate(original);
    expect(verdict).toMatchObject({
      status: 'VERIFIED',
      input: original,
      validator: { id: 'librechat:oracle:deterministic:v1', type: 'deterministic' },
      reasons: [{ code: 'CRITERION_MET', criterionId: 'total' }],
      checks: [{ criterionId: 'total', expected: 42, actual: 42, passed: true }],
      contradictions: [],
      uncertainty: [],
    });
    expect(Number.isNaN(Date.parse(verdict.timestamp))).toBe(false);
    original.criteria[0].expected = 99;
    expect(verdict.input.criteria[0].expected).toBe(42);
    expect(verdict.validator.id).not.toBe(original.agentId);
  });

  it.each(['{"total":41}', '{}', 'not JSON', '[42]', 'null'])(
    'rejects a demonstrated contract violation: %s',
    async (candidate) => {
      const verdict = await deterministicOracle.validate(input({ candidate }));
      expect(verdict.status).toBe('REJECTED');
      expect(verdict.reasons[0].code).toMatch(/CRITERION_FAILED|INVALID_CANDIDATE/);
    },
  );

  it.each([undefined, ''])('keeps an absent candidate unknown (%s)', async (candidate) => {
    expect((await deterministicOracle.validate(input({ candidate }))).status).toBe('UNKNOWN');
  });

  it('does not turn model agreement or high confidence into proof', async () => {
    const verdict = await deterministicOracle.validate(
      input({
        criteria: [{ id: 'total', field: 'total', expected: 42, requireEvidence: true }],
        evidence: ['model-a', 'model-b'].map((id) => ({
          id,
          criterionId: 'total',
          value: 42,
          source: { id, type: 'model' as const },
          confidence: 1,
        })),
      }),
    );
    expect(verdict.status).toBe('UNKNOWN');
    expect(verdict.uncertainty).toContain('INDEPENDENT_EVIDENCE_MISSING');
    expect(verdict.input.evidence).toHaveLength(2);
    expect((await deterministicOracle.validate(input({ criteria: [] }))).status).toBe('UNKNOWN');
  });

  it('accepts a matching independent tool check, but not producer evidence', async () => {
    const original = input({
      criteria: [{ id: 'total', field: 'total', expected: 42, requireEvidence: true }],
      evidence: [
        {
          id: 'tool-check',
          criterionId: 'total',
          value: 42,
          source: { id: 'calculator', type: 'tool', agentId: 'checker' },
        },
      ],
    });
    expect((await deterministicOracle.validate(original)).status).toBe('VERIFIED');
    original.evidence[0].source.agentId = 'producer';
    expect((await deterministicOracle.validate(original)).status).toBe('UNKNOWN');
  });

  it('requires a known checker identity for independent tool evidence', async () => {
    const original = input({
      criteria: [{ id: 'total', field: 'total', expected: 42, requireEvidence: true }],
      evidence: [
        {
          id: 'tool-unattributed',
          criterionId: 'total',
          value: 42,
          source: { id: 'call-unattributed', type: 'tool' },
        },
      ],
    });
    const verdict = await deterministicOracle.validate(original);
    expect(verdict.status).toBe('UNKNOWN');
    expect(verdict.uncertainty).toContain('INDEPENDENT_EVIDENCE_MISSING');
  });

  it('preserves conflicting values and sources instead of choosing a winner', async () => {
    const original = input({
      evidence: [
        { id: 'a', criterionId: 'total', value: 42, source: { id: 'A', type: 'source' } },
        { id: 'b', criterionId: 'total', value: 43, source: { id: 'B', type: 'source' } },
      ],
    });
    const verdict = await deterministicOracle.validate(original);
    expect(verdict.status).toBe('UNKNOWN');
    expect(verdict.contradictions).toEqual([{ criterionId: 'total', evidenceIds: ['a', 'b'] }]);
    expect(verdict.input.evidence).toEqual(original.evidence);
    expect(verdict.uncertainty).toContain('CONTRADICTORY_EVIDENCE');
    expect(
      (
        await deterministicOracle.validate({
          ...original,
          review: { required: true, reason: 'policy' },
        })
      ).status,
    ).toBe('HUMAN_REVIEW');
  });

  it('preserves human review even when deterministic criteria pass', async () => {
    const verdict = await deterministicOracle.validate(
      input({
        review: { required: true, reason: 'high_risk' },
      }),
    );
    expect(verdict.status).toBe('HUMAN_REVIEW');
    expect(verdict.reasons).toContainEqual({ code: 'HUMAN_REVIEW_REQUIRED', detail: 'high_risk' });
  });

  it('does not accept self validation or ambiguous criterion identities', async () => {
    expect(
      (
        await deterministicOracle.validate(
          input({
            agentId: deterministicOracle.identity.id,
          }),
        )
      ).status,
    ).toBe('UNKNOWN');
    expect(
      (
        await deterministicOracle.validate(
          input({
            criteria: [input().criteria[0], input().criteria[0]],
          }),
        )
      ).status,
    ).toBe('UNKNOWN');
  });
});

describe('versioned mission result contract', () => {
  it.each([undefined, '', '  \n  ', null, 42])(
    'rejects a completed task without a usable result: %s',
    async (result) => {
      const candidate = JSON.stringify({ ok: true, result });
      const verdict = await deterministicOracle.validate({
        ...input(),
        candidate,
        criteria: [{ id: 'completed', field: 'ok', expected: true }],
        outputContract: 'result-v1',
      });
      expect(verdict.status).toBe('REJECTED');
    },
  );
  it('accepts an explicit impossibility conclusion without inventing feasibility', async () => {
    const verdict = await deterministicOracle.validate({
      ...input(),
      candidate: JSON.stringify({
        ok: true,
        result: 'Impossible à établir : délais de paiement inconnus.',
      }),
      criteria: [{ id: 'completed', field: 'ok', expected: true }],
      outputContract: 'result-v1',
    });
    expect(verdict.status).toBe('VERIFIED');
    expect(verdict.input.outputContract).toBe('result-v1');
  });
});

describe('research source provenance', () => {
  const research = {
    ...input(),
    outputContract: 'research-v1' as const,
    criteria: [{ id: 'completed', field: 'ok', expected: true }],
    candidate: JSON.stringify({
      ok: true,
      result: 'See https://example.org/report',
      sources: 'https://example.org/report',
    }),
  };
  it('rejects model supplied citations without an executed search observation', async () => {
    expect((await deterministicOracle.validate(research)).status).toBe('REJECTED');
  });
  it('accepts a cited URL present in the task native search observation', async () => {
    const verdict = await deterministicOracle.validate({
      ...research,
      observedSources: [{ toolCallId: 'search-call', urls: ['https://example.org/report'] }],
    });
    expect(verdict.status).toBe('VERIFIED');
  });
  it.each([
    '\\ue202turn0search0',
    '\ue202turn0search0',
    '\\ue202turn0search0\\ue202turn0news1',
    '\ue202turn0search0\ue202turn0news1',
    '\\ue200\\ue202turn0search0\\ue201',
    '\ue200\ue202turn0search0\ue201',
    '\\ue204\\ue202turn0search0',
    '\ue204\ue202turn0search0',
  ])('accepts an observed URL followed by the application citation suffix %s', async (suffix) => {
    const url = 'https://example.org/report';
    const verdict = await deterministicOracle.validate({
      ...research,
      candidate: JSON.stringify({ ok: true, result: `Observed ${url}.${suffix}`, sources: url }),
      observedSources: [{ toolCallId: 'search-call', urls: [url] }],
    });
    expect(verdict.status).toBe('VERIFIED');
  });

  it.each([
    'https://example.org/forged.\\ue202turn0search0',
    'https://example.org/report/extra.\\ue202turn0search0',
    'https://example.org/report?extra=yes.\\ue202turn0search0',
    'https://example.org/report#extra.\\ue202turn0search0',
    'https://example.org.attacker.invalid/report.\\ue202turn0search0',
    'https://example.org/report.\\ue202turn0search0/extra',
    'https://example.org/report.\\ue202turn0search0evil',
    'https://example.org/report.\\ue202turn0unknown0',
    'https://example.org/report.%EE%88%82turn0search0',
  ])('keeps forged or malformed citations rejected: %s', async (citation) => {
    const verdict = await deterministicOracle.validate({
      ...research,
      candidate: JSON.stringify({
        ok: true,
        result: `Observed ${citation}`,
        sources: 'https://example.org/report',
      }),
      observedSources: [{ toolCallId: 'search-call', urls: ['https://example.org/report'] }],
    });
    expect(verdict.status).toBe('REJECTED');
  });

  it('does not promote a citation anchor into an independent source observation', async () => {
    const verdict = await deterministicOracle.validate({
      ...research,
      candidate: JSON.stringify({
        ok: true,
        result: 'https://example.org/report.\\ue202turn0search0',
        sources: 'https://example.org/report',
      }),
    });
    expect(verdict.status).toBe('REJECTED');
  });

  it('rejects a citation absent from observed results', async () => {
    expect(
      (
        await deterministicOracle.validate({
          ...research,
          observedSources: [{ toolCallId: 'search-call', urls: ['https://other.example/report'] }],
        })
      ).status,
    ).toBe('REJECTED');
  });
  it('rejects a bibliography not cited in the result', async () => {
    expect(
      (
        await deterministicOracle.validate({
          ...research,
          candidate: JSON.stringify({
            ok: true,
            result: 'Unsupported assertion',
            sources: 'https://example.org/report',
          }),
          observedSources: [{ toolCallId: 'search-call', urls: ['https://example.org/report'] }],
        })
      ).status,
    ).toBe('REJECTED');
  });
});

it.each(['https://example.org/report?q=yes!', 'https://example.org/a(b)'])(
  'accepts an observed URL with legitimate punctuation: %s',
  async (url) => {
    expect(
      (
        await deterministicOracle.validate({
          ...input(),
          outputContract: 'research-v1',
          candidate: JSON.stringify({ total: 42, result: `See [source](${url}).`, sources: url }),
          observedSources: [{ toolCallId: 'search', urls: [url] }],
        })
      ).status,
    ).toBe('VERIFIED');
  },
);

it('rejects an extra unobserved citation with an uppercase HTTP scheme', async () => {
  expect(
    (
      await deterministicOracle.validate({
        ...input(),
        outputContract: 'research-v1',
        candidate: JSON.stringify({
          total: 42,
          result: 'See https://example.org/report and HTTPS://forged.example/claim',
          sources: 'https://example.org/report',
        }),
        observedSources: [{ toolCallId: 'search', urls: ['https://example.org/report'] }],
      })
    ).status,
  ).toBe('REJECTED');
});
