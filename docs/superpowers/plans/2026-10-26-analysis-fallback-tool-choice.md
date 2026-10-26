# Analysis fallback tool choice

Bounded offline correction following synthetic run 40249558528 on harness 992133e and product a8b8073. No archive reanalysis, SDK patch, guard relaxation, Docker build, provider inference or installation in this lot.

Evidence: the third primary/fallback pair fails only on tool_choice: primary auto, secondary null. Messages, tools (including host-injected check_background_task), and response_format match exactly. Two research Oracle verdicts are VERIFIED; analysis has no accepted result. Network internal=true, real_free_provider=false, provider records empty, cleanup PASS.

Cause to reproduce: native validatedClientOptions applies implicit automatic tool choice to the primary after structuredTaskOptions has mapped fallback schemas; fallback options miss that normalization for non-research tasks with host tools. Research has a separate phase normalizer and passed both pairs.

1. Add failing regressions for validated non-research tools, graphTools and toolDefinitions through nested compatible fallback options; preserve explicit per-provider choices and deferred/no-tool/Responses/unsupported-provider behavior and immutable bindings.
2. Apply the existing JSON/tool choice normalization to compatible fallback options as well as primary. Preserve saved provider/model credentials, eligibility/retry policies and explicit choices. Never grant a tool or relax the exact wire guard.
3. Reproduce analysis using actual SDK HTTP with an injected graph tool: primary controlled 429, fallback strict context comparison; no provider call. Run focused native/schema/research/transport tests, build/types/lint as appropriate.
4. One fresh read-only review, resolve important findings, record evidence and prepare exact commit. Publication/new image/host mission remain separately authorized actions; no automatic replay.

Success for this offline lot means primary and fallback carry the intended implicit auto choice for host-injected tools, existing explicit configurations are unchanged, and the actual SDK regression completes with identical selected contexts. It does not qualify the whole hosted or real mission.
