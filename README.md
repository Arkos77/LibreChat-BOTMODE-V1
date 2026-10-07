# LibreChat BOTMODE V1

**LibreChat BOTMODE V1** is a multi-agent orchestration layer built on top of [LibreChat](https://github.com/danny-avila/LibreChat). It turns LibreChat into a governed workspace for durable missions, specialist agents, background work, RAG/memory, model routing, media capabilities, MCP tools, evidence collection, QA and controlled publication.

> Status: **V1 release candidate**. The current public development branch is `bot-mode-p4-closed`; `main` will become the stable BOTMODE branch after final release validation.

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

- Git
- Node.js 24.x
- npm
- Docker
- Docker Compose v2

### Install

```bash
git clone --depth 1 https://github.com/Arkos77/LibreChat-BOTMODE-V1.git
cd LibreChat-BOTMODE-V1
./install.sh
```

The installer does **not** use `sudo`, does not overwrite an existing `.env`, and does not delete application data. It validates the host, installs Node dependencies, builds the packages/client, validates Docker Compose and runs BOTMODE reproducibility tests.

To install and start the stack in the same run:

```bash
./install.sh --start
```

On a low-memory system:

```bash
./install.sh --lite
```

After `.env` is created, add only the provider/API credentials you actually use. Never commit `.env`.

Full installation details: [docs/BOT_MODE_INSTALL.md](docs/BOT_MODE_INSTALL.md)

## Supported platforms

| Platform | V1 path |
| --- | --- |
| Linux / Xubuntu | Direct |
| ChromeOS | Crostini / Linux |
| macOS | Docker Desktop or compatible Docker runtime |
| Windows | WSL2 |
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

BOTMODE is designed to route across configured providers rather than hard-code a single model family. The visible catalogue must reflect providers that are actually configured/connected. Local and free fallbacks can be used when appropriate, while policy/budget/risk controls remain authoritative.

No API key is shipped in this repository.

## Project status

The V1 release path is:

1. final Git / secrets / dependency / licence audit
2. BOTMODE README and public documentation
3. reproducible installation validation
4. stable BOTMODE `main`
5. GitHub repository security/rules
6. clean-machine validation and `v1.0.0` release

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
