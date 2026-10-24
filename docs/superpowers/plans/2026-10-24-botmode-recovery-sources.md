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

- [ ] Ajouter nativeMissionRecoveredOracleSources.spec.js : vrais contrats normalisés et Oracle ; conservation après écriture/replay ; succès sur observation durable ; refus sans sources, sources étrangères, URL malformée, révocation et refus CAS.
- [ ] Exécuter et observer les deux échecs de conservation/transmission avant correction.
- [ ] Conserver les sources normalisées lors de la fusion du résultat dans nativeMissionRecoveredOraclePersister.js.
- [ ] Passer uniquement le bucket de la tâche courante à l'Oracle dans nativeMissionRecoveredOracleVerifier.js.
- [ ] Exécuter la suite verte, les régressions adjacentes existantes et le lint/diff. Une revue indépendante unique, puis correction Important/Critical si nécessaire avec rouge→vert.

## Résultat

En cours. La reprise automatique complète avec outils reste hors de cette correction préalable.
