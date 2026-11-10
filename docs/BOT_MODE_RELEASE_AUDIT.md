# BOT MODE V1 — final public release audit

Audit baseline: 7 October 2026. **Sections historiques à lire avec le checkpoint actuel ci-dessous.**

## Audit actuel de distribution V1.0.6 — 10 novembre 2026

**Ce qui suit actualise le bilan pour la PR #180. Les sections d'octobre ci-dessous sont conservées comme ARCHIVES, pas comme verdict contemporain.**

- **Source CI entièrement validée** : `cec7497ca0978d99702bf8d121f192de66d941e3` ; 25 contrôles GitHub sur la PR, **23 SUCCESS / 2 SKIPPED / 0 FAIL**, dont scan npm production, CodeQL, Lite Current HEAD Release Preflight, Full RAG Native Acceptance, contrats Worker/Oracle, Backend et Playwright. Toute mise à jour documentaire après ce SHA doit reconfirmer les checks du nouveau commit avant publication.
- **Secrets** : les garde-fous de détection sur source/archives CI ont réussi ; les sauvegardes locales `.env` ne sont pas publiées et aucun secret local n'a été ouvert lors du préflight. Un scan positif ne prouve pas une absence absolue de secrets dans tout historique : la vérification finale doit être réalisée sur la source effectivement taggée.
- **Sécurité applicative** : la vue CodeQL `refs/pull/180/merge` compte **2 HIGH** (#331, #332) dans les endpoints polling OAuth MCP. Les routes appliquent JWT + limiteur partagé, et les tests d'intégration vérifient 401/429 et `Retry-After` ; **revue de disposition nécessaire**, pas de dismissal automatique. La vue `main` compte séparément 307 alertes OPEN (134 HIGH/173 MEDIUM) ; ne pas additionner ou confondre les deux refs.
- **Audit dépendances production** : contrôle npm sur la source de la PR **SUCCESS** ; les 0 constat au seuil de l'audit ne remplacent pas le triage CodeQL, les images tierces ou les risques MongoDB 4.4 hors support.
- **OCI et release** : pas de Git tag `v1.0.6`, image GHCR candidate publiée ni digest index multiarchitecture vérifié au présent checkpoint. **Aucun résultat ne doit être présenté comme validation d'un artefact non encore émis**. Le workflow de publication générique LibreChat a été protégé pour ce dépôt ; ne pas publier ces images accidentellement.
- **Reproductibilité Lite/Full** : PASS sur runners jetables ; restauration multi-volumes et navigation utilisateur finale restent dans le périmètre exact des scénarios testés. Mac/Chromebook exécutent v1.0.5 et ont des sauvegardes Mongo du 10 novembre dont `gzip -t` est PASS, mais restauration locale non réalisée, trois listeners BOT MODE non limités à loopback.
- **Licence** : MIT pour la majeure partie du dépôt ; Nodebox sous Sustainable Use License à contrôler en cas de redistribution commerciale, [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Aucun engagement de support macOS/Windows/ARM spécifiques sans essais réels.
- **Frontière projet** : compétences historien, documentaliste, investigateur, China Sourcing, audiovisuel réservées à la [V2 privée, issue #181](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/181). Ne pas les développer en V1.

**Gate** : **NO-GO publication** tant que la réception réelle et l'acceptation/correction de risques pertinents ne sont pas documentées et que le propriétaire n'a pas autorisé explicitement un build/push candidat puis la release. Toute promotion `latest`, `stable` ou ancien tag est interdite.

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
