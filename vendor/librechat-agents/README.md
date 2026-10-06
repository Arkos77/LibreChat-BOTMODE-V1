# BOT MODE safe rate-limit failover SDK — current artifact

- Package: `@librechat/agents` 3.7.17.
- Source commit: `29e3b4231ee7c52eec01257678f3babb07f6fa9e`.
- Commit message: `feat(agents): gate failover on zero-chunk rate limits`.
- Artifact: `librechat-agents-3.7.17-29e3b4231ee7c52eec01257678f3babb07f6fa9e.tgz`.
- SHA-256: `8277ec1a7012a28bf1153bc871883150dcbbd545b0c9110fa627127f41451632`.
- npm integrity: `sha512-fAnGEyNugQoqI28MKMtsTFmsIdcOp64a+WQeVBV8Lns1gqWOxUkNO5EoAZisvhegCi8TLqMoEnSD2PCyHsIRpA==`.
- Validation: fallback suite 18/18 PASS; SDK build PASS; `git diff --check` PASS.
- Typecheck note: standalone `tsc --noEmit` currently reports the pre-existing unrelated `src/hooks/effectAuthority.ts:77 TS2367`; this failover patch does not touch that file.
- Contract: a fallback carrying `retryOn: MODEL_RATE_LIMIT_ZERO_CHUNK` may run only after a typed model rate-limit whose failed attempt emitted zero model chunks. Ordinary provider errors, context-overflow errors, stream-limit aborts, and rate-limits after any emitted chunk remain fail-closed. Unmarked historical fallbacks retain their previous behavior.
- Host integration: LibreChat P11 still resolves, validates, authorizes and records the candidate bindings before execution; this SDK restriction narrows when the already-authorized native fallback chain may advance.

# P8 Docker execution gateway SDK — current artifact

- Package: `@librechat/agents` 3.7.17.
- Source commit: `214fcad2744055315c3d1940e9d4a29c7c5444d6`.
- Artifact: `librechat-agents-3.7.17-214fcad2744055315c3d1940e9d4a29c7c5444d6.tgz`.
- SHA-256: `9ca06cace7b03160f308999998a788045aeab958d98dc894e291a396b3e7a472`.
- npm integrity: `sha512-oLznPxBjUpt25PxsFFZsex0MMpYnjTTbSo8yAUXVA2/lKTf0MBmywrdX4vaW/uMP3Q+3deJrS5sbbpxqvjXxEA==`.
- Validation: execution-grant/ToolNode/Docker tests 12/12 PASS; SDK TypeScript `--noEmit` PASS; SDK build PASS; live Docker enforcement verified cgroup CPU/RAM, bounded tmpfs disk and network `NONE`.
- Contract: grants are scoped to job/action/tool and fail closed on missing, revoked, expired, invalid or mismatched state. Docker is execution-only; `NONE`/`LOCAL_LAB`/`WEB` are advertised, while `ALLOWLIST`/`TOR_ALLOWLIST` fail closed without a policy-aware proxy.
- Host integration: the generation job is the sole durable owner of grants; only `codeEnvAvailable` agents receive the Docker execution profile.

# P8 SDK dependency

This npm archive contains `@librechat/agents` 3.7.17 built from local SDK commit
`dc4a4bf95a95a628cfd17421a8c2dab9eab5eba6`.

- Archive: `librechat-agents-3.7.17-dc4a4bf95a95a628cfd17421a8c2dab9eab5eba6.tgz`.
- Archive SHA-256: `684b0d77931dab91299b5c988362441dd8bf63e1d400f219cfc593a6cd90077c`.
- The npm lockfile additionally pins the archive's SHA-512 integrity.
- P8 adds the opt-in `authorizationDecisionRequired` fail-closed contract.
- This dependency integration does not enable host authorization hooks.
- The previous P4 archive is retained.

The upstream package does not commit `dist`, and its `prepare` script only sets
up Husky. A Git dependency alone therefore does not produce the executable
files required by its exports. A local npm tarball supplies those files without
a host postinstall script, a second runtime, or a manual `node_modules` overlay.
The existing `@librechat/api` peer range remains compatible with version 3.7.17.

To regenerate, check out the exact SDK commit in an isolated SDK checkout,
install its locked build dependencies, run the two P4 regression tests, run
`npm run build`, then run `npm pack --ignore-scripts`. Rename the generated
archive to include the full source commit and refresh the host lockfile with
`npm install --package-lock-only --ignore-scripts`. Review both integrity and
dependency diffs before adopting a regenerated archive.

