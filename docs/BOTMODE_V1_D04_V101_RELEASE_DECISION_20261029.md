# BOT MODE V1 — D-04, décisions et preuves v1.0.1

## État ACTUEL après publication — 29 octobre 2026

**PASS — publication GitHub Release v1.0.1 et promotion GHCR stable/latest terminées.** Le statut `NO-GO` et les interdictions mentionnées plus bas décrivent exclusivement le **checkpoint historique de préparation**, rédigé AVANT les autorisations humaines des étapes Git tag, promotion puis Release ; ils ne s'appliquent plus à ces trois opérations désormais exécutées et vérifiées.

| Contrôle | Résultat exact | Preuve |
| --- | --- | --- |
| Tag Git `v1.0.1` | PASS — `1478fb34e15e1bad7c07e4928ee8812e47bea064` | [création contrôlée #40824023867](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40824023867) |
| Source / OCI AMD64+ARM64 | PASS — candidate `sha256:97e74b9b780c6a8742a6427c49378583f4b8a4213ec43877181372852b6cf5e2` | [publication #40818813544](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40818813544) |
| Installation Lite sur runner jetable | PASS — onboarding six agents, ACL, redémarrage/persistance | [acceptation #40819675546](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40819675546) |
| GHCR `stable` / `latest` | PASS — le même digest, sans rebuild, index AMD64+ARM64 et contrôle public anonyme | [D-04 #40824924363](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40824924363) |
| GitHub Release stable et dernière version | PASS — [v1.0.1 publiée](https://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v1.0.1), non-préversion | API Releases `/latest` et tag vérifiés |
| Ancienne release `v1.0.0` | PRÉSERVÉE — SHA `59598c2f4e333c256296bbb8c6f45a024832745b` | tag Git distinct |
| Mise à niveau des machines réelles | NON EXÉCUTÉE — installations utilisateur intactes | hors mandat de publication |
| Inference OpenRouter Free dans toutes les missions et authentification Azure/MSAL réelle | NON CONCLUANT pour cette release | preuves CI partielles/historiques et pas d'essai utilisateur complet |

**Correctifs présents dans la source Git immuable v1.0.1 (ne pas les réimplémenter) :**
- Autorisation des spécialistes via le graphe natif initialisé `getReachableMissionAgents()`, vérifiée avant exécution dans `api/server/controllers/agents/request.js`. L'incident Chromebook d'origine était sur `v1.0.0` ([issue #74](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/74)) ; le correctif source ne remplace pas un essai sur le Chromebook réel.
- `update.sh` refuse avant mutation une API active et les mises à jour interversions Redis sans preuve de quiescence ([issue #42](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/42)) ; la reprise sûre d'une mission Redis active à travers un changement arbitraire de version reste non démontrée.
- `docker-compose.botmode.yml` isole les clés d'embeddings RAG des clés générales des fournisseurs ; RAG ne reçoit pas de clé OpenAI globale sans accord dédié ([issue #47](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/47)). La présence de la garde source ne constitue pas une autorisation d'appels payants.

**Décision :** distribution officielle `v1.0.1` **PASS / terminée**. Clôture fonctionnelle de tous fournisseurs, intégrations et matériels **NON CONCLUANTE** tant que leurs preuves spécifiques n'existent pas. Aucun retag, rebuild, déploiement ou achat autorisé par ce document. Garder `v1.0.0` et `v1.0.1` immuables, la revue des risques D-02, et les limites du rollback.

---

## Historique de préparation D-04 (conservé comme preuve de décisions antérieures)

**Statut : NO-GO stable.** Document de décision à la date du 29 octobre 2026, après la publication et l'acceptation de la candidate SHA `1478fb34`. **Ne pas créer de tag Git, modifier `stable/latest`, lancer de promotion ou déployer sur les machines de l'utilisateur au titre de ce document.**

## 1. Identité exacte de la release proposée

| Rôle | Identifiant immuable |
| --- | --- |
| Source logique approuvée | `1478fb34e15e1bad7c07e4928ee8812e47bea064` |
| Arbre de source runtime | `9d33e7e25b60082c1681febb99f950abd0fcf9b7` |
| Version Git souhaitée (NON créée) | `v1.0.1` à placer exactement sur la source ci-dessus |
| Candidate GHCR AMD64/ARM64 | `ghcr.io/arkos77/librechat-botmode-v1@sha256:97e74b9b780c6a8742a6427c49378583f4b8a4213ec43877181372852b6cf5e2` |
| Tags candidates déjà publiés | `candidate-botmode-v1-1478fb34e15e`, `sha-1478fb34e15e` |
| Ancien digest `stable/latest` | `sha256:20e921df9fda01dba00bc925fe1ae37ae24fbcc992f52f15aad60bfa5aae4c21` |
| Ancienne version Git `v1.0.0` (intouchable) | `59598c2f4e333c256296bbb8c6f45a024832745b` |

**Le commit `main`** contient le runtime source corrigé et les workflows ultérieurs, mais son SHA diffère de `1478fb34` ; pour une provenance correcte, la future version Git `v1.0.1` doit cibler le SHA d'origine exact, sans réattribuer les preuves à un autre binaire.

## 2. Preuves déjà acquises (ne pas relancer sans motif)

- [PR #90](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/90) : source corrigée intégrée à `main`, tests de compilation, sécurité, backend/frontend, Playwright, Oracle/P6, reprise Cold SIGKILL et protection `main` PASS à leur périmètre.
- [Publication GHCR #40818813544](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40818813544) : six jobs PASS, builds digest AMD64/ARM64, index immuable, pulls anonymes et preuve du BUILD_COMMIT.
- [Acceptation Lite #40819675546](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40819675546) : installation neuve depuis l'image corrigée, authentification, six agents natifs, ACL, idempotence et persistance après arrêt/redémarrage PASS. Test sur runner jetable, sans inférence payante.
- Audit npm de production du commit corrigé : aucune vulnérabilité au moment du run. **À réévaluer à la date exacte de promotion** : les avis de sécurité peuvent évoluer.

Les tests ne prouvent PAS l'usage d'un vrai compte OpenRouter gratuit (le fournisseur d'essai est simulé), ni Azure/MSAL réel. Les exclure de la promesse V1 ou demander une preuve distincte.

## 3. Workflow D-04 nouveau — modes et restrictions

Fichier proposé : `.github/workflows/botmode-v1-d04-1478fb34-v101-manual.yml`, sur une **PR DRAFT séparée**, sans démarrage automatique.

- **`PREFLIGHT_ONLY`** (défaut) : contrôle de la branche `main`, source et arbre Git, des deux tags de candidate et du digest public, des deux alias actuels `stable/latest` et des plateformes AMD64/ARM64. **Pas de droits d'écriture GHCR**, ni de création de tag. Le contrôle ne constitue pas une publication.
- **`AUTHORIZE_D04_V101_STABLE_LATEST_1478FB34`** : doit être choisi seulement après une nouvelle **autorisation explicite D-04**. Exige que le tag Git `v1.0.1` existe déjà et résolve strictement sur `1478fb34...`, vérifie immédiatement avant écriture les digests candidats et anciens alias, puis retague exactement l'index OCI existant. Aucun build et aucune création de version Git.
- Si un alias inconnu remplace `stable/latest`, le workflow **refuse** la promotion. S'il vaut l'ancien digest ou le nouveau digest attendu, la promotion est idempotente après interruption.
- La mise à jour de deux alias `stable/latest` n'est **pas atomique** ; si la seconde opération échoue, conserver les preuves exactes puis traiter l'état partiel avec contrôle humain (ne pas déclencher de rollback aveugle).
- Le workflow historique `.github/workflows/botmode-v1-d04-promote-stable.yml` reste épinglé à l'ancienne source et à son digest : **ne pas l'utiliser** pour cette nouvelle version.

## 4. Dépendance Git tag et effets secondaires

À l'heure de ce checkpoint, `v1.0.1` n'existe pas. Le créer **est une action de publication distincte** qui déclenche normalement des workflows `push.tags: v*` dans le dépôt.

**Attention, risque découvert après le précontrôle D-04 (run #40821275113 : PASS, sans écriture) :** l'exclusion `!v1.0.1` ajoutée sur `main` ne suffit **pas** à protéger la création d'un tag sur le commit runtime `1478fb34...`. Ce commit contient encore une ancienne version de `.github/workflows/tag-images.yml` (déclencheur `push.tags: v*`, sans exclusion) qui peut publier des images génériques GHCR/Docker Hub. Le workflow `botmode-image.yml` de ce commit est également déclenchable par `v*` ; son job de publication est conditionné à `workflow_dispatch`, mais ses builds smoke peuvent s'exécuter. **Ne pas créer `v1.0.1` avec le CLI local, un PAT, une GitHub App ni l'interface Release.**

Pour prévenir cet effet, une PR DRAFT supplémentaire propose le workflow manuel `.github/workflows/botmode-v1-d04-v101-create-exact-tag-manual.yml`, avec mode `PREFLIGHT_ONLY` par défaut (lecture seule) et mode `AUTHORIZE_CREATE_V101_TAG_SOURCE_1478FB34_ONLY` sous **autorisation humaine distincte**, créant le tag léger `v1.0.1` exactement sur le SHA source via le **`GITHUB_TOKEN` propre au run GitHub Actions**, et seulement après double vérification de l'absence du tag. GitHub documente que les événements `push`/`create` issus de ce `GITHUB_TOKEN` ne génèrent pas de nouveaux workflows, hormis exceptions explicites `workflow_dispatch`/`repository_dispatch` (documentation : https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow). Le workflow ne fait aucun dispatch secondaire, et n'accorde `contents:write` qu'au job de création explicitement autorisé. Refus si le tag existe ou si la source, l'arbre ou l'ancienne `v1.0.0` divergent.

L'exclusion `!v1.0.1` sur `main` reste une défense complémentaire, **non la preuve principale de non-publication**. La suppression des déclenchements Actions ne garantit pas l'absence de notifications ou de traitements par des systèmes externes abonnés aux webhooks GitHub. Vérifier ces intégrations avant GO. Le nouveau workflow doit lui-même être relu, qualifié et fusionné séparément avant son éventuel usage. **Aucun tag n'a été créé par la préparation.**

## 5. Ordre des décisions D-04

1. Revue/qualification de la PR D-04 **DRAFT** : workflow, bash, contrôles de sécurité, exclusion du publisher générique et risques de tags.
2. Autorisation de fusion du seul matériel de préparation dans `main` ; utiliser les protections GitHub, sans lancer de promotion, sans écraser `v1.0.0`.
3. Lancer éventuellement `PREFLIGHT_ONLY` avec une autorisation de validation en lecture seule ; contrôler les sorties et avis sécurité.
4. Définir le périmètre supporté V1 et la stratégie de retour arrière ; **autorisation distincte** pour créer `v1.0.1` en évitant les publications automatiques non souhaitées.
5. **Autorisation distincte D-04 stable** pour promouvoir le digest immuable `97e74b9b...` vers `:stable` et `:latest`, avec vérification post-écriture publique et rollback documenté si nécessaire.
6. Vérifier l'installation/usage réel à l'échelle voulue et communiquer la version finale seulement après tous les contrôles ; aucune obligation de déployer sur le Chromebook/MacBook existant.

## 6. Critères de décision

**PASS :** source corrigée, image candidate publiée, index AMD64/ARM64, pulls anonymes, installation Lite, six agents, persistance.

**NON CONCLUANT pour D-04 :** contrôle du workflow de promotion GitHub en conditions réelles, absence d'effets secondaires des tags de release, état des avis npm à la date du GO, promesse fournisseur externe réel, plan de rollback testé.

**Décision présente : D-04 NO-GO, publication de la candidate uniquement déjà validée ; `stable/latest` et `v1.0.0` intouchés.**

**Qualification de la PR :** le présent fichier doit être soumis aux contrôles GitHub de la branche protégée avant toute décision de fusion ; les preuves de la candidate publiée ne remplacent pas les checks du workflow D-04 proposé.
