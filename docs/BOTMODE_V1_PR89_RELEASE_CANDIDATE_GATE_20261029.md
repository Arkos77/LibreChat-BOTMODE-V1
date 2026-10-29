# BOT MODE V1 — Passage PR #89 vers nouvelle candidate OCI : critères de décision

**Checkpoint 29 octobre 2026.** Ce document est un plan de livraison en lecture seule du runtime ; il **n'autorise aucun merge, changement de tag ou publication GHCR**. Source examinée : [PR #89](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/89) DRAFT, SHA `1478fb34e15e1bad7c07e4928ee8812e47bea064` (deux commits au-dessus du digest-source D-03 `7605e9186b84d4a7eb6d14be1bc9528c6033bbd8`).

## 1. Preuves et limites connues

- **PASS sur #89 HEAD** : [Cold SIGKILL](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40813828371) (reprise Mongo/Redis, effets externes non dupliqués, Oracle/P6), [audits de production](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40813828476) (zéro avis npm de toute sévérité à la date du run), [Backend](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40813828381), [Frontend](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40813828428), [Static](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40813828407), [Docker smoke](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40813828469), [Runtime Image](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40813828360) AMD64 et ARM64, non publié.
- **PASS sur #89 HEAD** : les trois contrôles réellement requis par la branche protégée `main`, [Change safety gate / image amd64 / image arm64](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40813828396). La branche exige `strict=true` et `enforce_admins=true` ; cela ne dispense pas de GO humain.
- **NON CONCLUANT au dernier relevé** : [Playwright E2E](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40813828427), 3/4 groupes de tests principaux déjà PASS (memory 1/3, memory 2/3, redis), memory 3/3 encore IN_PROGRESS ; MCP liste 1 et 2 replicas PASS. Ne pas déclarer E2E PASS avant conclusion finale.
- **Refus attendu d'ancienne sonde** : [Exact Candidate OCI](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40813828451) `current-candidate-runtime` échoue avant mission sur `CI_CANDIDATE_RUNTIME_SOURCE_DRIFT_NOT_ALLOWED`. Il compare au digest d'une **ancienne** candidate ; sa garde doit rester active. Le job d'installation Lite isolée est PASS, sans servir de preuve de publication #89.
- **Candidate D-03 historique** : `ghcr.io/arkos77/librechat-botmode-v1@sha256:ed493e0ffdfc7a1056d11834474b4127e0ae27ea52421e8d5fa9aa26e686c8a1`, **provenance SHA `7605e918...` uniquement**. Ne jamais prétendre que ce digest représente le correctif `1478fb34...`.

## 2. Stratégie reproductible et sécurisée, après autorisation distincte

1. **Geler le SHA candidat** `1478fb34e15e1bad7c07e4928ee8812e47bea064` et vérifier que l'arbre Git/lockfile de la branche correspond, sans rebase silencieux.
2. **Choisir explicitement une nouvelle version** de release, sans déplacer `v1.0.0`. Aucun tag stable ou `:latest` à ce stade.
3. **Préparer un workflow candidate-only pour ce SHA**, dérivé des principes de `.github/workflows/botmode-v1-d03-candidate-manual.yml` mais **PAS de son exécution telle quelle** : le fichier actuel est épinglé à l'ancien `SOURCE_SHA=59598c2f4e...` et `BUILD_BRANCH=botmode-v1-final-source-qualified-20261019`. Il doit exiger une entrée d'approbation candidate dédiée, une source Git SHA exacte, l'absence de tags préexistants conflictuels et refuser toute possibilité de toucher `:stable/latest`.
4. **Construire sur runners propres AMD64 et ARM64** via Docker Buildx avec `BUILD_COMMIT` et labels/source vérifiés, pousser seulement par digest sur le registre sous mandat approuvé, puis créer un index multiarchitecture **immuable et nouveau**, tags `sha-1478fb34e15e` et `candidate-botmode-v1-1478fb34e15e` seulement si libres.
5. **Vérifier le digest produit** et chaque manifeste par architecture, des téléchargements publics anonymes, le build commit dans l'image et les labels de provenance. Conserver tous les identifiants, logs et artefacts GHCR pour la décision D-04.
6. **Qualifier uniquement les écarts nécessaires**, notamment une installation Lite neuve depuis ce nouveau digest, le comportement des dépendances patchées et le contrôle de provenance. Les missions/contrats D-03 acquis ne doivent pas être relancés sans régression observée ; la preuve d'égalité de source n'existe pas entre `7605e918` et `1478fb34`.
7. **Proposer l'intégration corrigée vers `main` uniquement après décision humaine**, de préférence une PR d'intégration DRAFT vers `main` pointant directement sur le SHA final, au lieu de fusionner #88 seule (ancienne version vulnérable) puis #89. Ne pas fermer ou rebinder les PR existantes automatiquement.
8. Après approbation de fusion distincte : vérifier HEAD de `main`, arbre Git final et provenance du digest. **D-04 stable** reste une décision encore distincte, avec versionnement, backup/rollback et autorisation explicite ; le workflow `.github/workflows/botmode-v1-d04-promote-stable.yml` est lui aussi **épinglé à une ancienne source/digest et au tag v1.0.0**, donc interdit tel quel.

## 3. Conditions de passage

- Gate CI du commit final : 3 required checks PASS ; frontend/backend/Static/Oracle PASS ; Playwright E2E terminé PASS **ou** anomalie précisément attribuée NON CONCLUANTE avec traitement décidé.
- Gate sécurité : audit npm production du verrou final zéro alerte à la date de contrôle ; aucune clé/secrète en sortie ; builds propres.
- Gate OCI : nouvelle candidate SHA-matched, manifest AMD64+ARM64, pulls anonymes, digest/provenance enregistrés ; pas de nouveau tag/digest inventé.
- Gate humain : GO explicite pour une nouvelle candidate GHCR, GO distinct pour toute fusion, GO distinct pour D-04 stable.
- Support Azure/MSAL réel non qualifié : documenter son exclusion du périmètre V1 ou recueillir une preuve avant de le déclarer supporté.

**Verdict rédaction de plan : PASS. Publication candidate : NON AUTORISÉE. D-04 stable : NO-GO.** Aucun composant Chromebook/MacBook existant, aucun tag, aucune PR de production et aucune image déjà qualifiée ne sont à modifier pour cette documentation.
