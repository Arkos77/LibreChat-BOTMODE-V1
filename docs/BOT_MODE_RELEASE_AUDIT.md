# BOT MODE V1 — final public release audit

Audit baseline: 7 October 2026.

## Git and release state

- BOTMODE branch audited: `bot-mode-p4-closed`
- audited HEAD before documentation changes: `000f7e1e`
- upstream merge base used by the release audit: `f9f1b2fb`
- BOTMODE-specific commits audited at that point: 377
- worktree before release-documentation changes: clean
- personal remote: `https://github.com/Arkos77/LibreChat-BOTMODE-V1.git`

The canonical check is always the latest output of:

```bash
./scripts/botmode/audit-public-release.sh
```

The audit must be rerun on the final release HEAD.

## Secrets and sensitive files

The release audit passed on the baseline HEAD.

Verified:

- common long-form GitHub/OpenAI/Google/Slack credential patterns: no unreviewed matches in BOTMODE history;
- private-key markers: no unreviewed matches;
- commit messages: no detected secret patterns;
- tracked `.env*` files: examples only;
- no untracked local files at the audited baseline.

Local runtime credentials must remain in ignored files such as `.env`.

## Repository size

- tracked content is modest; no file approaches GitHub's normal 100 MiB single-file limit;
- largest tracked artifact at audit time is approximately 2.5 MiB;
- Git LFS is therefore not required for V1.

## Dependency security

Latest production audit captured during V1 preparation:

- critical: **0**
- high: **9**
- moderate: **10**
- low: **8**

The high findings are concentrated in:

- Firebase / Firestore / `@grpc/grpc-js`;
- Tailwind 3 build-chain dependencies (`braces`, `micromatch`, `chokidar`, `fast-glob`).

These are documented release debt and are not hidden with `npm audit fix --force`, because the proposed fixes require broader compatibility migrations.

## Licence review

The repository root uses the MIT licence used by current upstream LibreChat.

A transitive dependency is a known exception to an all-MIT interpretation:

```text
@librechat/frontend
└─ @codesandbox/sandpack-react@2.19.10
   └─ @codesandbox/sandpack-client@2.19.8
      └─ @codesandbox/nodebox@0.1.8
```

`@codesandbox/nodebox@0.1.8` ships under Sustainable Use License 1.0. Its restrictions must be considered for redistribution/commercial use. See `THIRD_PARTY_NOTICES.md`.

This audit is an engineering inventory, not legal advice.

## Release gate

A V1 release candidate may proceed when all of the following are true:

- release audit script: PASS
- final worktree: clean
- reproducibility verification: PASS
- build: PASS
- README/install docs match the actual commands
- GitHub `main` points at the validated BOTMODE release candidate
- branch/ruleset security is enabled where supported


## Clean-machine runtime findings (7 October 2026)

The first clean Chromebook/Crostini pass validated the public checkout and source reproducibility at `4075169b`: package/client builds completed and the dedicated BOTMODE suite passed 42/42 tests.

The runtime phase then exposed distribution defects that source-only verification could not detect:

- a second `npm ci` triggered by `--start` exhausted the 2.7 GiB host and was killed by the kernel OOM killer;
- MongoDB 8 cannot run on the target CPU because AVX is absent;
- host bind mounts produced runtime permission failures under containerless Crostini;
- most importantly, the Compose runtime referenced the upstream LibreChat development image rather than an image built from this BOTMODE repository.

The V1 release gate therefore now also requires:

- BOTMODE-owned GHCR image built from this repository;
- runtime bootstrap with no npm install/build path on target hosts;
- automatic Lite selection for low-memory or non-AVX Linux hosts;
- MongoDB 4.4.29 in Lite;
- Docker-managed runtime data volumes;
- mounted `librechat.yaml`;
- single-process scheduler assertion in Lite;
- successful clean-machine runtime test from the published candidate image.

Do not tag `v1.0.0` until this runtime distribution gate passes.