The two Dockerfiles copy this directory before dependency installation, and
`.dockerignore` explicitly includes it despite the existing `librechat*` rule.
Keep the archive, this provenance record, the manifest and lockfile together.

P4 guarantees that this tested reconstruction does not replay completed
predecessors. It does not guarantee universal exactly-once execution: an
interrupted node may replay code before its interrupt. External side effects
still require appropriate idempotency keys, durable claims or fencing.

## Remote PTC authorization SDK — current artifact

- Package: `@librechat/agents` 3.7.17.
- SDK source commit: `5b3aa707be85390c4e0c4e3cf36b7e8971373edf`.
- Commit message: `fix(security): authorize remote PTC internal tool calls`.
- Artifact: `librechat-agents-3.7.17-5b3aa707be85390c4e0c4e3cf36b7e8971373edf.tgz`.
- SHA-256: `21986977c36225d41027f0586f6f0dce0d1d8018a9599a54ca35a6f7079ff1b3`.
- npm integrity: `sha512-4FFaQa/SDGT4Wrz8toDJgJ6YJjWCKk+3zPs170GOz3dqFa5XDJ+QgxtVvCXEqV6wRQKf9MOHUJJgUvgoftS4WA==`.
- Distributed files: 1278.
- Reproducibility: two independent npm packs were byte-identical.

This integration preserves the existing host wiring. Remote PTC host authorization
behavior still requires the separate micro-lot 29 runtime proof. Historical
artifacts and provenance above are retained.

## Event authorization context SDK — current artifact

- Package: `@librechat/agents` 3.7.17.
- Source commit: `c8493e8a65260790e3dbf2dce4583780b0067935`.
- Commit message: `fix(security): propagate hook context through tool execute events`.
- Artifact: `librechat-agents-3.7.17-c8493e8a65260790e3dbf2dce4583780b0067935.tgz`.
- SHA-256: `2e241c038856923c931f7f0993e7a445844103b4eeb5ee0a2ef87f27fed74ebc`.
- npm integrity: `sha512-ZENxQMEUePclkzIYGSm4h7ZZ0M0fWb8DsWBRVR6EkAKg/pygRN+GXezBlh+LugNJ8ouELGdRCC5SsTqoSXAMSA==`.
- Distributed files: 1278.
- Reproducibility: two independent npm packs were byte-identical.

The SDK event batch carries the existing native hook context. Host forwarding
and behavior require a separate host patch and runtime proof. Historical
artifacts are retained.

## Native effect-time authority SDK — current artifact

- Package: `@librechat/agents` 3.7.17.
- Source commit: `ccf67f50febbc99112d7ba5bdf132a55ba09c175`.
- Commit message: `feat(security): propagate effect-time tool authority`.
- Artifact: `librechat-agents-3.7.17-ccf67f50febbc99112d7ba5bdf132a55ba09c175.tgz`.
- SHA-256: `08abe0b2ce881847b05d1cd7c7b0d4a3427ca48008bc0dfda5fac756503503e7`.
- npm integrity: `sha512-tmmrrLJGeKiDaElCJgWPXjO6RZSv/H+nfcS32IqcGK8c6O2VqRCKTKwdJB6GZYq1xZLcycO9r9UsTggAUf2nLQ==`.
- Distributed files: 1284.
- Reproducibility: two independent npm packs were byte-identical.

The SDK transports an explicit effect-time authority requirement and reuses the
native durable hook phase. Host mandate semantics remain in LibreChat. The installed
payload matches this archive exactly. Targeted host runtime proofs cover direct,
event, remote PTC and host-side MCP dispatch. Local PTC and background authority
remain outside this coverage. Historical artifacts are retained.

Durable validation record: `P8-EFFECT-INTEGRATION-REAL`.

## Detached child step-limit identity SDK — current artifact

- Package: `@librechat/agents` 3.7.17.
- Source commit: `d4f3c6a6bbd38ac555d29b287d4f9e2ab5185932` (preceded by `cf38d76b070b3a0c5fa8abf2e327510dd0bd3625`).
- Artifact: `librechat-agents-3.7.17-d4f3c6a6bbd38ac555d29b287d4f9e2ab5185932.tgz`.
- SHA-256: `2e5032d49dca88efe4bd0ca946a651c108272e693d86d95409f7b409a34f339f`.
- npm integrity: `sha512-wvXEQbnBcBvINA0+m117qT9pRUH8EPh7eeZYg2bG4Bp1gmzjwAkarBGETVVrdZxwgveWBPvXPjGdsW6QW0rdLA==`.

