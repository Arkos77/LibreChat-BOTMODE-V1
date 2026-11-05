import type { OracleSourceObservation } from '../oracle/types';
import { normalizeSourceUrls, supportsResearchResult } from '../oracle/sources';

/**
 * Transparent, bounded projection of a research-v2 answer onto independently
 * observed web_search URLs. The raw model answer is retained for replay/audit.
 * This does NOT claim that the cited pages prove the model's factual claims.
 * Unsupported or ambiguous provenance still fails the unchanged Oracle.
 */
export interface ResearchSourceProjectionAudit {
  policy: 'observed-source-projection-v1';
  originalCandidate: string;
  removedUrls: string[];
  substitutedUrls: Array<{ from: string; to: string }>;
}

export interface ResearchSourceProjection {
  candidate: string | undefined;
  audit?: ResearchSourceProjectionAudit;
}

const linkPattern = /https?:\/\/[^\s<>"\]]+/gi;
const finalPunctuation = /[).,;:!?]+$/;

function exactObservationForSchemeVariant(
  declared: string,
  observed: readonly string[],
): string | undefined {
  const source = new URL(declared);
  const matches = observed.filter((url) => {
    const actual = new URL(url);
    return (
      source.protocol !== actual.protocol &&
      source.host === actual.host &&
      source.pathname === actual.pathname &&
      source.search === actual.search &&
      source.hash === actual.hash
    );
  });
  return matches.length === 1 ? matches[0] : undefined;
}

function splitCitation(
  value: string,
  observed: ReadonlySet<string>,
): { url: string; suffix: string } {
  let url = value;
  let suffix = '';
  // Preserve exact links first; only peel presentation punctuation on a mismatch.
  while (url && !observed.has(normalizeSourceUrls([url])[0]) && finalPunctuation.test(url)) {
    const last = url.slice(-1);
    url = url.slice(0, -1);
    suffix = last + suffix;
  }
  return { url, suffix };
}

export function projectObservedResearchSources(
  raw: string | undefined,
  observations: readonly OracleSourceObservation[],
): ResearchSourceProjection {
  const unchanged: ResearchSourceProjection = { candidate: raw };
  if (!raw || raw.length > 65536 || !Array.isArray(observations) || !observations.length) {
    return unchanged;
  }
  try {
    const sourceUrls = normalizeSourceUrls(
      observations.flatMap((observation) => {
        if (!observation.toolCallId?.trim()) throw new Error('Missing tool provenance');
        return observation.urls;
      }),
    );
    const sourceSet = new Set(sourceUrls);
    if (!sourceUrls.length) return unchanged;

    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return unchanged;
    const candidate = parsed as Record<string, unknown>;
    if (
      candidate.ok !== true ||
      typeof candidate.result !== 'string' ||
      typeof candidate.sources !== 'string' ||
      !candidate.result.trim()
    )
      return unchanged;
    if (supportsResearchResult(candidate.result, candidate.sources, observations, 'research-v2'))
      return unchanged;

    const declared = candidate.sources
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean);
    if (!declared.length || declared.length > 16) return unchanged;
    const urls = normalizeSourceUrls(declared);
    // An entirely forged source list is never automatically repaired.
    if (!urls.some((url) => sourceSet.has(url))) return unchanged;

    const observedHosts = new Set(sourceUrls.map((url) => new URL(url).host));
    const removed = new Set<string>();
    const substitutions = new Map<string, string>();
    const selected: string[] = [];

    const project = (url: string): string | undefined => {
      const canonical = normalizeSourceUrls([url])[0];
      if (sourceSet.has(canonical)) return canonical;
      const equivalent = exactObservationForSchemeVariant(canonical, sourceUrls);
      if (equivalent != null) {
        substitutions.set(url, equivalent);
        return equivalent;
      }
      // A foreign host is not a citation typo: do not launder it.
      if (!observedHosts.has(new URL(canonical).host)) throw new Error('Foreign source domain');
      removed.add(url);
      return undefined;
    };

    for (const url of declared) {
      const attested = project(url);
      if (attested != null && !selected.includes(attested)) selected.push(attested);
    }
    if (!selected.length) return unchanged;

    const report = candidate.result.replace(linkPattern, (value) => {
      const { url, suffix } = splitCitation(value, sourceSet);
      const attested = project(url);
      return attested == null ? `[lien non observé écarté]${suffix}` : attested + suffix;
    });
    if (removed.size + substitutions.size === 0 || removed.size > 4 || substitutions.size > 4)
      return unchanged;

    const note =
      `\n\nNote de traçabilité BOT MODE : ${removed.size} lien(s) non observé(s) écarté(s) et ` +
      `${substitutions.size} citation(s) remplacée(s) par des URL réellement observées. ` +
      'La sortie originale est conservée dans la preuve de correction.';
    const revised = JSON.stringify({
      ...candidate,
      __botModeSourceProjection: 'observed-source-projection-v1',
      result: report + note,
      sources: selected.join('\n'),
    });
    if (!supportsResearchResult(report + note, selected.join('\n'), observations, 'research-v2'))
      return unchanged;
    return {
      candidate: revised,
      audit: {
        policy: 'observed-source-projection-v1',
        originalCandidate: raw,
        removedUrls: [...removed],
        substitutedUrls: [...substitutions].map(([from, to]) => ({ from, to })),
      },
    };
  } catch {
    // The strict deterministic Oracle still rejects the untouched candidate.
    return unchanged;
  }
}
