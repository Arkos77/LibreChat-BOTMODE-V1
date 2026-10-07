# Native mission planning MVP

`deterministicPlanner.planMission(mission, context)` describes a mission using
structured host-supplied objectives, capabilities, constraints and Oracle P5
requirements. Without explicit objectives it plans one `main` task. It does not
decompose natural language, infer permissions or call a model.

The worker is preferred whenever it covers the task's capabilities. Otherwise
the planner selects one covering specialist, preferring fewer extra capabilities
then its stable ID. Missing capabilities, ambiguous identities, duplicate task
keys, unknown dependencies and cycles fail planning. No agent is invented.
Explicit objectives determine the DAG; capability declarations alone do not
invent dependencies or a synthesis task.

Plans describe `DIRECT`, `SINGLE`, `PARALLEL`, `SEQUENTIAL` or `FANOUT_FANIN`.
Tasks retain their parent task, capabilities, all constraints and all validation
layers (mission, specialist, task). Parallel flags describe topological levels;
the native graph owns actual concurrency. Task/node identities remain stable
across plan revisions. The host must increment `planVersion` when revising a
mission and may reference `supersedesPlanId`; no replanning runtime is added.

`compileNativePlan(plan, authorizedBindings, compileOptions)` returns a native
`StandardGraphConfig` for one task or `MultiAgentGraphConfig` for several tasks.
Each destination has one direct edge with **all** dependency sources, retaining
the SDK's fan-in barrier. No execution loop, task store or scheduler is created.
The host can supply its existing durable checkpointer through compile options.

Bindings must already be resolved and authorized by the host. Models, tools and
other binding settings are retained; task objectives and constraints are added
as planning context, not enforced as authorization. SDK node IDs are task-scoped;
`actors` maps them back to saved-agent and task identities for host policy and
trace correlation. The host still owns policy hooks, admission, Task Engine
submission, settlement and durable execution state. A plan is not permission.

`validation` carries the original P5 criteria and review requirements per task,
including requests for independent evidence. The planner/compiler never produce
a verdict. The host must supply evidence and invoke P5 separately; automatic
per-member Oracle invocation in a multi-agent graph is outside this MVP. No P5
behavior is changed, no verdict is persisted and no chain-of-thought is collected.

This is an opt-in planning/configuration API, not an HTTP controller or automatic
mission submission path. A direct plan adds no specialist or delegation layer.
It does not revoke delegation tools already present in an authorized binding.
Budgets, deadlines, retry/recovery and enforcing constraints remain host concerns.

## P9 — Capability, resource and model/provider routing

P9 adds an opt-in routing layer without creating a second runtime, scheduler,
permission system or source of truth.

The target chain is:

`need -> required capability -> execution mode -> authorized resource -> decision provider -> model/provider adapter -> native SDK execution -> evidence/Oracle`

Authorization remains upstream of routing. A route is never permission. The host
must resolve credentials, ACLs, model validity, tools, skills, budget authority
and other policy gates before constructing routing candidates. The routing layer
cannot discover or grant capabilities by itself.

`rankAuthorizedResources(...)` is the generic capability/resource router. It
operates only on non-secret metadata and may compare resources declared as
`model`, `agent`, `tool`, `workflow`, `external-provider` or `local-runtime`.
It applies hard host constraints first, then deterministic ordering, with an
optional Decision Provider allowed to reorder only the surviving candidates.

Decision Providers are interchangeable policy-neutral decision engines. Known
provider identities include Jev, GIVE, NanoJev, `RuleDecisionProvider` and
`LLMDecisionProvider`; future providers
may be added without changing the router contract. They receive sanitized
candidate views only — never `AgentInputs`, credentials, headers, tool registries
or secret-bearing client options — and they cannot authorize a denied resource.
The selected provider identity may be retained in the routing decision for
structured provenance/MTO correlation. No chain-of-thought is required or
stored by this API.

`routeAuthorizedModelBindings(...)` is deliberately narrower. It adapts an
ordered set of already-authorized model/provider bindings for one logical agent
into the SDK's native provider fallback mechanism. All candidates must share the
same logical `agentId`; existing nested `clientOptions.fallbacks` are rejected so
an undeclared provider/model cannot bypass host authorization or router filters.
The adapter selects the primary binding and maps the remaining authorized order
to SDK `FallbackConfig` entries. Retry/fallback execution remains owned by
`@librechat/agents`; P9 does not duplicate it.

The production host-model path is intentionally stricter than that generic
adapter. Its opt-in routing supports either the legacy OpenRouter model list or
two to four explicit host-authorized provider/model bindings identified by
stable non-secret binding IDs. Every alternative is revalidated and separately
initialized through the native provider path on both initial run and resume;
cross-provider alternatives do not inherit primary-provider model parameters.
The host persists the selected `DECIDED` provenance before execution, installs
only the selected binding, rejects hidden/native fallbacks, and attributes
primary model-end usage to the selected provider/model identity.
Binding-specific pre-invocation balance admission is wired through
`modelCallbackFactory` for initial and resume runs, using the exact host-known
`agentId`/provider/model, the final provider-bound message batches, and that
agent's resolved token pricing configuration. Explicit multi-provider host
routing and per-invocation balance admission are therefore closed. This does
not provide an atomic reservation or hard concurrent spending cap for metered
provider calls.

