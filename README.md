# LibreChat BOTMODE V1

**LibreChat BOTMODE V1** is a multi-agent orchestration layer built on top of [LibreChat](https://github.com/danny-avila/LibreChat). It turns LibreChat into a governed workspace for durable missions, specialist agents, background work, RAG/memory, model routing, media capabilities, MCP tools, evidence collection, QA and controlled publication.

> **V1 release source (20 October 2026):** The immutable Git tag `v1.0.0` points to functional source `59598c2f4e333c256296bbb8c6f45a024832745b`. Its public multi-architecture runtime image is `ghcr.io/arkos77/librechat-botmode-v1:sha-59598c2f4e33`, OCI index `sha256:20e921df9fda01dba00bc925fe1ae37ae24fbcc992f52f15aad60bfa5aae4c21`. Release promotion is tracked under [D-04](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/65); use **the immutable Git tag for installation**, not the moving `main` branch. Distribution is free/non-commercial, with the documented [time-limited dependency risk decision](docs/BOTMODE_V1_NPM_RISK_DECISION_20261014.md).

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

V1 integration is merged into protected `main` via [PR #65](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/65). Git `v1.0.0` intentionally points at the **functional source**, not the later CI-only merge commit. The same D-03 source/runtime image is used for stable promotion without rebuilding. The [installation guide](docs/BOT_MODE_INSTALL.md) covers reproducibility and rollback; the [risk decision](docs/BOTMODE_V1_NPM_RISK_DECISION_20261014.md) is time-limited and does not authorize commercial redistribution.

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
