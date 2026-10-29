import type { OracleInput } from './types';
import { deterministicOracle } from './deterministic';

const source = 'https://ci-source.invalid/report';
const candidate = {
  result: 'Rapport CI-FIXTURE-001, publié le 2026-10-25T00:00:00Z : trois contrôles passés.',
  sources: source,
  ok: true,
};
const input = (): OracleInput => ({
  taskId: 'mission/research',
  agentId: 'saved-researcher',
  outputContract: 'research-v2',
  candidate: JSON.stringify(candidate),
  criteria: [{ id: 'completed', field: 'ok', expected: true }],
  evidence: [],
  observedSources: [{ toolCallId: 'current-search', urls: [source] }],
});

describe('versioned structured research provenance', () => {
  it('accepts a source field without duplicating URLs in v2, while v1 still rejects it', async () => {
    expect((await deterministicOracle.validate(input())).status).toBe('VERIFIED');
    expect(
      (await deterministicOracle.validate({ ...input(), outputContract: 'research-v1' })).status,
    ).toBe('REJECTED');
  });

  it.each([
    { sources: '' },
    { sources: 'https://forged.invalid/report' },
    { result: 'See https://forged.invalid/report' },
    { result: '' },
    { ok: false },
    { ok: null },
  ])('rejects invalid provenance or completion %j', async (patch) => {
    const verdict = await deterministicOracle.validate({
      ...input(),
      candidate: JSON.stringify({ ...candidate, ...patch }),
    });
    expect(verdict.status).toBe('REJECTED');
  });

  it('rejects missing native observations, even when a model declares the source', async () => {
    expect((await deterministicOracle.validate({ ...input(), observedSources: [] })).status).toBe(
      'REJECTED',
    );
  });

  it('keeps independent evidence, contradictions and human review mandatory', async () => {
    const independent = {
      ...input(),
      criteria: [{ id: 'completed', field: 'ok', expected: true, requireEvidence: true }],
    };
    expect((await deterministicOracle.validate(independent)).status).toBe('UNKNOWN');
    expect(
      (
        await deterministicOracle.validate({
          ...independent,
          evidence: [
            {
              id: 'check',
              criterionId: 'completed',
              value: false,
              source: { id: 'checker', type: 'tool', agentId: 'independent-checker' },
            },
          ],
        })
      ).status,
    ).toBe('UNKNOWN');
    expect(
      (
        await deterministicOracle.validate({
          ...input(),
          review: { required: true, reason: 'policy' },
        })
      ).status,
    ).toBe('HUMAN_REVIEW');
  });
});

it('preserves the exact captured candidate and distinguishes v1 rejection from v2 provenance', async () => {
  const raw =
    '{"result": "Le rapport CI contrôlé (fixture de qualification BOTMODE, périmètre exclusif du jeu de test) est le suivant : identifiant CI-FIXTURE-001 ; date de publication 2026-10-25T00:00:00Z ; contrôles enregistrés : trois vérifications, toutes conclues par un statut passé.\\nSynthèse : le jeu de test comporte un seul rapport de CI contrôlé, dont les trois contrôles ont été enregistrés comme réussis, sans contrôle échoué ni ignoré signalé.", "sources": "https://ci-source.invalid/report", "ok": true}';
  const before = raw;
  expect((await deterministicOracle.validate({ ...input(), candidate: raw })).status).toBe(
    'VERIFIED',
  );
  expect(
    (
      await deterministicOracle.validate({
        ...input(),
        candidate: raw,
        outputContract: 'research-v1',
      })
    ).status,
  ).toBe('REJECTED');
  expect(raw).toBe(before);
});