Controlled production failover therefore remains open. The native SDK
`tryFallbackProviders(...)` path can run after a primary invocation error that
occurs after streaming has already started, and the current graph seam exposes
no proven fail-closed marker that the provider never started and produced no
external effect. The host must not enable that fallback path merely because the
alternatives were previously validated. A future controlled failover must prove
a zero-effect/pre-provider boundary, then revalidate/re-authorize the alternate,
apply budget admission, and persist fresh provenance before that alternate may
execute; it must not replay the whole graph/run after partial execution.
The host now carries each natively resolved maxContextTokens value into the
routing candidate as the truthful contextWindow signal. Dynamic pre-run
quality/cost/latency signals remain open rather than being synthesized from
unproven metrics.

A generic tool, workflow or local runtime is therefore not disguised as an
`AgentInputs` fallback. Those resources remain in the capability/resource layer
and require the appropriate host/executor adapter after selection. This preserves
the rule that one technology may dynamically serve as a model, agent, tool,
workflow, external provider or local runtime without forcing every mode through
one execution primitive.

The current API is intentionally not auto-wired into `createRun`. LibreChat's
existing `agentInputs` array is the native graph topology, not a pool of competing
model candidates, and lazy subagents resolve their bindings later. Wiring P9 by
selecting among those graph members would corrupt orchestration semantics. A
production caller should opt in only when it can supply a real set of separately
resolved and authorized alternatives for the same logical binding, including on
resume/lazy-resolution paths. Until then, existing run behavior is unchanged.

Oracle remains downstream and independent: historical Oracle/benchmark signals
may inform routing, but the router cannot create an Oracle verdict. Budget
reservation, durable task ownership, retries/recovery, Policy/Auth and final QA
remain owned by their existing BOT MODE layers.

## P10 — MTO observation contract

P10 starts with an opt-in, pure MTO normalization contract in `mto.ts`. It does not add a runtime, scheduler, task store, event bus, persistence layer, permission system, or production hook. The existing Task Engine, SDK hooks/custom handlers, `SubagentActivity`, `subagentUsageSink`, and Oracle remain authoritative for their own concerns.

MTO identities are intentionally distinct. `traceId`/`traceEventId` are host-supplied trace identities and are never inferred by aliasing `taskId`, `runId`, `rootRunId`, `parentRunId`, `subagentRunId`, `threadId`, or tool-call identities. Adapters only correlate native identities already emitted by the SDK/host.

The initial adapters normalize metadata from bounded `SubagentUpdateEvent`, `SubagentUsageEvent`, and Oracle events. They remain observation-only: they cannot authorize work, settle a task, publish a skill, mutate memory, or convert Oracle `ACCEPT` into execution authority. Activity `data`, raw Oracle candidates, evidence values, and reasoning content are deliberately excluded from MTO payloads; only bounded lifecycle, identity, usage, validator and reason metadata is retained. Production host seams now emit MTO observations from subagent activity/usage, Oracle validation, host-model decisions and authorization checks. Request/resume/initialization paths can persist these bounded observations through the host observation store. This persistence remains telemetry/provenance only and does not become task, Policy/Auth, Oracle, or publication authority.

## P10 — controlled improvement candidate

`improvement.ts` adds the next pure P10 boundary: deterministic pattern summaries over sanitized MTO metadata and a host-owned `ImprovementCandidate`. It adds no persistence, scheduler, task engine, memory write, runtime mutation or publication side effect. Candidates retain trace-event references and aggregate signals rather than copying source events, raw Oracle candidates, evidence values or reasoning.

The candidate is always born in `CANDIDATE` state. Oracle verification and authorization remain mandatory before any later publication step, and Oracle acceptance is not authorization. `skill` is currently the only target with a proven native publication path, so its disposition is `native-skill-authoring-required`; actual create/update must still go through LibreChat's existing skill-authoring authorization, ownership and optimistic-version contract. `agent`, `workflow` and `specialist` remain `proposal-only` until equivalent native fail-closed publication contracts are proven.

## P10 — Transient tool evidence buffer

The agents `initializeClient` path creates one isolated transient evidence buffer per initialization and passes that same request-local buffer into the native tool-end callback. For a configured mission evidence declaration, the callback appends only bounded native tool identity and the explicit criterion/value binding. The client promotes those observations into mission Oracle state, persists that state first, reads it back to verify the durable write, and only then clears the transient buffer.

