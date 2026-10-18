import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReleaseTarget, verifyPublishedRelease } from '../src/release.mjs';

const release = 'https://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v1.0.0';
const target = 'https://api.github.com/repos/Arkos77/LibreChat-BOTMODE-V1/releases/tags/v1.0.0';
test('only exact official immutable version URL is allowed', () => {
  assert.equal(validateReleaseTarget('v1.0.0', release), target);
  for (const wrong of [release + '/additional', release + '?x=1', release + '#fragment',
    'https://github.com.attacker.example/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v1.0.0',
    'https://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v2.0.0',
    'http://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v1.0.0']) {
    assert.throws(() => validateReleaseTarget('v1.0.0', wrong));
  }
  for (const bad of ['bad/tag','', '../admin','@host','a'.repeat(55)]) assert.throws(() => validateReleaseTarget(bad, release));
});
test('a complete non-prerelease published official release is required', async () => {
  const record = { tag_name: 'v1.0.0', html_url: release, draft: false, prerelease: false, published_at: '2026-10-18T18:00:00Z' };
  let seen;
  const responder = async (url, options) => {seen = {url,options};return {ok:true,json:async()=>record};};
  assert.equal(await verifyPublishedRelease('v1.0.0',release,responder), true);
  assert.equal(seen.url,target);
  assert.equal(seen.options.redirect,'error');
  for(const invalid of [
    {draft:true},{prerelease:true},{tag_name:'v1.2.0'},
    {html_url:'https://attacker.example/'},{published_at:null}
  ]) {
    await assert.rejects(verifyPublishedRelease('v1.0.0', release, async()=>({ok:true,json:async()=>({...record,...invalid})})));
  }
  await assert.rejects(verifyPublishedRelease('v1.0.0', release, async()=>({ok:false,status:404})));
});
