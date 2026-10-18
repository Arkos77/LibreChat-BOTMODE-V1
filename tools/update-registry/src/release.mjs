/** Only exact publicly published, non-prerelease GitHub releases are eligible for notices. */
const BASE = 'https://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/';
const API = 'https://api.github.com/repos/Arkos77/LibreChat-BOTMODE-V1/releases/tags/';
export function validateReleaseTarget(version, releaseUrl) {
  if (typeof version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,48}$/.test(version)) {
    throw new Error('Specify a safe --version');
  }
  if (releaseUrl !== BASE + version) {
    throw new Error('Release URL must exactly match the official version tag');
  }
  return `${API}${encodeURIComponent(version)}`;
}
export async function verifyPublishedRelease(version, releaseUrl, fetchFn = fetch) {
  const uri = validateReleaseTarget(version, releaseUrl);
  const response = await fetchFn(uri, {
    redirect: 'error',
    headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'BOTMODE-Updates-Registry' },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('Release is not verified as publicly published');
  const release = await response.json();
  if (
    release?.tag_name !== version ||
    release?.html_url !== releaseUrl ||
    release?.draft !== false ||
    release?.prerelease !== false ||
    typeof release?.published_at !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(release.published_at)
  ) throw new Error('Release is unpublished, prerelease, or does not match the tag');
  return true;
}