`transientEvidenceBuffer.ts` defines a request/run-local, in-memory and bounded observation buffer for native tool-end evidence. It preserves explicit native identity plus optional declared criterion/value only, deduplicates by the pair (`taskId`, native `toolCallId`) when task identity is available, evicts the oldest entry when capacity is reached, and supports defensive snapshot, atomic consume and clear operations.

The buffer is still not durable state and has no authority: it contains no raw tool output, arguments, artifacts, reasoning, confidence, Oracle verdict, authorization or publication state. It is only a staging boundary: durability begins when the client promotes the observations into the mission Oracle state and successfully verifies the persisted readback.

## P10 — Step-limit evidence context

The existing `observeStepLimitImprovementCandidate` host path now consumes this bounded context before constructing its OBSERVED event, workflow candidate identity and CANDIDATE correlation event. This adds no new runtime collection: request/resume call sites remain unchanged, so only identities already supplied by the host are normalized.

`stepLimitEvidenceContext.ts` normalizes the host-owned `tool_call_limit` signal into a bounded `native_step_limit` context. Trace and response-message identity are required because they identify the host observation; task, producer, native tool-call, tool name, checker agent, run and thread identities remain optional and are preserved only when explicitly supplied.

The context never derives one identity from another and contains no raw output, tool arguments, artifacts, reasoning, confidence, Oracle verdict, authorization or publication state. It remains a correlation boundary only, and the existing step-limit candidate host path consumes it directly before constructing the durable candidate and MTO correlation observations.

## P10 — Improvement evidence context

`improvementEvidenceContext.ts` builds a bounded `native_tool_end` observation context from explicit host-owned identities only. Tool call, tool name and producer identity are mandatory; task, trace, run, thread and checker identities remain separate optional dimensions and are omitted when unavailable rather than inferred from another identifier.

The context contains no raw tool output, arguments, artifacts, confidence, verdict, authorization, publication status or reasoning. It does not invoke Oracle, persistence, Policy/Auth, the Task Engine or runtime mutation, and is intentionally dormant until consumed through the already-tested host evidence seam.

## P10 — Independent evidence contract

`evidence.ts` adds a pure normalization boundary for source-addressed Oracle evidence. It accepts only explicit host-supplied provenance and classifies evidence as independent when it is neither producer-declared nor attributed to the producing agent. Callers may require independence, in which case producer evidence and same-producer model/tool evidence fail closed.

This contract does not discover evidence, execute tools, call models, invoke Oracle, authorize work, publish improvements, persist lifecycle state, create tasks, or mutate runtime state. It normalizes already-existing provenance into the native `OracleEvidence` shape. The mission Oracle path now consumes this boundary for structured `native_tool_end` observations after explicit criterion/value binding; this production wiring does not make the pure contract authoritative.

## P10 — Tool evidence intent contract

`toolEvidenceIntent.ts` resolves only explicit host-owned declarations that bind an exact tool name to an Oracle criterion and expected scalar value. It returns no evidence semantics for undeclared tools and fails closed when multiple declarations make the mapping ambiguous.

The contract does not inspect or interpret raw tool output, tool arguments, artifacts, model text, confidence or producer instructions. It therefore cannot promote arbitrary tool output into trusted evidence. `resolveToolEvidenceIntent` is now called by the production `tool-end` callback when explicit mission evidence declarations are present; undeclared or ambiguous tool semantics remain fail-closed.

## P10 — Native tool evidence adapter

`toolEvidence.ts` maps already-observed native tool provenance into the P10 evidence contract. It preserves the native `tool_call_id`, optional native run identity and the tool/checker agent identity when the host already has them. It never derives those identities from trace, candidate, message or response identifiers.

The adapter does not interpret raw tool output, infer a criterion, infer an evidence value, execute a tool, persist evidence, invoke Oracle, authorize work, publish an improvement, create a task or mutate runtime state. Tool provenance is independent only when the native tool has a known checker agent distinct from the producer; a missing checker or same-producer tool remains non-independent. Source-addressed evidence retains its separate host provenance contract. `createNativeToolEvidence` is now called by the production mission Oracle promotion path for already-bounded `native_tool_end` observations; missing checker or same-producer evidence still remains non-independent.

## P10 — Optional tool-end observation hook

`createToolEndCallback` now exposes an optional `improvementEvidenceCallback` observation boundary before its artifact-only early return. The hook receives the already-produced native tool-end `data` and `metadata`; existing callers do not provide the hook, so normal LibreChat behavior is unchanged.

The boundary is observation-only. It does not interpret output, invoke Oracle, persist evidence, authorize actions, publish improvements, create or settle tasks, or mutate tool execution. Hook failure propagates rather than manufacturing evidence. No production caller configures the hook yet.

## P10 — Host tool-end evidence seam

The host seam now normalizes native identities through `createImprovementEvidenceContext` before composing Distill input. Trace and thread identity remain bounded observation context and are not promoted into Oracle, authorization or publication fields. Raw tool content, input and artifacts still do not cross the seam.

