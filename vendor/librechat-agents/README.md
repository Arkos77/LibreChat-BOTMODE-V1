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
