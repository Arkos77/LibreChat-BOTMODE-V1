# BOTMODE — conservation des sources dans la reprise native

> Exécuter inline avec superpowers:executing-plans, puis une seule revue indépendante du lot.

**Goal:** Ne pas effacer les observations de sources déjà sauvegardées quand la reprise native écrit ou revalide un verdict Oracle.

**Architecture:** Utiliser MissionOracleState.sources et les normaliseurs, écrivains à propriétaire CAS et validateurs natifs déjà présents. Aucun nouveau stockage, ordonnanceur ou droit d'outil. Les clients warm conservent déjà ces sources ; deux passages cold ne les transportent pas.

**Tech Stack:** Adaptateurs JS existants, API compilée TypeScript, Jest et régressions Node locales.

**Spec:** feuille de route réconciliée, R13/R18/R30/R35 ; contrat sources de missionOracle.ts ; source de base e40f1e57c61f4d0eb82dc5304859ad1992f70bfc. Choix de l'implémenteur : corriger ce préalable de conservation avant l'adaptateur d'outils de reprise à froid ; ne pas supprimer le refus actuel des outils.

## Global Constraints

- Source seulement : aucun push, CI, build Docker, fournisseur distant, publication ou installation.
- Aucune modification des permissions, leases, identité de génération, Oracle/P6 ni attestations d'effets.
- Le refus de reconstruction des agents avec outils reste en place. Ce lot ne clôture pas la reprise automatique web_search après crash.
- Tester avec les vrais normaliseur et Oracle ; stockage en mémoire explicitement simulé pour le contrat de l'adaptateur, sans prétendre à un test Redis/Mongo.
- Ne pas refaire les 324 tests ni l'image déjà qualifiée pour ces changements locaux ; exécuter les voisins réellement concernés.

## Review Focus

- Source absente, d'une autre tâche ou malformée : aucune validation fabriquée.
- Réécriture et replay idempotent : sources conservées, horodatage initial conservé.
- Perte de propriétaire ou révocation : aucun état validé hors du CAS autorisé.
- Vérification indépendante : résultat checkpointé, observations durables séparées du texte du modèle.
- Ne pas qualifier la nouvelle source par l'image e40f1e5, qui ne contient pas ces corrections.

## Tâche 1 — Transmission des observations

Interfaces inchangées : createNativeMissionRecoveredOraclePersister conserve le MissionOracleState normalisé ; createNativeMissionRecoveredOracleVerifier fournit observedSources à validateMissionTask.

- [x] Ajouter nativeMissionRecoveredOracleSources.spec.js : vrais contrats normalisés et Oracle ; conservation après écriture/replay ; succès sur observation durable ; refus sans sources, sources étrangères, URL malformée, révocation et refus CAS.
- [x] Exécuter et observer les deux échecs de conservation/transmission avant correction.
- [x] Conserver les sources normalisées lors de la fusion du résultat dans nativeMissionRecoveredOraclePersister.js.
- [x] Passer uniquement le bucket de la tâche courante à l'Oracle dans nativeMissionRecoveredOracleVerifier.js.
- [x] Exécuter la suite verte, les régressions adjacentes existantes et le lint/diff. Une revue indépendante unique, puis correction Important/Critical si nécessaire avec rouge→vert.

## Résultat

Correction source terminée le 24 octobre 2026. Source produit corrigée : `cb55aa39e473d8e68bdc747ddf02495190309a9d` ; tests et style figés : `f9d50e74e26423704742b15ebef249b82c5b8daf`. Branche locale conservée : `fix/botmode-recovery-source-evidence-20261024`.

- RED observé avant correction : 2 échecs, 5 succès. Le vrai Oracle refusait une recherche pourtant munie d'observations durables ; l'écrivain supprimait sources.
- GREEN final : **17 tests, 3 suites**, avec les cas de sources absentes, étrangères, malformées, reprise idempotente, révocation et refus CAS. Le stockage de ces tests est simulé ; normaliseur et Oracle sont réels.
- Cinq scripts de régression voisins passent : persistance Oracle, revalidation, liaison du client, callbacks de reprise model-only et publication terminale. Leurs barrières de propriétaire et de publication restent en place.
- ESLint ciblé, syntaxe Node et diff-check passent. Le lint avait détecté un ternaire imbriqué dans le nouveau test ; sa fixture a été simplifiée, puis contrôles et tests réexécutés. Aucun diagnostic ignoré.
- Aucun fichier TypeScript modifié : pas de nouveau typecheck ou build API nécessaire ; le paquet compilé inchangé fournit le normaliseur et l'Oracle des tests.
- Une revue indépendante unique : aucun Critical ou Important. Le seul Minor concernait les cases/statu du présent plan encore en cours, mis à jour par cette clôture prévue. Aucun second cycle de revue.

## Décisions et limites

1. Corriger seulement les deux passages perdant la provenance ; aucun nouveau mécanisme de stockage ou d'autorisation. La suppression du refus des outils ne serait pas couverte par cette preuve.
2. Conserver uniquement les champs connus du MissionOracleState à l'écriture, plutôt que propager tous les champs supplémentaires acceptés par le normaliseur. Les droits et le CAS sont inchangés.
3. Les tests ne qualifient ni concurrence Redis/Mongo, ni arrêt brutal, ni initialisation d'outil à froid. La revue n'a pas réexécuté les commandes : les preuves de test proviennent de l'implémenteur.
4. L'image candidate e40f1e5 et son run 40122921364 restent acquis pour leur source exacte ; ils ne contiennent pas ce correctif. Aucun nouveau build, push, lancement CI, fournisseur réel, publication ou installation n'a été effectué.

La reprise automatique complète avec outils reste ouverte : l'adaptateur de reconstruction hôte et la preuve des effets doivent être qualifiés avant de lever son refus. La persistance des observations au bon moment du cycle de recherche doit également être vérifiée ; ces deux lignes ne prouvent pas l'atomicité outil/checkpoint/stockage. Stable reste NO-GO.