The server helper `api/server/services/Endpoints/agents/improvementToolEvidence.js` is the first host-owned bridge from an already-observed native LibreChat tool-end event into the pure P10 evidence chain. It reads only the native tool name and `tool_call_id`, plus optional `run_id` and `executingAgentId` metadata, and combines them with explicitly supplied Task Engine, producer, candidate and declaration context.

The helper deliberately drops raw tool content, artifacts, arguments, thread metadata and unrelated callback metadata. Missing native tool identity fails closed; missing checker/run identity is not invented. The helper does not execute tools, invoke Oracle, authorize, persist, publish, settle tasks or mutate runtime state. It currently has no production caller and therefore remains dormant pending a separately tested opt-in callback wiring boundary.

## P10 — Tool evidence to Distill composition

`toolEvidenceDistill.ts` composes three already-proven pure contracts: explicit host tool semantics, native tool provenance, and the bounded Distill request. Undeclared tools return `NO_DECLARATION`; unsupported Distill criteria fail closed. Same-producer evidence is preserved as non-independent rather than promoted.

This composition does not execute a tool, inspect raw tool output, call Oracle, authorize work, persist lifecycle state, publish an improvement, create or settle a task, or mutate runtime state. It is exported but intentionally unwired in production until a host-owned runtime seam can supply the native task, producer/checker and declaration context explicitly.

## P10 — Bounded child tool completion observation

`SubagentThreadTaskStore` can optionally project a native child `run_step_completed` event into `taskId`, `toolCallId`, tool name and executing agent identity. It takes the task ID from the store runtime and the call ID from the SDK event; for graph children it omits the synthetic graph subject when the executing member is unknown. Raw arguments, output and artifacts are discarded before the observer runs. Observer errors do not change task settlement. The production store now routes this observer to a bounded MTO log when a native trace exists. This is provenance metadata, not an Oracle criterion/value or verification result. The SDK does not forward a direct child `TOOL_END` callback to the host.

## P10 — Distill validation boundary

`distill.ts` prepares a bounded, host-owned `OracleInput` for an `ImprovementCandidate`. It copies only candidate identity, target, `CANDIDATE` status, trace identity and explicitly supplied source-addressed evidence; improvement prose, aggregate signals, source observations and reasoning are not copied into the validation request. Evidence referring to an unsupported Distill criterion fails closed.

Distill does not invoke Oracle, interpret a verdict, authorize or publish an improvement, persist state, schedule work, mutate the candidate, or grant execution authority. Oracle remains an independent downstream QA boundary, and any later publication still requires the existing Policy/Auth and native publication contract.

## P10 — Improvement disposition boundary

`disposition.ts` converts a completed Oracle result into a bounded, host-owned improvement disposition. It validates that the terminal Oracle phase, verdict status and decision agree before interpreting the result. The disposition copies only candidate/trace identity, target, publication-path metadata and the Oracle decision; it does not copy candidate prose, Oracle evidence, reasons or reasoning.

Oracle `ACCEPT` remains QA conformance rather than execution authority. An accepted `skill` candidate becomes `AUTHORIZATION_REQUIRED` and must still pass the existing Policy/Auth and native skill-authoring contract before any create/update action. Accepted `agent`, `workflow` and `specialist` candidates remain `PROPOSAL_ONLY`. Oracle `REJECT`, `DEFER` and `REQUEST_HUMAN_REVIEW` map to fail-closed dispositions and never become publishable.

This boundary always returns `authorized: false` and `publishable: false`. It does not authorize, publish, persist, schedule, mutate runtime state, settle tasks or turn an Oracle verdict into permission.

## P10 improvement authorization boundary

The self-improvement path remains proposal-first and fail-closed.

For accepted skill-update candidates, authorization is composed through bounded host-owned contracts:

1. `createImprovementAuthorizationRequest` creates an authorization request and grants no authority by itself.
2. `evaluateNativeSkillUpdatePolicy` requires the native `SKILLS` capability gate (`USE` + `CREATE`) before resource authorization.
3. `evaluateNativeSkillAuthorization` delegates the resource-level `skill` `EDIT` decision through an injected native permission checker.
4. `resolveImprovementAuthorization` maps the native authorization evidence to the bounded result.
5. `authorizeImprovementPublication` only composes these stages; it does not own ACL policy or mutate skills.

Controlled P10 Skill creation now uses LibreChat's native creation seam under the same governed publication boundary. The request-backed path proves native `SKILLS USE+CREATE` authorization, persists exact approval and authorization receipts, allocates a deterministic Skill ID durably before mutation, invokes native creation with that exact ID, requires the atomic `lastImprovementMutation` create receipt bound to candidate and payload, proves OWNER ACL, and records `COMMITTED`. Replay uses the durable allocation plus exact native receipt to repair missing OWNER ACL and/or `COMMITTED` only; conflicting or mismatched native state fails closed.

