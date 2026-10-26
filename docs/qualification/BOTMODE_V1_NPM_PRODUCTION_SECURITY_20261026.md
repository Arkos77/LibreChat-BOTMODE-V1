# BOT MODE V1 — production npm security reassessment — 26 Oct 2026

## Source and scope
- Source branch base PR82 `c25e749314278fe77d4ae2cef4277a040ce8822e`, image installed only on isolated Chromebook test port 3081, build ID `sha256:09e589731d164616f1a8b2c3b83515508bb7e46619da7325cc370b9bc330a255`.
- Command: `npm audit --omit=dev --json --no-fund`, lockfile SHA256 before: `0156c6fb27c87d25734d41fd90a084fb852d9e55c8e8d0877832c45554dbb89d`.
- Audit is against the dependency lockfile and npm registry advisories, NOT proof of exploitability on a route. Read-only inspection confirmed that all nine flagged packages are actually installed in the 3081 API image.
- Before: 0 critical, 7 high, 2 moderate. This newer finding is NOT covered by the earlier temporary D-02 acceptance of three moderate vulnerabilities.

## Isolated patch-only lockfile changes
| Package | Original | Patched within compatible major |
| --- | --- | --- |
| body-parser | 2.3.0 | 2.4.0 |
| multer | 2.4.0 | 2.5.0 |
| undici | 7.30.0 | 7.30.1 |
| nodemailer | 10.0.15 | 10.2.1 |
| fast-uri | 3.1.8 | 3.1.9 |

- Updated using `npm update --package-lock-only --ignore-scripts --no-audit --no-fund body-parser multer undici nodemailer fast-uri` in a NEW, isolated Git worktree. No `npm audit fix --force`, no new direct dependencies, no package.json or application source changes.
- Re-audit of the modified lockfile: **0 critical, 4 high, 0 moderate**; five advisory package entries removed, no new entries.
- GitHub advisory references include body-parser [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828) and multer [GHSA-q7qp-rjg7-q26m](https://github.com/advisories/GHSA-q7qp-rjg7-q26m). Exact risk applicability still requires checking how middlewares are used and exposed.

## Remaining unresolved high warnings
- `@azure/identity` 4.13.1 and `@azure/msal-node` 5.1.5: advisory GHSA-xcx6-jx8p-x3h5. The currently available identity 4.14.0 depends on MSAL 6.x, which is also in the affected advisory range; forcing 7.x would be a major compatibility change, NOT attempted.
- `openai` 5.8.2 and `zod` 3.25.67: Zod memory-exhaustion advisory GHSA-mrhx-c7xc-m3w5. Fix recommended by npm audit requires major-range upgrades, NOT attempted. Nested v4.4.3 Zod copies are also present in the lockfile.
- These warnings remain release blockers pending either compatible tested fixes or an explicit, evidence-based security determination and user approval.

## Acceptance gates
- Current artifact is a DRAFT candidate only; `npm ci` and appropriate regression tests must pass on the exact resulting SHA, followed by an exact Docker build and re-audit of the installed production image before an eventual release.
- No merge, stable/latest tag, GHCR push, secrets change, database migration, or update to current 3080/3081 is authorized by this assessment.
- Current nonsecurity gates still include browser confirmation of BOT MODE tool activity in the right Progression panel and other remaining V1 functional qualifications.
