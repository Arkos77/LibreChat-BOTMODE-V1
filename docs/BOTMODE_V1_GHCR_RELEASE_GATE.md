# BOT MODE V1 — GHCR publication gate and rollback

Status: **NO-GO for stable publication** until all release gates below are evidenced. This checklist is not authorization to merge PRs, push a stable tag, or publish `:latest`.

## Scope and current evidence

- Stacked drafts: PR #20 (release preparation), PR #21 (isolated DOCX workers), PR #23 (Mammoth 1.12.3 and reproducible lockfile).
- PR #23 HEAD `17f470a7f6296ab3d15a5740d10c60c451558eaa`: **14/14 PR workflows successful**. Inspect [Actions](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions) for the exact workflow runs and immutable provenance.
- Runtime Image workflow: **AMD64 and ARM64 pre-push image smoke succeed**; image publication, multi-platform manifest, lite runtime-from-registry smoke and public pull were **skipped** for this PR.
- Production `npm audit --omit=dev` still reports **three moderate findings** (`mammoth`, transitive `argparse`, transitive `sprintf-js`), zero high and zero critical. A passing severity threshold does **not** mean these findings are resolved.
- No proof of public GHCR pull, platform manifest or production rollback is available from these PR CI results.

## Gate A — Freeze candidate (no publication)

- [ ] Resolve PR stack in order #20 → #21 → #23 only after review, with correct base branches and merge authorization. The successful CI on stacked PRs alone is not an authorization to merge.
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
