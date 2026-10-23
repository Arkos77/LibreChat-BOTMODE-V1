# Durable BOT MODE conversation settings

**Goal:** preserve the selected mission mode and specialists after reopening a conversation, without replaying a previous plan or enabling ordinary chats.

**Architecture:** add versioned conversation settings shared by the provider schema and Mongo model. The client restores them when the route has no explicit BOT MODE choice. The server validates settings against the admitted mission and authorized agents, persists only admitted settings, and refuses silent downgrade of an existing mission before any model invocation. Reuse the native planner, SDK, Oracle and saving paths.

**Constraints:** no new scheduler/state store, migration of old chats, model calls, paid routing, weaker ACL/Oracle, or installation/publication in this source lot. Explicit FAST stays FAST. Each follow-up gets fresh execution identities and reauthorization.

**Review focus:** reopened URL without parameters; ordinary/legacy chat; explicit FAST; changed agent or stale selection; error settlement before normal response saving.

## Execution
- [x] Add failing shared-schema, real ask-hook and server admission/persistence tests for reopened auto/manual settings and negative cases.
- [x] Add the shared versioned settings schema and Mongo field; keep it out of presets and protect it from generic save unsetting.
- [x] Restore effective settings in the real ask path, send them with each turn, and display the effective mode in the existing header.
- [x] Validate the supplied/stored settings before execution, recheck selected agent identities, and expose admitted settings to normal/error conversation persistence.
- [x] Run the new regressions, affected navigation/request/persistence suites, workspace typechecks and formatting; inspect the whole diff and report exact limits.

Approved direction: owner request to apply the first correction after the architecture audit; implement inline in the existing isolated worktree.

Verification: 683 targeted tests passed; strict client/provider/data-schema typechecks passed, lint/format/diff checks passed. Local MongoMemoryServer startup is blocked by open: Operation not permitted; the exact changed Mongoose field passed isolated database roundtrips and cleanup. Native tsdown is unavailable in this host dependency set; local runtime assembled for tests with Rollup/TypeScript. No release image built or installed.
