# Native output schema implementation plan

> For agentic workers: REQUIRED SUB-SKILL: use superpowers:executing-plans in the current session. Steps use checkbox syntax.

**Goal:** transmit the existing host output contract as a structured provider request, without weakening Oracle.

**Architecture:** add one schema/transport helper consumed by the native compiler and research phases; retain native SDK execution, permissions, identities and persistence. No retries or response rewriting.

**Tech Stack:** existing TypeScript package API, native agents SDK, Jest and loopback HTTP; no dependencies.

**Spec:** docs/superpowers/specs/2026-10-25-native-output-schema-design.md

## Global constraints

- No external inference/build/install/publication in this offline lot.
- Preserve Oracle, observed-source checks, P6, saved model/provider and authorizations.
- Preserve explicit owner JSON schemas and provider routing preferences; require_parameters=true on native OpenRouter.
- Scope standard research-v1/result-v1 Chat Completions; other providers and Responses API unchanged.

## Review focus

- Multiple criterion fields/types must remain honest, including false and null outcomes.
- Explicit owner schema and provider preferences must not be silently replaced.
- Native fallback payloads must retain contract and original binding.
- Observation must have no response_format and only the authorized named search.
- Invalid captured output must remain Oracle-rejected despite successful HTTP/JSON syntax.

## Task1 — contract and native HTTP boundary

**Files:** create packages/api/src/agents/orchestrator/schema.ts and schema.spec.ts; modify native.ts and research.ts; add targeted SDK loopback coverage in schema.spec.ts; update existing image regression's contract assertion only if needed.

**Interfaces:** structuredTaskOptions(provider, options, requirements) derives a JSON schema and recursively handles supported fallbacks. requireNativeParameters(provider, options) sets native OpenRouter routing support. Both preserve inputs and all unrelated client options.

- [ ] Write failing tests for strict required scalar contract, provider preferences, explicit schemas, no contract/Responses/other-provider behavior, immutable inputs and fallback identity.
- [ ] Run tests: expected failure because response_format is json_object and native OpenRouter routing does not require parameters.
- [ ] Implement helper and integrate into native compiler/research phase options. Preserve noncontract behavior.
- [ ] Run native SDK loopback tests with actual HTTP payload capture: observation has no JSON format, result has schema, model/tool/caps remain unchanged; no external network or keys.
- [ ] Replay actual captured query through real Oracle; expected rejection for result/sources/completion. Test false outcomes are structurally allowed, not manufactured successes.
- [ ] Run relevant orchestrator regressions, packages/api tsc --noEmit and build, touched-file lint/format and git diff --check. Resolve actual failures only.
- [ ] Commit one reviewable product lot, then one fresh whole-lot review. Fix Important/Critical findings once with RED→GREEN and relevant suite.
- [ ] Persist exact source, evidence and limits. Stop before publication/new image/real inference unless separately authorized.
