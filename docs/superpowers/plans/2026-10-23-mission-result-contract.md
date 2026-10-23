# Mission result contract implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. No per-task delegation.

**Goal:** Refuse BOT MODE mission completion without a nonempty result, enforced by the host.
**Architecture:** Extend the existing deterministic Oracle with an optional versioned output contract. The authenticated BOT MODE request admission imposes this contract on the mission before planning, so each planned task inherits it. Legacy scalar Oracle inputs remain compatible; the raw candidate and existing criteria/evidence/review remain unchanged.
**Tech Stack:** TypeScript, existing Jest, thin existing JavaScript controller.
**Spec:** Architecture audit Lot B; this is the result-presence portion only. Source provenance and actual financial truth remain unproven.

## Global constraints

No extra LLM, no inference, no weakened Oracle/P6/authorization, no rebuild or install in this local lot. Preserve the installed a0aa image. User opted for autonomous correction without design questions.

## Review focus

Missing/blank/non-string result must fail; false completion must still fail; human review must remain; hostile caller cannot remove host policy; plan persistence/recovery must preserve policy.

### Task 1: Enforce versioned result contract

Files: Oracle types/deterministic/spec; orchestrator types/missionOracle/spec; new orchestrator output.ts/spec and index; request.js and existing request controller tests.
Interfaces: OracleInput.outputContract and OracleRequirement.outputContract are optional literal result-v1. prepareBotModeMission(mission: Mission): Mission clones caller input and imposes this policy. validateMissionTask forwards it to Oracle.

- [x] Write and run failing tests for ok-only and empty results, planner inheritance and host admission.
- [x] Add policy, validate before VERIFIED, preserve ordinary legacy inputs and review.
- [x] Run changed suites plus adjacent Oracle/orchestrator tests, package typecheck and scoped lint/format.
- [x] One fresh read-only review, one bounded fix pass if needed, commit evidence. No public candidate or installation claim.

## Ledger

Base: fbd595f (installed application source remains a0aa). Existing mode persistence proofs acquired; do not rerun them.

Results: five real Oracle regressions RED (VERIFIED instead of REJECTED), actual controller inheritance RED (false instead of true), caller false-completion RED, then corrected. Final targeted suites: 91 tests / 7 suites. Complete controller file: 143 tests / 1 suite. Scoped ESLint and format pass. Full package API typecheck passed with 8GB heap; default 2GB exhausted its heap (not a source diagnostic). Canonical release build not performed.

Single fresh read-only reviewer found an Important regression: duplicate completion criterion blocked valid independent evidence. Added real evidence regression RED (UNKNOWN), recognized existing ok=true criterion independently of its ID, final suite GREEN. No second review, no deferred findings. Source-provenance and factual-quality work remain distinct and are not claimed by B1.
