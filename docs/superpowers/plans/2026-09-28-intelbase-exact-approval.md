# IntelBase Exact Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind one human-approved third-party email lookup to one native paused tool call and enforce it at execution without enabling live egress by default.

**Architecture:** The native `tool_approval` pause and resume remain authoritative. A small TypeScript binder consumes the validated pending action and a confirmed `approve` decision to create a request-local, single-use lease for the exact tool call and email. The host only supplies this lease after its existing resume CAS succeeds. The provider adapter still requires a separate host grant and budget reservation before HTTP; no model field can mint either.

**Tech Stack:** TypeScript/Jest, LibreChat native agents HITL, GenerationJobManager CAS.

**Spec:** docs/superpowers/specs/2026-09-28-intelbase-email-enrichment-design.md

## Global Constraints

- Third-party email addresses are allowed only after review of the exact lookup; known or suspected minors are refused.
- No default-on config, no actual IntelBase request, no second Task Engine or permission authority.
- Never store email or API key in MTO, Memory, logs or a new global registry.
- One approval yields at most one lookup; editing arguments requires a new pause and approval.
- Existing unrelated .devcontainer and backup files stay untouched.

## Review Focus

- A crafted decision for another tool call or stale action cannot mint a lease (Task 1).
- `edit`, `respond`, `reject`, missing adult attestation or malformed arguments cannot mint a lease (Task 1).
- A lease for another owner/tenant/agent/conversation/email cannot be consumed (Task 1).
- Two concurrent consumes cannot both succeed (Task 1).
- A failed budget hold or absent native effect authority cannot dispatch (Task 2).

---

### Task 1: Exact, single-use approval lease

**Files:** Create `packages/api/src/agents/external/approval.ts` and `approval.spec.ts`.

**Interfaces:** `createIntelBaseApprovalLease(input): IntelBaseApprovalLease | null` accepts the trusted pending action with `actionId`, a submitted `actionId`, `action_requests`, validated decisions, authenticated `userId`, optional `tenantId`, `conversationId`, `agentId`, host `purpose`, and `adultTargetConfirmed` submitted explicitly by the human. It returns an object with `consume({ toolCallId, email, userId, tenantId, conversationId, agentId, purpose }): { actionId, toolCallId } | null`, synchronously and once. Only one `osint_email_enrich` call in the paused batch and its `approve` decision qualify; reject `edit` even if the client supplied new arguments. Never expose the email through the lease result or an error.

- [x] Write failure tests for wrong action/tool/decision, absent attestation, mismatched scope/email, concurrent replay; run Jest RED.
- [x] Implement strict binding and single-use consumption; run Jest GREEN.
- [x] Run focused TypeScript/ESLint and commit only these files.

### Task 2: Resume and execution bridge behind opt-in

**Files:** Modify `api/server/controllers/agents/resume.js` with a thin call into packages/api; modify `api/app/clients/tools/util/handleTools.js` and existing tool definition/config seams only after confirming the runtime's exact invocation context. Tests in neighboring resume and handleTools suites.

**Interfaces:** The resume controller creates the lease only after `GenerationJobManager.approvals.resolve` succeeds. The per-request tool receives the lease via a host-only closure. A true native `PreToolUse` ask rule and effect-time revalidation are required for the tool. The adapter grant additionally verifies owner/tenant/agent/purpose, adult attestation, server credential and an operator-configured fixed-cost budget hold. Config is absent by default, so no live transport can occur without explicit administrator settings.

- [ ] Write host tests for initial pause, exact resume, mismatch, edited/replayed decision, missing budget/config, and no HTTP on all denials; run RED.
- [ ] Add minimal native wiring; run GREEN and neighboring tests.
- [ ] Run typecheck/build/lint/diff checks; document remaining live prerequisites and commit.

## Boundary note

The existing AutonomyMandate grants a capability, not approval of an address. The existing BudgetReservation holds LibreChat tokenCredits, not an IntelBase price. A host-configured conversion and observed provider quota are prerequisites for claiming a monetary budget. Until these facts are established, Task 2 must leave the tool disabled rather than fabricate a grant or a cost.
