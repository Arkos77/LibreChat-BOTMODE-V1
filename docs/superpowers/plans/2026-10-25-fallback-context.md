# Preserve the agent context across free fallback

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** Preserve current authorized instructions and tools when the SDK switches provider/model after an eligible zero-chunk failure.
**Architecture:** Derive a reproducible vendored SDK archive from the already pinned 3.7.17/145865e artifact. Add optional internal model/tools preparation hooks to fallback initialization and supply them from the existing Graph AgentContext. Do not introduce an orchestrator, runtime monkeypatch, provider retry loop or new dependency.
**Tech Stack:** Existing vendored TypeScript SDK, CJS/ESM distribution, deterministic Python archive generator, Jest/native HTTP loopback.
**Spec:** Existing primary Graph behavior plus owner mandate to repair free fallback; source contract docs/BOTMODE_V1_METHODE_CLOTURE_20261023.md.

## Global constraints

- Offline changes/tests only. No new Docker build, source push, external inference or installation.
- Preserve rate-limit-only/zero-chunk eligibility, all authorization/deferred-tool filters, schemas, budgets, aborts and Oracle/P6.
- Use the primary SDK context preparation pipeline, not raw tools or invented instructions.
- New tarball and exact lock integrity must reproduce clean installation; never edit shared node_modules.

## Review focus

- Runtime-created authorized subagent tool survives fallback; observation phase still cannot delegate.
- Owner/dynamic instructions present exactly once on each fallback phase; no cross-agent context leak.
- Deferred or non-direct tools stay hidden; no authority inferred from fallback.
- No fallback after content chunks, abort or noneligible errors.
- Optional fallback hooks preserve standalone callers without Graph; CJS and ESM stay equivalent.

### Task 1: Preserve context in the pinned SDK and prove its transport

**Files:** reproducible generator under scripts/botmode; new vendor tarball and README; api/package.json/package-lock.json; native fallback/schema regressions and one real SDK child-call loopback.
**Interfaces:** Optional prepareModel(model) and prepareTools(provider,clientOptions) fallback hooks; Graph supplies current system runnable and getPreparedToolsForBinding for the target provider.

- [x] Tighten current native transport tests (remove known-loss exceptions), observe RED for prompts and subagent binding.
- [x] Generate the minimally patched SDK source/CJS/ESM/types artifact in an isolated directory with exact base SHA and patch-anchor checks; build and verify identical output twice.
- [x] Test isolated new SDK over local HTTP, including actual child execution and negative authorization/zero-chunk cases. No external model.
- [x] Update the local dependency/lock deterministically; run affected source/native tests, types and reproducibility checks.
- [x] One fresh whole-lot review, one RED→GREEN pass for Important findings; freeze local source and record remaining live/image limits.