## P10 — Governed Self-Improvement Capability

P10 is a governed BOT MODE capability for proposing, validating, authorizing, and applying bounded improvements. It is not a runtime, scheduler, task engine, authority source, or autonomous self-modification loop.

### Architectural placement

P10 belongs to the Decision Layer and governance path:

```text
OBSERVATION
 -> ImprovementCandidate
 -> DistillValidationRequest
 -> Oracle verification
 -> ImprovementDisposition
 -> Policy / native authorization
 -> controlled publication boundary
 -> native LibreChat mutation primitive
```

Execution authority remains outside P10. The native Task Engine owns execution identity, ownership, leases, retry/recovery, cancellation, settlement, dependencies, concurrency, and idempotence. Native LibreChat authorization remains the authority for resource mutation. Oracle verifies evidence and never grants execution authority. MTO observes and correlates the chain and never becomes an authority.

### Authority invariants

- An ImprovementCandidate is a proposal, never an authorization or executable task.
- Oracle `ACCEPT` may only produce a bounded disposition such as `AUTHORIZATION_REQUIRED`; it cannot authorize or publish an improvement.
- Improvement authorization requests start with `authorized: false` and `publishable: false`.
- Skill publication requires the native capability and resource authorization seams.
- Publication revalidates the exact authorized payload digest and candidate, trace, actor, operation, skill and version identities before the native mutation call. It applies the same skill content inspection used by native `PATCH /skills`, including bounded traversal, before invoking `updateSkill`. The update object must contain at least one field from the native PATCH allowlist; internal source metadata and derived fields cannot be supplied to the P10 publication primitive.
- Native optimistic concurrency remains authoritative through `expectedVersion`; `conflict` and `not_found` are preserved as native results.
- Durable ImprovementCandidate and ImprovementLifecycleEvent stores are persistence-only and cannot validate, authorize, schedule, execute, publish, or settle work.
- P10 must not create a second runtime, orchestrator, task engine, scheduler, permission system, durable authority, or source of truth.
- Controlled improvement Skill creation is now enabled only through the governed request-backed CREATE path: exact human approval and native authorization are followed by a durable deterministic `ALLOCATED` receipt bound to the candidate, trace, payload and snapshot before any native mutation. Native creation must then return the preallocated Skill ID with the exact candidate/payload-bound create receipt, OWNER ACL must be proven, and only then may `COMMITTED` be recorded. Recovery fails closed on any allocation/native receipt mismatch and repairs only missing OWNER ACL or `COMMITTED` observation without recreating the Skill.

### MTO mapping

P10 participates in the operational trace without owning it:

| MTO stage     | P10 responsibility                                                      |
| ------------- | ----------------------------------------------------------------------- |
| OBSERVATION   | bounded improvement signals and provenance references                   |
| EVIDENCE      | referenced observations and independent Oracle evidence                 |
| DECISION      | candidate formation and disposition only                                |
| POLICY        | host/native policy evaluation outside persistence                       |
| AUTHORIZATION | native authorization result, distinct from Oracle verification          |
| TASK          | native Task Engine identity; never synthesized from trace/candidate IDs |
| ACTION        | native LibreChat mutation primitive only after authorization            |
| VERIFICATION  | independent Oracle result                                               |
| DURABLE       | immutable candidate snapshot plus append-only lifecycle events          |
| RESULT        | native effect result such as updated/conflict/not_found                 |

MTO event identity remains observational. P10 may correlate events such as `CANDIDATE`, `VALIDATING`, `VERIFIED`, `REJECTED`, `HUMAN_APPROVAL_REQUIRED`, `AUTHORIZED`, `DENIED`, `COMMITTED`, and `PUBLISHED`, but emitting or persisting such an event does not itself cause the next stage.

### Identity separation

The following identities are intentionally distinct and must not be substituted for one another:

- `traceId`: MTO trace correlation.
- `traceEventId`: one MTO event identity.
- `candidateId`: immutable improvement proposal identity.
- `taskId`: real native Task Engine execution identity.
- `decisionId`: decision record identity when/where the Decision Layer produces one.
- `authorizationId`: authorization record identity when/where the authorization layer produces one.
- `actorId`: principal requesting or performing the authorized native operation.
- `skillId` plus `expectedVersion`: native resource identity and optimistic concurrency boundary.
- `payloadDigest`: exact content binding for a skill improvement payload.

In particular, P10 must never manufacture a Task Engine identity from `traceId`, `candidateId`, response/message IDs, run IDs, or event IDs.

### Lifecycle states

The durable/trace vocabulary may represent:

`CANDIDATE -> VALIDATING -> VERIFIED | REJECTED | UNKNOWN | HUMAN_REVIEW -> AUTHORIZATION_REQUIRED -> AUTHORIZED | DENIED -> COMMITTED / PUBLISHED`

These states are descriptive records of progression. They do not imply that each transition is currently wired in production and they do not grant authority by themselves.

