# D01 — lots restants après qualification des receipts, 23 octobre 2026

## Rectification prioritaire — décisions et preuves antérieures retrouvées
La liste précédente mélangeait exigences V1, post-V1 et validations historiques. Ne pas ouvrir un nouveau chantier sur cette base.
- [Issue #66](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/66) : décision propriétaire du 20 octobre, spécialistes persistants supplémentaires explicitement post-V1 ; la V1 utilise les enfants éphémères sous permissions centrales. Leur factory persistante n'est pas un bloqueur V1.
- [Soak 39274101022](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39274101022), source 80fdfd3a0946b87be6d04434747b178c25fef3b5, job 118133771109 SUCCESS : durée réellement observée 180,44 minutes ; jalons Redis 30/90/150 minutes, Oracle VERIFIED, réauthentification propriétaire et publication MongoDB unique. Preuve acquise dans ce périmètre modèle simulé sans outils réels. Ne pas relancer trois heures par défaut ; établir d'abord si les changements de la composition nouvelle affectent cette preuve.
- [D04 39503107999](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39503107999) SUCCESS : une stable historique a déjà été promue. Le NO-GO courant concerne la nouvelle composition/candidate, sans annuler l'ancienne qualification.
- Contrats factory 0/1/N, orchestration, permissions, Oracle/P6, RAG borné, installation/rollback et fonctions UX déjà implémentées ne sont pas à reconstruire. Une limite précise ou une intégration nouvelle doit être distinguée d'une fonctionnalité absente.

## Point de départ conservé
Source corrigée b2213e9717b879a91181c6ac9d7607124c30258b. Persistance des receipts dans MongoDB acquise avec fournisseur local déterministe : run 39883796226. Parcours externe cinq tâches/Oracle/P6 acquis séparément sur a6 : run 39877163780. La nouvelle mission externe b221 est arrêtée au critère Oracle; ses receipts externes restent non prouvées. Ne pas rejouer ces scénarios comme diagnostics génériques.

## Lots de preuve à séparer

| Lot | État dans le registre actuel | Contrôle attendu | Portée à ne pas inventer |
|---|---|---|---|
| Enfant imbriqué et création dynamique | Enfant préautorisé durable local acquis (39899705393) ; contexte self éphémère durable local acquis (39901355206) ; factory persistante post-V1 (#66), enfant externe encore non prouvé | Création/sélection par l'orchestrateur, ACL centralisées, lignée enfant durable, résultat et Oracle/P6 | Un spécialiste du graphe ne suffit pas; aucune nouvelle mission externe autorisée |
| Endurance modèle seul, 180 minutes | Acquise : run 39274101022, 180,44 min au SHA 80fdfd3 ; rapprochement de composition à documenter | Workflow existant botmode-v1-mission-soak.yml, durée explicitement 180, temps réel observé, Redis/checkpoints/plan, pas de publication anticipée, Oracle puis un message MongoDB | Le défaut du workflow est 3 minutes; ce mode court ne clôt pas trois heures |
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

## Avancée locale — enfant autorisé
Le [lot enfant local](BOTMODE_V1_LOCAL_CHILD_LINEAGE_20261023.md), run 39899705393 sur image b221 conservée, établit un cycle parent/enfant/parent, Oracle VERIFIED, propriétaire/agent autorisés et lignée MongoDB avant/après redémarrage. Zéro événement enfant SSE observé : progression UI non validée. Fournisseur local et host routing désactivé ; aucun transfert à une mission externe. Le contexte self éphémère est désormais qualifié dans l'application : run 39901355206 SUCCESS, politique enregistrée inchangée, nœud canonique du plan rattaché au Worker, lignée MongoDB avant/après redémarrage. La création de nouveaux spécialistes enregistrés/personnalisés relève explicitement du post-V1 (#66). Les contrats 0/1/N et multi-spécialistes déjà validés restent acquis ; une nouvelle preuve runtime éventuelle doit être motivée par un manque précis, pas assimilée à une fonction à construire. D01 reste ouvert.

Les mentions historiques « aucun test long lancé pour établir ce plan » décrivaient seulement ce lot du 23 octobre ; elles ne signifient pas qu'aucun soak long n'avait réussi auparavant. Les anciennes validations ne sont pas invalidées par l'absence de leur lien dans la première version de ce plan.
