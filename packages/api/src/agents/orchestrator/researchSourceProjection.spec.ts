import { supportsResearchResult } from '../oracle/sources';
import { projectObservedResearchSources } from './researchSourceProjection';

const observations = [
  {
    toolCallId: 'call-real-web-search',
    urls: [
      'http://fastapi.tiangolo.com/',
      'https://fastapi.tiangolo.com/ur',
      'http://github.com/tiangolo/fastapi',
      'https://docs.rs/actix-web',
      'https://actix.rs/docs/getting-started',
      'https://actix.rs/docs/application',
    ],
  },
];

const original = JSON.stringify({
  ok: true,
  result:
    'FastAPI https://fastapi.tiangolo.com ; code https://github.com/fastapi/fastapi. ' +
    'Actix Web https://docs.rs/actix-web et https://actix.rs/docs/application.',
  sources: [
    'https://fastapi.tiangolo.com',
    'https://github.com/fastapi/fastapi',
    'https://docs.rs/actix-web',
    'https://actix.rs/docs/getting-started',
    'https://actix.rs/docs/application',
  ].join('\n'),
});

describe('bounded host-observed research-v2 source projection', () => {
  it('repairs the exact live FastAPI / Actix mismatch without inventing source URLs', () => {
    const raw = JSON.parse(original);
    expect(supportsResearchResult(raw.result, raw.sources, observations, 'research-v2')).toBe(
      false,
    );
    const projected = projectObservedResearchSources(original, observations);
    expect(projected.audit).toEqual({
      policy: 'observed-source-projection-v1',
      originalCandidate: original,
      removedUrls: ['https://github.com/fastapi/fastapi'],
      substitutedUrls: [
        { from: 'https://fastapi.tiangolo.com', to: 'http://fastapi.tiangolo.com/' },
      ],
    });
    const parsed = JSON.parse(projected.candidate ?? '{}');
    expect(parsed.ok).toBe(true);
    expect(parsed.sources.split('\n')).toEqual([
      'http://fastapi.tiangolo.com/',
      'https://docs.rs/actix-web',
      'https://actix.rs/docs/getting-started',
      'https://actix.rs/docs/application',
    ]);
    expect(parsed.result).not.toContain('https://github.com/fastapi/fastapi');
    expect(parsed.result).toContain('lien non observé écarté');
    expect(parsed.result).toContain('Note de traçabilité BOT MODE');
    expect(supportsResearchResult(parsed.result, parsed.sources, observations, 'research-v2')).toBe(
      true,
    );
    expect(JSON.parse(original)).toEqual(raw);
  });

  it('does not rewrite already verified research', () => {
    const valid = JSON.stringify({
      result: 'Documentation https://docs.rs/actix-web',
      sources: 'https://docs.rs/actix-web',
      ok: true,
    });
    expect(projectObservedResearchSources(valid, observations)).toEqual({ candidate: valid });
  });

  it('fails closed for a foreign URL even when one real citation exists', () => {
    const forged = JSON.stringify({
      ok: true,
      result: 'See https://docs.rs/actix-web and https://attacker.invalid/phishing',
      sources: 'https://docs.rs/actix-web\nhttps://attacker.invalid/phishing',
    });
    expect(projectObservedResearchSources(forged, observations)).toEqual({ candidate: forged });
    const p = JSON.parse(forged);
    expect(supportsResearchResult(p.result, p.sources, observations, 'research-v2')).toBe(false);
  });

  it('never repairs a candidate with no exact observed source', () => {
    const forged = JSON.stringify({
      ok: true,
      result: 'See https://fastapi.tiangolo.com and https://github.com/fastapi/fastapi',
      sources: 'https://fastapi.tiangolo.com\nhttps://github.com/fastapi/fastapi',
    });
    expect(projectObservedResearchSources(forged, observations)).toEqual({ candidate: forged });
  });

  it('keeps incomplete work, missing observations and malformed output unchanged', () => {
    const notDone = original.replace('"ok":true', '"ok":false');
    expect(projectObservedResearchSources(notDone, observations)).toEqual({ candidate: notDone });
    expect(projectObservedResearchSources(original, [])).toEqual({ candidate: original });
    expect(projectObservedResearchSources('{invalid}', observations)).toEqual({
      candidate: '{invalid}',
    });
  });

  it('refuses arbitrary citation rewrites when the bounded deletion cap is exceeded', () => {
    const unknown = [1, 2, 3, 4, 5].map((n) => `https://docs.rs/not-seen-${n}`);
    const forged = JSON.stringify({
      ok: true,
      result: `See https://docs.rs/actix-web ${unknown.join(' ')}`,
      sources: ['https://docs.rs/actix-web', ...unknown].join('\n'),
    });
    expect(projectObservedResearchSources(forged, observations)).toEqual({ candidate: forged });
  });

  it('does not change the oracle contract or permit fabricated sources on a new domain', () => {
    const forged = JSON.stringify({
      ok: true,
      result: 'https://untrusted.example/unknown',
      sources: 'https://untrusted.example/unknown',
    });
    expect(projectObservedResearchSources(forged, observations)).toEqual({ candidate: forged });
  });
});
