# LibreChat BOTMODE V1

**LibreChat BOTMODE V1** is a multi-agent orchestration layer built on top of [LibreChat](https://github.com/danny-avila/LibreChat). It turns LibreChat into a governed workspace for durable missions, specialist agents, background work, RAG/memory, model routing, media capabilities, MCP tools, evidence collection, QA and controlled publication.

> **Current stable release (29 October 2026):** [v1.0.1](https://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v1.0.1) points to immutable application source `1478fb34e15e1bad7c07e4928ee8812e47bea064`. The public AMD64/ARM64 image `ghcr.io/arkos77/librechat-botmode-v1:stable` and `:latest` resolves to index `sha256:97e74b9b780c6a8742a6427c49378583f4b8a4213ec43877181372852b6cf5e2`. **Install from the pinned `v1.0.1` Git tag, never from moving `main`**; the bootstrap resolves the exact `sha-1478fb34e15e` runtime image. Original [v1.0.0](https://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v1.0.0) and its digest `sha256:20e921df9fda01dba00bc925fe1ae37ae24fbcc992f52f15aad60bfa5aae4c21` remain immutable historical release artifacts. Distribution is free/non-commercial as documented; see [dependency risk decisions](docs/BOTMODE_V1_NPM_RISK_DECISION_20261014.md) and third-party notices.

## What BOTMODE adds

- Director/orchestrator with specialist delegation
- Durable task tree / DAG execution and recovery
- Background subagents and resumable work
- RAG + persistent/shared memory scopes
- Capability and provider/model routing with fallbacks
- Work / Ideas flows and background analysis
- Web, code, documents, MCP and media capability routing
- Evidence collection and provenance
- Oracle / QA validation
- Publication Barrier before user-visible final output
- Full and Lite deployment profiles
- Reproducibility, release auditing, backup and restore scripts

## Architecture

```text
USER
  ↓
ROOM / PROJECT
  ↓
Director / Orchestrator
  ↓
Intent / Objective / Constraints
  ↓
Decision + Policy + Auth + Budget + Risk
  ↓
Task Engine → Task Tree / DAG
  ↓
Agent Factory → Specialists / Subagents
  ↓
Capability Router → Provider / Model Router
  ↓
LibreChat Runtime
  ↓
Tools / Web / RAG / Code / Media / DB / MCP
  ↓
Durable State → Evidence
  ↓
Oracle / QA
  ↓
Publication Barrier
  ↓
Final answer / artifact
```

## Quick start

### Requirements

Runtime hosts need:

- Git
- Docker
- Docker Compose v2

Node.js/npm are needed only for source development and local verification. Docker-based installation uses the already published image for the checked-out release source.

### Install

```bash
git clone --branch v1.0.0 --depth 1 https://github.com/Arkos77/LibreChat-BOTMODE-V1.git
cd LibreChat-BOTMODE-V1
# Expect the exact published runtime source; stop if a different checkout is selected.
test "$(git rev-parse HEAD)" = 59598c2f4e333c256296bbb8c6f45a024832745b
./install.sh
```

The installer auto-selects the **Lite** profile on hosts with less than 4 GiB RAM or on x86_64 CPUs without AVX. It creates `.env` if needed, validates Docker/Compose, pulls the BOTMODE runtime image whose `sha-<commit>` tag matches the checked-out Git commit, and starts the stack. This prevents the configuration/scripts from silently drifting away from the runtime image.

Force Lite explicitly with:

```bash
./install.sh --lite
```

Prepare and pull without starting:

```bash
./install.sh --no-start
```

Day-to-day lifecycle commands:

```bash
./start.sh
./stop.sh
./update.sh
./doctor.sh
```

After `.env` is created, configure only your chosen provider/API credentials; never commit `.env`. First-user registration, native setup of six agents and owner permissions, and stop/restart persistence passed the public GHCR Lite acceptance checks ([D-03 candidate installation](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39445974153), [installation without image override](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39453514151)). FAST/DEEP triage is conservative, and ephemeral specialist agents remain subject to authorization and budget checks. Paid or ambiguous model selection is not automatically authorized.

Full installation details: [docs/BOT_MODE_INSTALL.md](docs/BOT_MODE_INSTALL.md)

## Supported platforms

| Platform | Intended V1 path / qualification |
| --- | --- |
| Linux x86_64 | Public GHCR Lite first-user onboarding and restart verified; AMD64 OCI verified |
| ChromeOS | Crostini / Linux, profile Lite (hardware-limited validation) |
| macOS | Docker Desktop or compatible Docker runtime; final candidate smoke pending |
| Windows | WSL2; final candidate smoke pending |
| ARM64 Linux/macOS | Native Linux ARM64 OCI manifest, public pull, licence and pre-push image smoke verified; macOS host still needs local validation |
| Native Windows | Not declared supported for V1 |

## BOTMODE specialists

The V1 architecture supports specialist roles such as:

- **RECHERCHE** — web/source discovery
- **ANALYSE** — structured reasoning and comparison
- **CODE** — implementation, debugging and tests
- **DOCUMENTS** — document/RAG work
- **RÉDACTION** — final drafting and synthesis

The orchestrator remains the authority: specialists do not become independent schedulers or alternate sources of truth.

## Deployment profiles

**Full** is intended for machines with at least 4 GiB RAM available to the bootstrap. **Lite** reduces the local service footprint for lower-memory machines such as Crostini environments.

```bash
./install.sh --lite
```

## Release and security

Before a public release, BOTMODE uses:

```bash
./scripts/botmode/audit-public-release.sh
```

The release audit checks the Git worktree, BOTMODE commit history, common secret patterns, tracked environment files and reviewed fixtures. Public archives are generated from Git objects rather than directly from the working directory.

See:

- [Public release procedure](docs/BOT_MODE_PUBLIC_RELEASE.md)
- [Release audit status](docs/BOT_MODE_RELEASE_AUDIT.md)
- [Security policy](.github/SECURITY.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## Reproducibility

The dedicated verification path is:

```bash
./scripts/botmode/verify-reproducibility.sh
```

It validates targeted BOTMODE orchestrator/routing tests and lint checks after installation/build.

Backup and restore helpers are available under `scripts/botmode/`.

## Providers and models

BOTMODE is designed to route across configured providers rather than hard-code a single model family. The visible catalogue must reflect providers that are actually configured/connected. The default native Worker/specialist host routes admit only explicitly free OpenRouter models; automatic paid fallback is disabled until an operator deliberately revises the authorized routing and budget policy. This free-only source configuration does not guarantee current provider quota or the availability of every free model. Policy/budget/risk controls remain authoritative.

No API key is shipped in this repository.

## Project status

**Distribution v1.0.1 complete:** official non-prerelease GitHub Release and public GHCR `stable`/`latest` are published. [Build/pull AMD64+ARM64 #40818813544](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40818813544), [fresh Lite install/onboarding/restart #40819675546](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40819675546), and [digest-pinned D-04 promotion #40824924363](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40824924363) are PASS. This is a **distribution verdict**, not proof of every external integration: OpenRouter free provider availability and Azure/MSAL sign-in are not universally qualified, and no user's Chromebook/MacBook was upgraded as part of the release. Historical v1.0.0 was released via [PR #65](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/65) and remains available. See the [post-release D-04 decision](docs/BOTMODE_V1_D04_V101_RELEASE_DECISION_20261029.md), [installation guide](docs/BOT_MODE_INSTALL.md), [rollback guide](docs/BOT_MODE_ROLLBACK.md) and [time-limited risk decision](docs/BOTMODE_V1_NPM_RISK_DECISION_20261014.md).

## Relationship to LibreChat

LibreChat BOTMODE V1 is based on the upstream [LibreChat](https://github.com/danny-avila/LibreChat) project and retains its MIT licence and attribution. BOTMODE-specific work adds orchestration, durable mission execution, routing, memory/RAG integration, governed publication and related UI/runtime features.

This repository is not presented as the official upstream LibreChat project.

## Licence and third-party components

The repository root licence is MIT, matching current upstream LibreChat. Dependencies retain their own licences.

A transitive dependency currently present through the Sandpack stack, `@codesandbox/nodebox@0.1.8`, uses the **Sustainable Use License 1.0** and includes restrictions beyond the MIT licence. Users planning redistribution or commercial usage should review [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the applicable dependency licences.

## Credits

- [LibreChat](https://github.com/danny-avila/LibreChat) and its contributors
- The open-source projects and service providers integrated by LibreChat and BOTMODE

## Licence

MIT — see [LICENSE](LICENSE).