### Current activation boundary

P10 improvement activation creates durable proposal-only candidates after persisted `tool_call_limit` terminal responses, including detached child tasks when the SDK reports its typed native graph limit and the host has a trace and durable child failure row. The child candidate ID incorporates the SDK task store’s real `taskId`; its MTO event carries that identity. An ordinary error, missing trace, cancellation, or failed durable write cannot create this child observation. P12 authorization observations described below are separate host records and do not advance a candidate. For a matching native child step limit with a known producer, the host now runs bounded Distill and deterministic Oracle QA after durable candidate persistence and records `VALIDATING`, the terminal verdict, and `PROPOSAL_ONLY` in the existing lifecycle store. Authorization and controlled native skill publication now have production callers through the request-backed review path; successful native updates and governed creates persist a COMMITTED lifecycle event and emit a best-effort, non-authoritative MTO COMMITTED observation. PUBLISHED remains an observational vocabulary term and is not manufactured as a separate durable lifecycle state without a distinct native publication effect.

This is deliberate. The top-level candidate seam does not currently expose a proven native Task Engine `taskId`. Event-actor deliveries instead carry an idempotency identity named `eventActorTaskId` in MTO; it must not populate the native `taskId` field. The request and HITL-resume candidate observations preserve that distinction. Therefore P10 must remain fail-closed and must not invoke Distill or synthesize an execution identity. The detached child seam provides a real `taskId` for correlation. For a single-agent child, the host also captures the producer agent ID from the matching native root `start` update; it omits this identity when that update is absent or mismatched and for graph children, whose root subject is a synthetic graph label. This identity is projected into MTO candidate observations only. The adapter and deterministic Oracle now both reject an unattributed tool call as independent evidence. A pure candidate-to-Distill-to-Oracle test demonstrates UNKNOWN without a checker and VERIFIED with an explicitly distinct checker. The typed host step-limit signal and confirmed durable failure row supply a bounded `workflow` source check for the child validation path; this verifies proposal metadata only. The production child path remains fail-closed when no host-owned skill test plan is configured. When a valid BOT_MODE_SKILL_TEST_PLANS entry exists for the target skill, the production path can run host tests and independent Oracle validation, but publication still requires exact human review and native authorization before the optimistic-versioned skill update.

### V6.1 integration sequence

1. Observe and persist bounded candidates without side effects.
2. Correlate candidates and future lifecycle records through MTO without making MTO authoritative.
3. Accept a real native Task Engine `taskId` and producer identity at the Distill boundary; never invent them.
4. Validate through the independent Oracle using criterion-bound evidence.
5. Produce a bounded disposition; Oracle acceptance is not authorization.
6. Evaluate native policy/capability/resource authorization.
7. Apply the exact authorized payload through the native mutation primitive with optimistic versioning.
8. Record bounded lifecycle/MTO evidence of the effect without using those records to manufacture authority.
9. Preserve native recovery, idempotence, checkpoint, and settlement semantics when runtime activation is introduced. Skill improvement publication now proves the native recovery/idempotence slice for both UPDATE and governed CREATE. UPDATE stores an internal `lastImprovementMutation` receipt atomically with the version bump, bound to `candidateId`, `payloadDigest`, and `expectedVersion`; replay repairs only missing `COMMITTED` after proving the exact approved/authorized receipt and native version/receipt. CREATE persists an exact `AUTHORIZED` receipt, then a deterministic `ALLOCATED` receipt whose `eventId`, `candidateId`, `traceId`, payload/snapshot digests and Skill ID are revalidated before mutation. Native creation must return version 1 at that exact ID with `lastImprovementMutation.operation = create` bound to the same candidate and payload. Replay never recreates a proven existing Skill: it may only repair missing OWNER ACL and/or `COMMITTED`; any mismatched allocation, native receipt or conflicting Skill state fails closed. MTO remains best-effort observation only.

Steps 3 through 9 now have bounded production call paths and proof for the governed Skill-improvement publication slice. This does not make P10 an autonomous self-improvement loop: candidate generation remains bounded, Oracle acceptance is not authorization, human review and native policy remain authoritative, and broader runtime checkpoint/settlement recovery semantics remain owned by their native subsystems.

## P11 — Decision record boundary

`createDecisionRecord(...)` validates a host-supplied decision: required identities,
question, provider, unique non-empty options, selected option membership, and
confidence/threshold values between zero and one. It copies only declared fields;
unknown properties are discarded. The host supplies the decision context and time.

`fromDecisionRecord(...)` emits a host `DECIDED` MTO observation with the host's
trace event identity and bounded metadata (decision ID, selected option, provider,
optional confidence). It does not include the question, option descriptions,
objective, policy context, reasoning, credentials, or executable bindings.

The existing `DecisionProvider` in `routing.ts` may rank only admissible,
authorized candidates. A caller may create a decision record after that ranking;
this contract does not execute a provider or automatically wire routing into
`createRun`. Policy, authorization, Task Engine settlement, and Oracle validation
remain with their existing owners.

