# Native Balance reservations

## Scope and accounting map

`Balance.tokenCredits` remains the authoritative available account balance.
`Transaction` and `spendTokens` record legacy metered usage after execution;
`checkBalance` performs a separate admission read. `updateBalance` uses CAS to
avoid lost balance writes, but does not reserve capacity before an effect.
`bulkWriteTransactions` also updates balance separately from transaction insertion.
No reservation or cross-document transaction is used by those paths.
The agent `stepBudget` limits tool rounds, not money.

`createBudgetReservationMethods` adds a fixed-cost reservation lifecycle to the
existing Balance document. It creates no collection, account, scheduler, policy,
provider adapter, or external endpoint. Reserve atomically decrements available
credits and appends its audit record; settlement changes that same record.
The reservation record is the durable evidence for these holds and settlements;
it is not also passed through legacy Transaction/spendTokens (which would double
charge). Existing legacy accounting is unchanged.

This is a **partial integration**, not a hard spending cap on all LibreChat
providers. Real metered provider calls still use post-hoc accounting. Direct and
event tests use a synthetic fixed-cost tool with the native host authorization
boundary and real Mongo reservations. They do not wire production providers.
Remote PTC/subagents have no budget integration added by this change.

## Units and admission

Native convention: 1,000 tokenCredits = USD 0.001. This API accepts only positive
safe integer tokenCredits and only reserves against a nonnegative safe integer
available balance. It performs no currency conversion, implicit rounding, or
migration. Legacy fractional balances continue to work in the legacy path and
are rejected by this opt-in API. Metered pricing multipliers are not a proven
upper bound on future cost and cannot be treated as one.

The database conditional update requires sufficient available credits, a new
reservation identity and room in the embedded ledger. Integer subtraction and
addition stay within Number.MAX_SAFE_INTEGER. Release also checks the current
balance representation and upper bound; an unsafe refund fails and keeps the hold.
No in-memory lock provides admission authority. Writes request majority
acknowledgement; deployment durability still depends on the Mongo configuration.

The trusted server supplies owner user/tenant, exact Balance `_id`, runId,
reservationId, amount and capability, plus optional mandateId for correlation.
Never construct these from model arguments, provider output or unvalidated HTTP
input. Tenant context must match explicit scope. The account query also matches
owner and tenant; settlement additionally matches runId. MandateId is correlation,
not a capability grant; native policy/mandate authorization must run first.

Reservation identity is `(balanceId, reservationId)`. Reusing it with a different
run, amount, capability or mandate is rejected. The atomic append predicate
prevents concurrent duplicates without a new unique index or migration.
`created: true` identifies the only fresh admission; `created: false` is an
idempotent retry result, **never permission to execute another effect**.

## Transitions

- Reserve: decrease available by the fixed amount; state `reserved`.
- Consume: state `consumed`, consumed amount recorded, no second decrease.
- Release: state `released`, full held amount restored once.
- Same terminal operation: return the existing record without mutation.
- Opposite late terminal operation: reject; no credit change.

Concurrent consume/release uses an atomic state predicate, so only one terminal
state wins. Amount is read from the stored hold, not settlement input. This API
consumes the fixed reservation whole; it does not estimate variable actual cost.
For admitted operations without external credits/debits, available + active holds

- consumed amounts remains the initial account capacity. Legacy refills/debits
  can change that capacity and are outside this opt-in admission guarantee.

The embedded ledger is bounded to 256 lifetime entries per Balance. Exhaustion
fails closed; existing settlement and retry remain available. Terminal entries
are not pruned, because deletion would erase durable idempotency evidence.
A future archival/reconciliation design is required for sustained use beyond
this bounded core. Do not silently drop entries or reset the ledger.

## Crash and recovery limits

- Reserve committed, no effect yet: hold survives. An ambiguous reserve retry
  cannot execute again. A trusted reconciliation decision may release once the
  absence of an external effect is established.
- Provider succeeded, consume not committed: hold remains unavailable; retrying
  consume is safe after independently establishing that outcome.
- Provider failed before any charge, release not committed: retry release.
- Effect outcome unknown: retain hold, do not automatically refund or repeat.

No TTL or timer releases money. Abandoned holds can retain capacity indefinitely.
There is no recovery worker or new Task Engine integration. A runId is ownership,
not a distributed effect fencing token. Database idempotency does not guarantee
exactly-once external effects or safely cancel an already-running provider call.
Provider idempotency/fencing and safe cost ceilings remain prerequisites for real
pre-effect integration. Old/stale settlement retries cannot override terminal
state, but callers must not release a hold merely because execution is slow.

## Evidence

`reservation.spec.ts` exercises real Mongo races, retry/terminal conflicts,
isolation, precision limits, bounded ledger, reconstruction and legacy debit
compatibility. `packages/api/src/agents/reservation.spec.ts` exercises synthetic
fixed-cost effects through native direct/event authorization, including budget
failure before effects, trusted pricing independent of model input, known failure
release, unknown failure hold retention, and concurrent native event runs.
