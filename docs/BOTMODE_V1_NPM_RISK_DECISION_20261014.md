# BOT MODE V1 — Residual npm advisory decision record

Status: **REVIEW REQUIRED — NOT ACCEPTED**. Prepared on 2026-10-14 for isolated candidate `54b30a342bf8f3480d7385b30cfa669b73c92878`.

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
