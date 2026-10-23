# Mission Output Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align validated mission output with generation and stop a failed research draft becoming a final answer.

**Architecture:** Extend the existing native compiler and Oracle error boundary, then adjust analyze-mode objectives. Keep the planner, routing, SDK and publication authority unchanged.

**Tech Stack:** Existing TypeScript/JavaScript, Jest, React; unchanged lockfile.

**Spec:** docs/superpowers/specs/2026-10-23-mission-output-contract-design.md

## Global Constraints

- Base d59dedf071d26503ec9bec5a31ee474f0ccc9724; no dependency changes.
- No external inference, image build/publication, deployment, merge or stable change.
- Never relax Oracle/P6, authorization, independent evidence or budget controls.
- Inline implementation; one independent whole-diff review at the end.

## Review Focus

- Non-OpenAI providers must not receive invented transport options.
- Explicit JSON schemas and fallback provider options must not be overwritten.
- Nested/parallel SDK errors must not turn rejected output into successful completion.
- Pause/resume and user abort retain existing ownership and settlement behavior.
- Manual selection and document attachments retain required tasks and dependency validity.

## Task 1: Native output contract

Files: packages/api/src/agents/orchestrator/native.ts and native.spec.ts.
Consumes: PlannedTask.validation and authorized AgentInputs. Produces: same NativeMissionPlan with aligned instructions and compatible JSON options.

- [ ] Add failing tests for machine contract, JSON transport, explicit schema and unsupported provider preservation, no-validation unchanged, binding immutability.
- [ ] Run native.spec.ts and observe expected failures.
- [ ] Add minimal contract/instruction/transport propagation for validated tasks only.
- [ ] Run native and missionOracle suites; typecheck package; commit.

## Task 2: Fail closed on intermediate Oracle rejection

Files: packages/api/src/agents/orchestrator/missionOracle.ts and missionOracle.spec.ts; api/server/controllers/agents/client.js and client.test.js.
Consumes: host-owned MissionOracleState.results. Produces: sanitized MISSION_ORACLE_FAILURE for any non-VERIFIED persisted result; no candidate/provider content.

- [ ] Add failing tests for bounded reason/error classification and real graph aggregate predecessor failure; initial and resumed client propagation.
- [ ] Run and observe expected failures.
- [ ] Implement failure helper and thin client catch integration; retain no-failure, abort and provider paths.
- [ ] Run package Oracle/native suites and client tests, typecheck; commit.

## Task 3: Match analyze tasks to the requested mode

Files: client/src/hooks/Chat/mission.ts and mission.spec.ts; client/src/hooks/Chat/useChatFunctions.ts.
Consumes: existing mode plus attachment presence. Produces: objective descriptions consumed by the existing request/planner path.

- [ ] Extract existing objective construction unchanged, characterize current behavior, then add failing tests for nontechnical analyze and attachments.
- [ ] Keep develop/watch objectives and manual binding flow unchanged; analyze has research/analysis/synthesis and conditional documentation.
- [ ] Include evidence guidance distinguishing sourced claims, estimates, deadlines and unavailable facts, without hardcoding the user's request.
- [ ] Run relevant frontend tests and typecheck; commit.

## Completion

- [ ] Review whole diff once independently; resolve Important/Critical findings through regression tests.
- [ ] Run targeted static/format checks and relevant suites; record exact source and proof limits.
- [ ] Publish only the reviewable source/docs branch within existing GitHub authorization; no image or installation change.
