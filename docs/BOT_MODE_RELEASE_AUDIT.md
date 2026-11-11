# BOT MODE V1 — final public release audit

Audit baseline: 7 October 2026. **Sections below the current checkpoint are historical archives, not the current release decision.**

## Audit actuel de distribution V1.0.6 — 11 novembre 2026

**PR #180, SHA applicatif vérifié avant actualisation documentaire : `3c5a90f9b83a5fc1ff7d3f5db72bbf1406bd15d1` ; 31 workflows PR : 29 SUCCESS, 2 SKIPPED, 0 FAIL.** Le présent commit documentaire doit reconfirmer son propre état CI. **Statut : DRAFT / RELEASE NO-GO** tant que décisions de risque, artefact OCI et autorisations du propriétaire restent manquants.

- **Missions réellement exécutées** : fournisseur gratuit OpenRouter et Worker → Oracle `VERIFIED` → P6, test de refus `HUMAN_REVIEW` **PASS** ([#42911804825](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/42911804825)). Worker → RECHERCHE acteur du graphe → Oracle vérifié et P6 unique **PASS** ([#42913006511](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/42913006511)). Pas de thread subagent imbriqué démontré.
- **Recherche native** : vrai fournisseur OpenRouter gratuit, appels réels recherche et extraction via **sources Web contrôlées**, trois étapes Recherche/Analyse/Synthèse, verdicts Oracle persistés, publication Mongo/P6 unique, nettoyage PASS ([#42926216758](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/42926216758)). **Keenable public et navigation Playwright réelle non démontrés.**
- **HITL** : deux approbations HTTP, Mongo checkpoints et exécution de l'outil exactement une fois **PASS avec `FakeChatModel`** ; double reprise avec fournisseur externe non qualifiée, historique R5 FAIL. **Ne pas promettre de multi-HITL réel validé.**
- **Image et code** : `dev-images.yml` YAML dupliqué corrigé, garde du publisher générique maintenue ; harness recherche Docker corrigé pour le port bind `127.0.0.1:3090`. Les agents, Oracle et P6 ne sont pas modifiés par ces deux corrections. Lite/Full, Backend, Frontend, Playwright, RAG natif et préflight sécurité **PASS CI**.
- **Sécurité npm** : Mongoose 8.24.7 en lockfile, audit production PASS avec 0 vulnérabilité signalée par npm. Les machines existantes exécutent encore la v1.0.5 avec Mongoose 8.24.1 ; leur mise à jour n'est pas faite.
- **CodeQL** : 2 HIGH PR #331/#332 **OPEN**, malgré protections JWT / `mcpOAuthPollLimiter` et tests d'intégration 401/429/Retry-After. Revue et décision explicite de disposition nécessaires ; ne pas assimiler les 307 alertes historiques `main` à des régressions PR. Registre [#154](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/154).
- **Dependabot** : 3 alertes développement OPEN : `minimatch` MEDIUM, `deepmerge` LOW, `elliptic` LOW. Réévaluations de risques planifiées pour le 16 novembre 2026.
- **Secrets, confidentialité et licence** : scans source/CI PASS dans leur périmètre sans garantie absolue sur tout historique ; aucun secret local copié, aucune clé API publiée. MIT majoritaire, exceptions/licences tierces documentées dans [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
- **Déploiement** : ne promettre que de **nouvelles installations Linux Docker Compose qualifiées**, Lite local/protégé et Full avec contrôle des accès/HTTPS/réseau ; pas de migration sans vraie restauration testée. Mongo 4.4 Lite hors support ; binds PROD actuels non tous limités à localhost ; aucun changement Mac, Chromebook, JARVIS ou PangaraBOT.
- **Artefact final** : pas encore de **digest GHCR index AMD64/ARM64 v1.0.6** vérifié ni de GitHub Release/tag `v1.0.6`. Ne pas confondre image locale et image diffusée. Aucune publication générique LibreChat sur Docker Hub autorisée.

**Décision : GO technique pour préparer une candidate à distribution sous restrictions ; NO-GO publication stable ou exposition Internet libre tant que le propriétaire n'a pas statué sur les risques et donné des GO distincts pour (1) build/push GHCR candidate, (2) merge/tag/Release, et (3) déploiements locaux.** La V2 privée/cloud reste séparée dans [issue #181](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/181).

---

## Git and release state

- BOTMODE branch audited: `bot-mode-p4-closed`
- audited HEAD before documentation changes: `000f7e1e`
- upstream merge base used by the release audit: `f9f1b2fb`
- BOTMODE-specific commits audited at that point: 377
- worktree before release-documentation changes: clean
- personal remote: `https://github.com/Arkos77/LibreChat-BOTMODE-V1.git`

The canonical check is always the latest output of:

```bash
./scripts/botmode/audit-public-release.sh
```

The audit must be rerun on the final release HEAD.

## Secrets and sensitive files

The release audit passed on the baseline HEAD.

Verified:

- common long-form GitHub/OpenAI/Google/Slack credential patterns: no unreviewed matches in BOTMODE history;
- private-key markers: no unreviewed matches;
- commit messages: no detected secret patterns;
- tracked `.env*` files: examples only;
- no untracked local files at the audited baseline.

Local runtime credentials must remain in ignored files such as `.env`.

## Repository size

- tracked content is modest; no file approaches GitHub's normal 100 MiB single-file limit;
- largest tracked artifact at audit time is approximately 2.5 MiB;
- Git LFS is therefore not required for V1.

## Dependency security

Latest production audit captured during V1 preparation:

- critical: **0**
- high: **9**
- moderate: **10**
- low: **8**

The high findings are concentrated in:

- Firebase / Firestore / `@grpc/grpc-js`;
- Tailwind 3 build-chain dependencies (`braces`, `micromatch`, `chokidar`, `fast-glob`).

These are documented release debt and are not hidden with `npm audit fix --force`, because the proposed fixes require broader compatibility migrations.

## Licence review

The repository root uses the MIT licence used by current upstream LibreChat.

A transitive dependency is a known exception to an all-MIT interpretation:

```text
@librechat/frontend
└─ @codesandbox/sandpack-react@2.19.10
   └─ @codesandbox/sandpack-client@2.19.8
      └─ @codesandbox/nodebox@0.1.8
```

`@codesandbox/nodebox@0.1.8` ships under Sustainable Use License 1.0. Its restrictions must be considered for redistribution/commercial use. See `THIRD_PARTY_NOTICES.md`.

This audit is an engineering inventory, not legal advice.

## Release gate

A V1 release candidate may proceed when all of the following are true:

- release audit script: PASS
- final worktree: clean
- reproducibility verification: PASS
- build: PASS
- README/install docs match the actual commands
- GitHub `main` points at the validated BOTMODE release candidate
- branch/ruleset security is enabled where supported


## Clean-machine runtime findings (7 October 2026)

The first clean Chromebook/Crostini pass validated the public checkout and source reproducibility at `4075169b`: package/client builds completed and the dedicated BOTMODE suite passed 42/42 tests.

The runtime phase then exposed distribution defects that source-only verification could not detect:

- a second `npm ci` triggered by `--start` exhausted the 2.7 GiB host and was killed by the kernel OOM killer;
- MongoDB 8 cannot run on the target CPU because AVX is absent;
- host bind mounts produced runtime permission failures under containerless Crostini;
- most importantly, the Compose runtime referenced the upstream LibreChat development image rather than an image built from this BOTMODE repository.

The V1 release gate therefore now also requires:

- BOTMODE-owned GHCR image built from this repository;
- runtime bootstrap with no npm install/build path on target hosts;
- automatic Lite selection for low-memory hosts or x86_64 hosts without AVX;
- MongoDB 4.4.29 in Lite;
- Docker-managed runtime data volumes;
- mounted `librechat.yaml`;
- single-process scheduler assertion in Lite;
- successful clean-machine runtime test from the published candidate image.

Do not tag `v1.0.0` until this runtime distribution gate passes.
