# BOT MODE V1 — Release decision evidence (integration simulation)

Status: **NO-GO** — evidence summary, not merge or publication authorization.

## Verified integration evidence
- Simulation PR: https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/25
- Simulation head before this record: `b79e3d07597a8ed237bdb115647a354524f22c2e`.
- Integrated-tree rehearsal: https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38477186700 — **SUCCESS**, with an ephemeral merge of `main` and `botmode-v1-mammoth-security-trial-20261013`; one workflow add/add conflict was resolved in favor of the candidate workflow.
- Integrated backend Jest: 4 isolated shards PASS. Isolated authorization middleware regression: 8/8 PASS. Integrated DOCX regression: 151/151 PASS. Integrated frontend: 6206/6206 PASS (earlier passing rehearsal: https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38471239290).
- Integrated Docker builds: amd64 PASS and arm64 PASS (no registry publication).
- Integrated Playwright targeted approval and model persistence suites: **20 passed**.
- Static Checks, Bombadil and Codegraph on simulation head: SUCCESS.
- Separate standard Playwright suite on simulation branch: still in progress at last observation. Previous run on simulation head failed approvals/soft-default, but those suites PASS when run on the integrated tree.
- Separate Runtime Image workflow on simulation branch: FAILURE because that branch's Dockerfile is from `main` and lacks Playwright; integrated-tree Docker tests PASS. Do not count the separate workflow as green.

## Remaining release gates — not evidenced
1. Decide and review the correct integration sequence for stacked PRs #20 → #21 → #23 and divergence from `main`; record final non-ephemeral merge SHA, lockfile SHA and all required CI. Do not merge without human authorization.
2. Document three residual moderate production `npm audit` findings (mammoth/argparse/sprintf-js), their actual exposure, mitigations and explicit acceptance or remediation.
3. With separate publication authorization only: publish an immutable *candidate* GHCR image, verify registry manifest for amd64/arm64, inspect platform digests, pull and smoke-test from GHCR. Current local Docker successes are not GHCR proofs.
4. Rehearse rollback using previous known-good digest plus configuration and database recovery, with logs and stop conditions.
5. Obtain explicit human approval for stable promotion. Do not create stable tags, update `:latest`, publish GHCR or merge `main` by virtue of this document.

See `docs/BOTMODE_V1_GHCR_RELEASE_GATE.md` on the candidate for the operational gate.
