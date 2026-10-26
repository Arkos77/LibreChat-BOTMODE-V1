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

### Task 2: Correct the pre-key probes exposed by run40245710585 (26 October)

**Evidence:** Published b7fdcbd run40245710585 reloaded and verified the exact retained image. Actual native fallback binding and wire probes passed. The legacy workflow wire probe then selected endpoint.models.default[0] (openrouter/free primary) and asserted the fixed secondary, failing before the host/secret step. Streaming model.invoke also attempted tiktoken.pages.dev while aggregating estimated usage, delaying the network-disabled probe. No external inference or hosted mission; the mission authorization remains unused. No cancellation was sent: its guard observed the job had already failed.

**Files:** Only workflow, validate-host-research-config.cjs, test_host_research_guard.py and this existing plan. No product changes or new image.

**Interfaces:** Exact workflow JS is exercised offline for real configs with/without fallback. Each subprocess rejects any non-loopback global fetch and fails immediately; no tokenizer cache or external network is assumed. Streaming probe uses the public model.stream path; nonstreaming continues model.invoke. Both still check actual request bodies and returned text. Fixed-model selection is explicit, independent of endpoint model order. Both pre-key containers have a45-second bound.

- [x] Reproduce wrong-model failure with exact workflow JS; reproduce tiktoken outbound fetch with deterministic refusal.
- [x] Select the fixed model explicitly; use public streaming API to avoid invoke's estimated-token aggregation, without disabling usage accounting in product or altering SDK prototypes.
- [x] Run guards and complete Python harness suite, JS lint/syntax, YAML/bash checks and exact product-drift guard.
- [x] One fresh bounded review of this CI-discovered correction; 0 Critical,0 Important,0 Minor, no second review.
- [x] Freeze local correction and checkpoint. Publishing a new exact harness source requires its corresponding approval; the already-authorized real mission was never admitted. No automatic dispatch/replay or new image in this correction lot.

Final Task2 validation:97/97 complete Python harness tests PASS (verbose completion observed),32 targeted guard tests PASS, JS lint with zero warnings and YAML/22 bash blocks/AST/source guard PASS. Exact workflow code is tested under both real configurations, not inferred from the standalone validator. Both observed defects have failing tests followed by passing results. The initial full-suite log was incomplete and was not counted; the completed verbose97-test run is authoritative.

Review limits retained: the local fetch wrapper detects global fetch only; the actual image must still enforce --network none for all networking. GNU timeout provides a pre-key deadline, not proof of teardown of an arbitrary uncooperative container; these disposable probe containers have fixture credentials only and cannot admit a real mission. No guarantee of corrected image execution is inferred from local verification.

### Task 3: Diagnose host context drift without another external inference (26 October)

**Evidence:** e05a9fe run40247048705 passes every pre-key gate, admits one mission, and makes two real free-model HTTP200 calls (reported cost0). Native search/scrape1/1 and research result-v1/research-v2 Oracle VERIFIED. Third primary429 is followed by local NATIVE_FALLBACK_SECONDARY_CONTEXT_OR_ORDER refusal before analysis egress. Captured five wire records prove pending third primary and changed context, but retain only its combined hash, so the changed field is UNKNOWN. Cleanup PASS; real one-shot authorization consumed. Local exact-SDK replay of captured three-task plan with synthetic responses yields8requests/four matching pairs, so no blanket product fix is justified.

**Goal/architecture:** Add bounded selected raw context diagnostics on refusal, keeping the exact four-field hash guard unchanged. Add an explicit zero-inference native_fallback=true/real_free_provider=false hosted simulation using the same config/model labels and retained image. Simulation has internal network only, no real key, no provider opener, provider records empty and summary provider=synthetic. The existing deterministic source fixture emits responses locally. No proxy bypass or altered candidate/Oracle policy. A real run still requires real_free_provider=true, an explicit key and catalog checks; its4request limit is unchanged.

**Files:** Existing host runner, fixture, guard/fixture tests, workflow, this plan. No product/SDK/image changes.

**Interfaces:** native_fallback_mode accepts true in real or simulated mode without conferring real-provider authority. build_config(real=False,fallback=True) uses the same fixed secondary/native options. compose_override gives no egress/key unless real=True. GET diagnostics works for real or native-fallback simulation, marks simulated. Mismatch captures changed_fields plus primary/secondary selected messages/tools/tool_choice/response_format only, redacts real key, max16KiB/context and first mismatch only; oversize contexts omitted with byte count, never truncated into misleading valid JSON. Hash refusal stays mandatory.

- [x] Write/run RED diagnostics and no-egress/no-key simulation tests.
- [x] Implement minimal diagnostics and simulation opt-in, retaining all live/key/catalog/Oracle/refusal guards.
- [x] Verify100/100 full harness tests, exact workflow/32flag combinations,22bash blocks, syntax and product drift; no Docker/inference in this offline lot.
- [x] One fresh bounded review:0Critical/0Important/1Minor deferred; no second reviewer.
- [x] Freeze and checkpoint; request only publication plus ONE hosted synthetic diagnostic run with real_free_provider=false. No new real mission authorized or automatically replayed.

Task3 review minor deferred:16KiB is the decoded UTF-8 JSON context measurement before final endpoint/artifact serialization; ASCII escaping/indentation can enlarge the saved representation. It remains finitely bounded and does not weaken the refusal or confer upstream authority. Do not claim an exact16KiB final serialized field cap.

Task3 limits: whether hosted simulation reproduces the live field drift is unknown; actual hosted network isolation/cleanup still require the separate run. No corrected product or full real fallback success is claimed. If simulation does not reproduce it, retain that result and do not automatically invoke a provider.
