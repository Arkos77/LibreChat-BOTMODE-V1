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

- [x] Ajouter researchSources.spec.ts avec vrais Run/ToolNode/tampon/promotion/normalisation ; succès, échec écriture, sources absentes, autre appel, outil en erreur et reconstruction avec preuves sauvegardées.
- [x] Observer les échecs rouges : le résultat démarre avant sauvegarde et les erreurs de stockage ne le bloquent pas.
- [x] Ajouter le callback après validation des messages et appeler le résolveur à la transition, en vérifiant au moins une source liée à un appel courant.
- [x] Tests API et voisins ciblés, typecheck API, lint, build local pour JS, régression de reprise sources du lot 3. Une revue, correction Important/Critical une fois si nécessaire, bilan et limites.

## Résultat

Correction source terminée le 24 octobre 2026. Cœur produit : `03d8aa97a56780d245d9801b52d3e18239ca3e54`. Tests complémentaires et harnais : `cc18d0a276c718f88bbf0b0d85723d698b22f565`. Branche locale conservée : `fix/botmode-research-source-barrier-20261024`.

## Vérifications terminées

- RED avant correction : **5 échecs, 1 succès**. Modèle résultat invoqué avant sauvegarde ; échec de stockage ou sources absentes/ancien appel ne l'arrêtaient pas. L'outil en erreur était déjà refusé.
- API : **98 tests, 6 suites PASS**, dont sept cas de la nouvelle barrière et ses voisins natifs/Oracle/tampon.
- JavaScript : **28 tests, 4 suites PASS**, dont le vrai callback de collecte, createToolExecuteHandler et Run SDK en mode événementiel. La source est capturée sous l'identité canonique et sauvegardée avant le modèle résultat.
- **Total : 126 tests, 10 suites**, plus quatre scénarios HTTP du harnais compilé (succès/prose/outil en erreur/429), tous réussis. Le harnais fournit maintenant aussi le résolveur et refuse une requête HTTP de résultat avant passage de la barrière.
- Un test à promesse contrôlée garde l'écriture en attente : zéro appel résultat avant libération, un seul ensuite. Aucun sleep arbitraire.
- Reconstruction après échec contrôlé du modèle résultat avec le même MemorySaver et un nouveau tampon : effet web1, appel observation1, appels résultat2, écriture de sources1. État des sources restauré via le vrai normaliseur.
- Typecheck API incrémental6Go, ESLint ciblé, build local API et diff-check réussis. Aucun build Docker ni modèle externe.

## Revue et décisions

Une revue indépendante unique du cœur03d8aa9 : aucun Critical/Important. Suggestion **Minor différée** : ajouter un espion de callback aux anciens cas unitaires d'observations invalides/ambiguës, pour expliciter le non-appel. Le flot de contrôle garde déjà la validation avant callback, et le cas outil en erreur démontre zéro lecture de sources. Les tests d'attente, le callback hôte et le harnais HTTP ont ensuite renforcé la vérification, sans nouveau changement produit ni seconde revue.

1. Réutiliser le résolveur hôte existant, qui promeut, sauvegarde et relit les observations ; aucun second stockage ou scheduler. Une simple citation du modèle ne suffit pas.
2. Exiger au moins une source non vide associée à un appel validé de cette phase. Un bucket d'un ancien tool_call ne suffit pas. Les usages génériques sans résolveur gardent leur comportement : ils n'obtiennent pas une garantie de persistance hôte.
3. La barrière protège la transition lorsqu'elle est traversée. Aucun checkpoint déjà au-delà de ce point n'est migré, rejoué ou implicitement qualifié.
4. Le magasin durable du test reste simulé. La revue ne valide ni Redis/Mongo, ni SIGKILL, ni l'atomicité outil/sauvegarde/checkpoint. L'initialisation/reprise automatique hôte avec outils reste refusée et à qualifier séparément.
5. L'image e40f1e5 du run40122921364 ne contient ni ce correctif ni ceux du lot3. Aucun push, CI, build Docker, publication ou installation dans ce lot. Conserver les preuves de l'image dans leur périmètre exact ; regrouper les changements avant une nouvelle construction.

La fermeture de cette fenêtre avant réponse ne vaut pas garantie générale d'exécution exactement une fois ou de redémarrage complet. Stable reste NO-GO.
