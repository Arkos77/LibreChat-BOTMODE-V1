# BOT MODE V1 — Residual npm advisory decision record

Status: **REVIEW REQUIRED — NOT ACCEPTED**. Historical 14 Oct candidate was `54b30a342bf8f3480d7385b30cfa669b73c92878`.

## 18 October 2026 — live release-candidate refresh (no risk acceptance)

- Qualifying [PR #29](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/29), current checkpoint `3b54802c610978312e223a5fb940140ed52e112e` (the final release SHA is not frozen).
- Lockfile SHA256: `4b0b6d51afb679bc3b1633f29609d3aa9bdce8515f4df719bf0ddc67d22b44b3`. A local `npm audit --omit=dev --package-lock-only` on this lockfile recorded **3 moderate, 0 high, 0 critical**; GitHub's default-branch 25 findings are a different scope and must not be conflated with the candidate lockfile.
- [DOCX reachability #39091502539](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39091502539) checked source at `ccb9ae9f5`: successful benign DOCX conversions with `BOTMODE_DOCX_LIBRARY_MODULE_LOADS=[]` and 15/15 ZIP/DOCX regressions. The workflow is now SHA-dependent on PR head, but no evidence excludes all hostile DOCX or indirect sinks.
- [Docker security distribution #39116675413](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39116675413) and [DOCX runtime #39116675429](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39116675429) were both green on `3cf108484`, but do not authorize acceptance of the vulnerable dependency range.
- The production audit workflow formerly pinned to SHA `54b30a3` has been switched to exact PR HEAD. **Do not mark the new audit validated until its own run finishes.**
- **Upstream advisory rechecked on 18 Oct 2026:** [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) lists `sprintf-js <=1.1.3` as affected and **no patched version** (as of its 5 Oct update). The upstream [Mammoth issue #491](https://github.com/mwilliamson/mammoth.js/issues/491), opened 6 Oct, identifies the `mammoth → argparse ~1.0.3 → sprintf-js` chain and proposes migrating argparse to v3 or removing the CLI dependency; this is a proposal, NOT an installed fix. Do not perform `npm audit fix --force` to downgrade Mammoth to `0.3.29`: the reported semver-major change would require a separately reviewed compatibility trial.
- **Deployment exposure boundary:** our DOCX conversions use Mammoth as a Node library inside bounded worker threads, not the Mammoth CLI. This reduces the likelihood of a remote caller controlling a `sprintf-js` CLI formatting string in those two routes; it does **not** rule out indirect invocation, new imports, other endpoints, or resource-exhaustion payloads. Keep the release decision open.
- Distribution is still **NO-GO** until the appropriate owner reviews the actual exposure, the Nodebox SUL redistribution/commercial-use restrictions, and agrees on remediation, an explicit scoped/expiring risk acceptance, or continued block.


## Evidence
- Production lockfile npm audit: https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38499277928 (PASS evidence gathering). 3 moderate, 0 high, 0 critical.
- Findings: `mammoth` (direct, version 1.12.3), `argparse` (transitive) and `sprintf-js` (transitive). Audit suggests `mammoth@0.3.29` as a semver-major downgrade; **not an approved remediation**.
- Synthetic DOCX runtime reachability + existing regression: https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38499969945 (SUCCESS). `BOTMODE_DOCX_LIBRARY_MODULE_LOADS=[]` for one synthetic DOCX converted via `extractRawText` and `convertToHtml`. 15/15 DOCX/ZIP tests passed.
- In candidate source, `packages/api/src/files/documents/docxWorker.ts` runs conversions in worker threads with max 2 active, 8 queued, 20-second deadline and worker memory limits (256 MB old generation, 64 MB young generation).

## Risk analysis and limitations
- The audit output reports packages present in the dependency graph; it does **not** itself prove exploitation.
- A dynamic trace on one benign fixture and two conversion APIs does **not** prove that malicious DOCX inputs, CLI invocation paths, all other endpoints, or all future call sites cannot reach `sprintf-js`.
- Worker concurrency and timeout reduce some denial-of-service exposure but do not eliminate or patch package-level vulnerabilities.
- The `sprintf-js` advisory GHSA-hp3w-g68c-fv3c concerns unbounded precision format strings. Exposure depends on attacker control of a format string reaching the affected library.
- Do not silently downgrade Mammoth, rewrite the lockfile, or mark the advisories resolved. Any upgrade/downgrade requires a separate compatibility/security trial and DOCX regressions.

## Decision options for release owner
1. **Remediate:** identify safe dependency change, demonstrate clean audit (or lower scoped risk), run DOCX and release CI, rebuild/requalify the new immutable candidate digest.
2. **Temporarily accept:** security reviewer documents actual reachable invocation paths and trust boundaries, deployment-specific DOCX exposure, compensating controls, risk tolerance, review/expiry date, and explicit sign-off; retain monitoring and a remediation issue.
3. **Block stable:** if trust boundary or exposure remains uncertain.

**Current recommendation: keep stable release NO-GO pending explicit owner/security sign-off, regardless of successful dynamic trace.** No human approval has been recorded.

## Other independent release gates
- Qualify a complete first-user mission with actual persisted Oracle-accepted publication on an unchanged, digest-pinned runtime; successful unit-contract suites are not equivalent.
- Assess authenticated restore/ACL and durable mission recovery across a rollback, including DB compatibility.
- Obtain explicit human approval to merge, deploy or move a stable tag/alias.

## 18 octobre 2026 — preuve courante et licence transitive

[Audit npm exact HEAD #39154363987](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39154363987) : 0 low, **3 moderate**, 0 high, 0 critical au commit 487e4046682f2aaf5fe8ee5101075ad91e815564. Le PASS de collecte n'accepte pas les risques. [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) décrit sprintf-js <=1.1.3 et ne liste aucune version corrigée.

**Licence indépendante à arbitrer :** le lockfile rattache Sandpack React 2.19.10 → sandpack-client 2.19.8 → @codesandbox/nodebox 0.1.8. Le code client importe effectivement Sandpack dans client/src/components/Artifacts/ArtifactPreview.tsx. La [Sustainable Use License 1.0 de Nodebox](https://github.com/Sandpack/nodebox-runtime/blob/main/packages/nodebox/LICENSE) restreint l'utilisation commerciale et la redistribution à titre gratuit pour usage non commercial. Ne pas déclarer cette chaîne inutilisée, commercialement libre ni implicitement acceptée. Toute distribution stable/commerciale requiert une revue humaine de la licence effective et du mode de distribution ; une solution alternative requiert des tests de régression Artifacts/Sandpack.

**D-02 reste NO-GO** : pas de modification du lockfile, pas de waiver ni d'autorisation commerciale implicite.
