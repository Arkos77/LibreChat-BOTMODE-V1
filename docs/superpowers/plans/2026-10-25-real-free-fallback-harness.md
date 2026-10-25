# Real free fallback harness implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prepare one bounded hosted mission proving native SDK fallback to the fixed free model, using the already-qualified a8b8073 image.

**Architecture:** Extend the existing CI relay: the saved OpenRouter/openrouter/free primary returns a controlled typed zero-chunk 429 without upstream inference; the only secondary is nvidia/nemotron-3.5-super-vl:free through the same native OpenRouter endpoint. The current SDK supports native openrouter fallback, as shown by the acquired image CJS/ESM child tests; the historical openAI compatibility alias is unnecessary here. The unchanged application resolves static free_only routing and invokes SDK fallback. The relay records paired request fingerprints for messages/tools/tool choice/output contract; it refuses direct secondary calls, changed context, or more than four pairs. Existing Oracle and exact SSE/Mongo checks remain mandatory.

**Tech Stack:** Existing Python standard-library fixture/guards, GitHub Actions, immutable Docker image. No product/dependency changes.

**Spec:** This document's architecture and constraints; owner closure method docs/BOTMODE_V1_METHODE_CLOTURE_20261023.md. Owner opted out of routine design questions and approved autonomous offline preparation; no external execution authorized by this plan.

## Global Constraints

- Product a8b8073211367c06b33c491dc9973340692a416b; image sha256:be343811b24d065448620b40a05302e6530a615ac12887544b600a44e3ec4e54; retained run40228333797/artifact12612047426.
- At most four upstream requests, max2048 output tokens each, reasoning disabled, fixed model only, current free catalog required before any secret; no retries/replay/paid route.
- Controlled primary 429 is synthetic: do not claim an actual external quota event or browser/restart/nested-child qualification.
- No application build, provider inference, publication, installation, merge or stable in this offline lot.
- Keep Oracle, native tool/source barrier, exact SSE/Mongo publication and cleanup mandatory; no candidate repair.
- Only explicit existing harness paths and this exact plan may differ from image source. Product drift stays forbidden.

## Review Focus

- Flag combinations must refuse fallback without explicit real-provider mode and retained-image selection before secret use.
- Direct fallback, missing/reordered 429 pairs, altered system/tools/contract, repeated primary or excess pairs must fail closed.
- Saved agent binding must exactly match the first static free_only routing binding; six agents remain native setup outputs.
- SDK fallback must receive endpoint reasoning/token/time limits and preserve context; actual image wire proof precedes any secret.
- Source/run/image/archive pins and cleanup must remain exact; simulated 429 and real provider calls must be separately labeled.

### Task 1: Prepare and verify the retained-image fallback recipe

**Files:** Modify scripts/botmode/ci-host-research.py, scripts/botmode/ci-openai-subagent-fixture.py, scripts/botmode/tests/test_host_research_guard.py, scripts/botmode/tests/test_source_fixture.py, scripts/botmode/validate-host-research-config.cjs, .github/workflows/botmode-v1-pr77-source-built.yml; create this plan.

**Interfaces:** build_config/compose_override/setup_binding/validate_agent_bindings add fallback=False; native_fallback_mode(env, real) validates opt-in. Relay env CI_NATIVE_FALLBACK=1 requires real source mode. validate_fallback_evidence(evidence) checks eight ordered paired wire observations. New workflow input native_fallback defaults false and is supported only by retained-host-research with real_free_provider=true.

- [x] Write failing config/flag/evidence and loopback relay tests; run them and observe missing behavior.
- [x] Implement minimal opt-in config, relay pairing, primary429 interception and fail-closed evidence validation.
- [x] Pin retained workflow to a8b8073, new image/tar/run/artifact; enforce combinations before key, retain pre-key loopback wire proof and record scope.
- [x] Run affected Python suites, synthetic+real+fallback schema checks, Python/YAML/workflow shell syntax and source-drift guard. No Docker/inference.
- [x] One fresh whole-lot review; fix Important/Critical findings with RED→GREEN; defer Minors with explicit limits.
- [x] Freeze harness-only lot with this plan; save evidence/checkpoint and present concrete authorization scope for one retained-image real mission. External execution remains separate.

## Final validation and review record

96 Python tests pass locally, including actual native initializer and streaming/nonstreaming loopback wire proof for the resolved fallback provider/options. YAML,22 workflow bash blocks,32 flag combinations, AST, JS lint/syntax and product-source drift guard pass. CI source-only Python tests may skip the compiled-API integration check when dist is absent; the exact-image runtime/wire gate is mandatory before any key is loaded.

One fresh review found 0 Critical,1 Important,0 Minor. Important fixed RED→GREEN: the initially considered historical openAI alias omitted reasoning.enabled=false on the wire. The current retained SDK already supports native openrouter fallback (including acquired CJS/ESM child tests), so the alias was removed. The pre-key guard now serializes actual resolved fallback.provider/clientOptions rather than forcing a different constructor. Relay strictness remains unchanged. No second review or external trial.

Ruling: native provider support in the exact current SDK supersedes the historical alias requirement for this recipe; if image behavior differs, its mandatory pre-key guard fails without consuming a mission. Full ACL/live provider/image-retrieval behavior remains for the authorized mission, with normal native validation/Oracle/cleanup, not presumed from local checks. No deferred minors. No stable/install/merge qualification implied.