The SDK passes the host trace identity into the detached task store and preserves LangGraph’s typed `GRAPH_RECURSION_LIMIT` signal across its internal failure envelope. The host correlates that signal only after a durable child failure row, using the store-owned `runtime.taskId`. The archived package was built and packed from the stated SDK commit; 145 targeted SDK tests and the build passed. Earlier artifacts remain for provenance.

## Durable detached checkpoint recovery SDK — current artifact

- Package: `@librechat/agents` 3.7.17.
- Source commit: `b880d31a6a70171c671923b351a721b1a5e0ae6d`.
- Commit message: `feat(subagents): isolate durable recovery authority`.
- Artifact: `librechat-agents-3.7.17-b880d31a6a70171c671923b351a721b1a5e0ae6d.tgz`.
- SHA-256: `681e6cf6149625ccaf5c423f4a062c40bf4402d69b1f680def52a05ce6441297`.
- npm integrity: `sha512-HGRQZSv4PiktFVDxmSn8CvD2hO6zlCnGF8dCN1QePUYAmJ39fL42UGICukbyEt2y8OmgD3PxUNqJ+GOgbJrhfA==`.
- Post-commit validation: `SubagentExecutor.test.ts` 132/132 PASS, TypeScript typecheck PASS, SDK build PASS.

This SDK separates durable checkpoint recovery capability from background-task authority
and HITL authority. A detached executor may recover from the host-provided checkpointer
without inheriting the host task store, and durable background recovery fails closed when
the persisted child state contains a HITL interrupt.

Installing this artifact alone does not authorize host-side abandoned-task recovery.
LibreChat must separately prove recovery admission from the existing durable identities,
lease fencing, parent resume manifest, and exact child checkpoint address. Ambiguous or
unproven abandoned `running` attempts remain fail-closed. Historical artifacts are retained.

## Recovery-only reseed guard SDK — current artifact

- source commit: `bc65f7b`
- artifact: `librechat-agents-3.7.17-bc65f7b.tgz`
- SHA256: `a592cfe612e1d5d1a4373a62cee5f449be989d6d7e15f671c9a8a3c5e68f5a78`
- npm integrity: `sha512-uchGP/plMmuxvfKz4dPxZq/0d68LKwIJH0rlUkkoYXdOz6W/NO3/FXCsbiHGKXQOI9pivcDKBRJKuH5lTFIm8g==`
- validation: SubagentExecutor 133/133 PASS; TypeScript noEmit PASS; build PASS; git diff --check PASS.
- contract: host-proven abandoned-attempt recovery can set `SubagentTaskRuntime.recoveryOnly`; the SDK then refuses to seed a fresh child when no durable recoverable checkpoint exists. This does not itself authorize host takeover.

## Multi-agent transition checkpoint SDK — current artifact

- Package: `@librechat/agents` 3.7.17.
- Source commit: `28c10ce0fa651df6f4c9b2fd9e166e24bc50a56f`.
- Commit message: `feat(graph): checkpoint per-agent outputs for transition gates`.
- Artifact: `librechat-agents-3.7.17-28c10ce.tgz`.
- SHA-256: `4216bb5cbbe4636d655a049852ec8aa0a0790e4316fddd8b40941242e48c9e48`.
- npm integrity: `sha512-RDJ370jVQSPaZynT80F92rihH1mZYo6QdiSGAD0on4jPNnVM/+TWROQTITGEuULEyoRItRJuoXW3LhyoSlnB9g==`.
- Distributed files: 1284.
- Reproducibility: after a clean SDK build at the exact source commit, two independent
  `npm pack --ignore-scripts` runs were byte-identical to each other and to the vendored archive.
- Validation: `MultiAgentGraph.test.ts` 24/24 PASS; the focused transition/checkpoint
  subset 2/2 PASS; SDK build PASS.

This SDK adds an observation-only `agentOutputs` LangGraph state channel and checkpoints
the last AI output per multi-agent node so a fresh graph can deterministically inspect
predecessor output after a blocked direct transition. It follows the direct transition
barrier introduced immediately before it and does not grant authorization, task ownership,
or execution authority. Existing P3 durable checkpoint recovery contracts remain unchanged;
the P3 source files in the prior `bc65f7b` package and this package are byte-identical.

