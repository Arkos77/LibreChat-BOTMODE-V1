# D01 — lots restants après qualification des receipts, 23 octobre 2026

## Point de départ conservé
Source corrigée b2213e9717b879a91181c6ac9d7607124c30258b. Persistance des receipts dans MongoDB acquise avec fournisseur local déterministe : run 39883796226. Parcours externe cinq tâches/Oracle/P6 acquis séparément sur a6 : run 39877163780. La nouvelle mission externe b221 est arrêtée au critère Oracle; ses receipts externes restent non prouvées. Ne pas rejouer ces scénarios comme diagnostics génériques.

## Lots de preuve à séparer

| Lot | État dans le registre actuel | Contrôle attendu | Portée à ne pas inventer |
|---|---|---|---|
| Enfant imbriqué et création dynamique | Non prouvés par les cinq tâches planifiées | Création/sélection par l'orchestrateur, ACL centralisées, lignée enfant durable, résultat et Oracle/P6 | Un spécialiste du graphe ne suffit pas; aucune nouvelle mission externe autorisée |
| Endurance modèle seul, 180 minutes | Nouvelle preuve exacte b221 à obtenir | Workflow existant botmode-v1-mission-soak.yml, durée explicitement 180, temps réel observé, Redis/checkpoints/plan, pas de publication anticipée, Oracle puis un message MongoDB | Le défaut du workflow est 3 minutes; ce mode court ne clôt pas trois heures |
| HITL 30 minutes | Pause/reprise courte existante, durée complète non acquise dans le registre | Vraie interruption persistée, 30 minutes chronométrées, réauthentification si nécessaire, reprise unique sans duplication | Un simple sommeil ou des horloges simulées ne prouvent pas la reprise |
| Compaction, budget, watchdog et outils sur longue mission | Non couverts par le seul soak modèle | Scénario borné avec appels d'outils, croissance et compaction, budget/retries, arrêt et reprise observés | Trois heures d'un flux modèle ne qualifient pas ces fonctions |
| UX FR, TTS, renouvellement de clé, mobile | Preuves spécifiques encore à rapprocher des exigences | Parcours utilisateur, retour vocal réellement écouté, bouton de renouvellement, formats mobile et accès propriétaire | Aucun PASS global de navigateur n'est assimilé à ces validations |
| Full RAG et migration | Portées/restaurations historiques bornées | Fonctions explicitement promises, provenance du manifeste final, sauvegarde et limites du rollback | Restauration de volumes ne prouve pas une migration arbitraire |

## Constat sur le contrôle d'endurance existant
Relecture du workflow, de playwright.config.mission-soak.ts et du test durable model-only mission soak dans mission-oracle-runtime.spec.ts.
Le workflow compile cinq workspaces puis exécute le runtime et le navigateur avec modèle simulé et Redis. Le mode long utilise un délai de chunks de 12 secondes, observe notamment les jalons 30/90/150 minutes et réauthentifie le propriétaire avant la lecture des messages.
L'assertion actuelle impose au moins 90% de la durée configurée : le temps réellement mesuré doit être publié; ne pas déclarer 180 minutes effectivement observées si le journal en montre moins.
Le test affirme explicitement ne pas couvrir les outils réels, les fournisseurs externes, toutes les compactions ou les changements de version en cours de mission. Ces limites restent applicables.

## Ordre de travail
1. Préparer les contrôles longs et le HITL en s'appuyant sur leurs harness existants, avec vérification préalable du bootstrap réel et du serveur exact. Réutiliser les artefacts compatibles; ne pas reconstruire une image si l'application n'a pas changé.
2. Faire les validations locales et de contrat avant toute mission externe. Préparer un scénario enfant externe/dynamique précis, borné en appels et en coût, avant de demander son accord spécifique.
3. Regrouper la revue UX et les actions humaines indispensables (écoute TTS, validation du comportement attendu) dans une liste concrète.
4. Rapprocher la source finale et les manifestes des PR, puis qualifier cette composition exacte avant D03/D04. Aucune fusion ou publication implicite.

Aucun nouveau test long, build, appel fournisseur ou changement d'installation n'a été lancé pour établir ce plan. Aucun périmètre V1 n'est réduit; D01 reste ouvert, ainsi que les autres gates de release. NO-GO stable.
