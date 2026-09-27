# BOT MODE — Durable MTO observation plan

Status: durable store implemented; native skill EDIT authorization observations active for traced resumable agent requests.

## Proven baseline

- The production host sink `mtoObservation.js` logs sanitized observations only.
- `ImprovementLifecycleEvent` is an existing append-only, owner-scoped Mongo pattern.
- MTO event identity is distinct from Task Engine, run, conversation and checkpoint identities.
- P9/P11 decision routing has no production caller with a resolved, authorized candidate pool.

## Initial durable contract

1. An MTO record is an observation, never a permission, task status, scheduler command, Oracle verdict or mutation trigger.
2. The host supplies authenticated `user`, optional `tenantId`, `traceId` and `traceEventId`. No identifier is inferred from another.
3. Unique key: `(user, tenantKey, traceId, traceEventId)`. Exact replay returns the existing record. Reuse with changed content raises an explicit conflict.
4. Store only a validated allowlist of event type, source, timestamp, native correlation identities, and bounded scalar metadata. Reject arbitrary nested payloads, reasoning, raw tool input/output, credentials and artifacts at the durable boundary.
5. Writes are append-only. Read access is scoped to the same user and tenant and returns a bounded page ordered by timestamp and event ID.
6. Host logging and durable writes are separate. An observational storage failure must not alter agent execution or Task Engine settlement. Do not enable production writes until the request owner and tenant are available on all emission and resume paths.
7. Use the existing `ImprovementLifecycleEvent` schema/methods as the structural pattern, without linking MTO events to improvement candidates or giving either store authority over the other.

## Proof sequence

- Tests first: exact replay, conflict, owner/tenant isolation, mutation rejection, malformed/secret payload rejection, bounded read and concurrent duplicate write.
- Implement model, schema, types and methods in `packages/data-schemas`; register through existing model/method factories.
- Run focused tests, neighboring persistence tests, data-schemas build, API build and lint hooks.
- Audit fresh request, resume and child-event host context before any opt-in production sink connection.

## État d'implémentation

Le contrat de stockage `MtoObservation` est implémenté dans `packages/data-schemas` :
validation stricte des quatre observations hôte DECIDED/AUTHORIZED/DENIED/
HUMAN_APPROVAL_REQUIRED, identité causale distincte, clé d'idempotence dans
le périmètre propriétaire/locataire/trace, reprise exacte ou conflit explicite,
registre append-only et lecture paginée par `(timestamp, traceEventId)`.
Le contrôle natif `canEditSkill` des requêtes agent traçables produit désormais
une observation durable AUTHORIZED ou DENIED, liée au propriétaire authentifié,
au locataire résolu et au `mtoTraceId` de la génération. Le sink global reste un
logger; les observations de décision, de validation humaine et les autres
sources MTO ne sont pas écrites durablement par ce raccordement.
