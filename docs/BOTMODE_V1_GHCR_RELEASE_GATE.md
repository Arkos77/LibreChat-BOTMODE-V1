# BOT MODE V1 — GHCR publication gate and rollback

Status: **NO-GO for stable publication** until all release gates below are evidenced. This checklist is not authorization to merge PRs, push a stable tag, or publish `:latest`.

## Scope and current evidence — 18 October 2026

- **Current qualification:** [PR #29](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/29), Draft, head `3cf1084843a1e7af1c398b69fbb06e68022eaeac` at this checkpoint, base `botmode-v1-integrated-candidate-20261014`. Earlier PR #20/#21/#23 results remain historical evidence only, not a release gate for this head.
- **Real free provider:** [run #39116699098](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39116699098) SUCCESS on exact SHA: `OpenRouter/openrouter/free` Worker SSE terminal, Oracle `VERIFIED`, durable accepted publication; separate `HUMAN_REVIEW` durable candidate correctly suppressed. This does **not** prove provider-free long missions or external specialist orchestration.
- **Crash/restart:** [run #39116675418](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39116675418) SUCCESS on exact SHA: real API SIGKILL/restart with Mongo+Redis kept, including original model-only recovery and exactly-once readback. Neither entire external-tool effect replay nor migration rollback is proven.
- **Runtime Image:** PR pre-push image smoke on AMD64 and ARM64 has succeeded; `publish=false`, no final SHA digest, manifest index, anonymous pull, or registry-backed install is certified. [Guard-only #39117454440](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39117454440) is read-only and cannot substitute for publication.
- **Dependencies:** `npm audit --omit=dev` still identifies three **moderate** vulnerabilities (`mammoth`, `argparse`, `sprintf-js`), zero high and zero critical in the production lockfile previously checked. No waiver or remediation has been approved; [risk record](BOTMODE_V1_NPM_RISK_DECISION_20261014.md) remains REVIEW REQUIRED. License [notices](../THIRD_PARTY_NOTICES.md) include the restrictive CodeSandbox Nodebox license.
- **Outstanding:** actual same-SHA GHCR candidate digest, multi-platform pull, clean Lite deployment from registry, published-digest rollback/DB compatibility, cross-tenant/UX coverage, branch protections and explicit human release/redistribution sign-offs. See [master inventory](BOTMODE_V1_INVENTAIRE_MAITRE_20261018.md). The fresh source-built onboarding is tested separately; it is not a registry-pulled image.

## Gate A — Freeze candidate (no publication)

- [ ] Review **PR #29's actual merge base** and predecessor PR stack before any merge. Its current base is not `main`. PR #20/#21/#23 were historical milestones, not the presently actionable order. Successful CI on a stacked PR is not merge authorization.
- [ ] Record the final **merged commit SHA**, lockfile SHA, workflow run URLs, and required human release authorization. Rerun CI on the actual final merged commit if changed.
- [ ] Confirm the deployed image is built from that exact commit, with digest/SBOM/provenance when available.
- [ ] Document accepted residual `npm audit` findings, affected invocation surface, compensating controls and reviewer sign-off. Do not claim these vulnerabilities are patched just because Mammoth was upgraded.

## Gate B — Multi-architecture distribution (requires publication authorization)

- [ ] Publish a **candidate immutable version tag** only to an explicitly authorized staging/candidate location. Do **not** move `:latest` or any stable alias at this stage.
- [ ] Verify the OCI image manifest index contains both `linux/amd64` and `linux/arm64` using `docker buildx imagetools inspect <candidate-image:tag>`.
- [ ] On both platforms, pull the **same image digest** or resolve each platform descriptor from the same manifest index. Record manifest and platform digests.
- [ ] Smoke-test a fresh Lite deployment from the pulled GHCR image; verify health, login/auth, mission execution and DOCX conversion, plus DB migration/rollback compatibility.
- [ ] Verify public (anonymous) pull if public distribution is intended, and private authenticated pull if required. Record actual commands, exit codes and logs; a local Docker build alone is insufficient.

## Gate C — Rollback and recovery

- [ ] Before promotion, record previous known-good **image digest**, immutable tag, runtime environment, config and DB backup / migration plan. Never rely on mutable `:latest` for rollback.
- [ ] Rehearse an interrupted/failed candidate deployment in a staging environment. Restore the previous digest, roll back configuration and verify readiness, authentication, existing data and mission state.
- [ ] If database migration is not backward compatible, use a documented forward-fix/recovery plan; changing image alone is **not** a valid rollback.
- [ ] Define release owner, stop conditions, verification window and explicit human **GO**. Keep stable **NO-GO** if any gate is missing.

## Gate D — Promotion (human approval required)

- [ ] Promote only the previously tested **immutable digest** to the stable release reference.
- [ ] Verify both architectures and runtime health after promotion.
- [ ] Archive the digests, logs, tests, known residual risks and rollback proof in the release record.

### Non-goals

This document does not trigger GHCR publishing, deploy, merge, tag creation or release approval. It intentionally distinguishes **pre-push build success** from **published distribution qualification**.
