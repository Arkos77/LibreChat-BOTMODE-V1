# BOT MODE extensions

These extensions add governed capability contracts around the existing BOT MODE authorities.
They do not create an orchestrator, task engine, scheduler, durable owner, decision layer,
policy layer, or alternative source of truth.

## Included packs

- `memory:hindsight` — retain/recall/reflect and provenance-backed knowledge.
- `qa:artifact-drift` — deterministic artifact integrity and drift checks.
- `media:audio-voice` — audio/voice/transcription/dubbing capability contract.
- `hardware:openblueprint` — hardware design/BOM/wiring/assembly contract; disabled until a real governed runtime is admitted.
- `opportunity:economic-enablement` — jobs, product testing, hospitality and sourcing.
- six vertical packs — Finance, Immobilier, Achats PME, Conciergerie, Automobile,
  Hospitality Intelligence.

All builtin packs are disabled by default. The existing `CapabilityResourceRegistry`
exposes them descriptively. Actual activation still requires host capability evaluation,
Policy/Auth, provider resolution and the existing task/router pipeline.

## Discovery seeds

`extensionCatalog.ts` also retains external discovery references such as Public APIs,
provider-routing references, hosting catalogs, CLI-Anything, and vertical references.
Seeds are not providers and never grant authorization.
