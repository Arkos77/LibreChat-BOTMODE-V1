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

| MTO stage | P10 responsibility |
| --- | --- |
| OBSERVATION | bounded improvement signals and provenance references |
| EVIDENCE | referenced observations and independent Oracle evidence |
| DECISION | candidate formation and disposition only |
| POLICY | host/native policy evaluation outside persistence |
| AUTHORIZATION | native authorization result, distinct from Oracle verification |
| TASK | native Task Engine identity; never synthesized from trace/candidate IDs |
| ACTION | native LibreChat mutation primitive only after authorization |
| VERIFICATION | independent Oracle result |
| DURABLE | immutable candidate snapshot plus append-only lifecycle events |
| RESULT | native effect result such as updated/conflict/not_found |

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

The currently proven production activation is intentionally limited to durable candidate creation from the bounded top-level `tool_call_limit` seam after the terminal response has already been persisted. Distill, lifecycle-event progression, authorization-to-publication orchestration, and controlled publication are not exposed through a production route or runtime caller.

This is deliberate. The top-level candidate seam does not currently expose a proven native Task Engine `taskId`. Therefore P10 must remain fail-closed and must not invoke Distill or synthesize an execution identity. A future activation may cross from the Task Engine into P10 only when it can provide the real native `taskId`, the producer identity, and independently valid Oracle evidence while preserving the authority boundaries above.

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
