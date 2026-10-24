# BOTMODE — sources sauvegardées avant la phase résultat

> Exécution inline avec superpowers:executing-plans et une seule revue indépendante du lot.

**Goal:** Sur le chemin hôte qui fournit le résolveur de sources, attendre sa sauvegarde vérifiée avant d'appeler le modèle de résultat.

**Architecture:** L'hôte fournit déjà resolveMissionOracleSources, qui vide le tampon natif via persistTransientMissionOracleEvidence et vérifie le readback. Appeler ce résolveur à la transition observation→résultat, après validation des AI/ToolMessages, et exiger une observation du tool_call courant. Aucun nouveau stockage ou état de reprise.

**Tech Stack:** TypeScript/API, Run et MemorySaver existants, Jest, outils synthétiques locaux.

**Spec:** R12/R13/R18 de la feuille de route réconciliée ; base 41a748fe1d2d708325f045c2a1c6028a2bcc9e11 ; contrat du résolveur dans native.ts et chemin hôte de client.js.

## Global Constraints

- Source et tests locaux uniquement, sans push, CI, Docker, modèle distant ou installation.
- Le résolveur existant reste facultatif pour les usages génériques du compilateur ; la garantie de sauvegarde de ce lot concerne le chemin hôte qui le fournit.
- Pas de preuve fabriquée depuis les messages, pas de réexécution automatique d'un effet incertain, pas de modification de permissions ou d'Oracle/P6.
- Sans source du tool_call courant, avec erreur de sauvegarde ou outil refusé, aucun modèle de résultat.
- Reconstruction Run+MemorySaver et magasin de test simulé ne valent pas SIGKILL ni reprise hôte Redis/Mongo. Le refus de reconstruction des outils reste en place.

## Review Focus

- Un ancien tool_call ne satisfait pas la nouvelle observation.
- Échec de sauvegarde : aucune réponse finale ni retry d'outil déclenché par ce correctif.
- ToolMessage erreur ou ambigu : le résolveur de sources n'est pas appelé.
- Reprise après sauvegarde et échec modèle : preuves restaurées, une seule recherche.
- Les usages génériques sans callback conservent leur comportement et leur portée limitée.

## Tâche 1 — Barrière de provenance

Interfaces : requireResearchObservation(task, onObserved?) reçoit un callback facultatif avec les IDs validés ; native.ts le lie au résolveur de sources hôte déjà fourni.

- [ ] Ajouter researchSources.spec.ts avec vrais Run/ToolNode/tampon/promotion/normalisation ; succès, échec écriture, sources absentes, autre appel, outil en erreur et reconstruction avec preuves sauvegardées.
- [ ] Observer les échecs rouges : le résultat démarre avant sauvegarde et les erreurs de stockage ne le bloquent pas.
- [ ] Ajouter le callback après validation des messages et appeler le résolveur à la transition, en vérifiant au moins une source liée à un appel courant.
- [ ] Tests API et voisins ciblés, typecheck API, lint, build local pour JS, régression de reprise sources du lot 3. Une revue, correction Important/Critical une fois si nécessaire, bilan et limites.

## Résultat

En cours. Aucune extension de la reprise automatique hôte avec outils.
