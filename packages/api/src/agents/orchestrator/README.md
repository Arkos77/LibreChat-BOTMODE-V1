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

The initial adapters normalize metadata from bounded `SubagentUpdateEvent`, `SubagentUsageEvent`, and Oracle events. They are observation-only: they cannot authorize work, settle a task, publish a skill, mutate memory, or convert Oracle `ACCEPT` into execution authority. Activity `data`, raw Oracle candidates, evidence values, and reasoning content are deliberately excluded from MTO payloads; only bounded lifecycle, identity, usage, validator and reason metadata is retained. Production wiring and durable trace persistence remain explicitly out of scope for this MVP until their host-owned seams are proven separately.

## P10 — controlled improvement candidate

`improvement.ts` adds the next pure P10 boundary: deterministic pattern summaries over sanitized MTO metadata and a host-owned `ImprovementCandidate`. It adds no persistence, scheduler, task engine, memory write, runtime mutation or publication side effect. Candidates retain trace-event references and aggregate signals rather than copying source events, raw Oracle candidates, evidence values or reasoning.

The candidate is always born in `CANDIDATE` state. Oracle verification and authorization remain mandatory before any later publication step, and Oracle acceptance is not authorization. `skill` is currently the only target with a proven native publication path, so its disposition is `native-skill-authoring-required`; actual create/update must still go through LibreChat's existing skill-authoring authorization, ownership and optimistic-version contract. `agent`, `workflow` and `specialist` remain `proposal-only` until equivalent native fail-closed publication contracts are proven.

## P10 — Transient tool evidence buffer

The agents `initializeClient` path now creates one isolated transient evidence buffer per initialization and returns it alongside the native client context. The buffer remains dormant: this seam does not pass it to tool-end callbacks, request settlement, MTO, Oracle, persistence, authorization or publication.

`transientEvidenceBuffer.ts` defines a request/run-local, in-memory and bounded observation buffer for native tool-end evidence. It preserves explicit native identity plus optional declared criterion/value only, deduplicates by the pair (`taskId`, native `toolCallId`) when task identity is available, evicts the oldest entry when capacity is reached, and supports defensive snapshot, atomic consume and clear operations.

The buffer is not durable state and has no authority: it contains no raw tool output, arguments, artifacts, reasoning, confidence, Oracle verdict, authorization or publication state. It is intentionally dormant until a dedicated host integration proves the lifecycle and declaration source.

## P10 — Step-limit evidence context

The existing `observeStepLimitImprovementCandidate` host path now consumes this bounded context before constructing its OBSERVED event, workflow candidate identity and CANDIDATE correlation event. This adds no new runtime collection: request/resume call sites remain unchanged, so only identities already supplied by the host are normalized.

`stepLimitEvidenceContext.ts` normalizes the host-owned `tool_call_limit` signal into a bounded `native_step_limit` context. Trace and response-message identity are required because they identify the host observation; task, producer, native tool-call, tool name, checker agent, run and thread identities remain optional and are preserved only when explicitly supplied.

The context never derives one identity from another and contains no raw output, tool arguments, artifacts, reasoning, confidence, Oracle verdict, authorization or publication state. It is a correlation boundary only and remains dormant until explicitly consumed by the existing step-limit candidate host path.

## P10 — Improvement evidence context

`improvementEvidenceContext.ts` builds a bounded `native_tool_end` observation context from explicit host-owned identities only. Tool call, tool name and producer identity are mandatory; task, trace, run, thread and checker identities remain separate optional dimensions and are omitted when unavailable rather than inferred from another identifier.

The context contains no raw tool output, arguments, artifacts, confidence, verdict, authorization, publication status or reasoning. It does not invoke Oracle, persistence, Policy/Auth, the Task Engine or runtime mutation, and is intentionally dormant until consumed through the already-tested host evidence seam.

## P10 — Independent evidence contract

`evidence.ts` adds a pure normalization boundary for source-addressed Oracle evidence. It accepts only explicit host-supplied provenance and classifies evidence as independent when it is neither producer-declared nor attributed to the producing agent. Callers may require independence, in which case producer evidence and same-producer model/tool evidence fail closed.

This contract does not discover evidence, execute tools, call models, invoke Oracle, authorize work, publish improvements, persist lifecycle state, create tasks, or mutate runtime state. It only normalizes already-existing provenance into the native `OracleEvidence` shape. Production evidence collection and Distill activation remain dormant until a real native tool/source/artifact provenance seam is proven.

## P10 — Tool evidence intent contract

`toolEvidenceIntent.ts` resolves only explicit host-owned declarations that bind an exact tool name to an Oracle criterion and expected scalar value. It returns no evidence semantics for undeclared tools and fails closed when multiple declarations make the mapping ambiguous.

The contract does not inspect or interpret raw tool output, tool arguments, artifacts, model text, confidence or producer instructions. It therefore cannot promote arbitrary tool output into trusted evidence. It only supplies the host-declared semantic binding later consumed by the native tool evidence adapter. The contract is exported but intentionally has no production caller yet.