LibreChat currently compiles durable mission plans into native direct graph topology but
does not yet attach host transition predicates/barriers to those edges. Therefore this
artifact makes the validated SDK capability reproducible and available without by itself
activating a new host-side decision or authorization path. Historical artifacts are retained.

## Durable per-node output accessor SDK — current artifact

- Package: `@librechat/agents` 3.7.17.
- Source commit: `b6ef55b8da8aaa397c89fc005224ef47c2c21a35`.
- Commit message: `feat(agents): expose durable per-node outputs`.
- Artifact: `librechat-agents-3.7.17-b6ef55b.tgz`.
- SHA-256: `2c9dec39b8f0972f09d3e4974435b90dbb13d80612d94a922fd0dd142cd8ac0c`.
- npm integrity: `sha512-1NZeKCRwP7VpwwcRRAjwBAKHjaDre7EA9wqi0YaxmcEPswziFO14LSkMh3e+RZppfiBITPtTW0X+qK7jP0Q4yg==`.
- Distributed files: 1284.
- Validation: TypeScript `--noEmit` PASS; `MultiAgentGraph.test.ts` 24/24 PASS;
  neighboring run-step/token/close-step suites 28/28 PASS; SDK build PASS; `git diff --check` PASS.
- Contract: exposes an observation-only defensive `Run.getAgentOutputs()` snapshot backed by
  the checkpointed multi-agent `agentOutputs` state channel. Fresh-process HITL resume restores
  checkpointed outputs into the sidecar before continuation. This grants no authorization,
  task ownership, or execution authority.

This artifact extends the previous transition-checkpoint SDK so LibreChat can inspect the exact
per-node AI output at host finalization boundaries instead of reconstructing a candidate from UI
content or message prose. Checkpoint state remains the durable source; the accessor is observation-only.

## Standard + multi-agent durable output accessor SDK — current artifact

- Package: `@librechat/agents` 3.7.17.
- Source commit: `5157597` (`fix(agents): expose standard graph output`), built on `b6ef55b8da8aaa397c89fc005224ef47c2c21a35`.
- Artifact: `librechat-agents-3.7.17-5157597.tgz`.
- SHA-256: `5a0b841a3d584475bbe7e8c150f34db262bed0e93319b190d56b315c17679550`.
- npm integrity: `sha512-7CC5Nn4tbBU09VgoQ6nv695eY79HnjryjwBXPy3viDeU3jr420+bIJ8/Mu3XAcUMTd1B0OfKpndi5Vz3GamMfQ==`.
- Distributed files: 1284.
- Validation: `composition.smoke.test.ts` 19/19 PASS; `MultiAgentGraph.test.ts` 24/24 PASS;
  TypeScript `--noEmit` PASS; SDK build PASS; `git diff --check` PASS.
- Contract: `Run.getAgentOutputs()` remains observation-only. Multi-agent output is backed by the checkpointed
  `agentOutputs` state channel and restored on fresh-process HITL resume. StandardGraph exposes only the latest
  AI message proven to have been produced by the current run, keyed by `defaultAgentId`, including after cleanup.
  This grants no authorization, task ownership, or execution authority.

This supersedes the interim `b6ef55b` package for LibreChat host integration because native one-task missions
compile to StandardGraph and require the same exact-output observation contract at terminal finalization.

## Cooperative detached-task pause/resume SDK — current artifact

- Package: `@librechat/agents` 3.7.17.
- Source commit: `da28c51` (`feat(agents): restore durable task control state`).
- Artifact: `librechat-agents-3.7.17-da28c51.tgz`.
- SHA-256: `ed0ea3f51737adfbb6100d5528b8f96a86a6ca47a48f78179731a9afb971f42b`.
- SHA-512: `CY0rq8QhhXwQvvL87GFHN7KgD5lX6LgUo2YQP1d1JHkRUC/ElOvFtVXQnnMf00IGb0ksnAu1bt5IFC+/wfhtOQ==`.
- Validation: `SubagentExecutor.test.ts` 136/136 PASS; TypeScript `--noEmit` PASS; SDK build PASS; `git diff --check` PASS.
- Contract: retains cooperative `pause_requested`/`paused` plus `pause`/`resume`, and adds host-only `SubagentTaskRuntime.rehydrate()` for control state already proven durable by the host. A replacement owner can restore the same task identity, remain paused before provider/tool work, freeze the task timeout, then resume the same task/thread.

This remains task-control and durable-recovery capability only; it does not grant HITL authority. The host must verify durable checkpoint lineage before calling `rehydrate()`. Historical SDK artifacts remain retained for provenance.
