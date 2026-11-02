# BOT MODE V1 — PR #107 / 4C: durable child model execution

Date: 2026-10-30. Status: architectural decision; NOT a qualified implementation.
Scope: recovery of an original native delegated child while the LibreChat API is killed and restarted. The released v1.0.1 and existing model_only recovery remain unchanged.

## Observed failure (evidence)

Exact-HEAD CI 41099730554: normal two-child mission succeeds (two distinct Mongo child conversations, Oracle VERIFIED, one P6 publication); at the mid-flight SIGKILL, first child is completed and the second provider request is held. The API restarts with two linked children and only one terminal result. Redis and Mongo cannot synthesize the second provider reply, and there is no safe automated model replay.

The read-only cold child inventory on PR #107 verifies original tenant/parent/attempt and planned agent identities. It returns executionAuthorized=false. It is provenance, not an execution authorization.

## Decision: independent durable provider-call owner (API-SIGKILL tolerance)

A small optional provider execution broker, separate from the API process, should own the **original** model HTTP request before it is sent and persist its result. The API must not start a model HTTP call and subsequently transfer its ownership to a broker: that would leave the same unknown-outcome window.

Use the existing MongoDB as source of truth for immutable call identity and result, and Redis only for dispatch/notification and claims. Do not add a second LLM runtime or depend on CUDA. Restrict first integration to the CI mock provider with no paid requests, then qualify real supported providers separately.

### Durable protocol

1. **Prepare (API, before provider network I/O):** validate original authenticated mission, user/tenant, agent set, taskId, threadId, attemptKey, parentRunId and original provider/model configuration. Create a unique immutable `callKey` under an exact operation identity, with a canonical request digest, requested effect category `model_inference`, and generation/attempt owner. Store in Mongo with a unique key. Store no API key or raw prompt in the Redis queue.
2. **Claim (broker):** a single broker instance obtains an atomic owner token/lease for the *same* prepared call, then compares original configuration and approved budget/cost constraints. Recheck owner token before dispatch. A competing broker or a changed generation must not dispatch.
3. **Dispatch once:** write a durable `dispatched`/ambiguous-on-owner-loss marker **before** issuing the provider request. The broker, not the API, owns the provider connection and its streaming response across API restart. Once dispatched, a lost broker never causes automatic re-dispatch without a provider-supported idempotency/retrieval guarantee.
4. **Commit result:** broker writes the original provider result and usage to a private, scoped Mongo record with CAS on callKey, digest and ownership generation; then marks `result_committed`. Redis sends only a best-effort wakeup. Duplicated notifications are harmless; result is loaded from Mongo, not the event payload.
5. **Resume child and parent:** after API restart, recover the exact original child attempt, verify owner/tenant/agent ACLs and effect receipts, and inject the committed provider result into the **same** child's pending model continuation. Never recreate the user message or invoke a second provider call. Complete the original child Mongo receipt, then wake the original parent and enforce Oracle VERIFIED and the original P6 unique-publication barrier.
6. **Ambiguous state:** if no committed result exists after broker owner loss and the original request may have reached the provider, report `PROVIDER_OUTCOME_UNKNOWN`. Do not re-send automatically, claim success, persist synthetic child output, or publish P6.

### State machine (durable Mongo authority)

`prepared -> claimed -> dispatched -> result_committed -> child_settled -> parent_verified -> published`.

Possible refusals: `prepared/claimed -> cancelled_before_dispatch` only with positive proof that no HTTP dispatch occurred; `dispatched -> outcome_unknown` if broker ownership is lost with no authenticated result. `outcome_unknown` requires reconciliation from an independently authenticated provider receipt, or explicit human choice for a *new* execution; automatic replay is prohibited.

The Mongo unique key is (tenantId, userId, parentConversationId, parentRunId, childThreadId, taskId, attemptKey, callKey). Enforce one provider call per logical attempt; identities must come from the durable original mission, not current Redis conversation slots.

### Fault model and limits

This design can pass the PR #107 **API-only SIGKILL** test because the broker and provider request remain alive. It does NOT claim global exactly-once semantics across broker crash, Mongo loss, provider timeouts, or a provider that does not support idempotent retrieval. A lease is a concurrency fence, not proof that an earlier network call never happened.

OpenRouter has a generation-content lookup for some stored generations, but logging of prompts/completions is opt-in; a generation ID may also be missing after a crash before its acknowledgement is persisted. Thus neither that API nor response caching may be treated as a default replay proof. Do not enable content logging or purchase credits without user authorization.

### First implementation slices (not yet implemented)

- Broker interface and Mongo CAS receipt schema; offline atomic-claim and ambiguous-outcome tests.
- Optional CI broker process/container with mock provider: prove that the broker receives one original request, lives through SIGKILL of `api`, durably commits its output, and that API consumes the same receipt.
- Wire one already-supported model adapter, with exact original provider/model request digest and no changes to tool execution or `model_only` recovery.
- Resume a child only with a proven committed reply and original SDK child/parent identities; check original Oracle/P6 on integration.
- Keep delegated tool executions in `receipts_required` until every tool effect is separately authenticated, including ownership, payload digest, and private result.

### Required negative tests

Second broker concurrent claim; tenant/agent/ACL changes; child attempt mismatch; stale owner token; broker crash before dispatch vs after dispatch; provider completes but result write fails; duplicate notification; user deletion; missing/incomplete proof; concurrent API restart; repeated SIGKILL; provider rate limit; provider cost > authorized budget. All negative cases must avoid external re-dispatch and P6 publication.

### Exit criteria

`CI_PR107_COLD_MULTI_TWO_CHILD_REPLAY_SAFE=PASS`, `CI_PR107_COLD_MULTI_SINGLE_ORACLE_VERIFIED=PASS`, `CI_PR107_COLD_MULTI_SINGLE_P6_AFTER_SIGKILL=PASS`, no new user submission, exactly two child model calls including the one held across the API kill, no extra parent model final, Mongo/Redis identities unchanged. Static/backend/agents/Playwright only for impacted surfaces. Do not promote this draft until all criteria are demonstrated.

References:
- https://github.com/langchain-ai/langgraph/issues/9240
- https://openrouter.ai/docs/api/api-reference/generations/list-generation-content
- https://openrouter.ai/docs/guides/features/response-caching
- https://openrouter.ai/support
