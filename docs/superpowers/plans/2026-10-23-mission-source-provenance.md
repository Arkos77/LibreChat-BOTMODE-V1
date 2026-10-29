# Mission source provenance implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. Keep a single final read-only review.

**Goal:** Research tasks cannot publish citations absent from completed native web-search observations.
**Architecture:** Extend the existing Oracle contract with research-v1, preserving scalar JSON. The server applies it to objectives requiring web_search. Capture bounded URLs from structured native web-search artifacts in the existing transient buffer, promote them into optional task-scoped source observations in the existing durable Oracle state, and pass these through the existing native QA hooks. No new scheduler, service, model or raw-page storage.
**Tech Stack:** Existing TypeScript Oracle/planner, minimal JS controller/callback wiring, Jest.
**Spec:** Architecture audit Lot B. This verifies provenance, not factual entailment or financial guarantees.

## Global constraints

No external inference, no image rebuild/publication/install in this local lot. Existing installed a0aa retained. Preserve permissions, independent-evidence semantics, P6, raw candidate, legacy scalar contracts and task-scoped recovery. Research-v1 requires a nonempty result plus scalar sources containing newline-separated absolute HTTP(S) URLs. These same links must appear in result and in observed successful web_search artifacts for that task. Reject unknown links and absent/failed/text-only tool calls.

## Review focus

Forged tool arguments; error artifacts; foreign task/node; replay conflicts; bounded URL lists; independent evidence unchanged; missing tools detected before generation; old persisted state without source observations stays readable.

### Task 1: Oracle provenance and native transport

Files: oracle types/deterministic/spec; orchestrator sources.ts/spec, output.ts/spec, missionOracle.ts/spec, transientEvidenceBuffer.ts/spec, native.ts/spec, run.ts; exports.
Interfaces: OracleSourceObservation {toolCallId,urls}; OracleInput.observedSources optional; outputContract adds research-v1; MissionOracleState.sources optional task-keyed observations; optional sources resolver appended to existing native compilation API.

- [x] RED tests: unobserved source rejected, same-task observed URL accepted, missing citations rejected, legacy state preserved.
- [x] Implement strict bounded source normalization, promotion and QA forwarding.
- [x] GREEN targeted suites and full API typecheck.

### Task 2: Host capture and admission

Files: existing request.js, initialize.js and callbacks.js plus actual corresponding regression tests.

- [x] RED tests for native artifact capture only under admitted research node, forged text/failed artifacts ignored, unavailable web_search denied before model invocation.
- [x] Configure research source scopes from host plan, capture structured artifact URLs, wire existing persistence resolver.
- [x] Targeted regression suites, lint/format/types; single focused review and bounded fix pass; record exact source, no deployment claim.

## Execution evidence

Local B2 outcome: 117 tests in 10 API suites and 392 tests in 4 host suites passed on the final sources. Full API workspace tsc --noEmit passed with 8GB heap. Scoped ESLint, import sorting, Prettier and diff whitespace checks passed. API dist has an ignored local transpile overlay of exact changed pure modules for host Jest; this is not a canonical release build.

RED observations: four research Oracle cases, task output-policy inheritance and transient URL preservation, native source promotion, real callback source capture and missing pure context module. The final reviewer found four Important issues: initialized tool objects/definitions rejected; criterion/source buffer key collision; valid punctuation and uppercase-scheme parsing; divergent source replay ignored. Six targeted regressions failed before the bounded fix pass, then the final suites passed. No second review and no deferred findings.

Ruling: extract the existing inline mission evidence context into a typed pure module actually called by initialize.js. The complete initialize.spec.js attempt was blocked in MongoMemoryServer beforeAll (exit100), affecting 93 tests; it was not retried or called passed. The extracted context has direct isolation, legacy-declaration and atomic reconfiguration tests. Cost if wrong: a runtime initialization regression, to be checked on the exact image before installation.

No external model generation, candidate publication, image build or installation has occurred for B1/B2 yet. Source provenance is checked only for research tasks requiring web_search; it does not establish factual truth, payment timing or final synthesis entailment. Existing permissions/P6 and independent evidence remain unchanged. Historical states without source observations remain readable.
