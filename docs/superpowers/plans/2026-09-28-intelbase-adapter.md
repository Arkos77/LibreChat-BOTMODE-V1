# IntelBase Email Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a tested, default-off IntelBase email lookup adapter that refuses unapproved egress and exposes only bounded, non-sensitive observations.

**Architecture:** A TypeScript service in packages/api owns the outbound HTTP boundary. Its caller supplies an explicit host authorization callback and a server-only credential resolver. Neither a model/tool argument nor the provider response can grant authority. This plan stops before registering the tool in LibreChat: its production caller needs a host policy that establishes permitted purpose, adult target, budget reservation and task context; no such policy has been proven in the checkout.

**Tech Stack:** TypeScript, Node fetch/AbortSignal, Jest, LibreChat packages/api.

**Spec:** docs/superpowers/specs/2026-09-28-intelbase-email-enrichment-design.md

## Global Constraints

- No real IntelBase request in tests; no default-on configuration.
- Only POST https://api.intelbase.is/lookup/email with x-api-key, a single email, timeout_ms 10000 and include_data_breaches false.
- Do not log or return the key, email, provider raw body, password, hash, login, IP, phone or profile fields.
- No automatic retry, Task Engine mutation, Oracle verdict or Memory/MTO write.
- New backend code belongs in packages/api TypeScript; preserve unrelated .devcontainer and backup files.

## Review Focus

- A malformed email or second field in a model input must fail before credential resolution and transport (Task 1).
- A host callback that throws or returns an incomplete grant must fail before transport (Task 1).
- A huge or malformed HTTP body must fail without being echoed (Task 2).
- A provider response that embeds secrets under unknown nested fields must not reach the projection (Task 2).
- A timeout, quota, IP/key error or forbidden target must have a bounded distinct outcome and no retry (Task 2).

---

### Task 1: Host grant and request boundary

**Files:** Create `packages/api/src/agents/external/intelbase.ts`; test `packages/api/src/agents/external/intelbase.spec.ts`.

**Interfaces:** `lookupIntelBaseEmail(input: { email: string }, host: { userId: string; tenantId?: string; agentId: string; taskId?: string; purpose: string; authorize: (request: { userId: string; tenantId?: string; agentId: string; taskId?: string; purpose: string; email: string }) => Promise<{ authorizationId: string; budgetReservationId: string; adultTargetConfirmed: true }>; getApiKey: () => Promise<string>; fetch: typeof fetch }): Promise<IntelBaseObservation>`; a missing grant, scope, purpose, credential or invalid email rejects with a constant code, never a value-containing error. The callback is trusted host code, never an agent argument. Its actual production implementation remains outside this task.

- [ ] Write tests: malformed/extra input, missing identities, absent/throwing/incomplete grant, missing credential; assert `fetch` is untouched and diagnostics contain no email or secret.
- [ ] Run focused Jest and observe RED.
- [ ] Implement input validation and host grant gate before resolving the credential; keep exported API fail closed.
- [ ] Run focused Jest and observe GREEN.
- [ ] Commit only task files.

### Task 2: Bounded REST and projection

**Files:** Modify `packages/api/src/agents/external/intelbase.ts`; extend its spec.

**Interfaces:** `IntelBaseObservation` contains only `provider: 'intelbase'`, `category: 'email_account_signal'`, `status: 'unverified'`, a bounded `accountCount`, `modules: string[]` from sanitized `identifier.accounts[].module.name`, and an ISO retrieval timestamp. No email or raw response field. Explicit `IntelBaseLookupError.code` distinguishes `invalid_request`, `unauthorized`, `credential_missing`, `provider_bad_request`, `provider_unauthorized`, `provider_forbidden`, `provider_rate_limited`, `provider_unavailable`, `provider_timeout`, `provider_invalid_response`.

- [ ] Write tests: exact HTTP request shape, successful empty/multiple accounts, all documented HTTP errors, timeout, oversized and malformed response, nested sensitive fields; assert no retry and no sensitive output.
- [ ] Run focused Jest and observe RED.
- [ ] Implement one bounded request (10s timeout plus AbortSignal), max 256 KiB response streaming, JSON shape validation, sanitized module names and count; no error-body forwarding.
- [ ] Run focused Jest and observe GREEN.
- [ ] Run neighboring agent tests, `NODE_OPTIONS=--max-old-space-size=4608 npx tsc --noEmit` in packages/api, API build, ESLint and `git diff --check`; record exact results.
- [ ] Commit only task files and update BOT_MODE_MASTER_CHECKPOINT_V2.md with the proven boundary and remaining host policy/tool integration.

## Integration gate

Do not expose a callable agent tool or activate a provider config until a host-owned policy can provide purpose, scope, adult-target decision and a budget reservation at execution time. The source cannot be a model argument. The next plan will test the real initial/resume tool path once that policy is specified and implemented.
