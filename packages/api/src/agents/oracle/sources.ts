import type { OracleSourceObservation } from './types';

export function normalizeSourceUrls(urls: readonly string[]): string[] {
  if (!Array.isArray(urls) || urls.length > 32) {
    throw new Error('Invalid source URL list');
  }
  return [
    ...new Set(
      urls.map((value) => {
        if (typeof value !== 'string' || value.length > 2048 || value.trim() === '') {
          throw new Error('Invalid source URL');
        }
        const url = new URL(value.trim());
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
          throw new Error('Unsupported source URL');
        }
        return url.href;
      }),
    ),
  ];
}

// The web tool explicitly instructs these suffixes (see tools/toolkits/web.ts).
// Strip only a complete, trailing citation sequence, never URL path/query text.
const citationAnchor = String.raw`(?:\ue202|\\ue202)turn\d+(?:search|news|image|ref)\d+`;
const citationSuffix = new RegExp(
  String.raw`(?:\ue204|\\ue204)?(?:(?:${citationAnchor})+|(?:\ue200|\\ue200)(?:${citationAnchor})+(?:\ue201|\\ue201))[).,;:!?]*$`,
  'i',
);

/** Checks observed URL provenance only, never whether a page entails a factual claim. */
export function supportsResearchResult(
  result: string,
  sources: string,
  observations: readonly OracleSourceObservation[],
  contract: 'research-v1' | 'research-v2' = 'research-v1',
): boolean {
  try {
    if (!Array.isArray(observations) || observations.length === 0 || observations.length > 32)
      return false;
    const observed = new Set(
      observations.flatMap((observation) => {
        if (typeof observation.toolCallId !== 'string' || !observation.toolCallId.trim()) {
          throw new Error('Missing native tool call');
        }
        return normalizeSourceUrls(observation.urls);
      }),
    );
    const declared = sources
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean);
    const normalized = normalizeSourceUrls(declared);
    if (normalized.length === 0 || normalized.some((url) => !observed.has(url))) return false;
    const cited = result.match(/https?:\/\/[^\s<>"\]]+/gi) ?? [];
    const matched = cited.map((citation) => {
      const matchUrl = (value: string) => {
        const url = normalizeSourceUrls([value])[0];
        return normalized.find(
          (source) =>
            url === source ||
            (url.startsWith(source) && /^[).,;:!?]+$/.test(url.slice(source.length))),
        );
      };
      // Preserve exact matching first, including legitimate URL punctuation or
      // Unicode paths. Markup is presentation only, not evidence of a source.
      return matchUrl(citation) ?? matchUrl(citation.replace(citationSuffix, ''));
    });
    return (
      matched.every((url) => url != null) &&
      (contract === 'research-v2' || normalized.every((url) => matched.includes(url)))
    );
  } catch {
    return false;
  }
}