A decision record may include an optional probability distribution. It must
contain exactly one entry per declared option, each probability must be finite
and between zero and one, and the total must equal one within numeric tolerance.
The record copies the entries; MTO deliberately omits the distribution.

## P12 — Authorization observation record

`createAuthorizationRecord(...)` copies and validates an outcome supplied by the
host: distinct authorization and trace identities, actor, capability, scope,
policy version, decision, and timestamp. Optional task identity, duration,
conditions, and human review reference are validated and copied. Unknown fields
are discarded. This record is not an authorization token or a policy evaluator.

`fromAuthorizationRecord(...)` maps `ALLOW`, `DENY`, and
`HUMAN_APPROVAL_REQUIRED` to bounded host MTO observations. The event contains
only authorization ID, decision, capability, and policy version; it excludes
actor, scope, conditions, approval reference, and any executable payload. Native
ACL/capability checks and human approval remain authoritative. Neither this
record nor its MTO event can grant permission, execute a tool, or settle a task.

The resumable agent host observes native `canEditSkill` EDIT ACL and
`canCreateSkill` SKILLS USE+CREATE capability outcomes at skill file operations.
Each wrapper delegates its native check once, then records `ALLOW` or `DENY`
under the authenticated owner, resolved tenant and generation MTO trace. Its
policy version identifies the host check profile, not mutable ACL entries. A
failed observation does not change the native verdict or prove a mutation
succeeded. P10 skill-improvement publication now reuses these same wrappers around
the request-backed native capability and EDIT checks, so each native check still
runs once while its ALLOW or DENY outcome is observed under the candidate trace.
This P12 observation remains non-authoritative and does not replace the durable P10
AUTHORIZED lifecycle receipt required before mutation.

The host MTO logging sink projects the scalar P11/P12 payload fields only for
`DECIDED`, `AUTHORIZED`, `DENIED`, and `HUMAN_APPROVAL_REQUIRED`. It rejects
malformed identities, decisions, values, and oversized text fields. Other host
observations, including `CANDIDATE`, remain payload-free in logs. The sink is
stateless and does not provide durable provenance or execution authority.

The `MtoObservation` data-schemas store now supplies an owner and tenant scoped,
append-only contract for four bounded host decision and authorization events.
Exact writes replay; changed content under the same trace event identity raises
an explicit conflict. Trace reads use a bounded `(timestamp, traceEventId)` page
cursor. The skill EDIT and CREATE wrappers write bounded authorization results directly
to this store before sending them to the logging sink. After the native
`tool_approval` pause persistence barrier releases, the request and resume
controllers record `HUMAN_APPROVAL_REQUIRED` with an action-scoped, replay-stable
identity. An `ask_user_question` pause does not imply tool authorization. This
record is evidence of an approval requirement, not an approval or an executable
permission. A configured host OpenRouter model selection now records DECIDED;
other decision producers remain unconnected. The global logging sink stays stateless.

The host logging projection also validates native subagent and Oracle fields at
every nested boundary: activity labels and identities are bounded strings,
usage contains only nonnegative token counters, and Oracle validator, reason
codes and uncertainty are reduced to bounded scalar metadata. Unexpected
nested values are omitted before logging.

### Host P11 model selection

An operator may set `endpoints.agents.hostModelRouting` in `librechat.yaml` for a saved agent. The legacy OpenRouter form remains supported:

```yaml
endpoints:
  agents:
    hostModelRouting:
      - agentId: agent_example
        models: [current-model:free, alternate-model:free]
        preferredModel: alternate-model:free
```

Explicit multi-provider routing uses bounded non-secret bindings:

```yaml
endpoints:
  agents:
    hostModelRouting:
      - agentId: agent_example
        bindings:
          - id: primary
            provider: OpenRouter
            model: current-model:free
          - id: anthropic-alt
            provider: anthropic
            model: claude-sonnet
        preferredBindingId: anthropic-alt
```

The first binding must match the saved agent provider/model. Configuration carries only binding ID, provider and model; credentials and resolved runtime client options are not accepted there. The native host validates and separately initializes every alternative before selection. Cross-provider alternatives receive provider-specific model parameters instead of inheriting primary-provider parameters. Failed native validation or failed durable provenance stops the configured run. The same authorization, validation and initialization path runs again on resume. A selected binding's resolved context, pricing metadata and tool configuration travel together; resolved `maxContextTokens` is exposed to routing as `contextWindow`.

