# BOT MODE V1 — Subagent-on-GHCR evidence gate

Status: **NOT YET PROVEN** on published image `ghcr.io/arkos77/librechat-botmode-v1@sha256:07185a44a89b06e4ca855a868d6eb557feb60065084fdde5b2183050d1427b95`.

## Evidence already verified

- https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38501422200: published-image synthetic mission: authenticated HTTP mission accepted, SSE final, Oracle ACCEPT, persisted status VERIFIED, non-empty response and Mongo persistence; HUMAN_REVIEW case suppresses publication. **Observed subagent run count: zero.**
- https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38502005825: 12/12 Playwright mock-agent handoff tests, including router → specialist → reviewer and two parallel branches; **not a test of the GHCR image**.
- `scripts/botmode/ci-openai-compatible-mock.py` returns the constant assistant content `{"ok":true}` for every completion. It does not emit a tool call or handoff; changing the mission text alone does not establish delegation.

## Required acceptance design

Use the same digest-pinned published image and disposable Lite/Redis/Mongo setup, no real keys or external inference. Replace or extend the fixture **in the ephemeral runner only** to respond deterministically to handoff tool schemas, not just with fixed text. First establish the actual runtime's handoff invocation contract (tool names, arguments, streamed vs non-streamed completion shape, target registration) from the SDK and application. Do not guess a tool-call schema.

Then verify all of the following within **one unique mission ID**, fail closed:

1. Native authenticated mission start, with a real parent run and an authorized specialist target.
2. Fixture/model tool call requests the specialized agent via the actual supported handoff contract.
3. Durable child run/task identity is present, distinct from parent, correctly linked and authorized; capture an allowlisted evidence receipt rather than raw user/model data.
4. Child produces a distinguishable terminal result; parent consumes this exact result, not a synthetic fallback or stale text.
5. Oracle records ACCEPT against this run and this child evidence; a missing/failed child must **not** pass.
6. Publication barrier exposes final content only after acceptance; verify persisted published response and conversation linkage.
7. Negative variant: withheld/failed child or Oracle HUMAN_REVIEW suppresses publication, then survives restart/resume as designed.
8. Assert directly against durable source of truth (e.g. Redis run metadata, Mongo, or authoritative task store) as well as SSE; SSE replay alone is not authoritative evidence.

Stop conditions: no child task ID; no verifiable parent/child relation; fixture returns content without a real tool call; Oracle record belongs to another mission; only HTTP 200 or `final:true` observed. Any such case remains **NO-GO**.

## Scope and release constraints

This gate is not implemented by the existing two workflows and cannot be declared green by combining their separate PASS results. Do not modify signed-off candidate binaries for test convenience; any required product change creates a new SHA/digest and requires requalification. Existing release owners must also decide on npm moderate findings, migration/rollback durability and explicit stable authorization. `main` and GHCR `:latest` remain untouched.
