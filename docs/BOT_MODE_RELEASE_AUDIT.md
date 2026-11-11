# BOT MODE V1 — final public release audit

> **BILAN POST-PUBLICATION (11/11/2026) :** V1.0.6 est officielle, [Release](https://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v1.0.6), source `416bf00898a6b0fb2eaf271ee4671d30ea55ccf0`, image `ghcr.io/arkos77/librechat-botmode-v1@sha256:e3640ac10833e4743796589b53d8a935d94867d73b0c25e82b4e7e1eba985cdb`, [GHCR 8/8 PASS](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/42953398588) et CI source 29 PASS / 2 SKIPPED / 0 FAIL. Les notes d'audit ci-dessous décrivent des **états historiques avant publication** et ne doivent pas être lues comme le statut courant. CodeQL HIGH OAuth #331/#332 toujours ouverts avec acceptation limitée au Linux protégé ; aucun déploiement matériel existant autorisé.

## Audit courant de V1.0.6 — avant promotion officielle (11 novembre 2026)

**Source de vérité :** [PR #180](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/180), [registre sécurité #154](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/154), [suivi publication #179](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/179). Ce texte est un **checkpoint avant tag**, et ne constitue pas un constat de publication.

- **CI :** dernier SHA exact de PR #180 à qualifier après correctif de deux traces DEBUG OAuth. Le SHA précédent `d2e96e7ab13716e575456e9a70763dc4a0036830` a conclu à 29 SUCCESS / 2 SKIPPED / 0 FAIL sur 31 workflows ; un premier échec intermittent du job Frontend ciblé a réussi lors d'une reprise de ce seul job. Ne pas transposer ces PASS à un SHA modifié sans CI terminale.
- **CodeQL :** deux HIGH `js/missing-rate-limiting` OAuth MCP #331/#332 atténuées et acceptées **temporairement** par le propriétaire pour Linux à accès protégé. Deux MEDIUM `Log injection` sur des traces de `packages/api/src/mcp/oauth/handler.ts` ont été découvertes pendant le contrôle pré-merge et corrigées par **deux logs constants sans paramètres utilisateur** ; attendre la nouvelle analyse CodeQL du commit final. Les alertes historiques sur `main` restent distinctes, documentées, non fermées en bloc.
- **Dépendances :** `npm audit --omit=dev` sur la précédente candidate : aucune vulnérabilité de production signalée ; vérifier le HEAD final. Trois alertes de développement surveillées.
- **Image déjà qualifiée :** candidate précédente `ghcr.io/arkos77/librechat-botmode-v1:candidate-botmode-v1-d2e96e7ab137`, OCI AMD64/ARM64 index `sha256:928d181f777b5e966f247b0807a013462591801c8ef261fde8b0721e9e281be5` — [run #42949119562](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/42949119562), 8/8 jobs SUCCESS, pull anonyme et smoke navigateur/Lite PASS. **Après correction du source, reconstruire une candidate immuable correspondant au nouveau SHA avant la release.**
- **Usage déclaré :** nouvelles installations Linux via Docker Compose ; Lite local/réseau de confiance ; Full HTTPS/authentification/ACL/réseau protégé. Ne pas exposer publiquement Mongo/Redis, ne pas promettre le HITL multiple avec LLM réel, navigateur Web public, migration, sauvegarde/restauration des machines installées ou systèmes non validés. MongoDB 4.4 Lite hors support.
- **Publication générique bloquée :** `dev-images.yml` protégé sur push main, et `tag-images.yml` exclut le tag `v1.0.6`. Réserver la promotion à `ghcr.io/arkos77/librechat-botmode-v1`, sans `:latest` ni Docker Hub/Helm.
- **Signalement privé :** GitHub Private Vulnerability Reporting activé (capture fournie par le propriétaire). Pas de secret API copié depuis les machines.
- **GO humains :** risques limités, candidate GHCR, fusion/tag/GitHub Release accordés séparément ; **pas de GO déploiement** Chromebook/Mac, aucun changement de JARVIS/PangaraBOT, aucune publication d'un fournisseur LLM payant.

**Arrêt impératif :** pas de tag ni GitHub Release avant preuves CI exact HEAD + digest GHCR aligné sur le même SHA, succès des deux architectures et contrôle du signalement CodeQL MEDIUM. Les notes Release devront citer SHA, digest, limites et preuve de pull anonyme.

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