`routingMode: static` preserves an explicitly preferred authorized binding. `routingMode: adaptive` uses the same generic router and may rank admissible bindings by freshness, spend policy, quality/Oracle/benchmark signals, observed reliability, optional cache reuse, estimated cost and latency. `free_only`, `free_first`, and `paid_allowed` remain admission/ranking policy rather than billing authority. Recent persisted routing receipts provide bounded host-observed latency, success/fallback and cache-read signals; no second telemetry ledger is created. `preferCached: true` is opt-in and cache reuse is only a tie-breaker after quality and health. When `allowFailover` is enabled, SDK fallbacks contain only already resolved/authorized bindings and retry only under the configured bounded failure policy. Without host routing configuration, agent initialization is unchanged.

For an opted-in P11 response, `message.metadata.hostModelUsage` links the durable `decisionId` and `traceId` to up to 16 primary model-end usage events for authorized provider/model bindings. Each event keeps bounded provider/model identity, token counts, cost when known, observed latency, and normalized prompt-cache read/write counters; subagent, summary and label usage are excluded. Selected and resolved provider/model identities remain separate so fallback and mismatches are visible. The public BOT MODE project projection retains the bounded `traceId`/`decisionId` correlation plus aggregate cost/latency/cache values, while credentials, client options and secret-bearing bindings remain private. This is host execution evidence, not an independent provider attestation.

The P11 projection also matches each primary usage event to the selected agent ID. The model-end handler carries that ID into the server-side usage collector; the SSE payload does not expose it. Calls from connected agents are excluded even if they have the same provider and an untagged primary usage type. Missing producer identity yields no P11 model-call evidence.

## P13 — Project subagent task control panel

Status: **CLOSED**.

P13 exposes the existing durable subagent task-control path in the Project workspace without
introducing a second runtime, scheduler, task store, or authorization boundary. The project panel
queries each conversation through the existing parent-subagent index and addresses pause/resume
commands with the existing durable `taskId`, `threadId`, parent conversation identity, and a fresh
invocation identity. Terminal children do not gain new controls, and a project conversation without
an identity is not queried.

The UI implementation is split deliberately: `BotModeProjectPanel.tsx` owns only project-level
projection and invocation of the existing control mutation, while `ProjectWorkspace.tsx` mounts that
panel in the native Project surface. Existing subagent status labels and pause/resume controls are
reused rather than duplicated into a new control authority.

Closure proof:

- `ab821dd` adds the project subagent task control panel and its isolated-addressing test.
- `e2c3f4c` mounts the panel in the Project workspace and adds the BOT MODE activity label.
- targeted Jest sentinel passes with coverage disabled:
  `npx jest src/components/Projects/BotModeProjectPanel.test.tsx --runInBand --coverage=false`.
- targeted ESLint passes for the panel, its test, and `ProjectWorkspace.tsx`.

P13 is therefore closed. Reopen it only on regression evidence affecting project-level subagent task
visibility, addressing, or use of the existing durable control path.

## V6.1 capability and media closure

BOT MODE uses one `CapabilityResourceRegistry` and one generic authorized-resource router. Registry entries are descriptive only: an enabled descriptor still becomes routable only after an explicit host resolver returns an authorized candidate. Capability routing therefore fails closed when no authorized resource is available and does not create a second permission or execution authority.

The stable media capability vocabulary is `image.generate`, `image.edit`, `video.generate`, `voice.generate`, `audio.generate`, `music.generate`, `avatar.generate`, `3d.generate`, and `live.compose`. Provider bindings are separate from that vocabulary. OpenAI/Gemini image tools and configured Higgsfield resources are represented by governed bindings; ElevenLabs, MiniMax, LTX and Tripo entries remain templates until their runtime/auth is verified. `music.generate` and `live.compose` are valid architectural capabilities but intentionally have no provider marked available yet.

Hardware engineering is separate from media generation. The `hardware:openblueprint` extension declares `hardware.design`, BOM, wiring, assembly and build-instruction capabilities but is disabled by default. Until a real CAD/hardware runtime passes host admission and authorization, routing `hardware.design` remains fail-closed. 3D asset generation stays in the media pipeline and does not imply hardware-design authority.

## FAST current-state resolution

BOT MODE exposes `current_state` as a standard LibreChat built-in tool. It is declared in the tool manifest, loaded through the normal built-in tool path, and attached explicitly to the persisted BOT MODE Worker alongside `web_search`; availability no longer depends on a FAST request hint or ToolService injection.

The resolver remains under the existing Capability Router. `time.current` routes to `native:runtime-clock`; `location.resolve` and `weather.current` route to `external:open-meteo-current-state`. The Open-Meteo adapter uses bounded HTTP timeouts, a 24-hour geocoding cache, a 5-minute weather cache, and a freshness gate. Its current weather payload is labeled `model-current` rather than as a station observation. A stale or failed structured result returns `fallbackRequired: true`, at which point `web_search` may resolve only the missing or stale fact.

The tool returns the selected capability resource IDs, IANA timezone, authoritative runtime instant, UTC offset, localized wall-clock time, weather-data timestamp, freshness, human-readable WMO condition, and public provider provenance. When `ok: true`, the model is instructed not to perform a supplementary web search merely to add a second source.
