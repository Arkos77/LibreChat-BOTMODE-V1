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
