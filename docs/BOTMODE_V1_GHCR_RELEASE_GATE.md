# BOT MODE V1 — GHCR publication gate and rollback

Status: **NO-GO for stable publication** until all release gates below are evidenced. This checklist is not authorization to merge PRs, push a stable tag, or publish `:latest`.

## Scope and current evidence — 18 October 2026

- **Current qualification:** [PR #29](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/29), Draft, runtime source `13edaa4f4d0a44d659d76ccb5b160358ad60dfc2`, current qualification source-controlled on PR #29 (latest evidence `83ac9282b096172b4e1f6ebbbace2eb2408872cc`), base `botmode-v1-integrated-candidate-20261014`. Earlier PR #20/#21/#23 results remain historical evidence only, not a release gate for this head.
- **Real free provider:** [run #39116699098](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39116699098) SUCCESS on exact SHA: `OpenRouter/openrouter/free` Worker SSE terminal, Oracle `VERIFIED`, durable accepted publication; separate `HUMAN_REVIEW` durable candidate correctly suppressed. This does **not** prove provider-free long missions or external specialist orchestration.
- **Crash/restart:** [run #39116675418](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39116675418) SUCCESS on exact SHA: real API SIGKILL/restart with Mongo+Redis kept, including original model-only recovery and exactly-once readback. Neither entire external-tool effect replay nor migration rollback is proven.
- **Experimental immutable GHCR image PUBLISHED with limited non-commercial authorization:** [#39126674985](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39126674985) all 8 jobs SUCCESS. Candidate `candidate-botmode-v1-13edaa4f4d0a` / `sha-13edaa4f4d0a`, OCI index digest `sha256:94b11ff0bc8f5820b803741f5a52c96a5e265c2994bb268ee565ba35444cee3a`. Contains linux/amd64 and linux/arm64, anonymous pull and Lite HTTP/browser smoke PASS on AMD64 runner. No `:latest`, stable tag, or merge.
- **Dependencies:** `npm audit --omit=dev` still identifies three **moderate** vulnerabilities (`mammoth`, `argparse`, `sprintf-js`), zero high and zero critical in the production lockfile previously checked. No waiver or remediation has been approved; [risk record](BOTMODE_V1_NPM_RISK_DECISION_20261014.md) remains REVIEW REQUIRED. License [notices](../THIRD_PARTY_NOTICES.md) include the restrictive CodeSandbox Nodebox license.
- **Staging API rollback from published digest:** [#39132997099](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39132997099) SUCCESS on qualification HEAD `bb3d31984`, validated identical Mongo credentials in `.env` and Compose; exact public GHCR digest install, Mongo stop/start persistence and API swap candidate -> older image -> candidate, with canary retained. The earlier failures were caused by divergent CI-generated credentials in the staging harness. **Scope: Lite on disposable runner, Mongo 4.4 synthetic marker only; does NOT prove migrations, Redis/task recovery, authenticated login or production rollback.**
- **First-user native setup on actual registry digest:** [#39134675477](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39134675477) SUCCESS: first registration/login JWT, six agents, native capabilities/ACL, restart and persistence on the exact published OCI image.
- **Worker→subagent→Oracle runtime on published digest (synthetic model only):** [#39140359622](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39140359622) SUCCESS: source-identity guard, anonymous OCI pull, exact launched image; 1 parent subagent tool call, 1 child response, Oracle VERIFIED and publication, REVIEW suppressed, 1 Mongo-linked terminal child before and after API restart. **No child SSE events on main stream; not an external-provider inference**. Model provider is a deterministic local fixture, though the host runtime, DB and subagent execution are real.
- **Native ARM64 public OCI binary and SDK:** [#39141139755](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39141139755) SUCCESS on GitHub `ubuntu-24.04-arm`: real `aarch64` host, anonymous pull of exact published index digest, selected image architecture `arm64`, installed Node + agents SDK executable with networking disabled. Scope does NOT include ARM64 Mongo, HTTP, first-user or inference.
- **Real external free provider, structurally required specialist→Oracle:** [#39150077172](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39150077172) SUCCESS on PR #29 qualification SHA `4ee221bf99521e0badca9a749d8f15b134fdd8d6` with `openrouter/free` and the exact public OCI image. A structured two-task MissionContract enforces Worker (`basic`) → specialist (`research_specialist_ci`, unavailable to Worker), strategy `SEQUENTIAL`, the specialist's actual bound agent identity and two durable Oracle VERIFIED verdicts before publication; SSE single clean final. **Nested subagentThread count was 0**, correctly reported NOT_OBSERVED, not passed. The independent mock-assisted nested-child/restart gate [#39140359622](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39140359622) remains historical proof only for nested children.
- **Outstanding:** external-provider nested-child execution/settlement across restart if that feature is a release requirement, repeated free-router capacity/long-mission endurance, full ARM64 Lite HTTP/DB deployment, full multi-volume/migration and agent-state rollback, cross-tenant/UX/accessibility, branch protection and separate stable risk/license approval. See [master inventory](BOTMODE_V1_INVENTAIRE_MAITRE_20261018.md).

## Gate A — Freeze candidate (no publication)

- [ ] Review **PR #29's actual merge base** and predecessor PR stack before any merge. Its current base is not `main`. PR #20/#21/#23 were historical milestones, not the presently actionable order. Successful CI on a stacked PR is not merge authorization.
- [ ] Record the final **merged commit SHA**, lockfile SHA, workflow run URLs, and required human release authorization. Rerun CI on the actual final merged commit if changed.
- [ ] Confirm the deployed image is built from that exact commit, with digest/SBOM/provenance when available.
- [ ] Document accepted residual `npm audit` findings, affected invocation surface, compensating controls and reviewer sign-off. Do not claim these vulnerabilities are patched just because Mammoth was upgraded.

## Gate B — Multi-architecture distribution (requires publication authorization)

- [x] Publish the approved experimental immutable candidate tag, without moving `:latest` or any stable alias ([#39126674985](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39126674985)).
- [x] Verify both platform descriptors in the OCI index and record the immutable index digest above.
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

**UX automatisée :** [#39151912466](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39151912466) SUCCESS : 6 scans gratuits axe-core/Playwright sur navigateur Chrome et Mongo temporaire, sans Deque SaaS. Ne couvre pas clavier/lecteur d'écran/mobile ni, à ce SHA, la fiche BOT MODE. Un 7e scan de la fiche projet BOT MODE est préparé, à vérifier par run distinct avant promotion ; ce n'est pas une approbation UX manuelle.

**A11y BOT MODE corrigée et validée :** [#39153359628](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39153359628) SUCCESS sur source 'be7bc850c' : 7 scans navigateur axe-core réels, y compris projet BOT MODE, après correction des deux défauts ARIA CRITICAL de la liste virtualisée. Pas de secret SaaS, pas de modèle payant, pas d'exclusion de règle. Ne remplace ni un audit clavier/lecteur d'écran manuel ni les gates sécurité, migrations ou autorisation de release.

**Le 18/10, source nouvelle ≠ digest publié :** après correction ARIA du projet BOT MODE, les runs #39153675364 et #39153675317 refusent la filiation de l'ancienne image GHCR gelée sur '13edaa4f4'. Cela ne remet pas en cause ses validations historiques, mais interdit de dire que le nouveau HEAD et son UI ont été qualifiés sur cette ancienne image. Ne PAS contourner ce garde par allowlist de code UI. Attendre une autorisation pour une **nouvelle candidate immuable** après revue de licence/sécurité, puis requalifier distribution + premier utilisateur + rollback + Oracle à partir du nouveau digest. Les builds et préflights exact HEAD sont jetables et ne publient rien.

**Build et installation depuis nouveau HEAD sans publier :** #39153675220 SUCCESS AMD64/ARM64, aucune image/tag GHCR émise ; #39153675325 SUCCESS build local du nouveau code, fresh Lite HTTP+Mongo, Mongo backup/restore isolée et audit sécurité read-only. **La correction ProjectChatList est validée sur code construit**, mais l'image publique historique est volontairement obsolète. Ne pas substituer ces preuves locales à un digest public exact ou à un vrai rollback multi-services.