## P10 — Native tool evidence adapter

`toolEvidence.ts` maps already-observed native tool provenance into the P10 evidence contract. It preserves the native `tool_call_id`, optional native run identity and the tool/checker agent identity when the host already has them. It never derives those identities from trace, candidate, message or response identifiers.

The adapter does not interpret raw tool output, infer a criterion, infer an evidence value, execute a tool, persist evidence, invoke Oracle, authorize work, publish an improvement, create a task or mutate runtime state. Tool provenance is independent only when the native tool has a known checker agent distinct from the producer; a missing checker or same-producer tool remains non-independent. Source-addressed evidence retains its separate host provenance contract. The adapter is exported but intentionally has no production caller yet; wiring remains dormant until the host seam can supply criterion/value semantics and native producer/checker identity without inference.

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

`SubagentThreadTaskStore` can optionally project a native child `run_step_completed` event into `taskId`, `toolCallId`, tool name and executing agent identity. It takes the task ID from the store runtime and the call ID from the SDK event; for graph children it omits the synthetic graph subject when the executing member is unknown. Raw arguments, output and artifacts are discarded before the observer runs. Observer errors do not change task settlement. The production store does not configure this optional observer yet. This is provenance metadata, not an Oracle criterion/value or verification result. The SDK does not forward a direct child `TOOL_END` callback to the host.

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

Skill creation remains closed until its native create-policy seam is explicitly proven. The authorization slice does not call skill mutation methods, persist improvement content, schedule work, or convert Oracle acceptance into execution authority.

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
- Publication revalidates the exact authorized payload digest before the native mutation call.
- Native optimistic concurrency remains authoritative through `expectedVersion`; `conflict` and `not_found` are preserved as native results.
- Durable ImprovementCandidate and ImprovementLifecycleEvent stores are persistence-only and cannot validate, authorize, schedule, execute, publish, or settle work.
- P10 must not create a second runtime, orchestrator, task engine, scheduler, permission system, durable authority, or source of truth.
- Skill creation remains closed until a distinct native create-policy seam is proven.

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

P10 improvement activation creates durable proposal-only candidates after persisted `tool_call_limit` terminal responses, including detached child tasks when the SDK reports its typed native graph limit and the host has a trace and durable child failure row. The child candidate ID incorporates the SDK task store’s real `taskId`; its MTO event carries that identity. An ordinary error, missing trace, cancellation, or failed durable write cannot create this child observation. P12 authorization observations described below are separate host records and do not advance a candidate. Distill, lifecycle-event progression, authorization-to-publication orchestration, and controlled publication are not exposed through a production route or runtime caller.

This is deliberate. The top-level candidate seam does not currently expose a proven native Task Engine `taskId`. Event-actor deliveries instead carry an idempotency identity named `eventActorTaskId` in MTO; it must not populate the native `taskId` field. The request and HITL-resume candidate observations preserve that distinction. Therefore P10 must remain fail-closed and must not invoke Distill or synthesize an execution identity. The detached child seam provides a real `taskId` for correlation. For a single-agent child, the host also captures the producer agent ID from the matching native root `start` update; it omits this identity when that update is absent or mismatched and for graph children, whose root subject is a synthetic graph label. This identity is projected into MTO candidate observations only. The adapter and deterministic Oracle now both reject an unattributed tool call as independent evidence. A pure candidate-to-Distill-to-Oracle test demonstrates UNKNOWN without a checker and VERIFIED with an explicitly distinct checker. No production child path currently supplies a host-owned criterion declaration and independently verified tool evidence, so Distill and publication remain dormant.

### V6.1 integration sequence

1. Observe and persist bounded candidates without side effects.
2. Correlate candidates and future lifecycle records through MTO without making MTO authoritative.
3. Accept a real native Task Engine `taskId` and producer identity at the Distill boundary; never invent them.
4. Validate through the independent Oracle using criterion-bound evidence.
5. Produce a bounded disposition; Oracle acceptance is not authorization.
6. Evaluate native policy/capability/resource authorization.
7. Apply the exact authorized payload through the native mutation primitive with optimistic versioning.
8. Record bounded lifecycle/MTO evidence of the effect without using those records to manufacture authority.
9. Preserve native recovery, idempotence, checkpoint, and settlement semantics when runtime activation is introduced.

Until steps 3 through 9 have production call sites with proofs, P10 remains a governed dormant capability rather than an autonomous improvement loop.

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
succeeded. P10 improvement candidate publication remains unconnected.

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
permission. Other MTO sources and decision events remain unconnected; the
global logging sink itself stays stateless.

The host logging projection also validates native subagent and Oracle fields at
every nested boundary: activity labels and identities are bounded strings,
usage contains only nonnegative token counters, and Oracle validator, reason
codes and uncertainty are reduced to bounded scalar metadata. Unexpected
nested values are omitted before logging.
