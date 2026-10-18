# BOT MODE V1 — INVENTAIRE MAÎTRE DES EXIGENCES ET PREUVES

**Version du registre :** 2026-10-18, édition 1. **Type :** registre vivant de continuité et de clôture, **pas** certificat de release. **Statut décisionnel : NO-GO stable**, sauf décision ultérieure documentée sur tous les gates.

**Instantané de référence avant commit de documentation :** [PR #29](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/29), branche `botmode-v1-final-integration-qualification-20261016`, base `botmode-v1-integrated-candidate-20261014`, SHA **`a20cb0604a24dc5f4da9b41d30d5bcfa0831fc0a`**. Vérification 18/10/2026 via `git` + `gh`, worktree propre, PR OPEN/Draft, **28 workflows : 27 SUCCESS, 1 SKIPPED (accessibilité), 0 FAILURE**. Ce comptage est attaché à CE SHA antérieur à la version documentaire ; nouveau commit = refaire la lecture des statuts et la correspondance des preuves.

## 0. Règles de vérité et de classement

- **PÉRIMÈTRE** : **V1-BLOQUANT** = attendu pour la V1 telle que promise ; **V1-CONDITIONNEL** = dépend de la promesse, OS, fournisseur ou outil réellement livré ; **HISTORIQUE** = décision/fonction acquise à protéger ; **VISION/ROADMAP** = préserver sans inventer sa livraison.
- **STATUT** : **SHA-CI** = workflow vert sur le HEAD courant *dans les assertions précises qu'il exécute* ; **SHA-LOCAL/CONTRAT** = code/test ciblé présent, E2E élargi non prouvé ; **HISTORIQUE-PINNÉ** = succès sur autre SHA/digest ; **PARTIEL** = preuve limitée ; **INCONNU** = aucune preuve récente suffisante ; **BLOQUÉ** = décision, droit, risque ou test ouvert ; **ROADMAP** = idée/contrat futur, pas une promesse déjà réalisée.
- Les mots **« supporté », « automatiquement », « sans intervention », « sécurité », « reprise », « toujours une réponse »** doivent être reliés à des **assertions et un scénario négatif**, pas seulement à un nom de test ou au README.
- **Feature freeze de l'issue #19** : ne pas reconstruire P3/P4/P6 ni ajouter un second runtime/orchestrateur/scheduler/Task Engine/Authorization Router/Capability Router/MCP Registry/store. Un nouveau besoin non critique va dans V1.1 ; un défaut d'une promesse V1 reste un bloqueur jusqu'à correction ou coupe de périmètre **approuvée**.
- Ne pas confondre **continuité de la vision** et **obligation de développer tous les business/providers historiques maintenant**. Ne pas requalifier arbitrairement une exigence V1 en ROADMAP pour obtenir un GO.

## 1. Index des preuves et limites

| Preuve | Source / lien | Ce qu'elle démontre | Limite explicite |
|---|---|---|---|
| E01 | [CI 28 workflows du HEAD](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions?query=branch%3Abotmode-v1-final-integration-qualification-20261016) | 27 SUCCESS, 1 SKIPPED au SHA gelé ; Backend/Frontend/Static/Docker/Playwright verts | PASS n'est pas test universel ; accessibilité ignorée |
| E02 | [Oracle crash/restart #39085485305](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39085485305) | API SIGKILL, reprise Oracle et une seule publication dans les scénarios testés | Local fixture/model-only ou contrat testé, pas licence pour rejouer les outils arbitraires |
| E03 | [SDK Cold SIGKILL #39085485272](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39085485272) | SDK checkpoint/claim, fencing Redis, comportements de crash/reprise SDK | Certaines dépendances SDK sont des images **pinnées** historiques |
| E04 | [Current Image Subagent/Oracle #39085485235](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39085485235) | Sonde corrigée construisant l'image du HEAD, route des sous-agents modèle simulé | Pas une image GHCR publiée depuis ce HEAD, ni inférence payante |
| E05 | [HEAD Release Preflight #39085485285](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39085485285) | Build local exact SHA, installation Lite fraîche, HTTP et Mongo, audit source | **Ni push GHCR, ni vraie clé fournisseur, ni onboarding/mission utilisateur complète** |
| E06 | [Native Oracle Runtime #39085485304](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39085485304) | Mission/Oracle serveur HTTP et persistance selon harness | Modèle local déterministe, portée d'assertions à relire avant de généraliser |
| E07 | [Mission Sync/Checkpoint #39085485203](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39085485203) | Synchronisation, persistance/récupération dans le contrat testé | Ne prouve pas une mission de 3 h avec tous outils |
| E08 | [Main Integration Rehearsal #39085485300](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39085485300) | Simulations d'intégration source | Ne constitue **pas** un merge autorisé ou une image stable |
| E09 | [Playwright #39085485318](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39085485318), [Frontend #39085485215](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39085485215), [Backend #39085485278](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39085485278) | Suites applicatives automatiques vertes sur HEAD | Ne garantit pas chaque UX FR/clé API/TTS dans un vrai navigateur utilisateur |
| E10 | [Static #39085485324](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39085485324), [Secrets/Release Preflight E05](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39085485285) | Qualité/secret scan dans leur portée | Ni pentest, ni acceptation de toutes les dépendances |
| E11 | [Ancienne candidate premier utilisateur #39085485250](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39085485250), [GHCR Lite #39085485313](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39085485313), [rollback #39085485219](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39085485219) | Parcours utilisateur, bootstrap d'agents, Lite et rollback **dans une image historique** | Référence historiquement épinglée `54b30a3`/`sha256:07185…` ; ne démontre pas la distribution du HEAD |
| E12 | [Issue #19](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/19) | Feature freeze, périmètre, interdits de destruction/dépenses/merge | Date initiale 12/10 ; croiser avec décisions récentes |
| E13 | [Gate GHCR](BOTMODE_V1_GHCR_RELEASE_GATE.md), [décision npm](BOTMODE_V1_NPM_RISK_DECISION_20261014.md), [INSTALL](BOT_MODE_INSTALL.md) | Gates candidats / multi-arch / risque / rollback / procédure | Documents de versions antérieures ; dates, anciens SHA et nombres d'avis à réévaluer sur image finale |
| E14 | [README](../README.md), [release decision](BOT_MODE_RELEASE_DECISION.md), [rollback](BOT_MODE_ROLLBACK.md) | Architecture et engagements déclarés | README mentionne encore une ancienne branche runtime-fix ; prose ≠ preuve actuelle |
| E15 | Library : `BOT_MODE_MASTER_FINAL_CONSOLIDE_V1.1_20260926.txt` (152 sections), `BOT_MODE_Continuite_Consolidee_2026-09-27.md`, V8.2 ; prompts des 16-17/10 ; `BOTMODE_V1_PROMPT_REPRISE_INTEGRAL_20261018.md` | Vision, contraintes, méthodes historiques | Anciens HEAD, anciens tickets P* et promesses non automatiquement valides aujourd'hui |
| E16 | [NPM risk decision](BOTMODE_V1_NPM_RISK_DECISION_20261014.md), [licences](../THIRD_PARTY_NOTICES.md) | Trois avis production modérés historiquement identifiés ; `@codesandbox/nodebox` licence non MIT | Acceptation sécurité/licence et analyse du lockfile **final** ouvertes |
| E17 | [Runtime Image workflow](../.github/workflows/botmode-image.yml) | Build multiarch prépublication possible | Ne pas confondre build réussi et publication GHCR + pull public du SHA ; publication requiert accord explicite |

## 2. Inventaire fonctionnel « VISION → CONTRAT V1 → PREUVE »

Chaque ligne est une **obligation à vérifier**, pas une affirmation de couverture exhaustive. Le « prochain contrôle » vaut pour la *version/l'image livrée*, non pour les anciennes PR. Écrire le SHA/digest exact quand on clôture une ligne.

### A. Installation, distribution, données

| ID | Exigence / critère d'acceptation | Périmètre | Statut / preuves | Écart ou contrôle de clôture |
|---|---|---|---|---|
| IN-01 | Clone propre + `./install.sh` sans compilation source ni bootstrap manuel d'agents | V1-BLOQUANT | PARTIEL E05, E11 | Pull depuis image **publiée** du SHA final, nouvel utilisateur réel |
| IN-02 | Détection Lite (<4 GiB/sans AVX x86_64), Full si ressources, configurations cohérentes | V1-BLOQUANT | SHA-CI Lite E05 ; Full historique E14 | Full sur artefact final, limites OS explicites |
| IN-03 | `.env` créé sans écrasement ; mots de passe générés, permissions 600, aucune clé livrée | V1-BLOQUANT | SHA-CI E05/E10 | Vérifier sous install publié et after-update |
| IN-04 | Uniquement les clés fournisseurs désirées à fournir ; aucune étape technique cachée après install | V1-BLOQUANT | PARTIEL E05/E11 | Parcours first-user, création agents + mission à clé réelle |
| IN-05 | HTTP readiness et auth réelle de Mongo Lite ; état persistant après stop/start | V1-BLOQUANT | SHA-CI HTTP/Mongo E05 ; persistance ancienne E11 | Répéter sur GHCR final, auth onboarding |
| IN-06 | Full : API/Mongo/PostgreSQL/Meilisearch/RAG, isolation/migrations | V1-CONDITIONNEL | HISTORIQUE E14 | Smoke Full digest final si livré |
| IN-07 | Multi-arch OCI AMD64/ARM64, manifest+digests, provenance lockfile/SBOM | V1-BLOQUANT pour promesse multiarch | PARTIEL E17 | Approbation publication candidate, pull des 2 architectures |
| IN-08 | Installation GHCR publique ou authentifiée depuis image immuable du SHA | V1-BLOQUANT | BLOQUÉ E05/E13 | Image actuelle **non publiée**, accord utilisateur nécessaire |
| IN-09 | Sauvegarde/restore volumes, configuration, DB et données ; non-régression ACL | V1-BLOQUANT | HISTORIQUE E13/E14 ; scripts présents | Vérifier restauration sur staging avec digest final + test d'auth |
| IN-10 | Rollback digest et restauration cohérente des données après migration | V1-BLOQUANT dans le périmètre promis | HISTORIQUE-PINNÉ E11/E13 | Rehearsal depuis registre final, compatibility DB décidée |
| IN-11 | Scripts start/stop/update/doctor, refus d'actions dangereuses sur volumes existants | V1-BLOQUANT | SOURCE/CONTRAT E13/E14 | Exécuter parcours final et erreurs contrôlées |
| IN-12 | OS pris en charge annoncé honnêtement : Linux, Crostini, Mac/ARM, WSL2 | V1-CONDITIONNEL | PARTIEL E13/E14 | Qualifier réellement chaque plateforme annoncée ; Windows natif non promis |
| IN-13 | README/documentation reproducibilité/limites/rollback utilisables par un tiers | V1-BLOQUANT | PARTIEL E14 | Actualiser anciens SHA, noter limites et commandes prouvées |

### B. Missions, orchestration, agents et autonomie

| ID | Exigence / critère d'acceptation | Périmètre | Statut / preuves | Écart ou contrôle de clôture |
|---|---|---|---|---|
| OR-01 | Noyau LibreChat natif, un Director/Orchestrator, un Task Engine/DAG, un scheduler, une vérité durable | HISTORIQUE / V1-BLOQUANT | SOURCE E15, CI E06/E07 | Vérifier invariants de non-duplication, ne pas rouvrir phases gelées |
| OR-02 | BOT-0 Worker, BOT-1 spécialiste, BOT-2 expert, BOT-3 orchestrator, BOT-4 Director (rôles et non cinq runtimes) | V1-CONDITIONNEL | VISION E15 ; composants présents | Prouver mapping effectif sans prétendre cinq services déployés |
| OR-03 | Analyse simple FAST vs plan multi-agent DEEP déterminée par complexité/mandat/coût | V1-BLOQUANT pour expérience autonome promise | PARTIEL E06, E15 | E2E deux missions de complexités différentes |
| OR-04 | MissionContract, objectifs, critères, Budget, risques, plan/DAG sauvegardés | V1-BLOQUANT | SHA-CI E06/E07 et code | Readback du contrat et du graphe via API |
| OR-05 | Provisionnement initial automatique de six agents sans bouton désactivé `agents=0` | V1-BLOQUANT | HISTORIQUE-PINNÉ E11 | Première installation GHCR **HEAD** + contrôle UI |
| OR-06 | Factory de spécialistes créée/sélectionne 0/1/N agents à la demande et autorise seulement leurs capacités | V1-BLOQUANT | PARTIEL E04/E06 | E2E dynamique sous mandat avec preuve de permissions |
| OR-07 | Worker → spécialiste(s) → Oracle → publication unique et persistée (fixture déterministe) | V1-BLOQUANT | SHA-CI E02/E04/E06 | Garder preuve exacte; distinguer fournisseur réel |
| OR-08 | Mission avec fournisseur réel (Gemini/OpenRouter), terminal output, Mongo readback | V1-BLOQUANT | HISTORIQUE E14, ancien run GO1 ; HEAD INCONNU | Test réel sur HEAD ou consigner décision humaine et risque |
| OR-09 | HITL/pause/reprise, correction de permissions, STOP/CANCEL tardif | V1-BLOQUANT | PARTIEL E07, E15 | Parcours pause 30 min et readback après restart si promesse |
| OR-10 | Replanification, parallélisation bornée, retries typés, détection boucles | V1-BLOQUANT si autonomie annoncée | SOURCE/CONTRAT E15 | Tests des cas négatifs et watchdog; ne pas inventer couverture |
| OR-11 | Mission de plusieurs heures, compaction contexte, budget hiérarchique, watchdog progress-aware | V1-CONDITIONNEL selon promesse V1 | INCONNU E15 | Soak réel ~3 h ; sinon limitation release explicite, à approuver |
| OR-12 | Cold restart worker/API, provider failover, Redis/Mongo, état checkpoint conservé | V1-BLOQUANT | SHA-CI model-only E02/E03, autre partiel | Ne pas extrapoler à panne DB totale ou tous effets externes |
| OR-13 | Reprise sous agents/outils externes, reçus d'effets, exactly-once, replay incertain interdit | V1-BLOQUANT pour outils autonomes | PARTIEL E02/E03, protections fail-closed | Qualifier les chemins d'effets ou limiter explicitement avec accord |
| OR-14 | Arrêt/reprise multiples et absence de doublon de tâche/effet/terminal Oracle | V1-BLOQUANT | SHA-CI certaines assertions E02/E03 | Crash à chaque frontière, multi-recovery et readback |
| OR-15 | Publication Barrier P6 : candidat privé durable, Oracle indépendant, accept/reject, une réponse finale | V1-BLOQUANT | SHA-CI ciblé E02/E06; architecture gelée E15 | Tester mêmes garanties lors des pièces jointes et HITL |
| OR-16 | Artefact final visible dans conversation ET fiche Idée/Projet/Work, pièces jointes autorisées | V1-BLOQUANT | SOURCE/CONTRAT E09/E15 | E2E UI sur SHA final, pièces jointes non imaginées |
| OR-17 | MTO traçabilité causal : task→agent→tool→evidence→Oracle→durable→publication + coûts/latence/failures | V1-BLOQUANT pour explicabilité | SOURCE/CONTRAT, module MTO dans code ; E15 | E2E de lecture du cheminement, sans chaîne de pensée privée |

### C. Fournisseurs, coûts, budgets, routage, capacités

| ID | Exigence / critère d'acceptation | Périmètre | Statut / preuves | Écart ou contrôle de clôture |
|---|---|---|---|---|
| PC-01 | Catalogue montre uniquement les providers/configs autorisés, pas des capacités fantômes | V1-BLOQUANT | PARTIEL E09/E15 | UI avec OpenRouter/Gemini et sans clé |
| PC-02 | Routage capability/provider/modèle unique, permission et budget avant outil | V1-BLOQUANT | SOURCE/CONTRAT E15 | Test route+refus+receipts, sans deuxième router |
| PC-03 | OpenRouter et Gemini réellement configurables ; génération avec clé valable | V1-BLOQUANT | HISTORIQUE fournisseur réel E14 ; HEAD INCONNU | E2E au HEAD avec clé autorisée sans exposer le secret |
| PC-04 | Modèles gratuits valides, bascule sur 429/panne si provider secondaire autorisé | V1-BLOQUANT dans promesse « toujours une réponse » | INCONNU E15 | Test 429/outage/crédits épuisés; erreur explicite si aucun |
| PC-05 | Payant sous plafond, justification ROI, pas de double facturation automatique | V1-BLOQUANT pour mandat financier | SOURCE/CONTRAT E15 | Simulation non facturante et test négatif |
| PC-06 | Santé provider : latence, quotas, coûts, receipts, upgrade proposé | V1-CONDITIONNEL | PARTIEL E15 | Vérifier affichage/événements MTO |
| PC-07 | Familles OpenAI/Gemini/Mistral/DeepSeek/Qwen/GLM/MiniMax/HF/Ollama/Grok/Anthropic | VISION/ROADMAP sauf officiellement supportées | ROADMAP E15 | Catalogue par provider (configuré/testé), aucune garantie globale |
| PC-08 | Bouton renouvellement de clé par fournisseur sans fuite de secrets | V1-CONDITIONNEL UX demandée | INCONNU E15 | Test du formulaire et persistance, demande mémorisée |
| PC-09 | Discovery externe : DISCOVER→VERIFY→AUTH/COST/LICENSE/SECURITY→TEST→ORACLE→REGISTRY | VISION/ROADMAP | SOURCE/CONTRAT E15 | Aucun registre concurrent, intégration si gain mesuré |
| PC-10 | Mise à jour catalogue modèles/skills proposée ou réalisée sous mandat | V1-CONDITIONNEL selon promesse | INCONNU E15 | Versioning, autorisations, notifications et rollback |
| PC-11 | MCP/A2A, API externes, Execution Environment Router, sandbox | V1-CONDITIONNEL selon outils activés | PARTIEL code/E15 | E2E autorisé/refusé et effets bornés |
| PC-12 | Identités séparées, secrets/permissions, scopes, vie privée | V1-BLOQUANT | SOURCE/CONTRAT E12/E15 | Négatifs cross-tenant/projet, logs sans secrets |

### D. Sécurité, durabilité, contrôle humain et conformité

| ID | Exigence / critère d'acceptation | Périmètre | Statut / preuves | Écart ou contrôle de clôture |
|---|---|---|---|---|
| SE-01 | Decision ≠ Authorization ; capability/skill ≠ permission ; aucun outil hors scope | V1-BLOQUANT | SOURCE + tests ciblés E02/E09/E15 | Tester refus et révocation après claim/handoff |
| SE-02 | HITL pour paiement, publication externe, credentials, risque sensible ; pas de microapprobation | V1-BLOQUANT | PARTIEL E07 | Test approbation, annulation et reprise |
| SE-03 | Budget/risk gates, receipts d'effets, « incertain = fail-closed » | V1-BLOQUANT | PARTIEL E02/E03 | Couverture réelle des chemins prod, pas seulement SDK |
| SE-04 | Audit Git secrets, fichiers ignorés, provenance, licence du fork | V1-BLOQUANT | SHA-CI E05/E10 | Scanner artefact final, acceptation licences tiers |
| SE-05 | Avis npm mammoth/argparse/sprintf-js ; dépendances critiques/hautes courantes | V1-BLOQUANT | BLOQUÉ / revue requise E13/E16 | Lockfile SHA final + exposition/mitigation + responsable |
| SE-06 | DOCX parsing/aperçu HTML isolés, temps/RAM/concurrence, ZIP bomb/XSS | V1-BLOQUANT si upload DOCX promis | HISTORIQUE E13/E16 | Tests hostiles sur HEAD, pas « patché » par seuil audit |
| SE-07 | MIT LibreChat, notices SUL/tiers, usage commercial | V1-BLOQUANT distribution | SOURCE E14/E16, décision INCONNUE | Revue notices et restrictions redistribution |
| SE-08 | Audit conteneur/OS/DB, réseau et secrets | V1-CONDITIONNEL selon publication | PARTIEL E05/E10 | Audit image finale et limites consignées |
| SE-09 | Aucun reset volume, down -v, prune -a ni suppression de compte utilisateur | V1-BLOQUANT méthode | Décision ferme E12/E15 | Destructif uniquement jetable et autorisé |
| SE-10 | Promesses migration in-place/downgrade auto, périmètre Helm legacy | V1-BLOQUANT décision de scope | BLOQUÉ E13/E14 | Docker Compose/GHCR-only proposé, décision humaine |
| SE-11 | Protections GitHub, PR draft/review, merge base/stack, rollback | V1-BLOQUANT release | PARTIEL E08/E13 | Revue de branche stable et GO humain |
| SE-12 | OSINT/cyber scope, preuve d'autorisation, aucun test offensif hors mandat | VISION/ROADMAP | SOURCE E15 | Recherche passive seulement sans mandat actif |

### E. UI, collaboration, RAG, mémoire, médias et navigateur

| ID | Exigence / critère d'acceptation | Périmètre | Statut / preuves | Écart ou contrôle de clôture |
|---|---|---|---|---|
| UX-01 | Parcours FR Chat/Work, Projet/Idées, objectif, statut, bouton mission | V1-BLOQUANT | PARTIEL E09 ; code BotModeProjectPanel/IdeasView | Vraie navigation premier utilisateur |
| UX-02 | Idée analysée → Projet/conversation → résultat directement dans la fiche Idée | V1-BLOQUANT UX promise | PARTIEL E09/E15 | E2E avec preuve de lecture |
| UX-03 | Agents, progression, Oracle, MTO, sources, coûts visibles | V1-CONDITIONNEL explicabilité | PARTIEL E09 + code MTO | Vérifier connexion au runtime |
| UX-04 | Français « Pensée », labels, erreurs et TTS FR sans erreur 500 | V1-CONDITIONNEL | INCONNU E15 | UI/TTS réel, demande historique |
| UX-05 | Accessibilité clavier/ARIA, scroll, layout mobile, formulaires | V1-BLOQUANT UX supportée | PARTIEL E09 ; workflow accessibilité SKIPPED E01 | Exécuter ou inscrire limitation |
| UX-06 | Multi-tenant/ACL, partage projet, aucune fuite cross-user | V1-BLOQUANT | PARTIEL E09/E15 | Tests API+UI à 2 comptes |
| UX-07 | Documents RAG, provenance, scopes mémoire personnelle/projet | V1-CONDITIONNEL si RAG promis | SOURCE/CONTRAT E14/E15 ; test final INCONNU | Upload, search, citations profil Full |
| UX-08 | Skills/Registry, publication contrôlée avec Oracle et rollback | V1-CONDITIONNEL + évolution | SOURCE modules skills et validation | Manuel V1 ≠ amélioration autonome roadmap |
| UX-09 | Browser/computer/comptes externes sous mandat, sessions, secrets séparés | V1-CONDITIONNEL si exposé | SOURCE/CONTRAT E15 | Effect-time auth + sandbox, pas de compte réel sans accord |
| UX-10 | PDF/DOCX, image/vidéo/audio/voix/musique/3D/Spatial routables | VISION/ROADMAP multi-provider | Modules partiels ; E2E global INCONNU | Préserver routeurs natifs, promesse par provider |
| UX-11 | YouTube/Shorts/social 24/24, plan→production→QA→publication | VISION/ROADMAP | ROADMAP E15 | Aucune chaîne réelle sans mandat |
| UX-12 | Rooms, Channel Gateway, Experience Store, Skill Palette, notifications | VISION/ROADMAP | SOURCE/CONTRAT E15 | Extensions sans second orchestrateur |
| UX-13 | Mémoires longues/compaction stable, confidentialité personnelle/projet/org | V1-CONDITIONNEL selon promesse | PARTIEL E07/E15 | Soak avec provenance et contexte |

### F. Vision business, amélioration, extensions à préserver — pas toutes promises V1

| ID | Orientation historique | Périmètre | Statut / preuve | Décision de continuité |
|---|---|---|---|---|
| VI-01 | Opportunity Intelligence : veille signaux France→Europe→monde, qualification/priorisation | VISION/ROADMAP | E15 | Conserver pipeline, aucun revenu réel revendiqué |
| VI-02 | Economic Enablement : Business Model Router, ROI/risque, Fiscal/Legal Eligibility | VISION/ROADMAP | E15 | Consultatif, toujours Decision→Policy/Auth |
| VI-03 | Business Blueprint→Execution Contract→DAG→Evidence/Oracle→coûts/marge | VISION/ROADMAP | E15 | Parcours testable futur, pas second moteur |
| VI-04 | Produits, UGC/marques, expériences/services, marketing/conciergerie | VISION/ROADMAP | E15 | Opportunités conservées, pas tous les verticals ce soir |
| VI-05 | Marchés freelance/emplois, aides/subventions, appels d'offres, financement | VISION/ROADMAP | E15 | Sources/provenance/juridiction |
| VI-06 | Sourcing Asie (1688/Taobao/Weidian/Yupoo), QC/logistique | VISION/ROADMAP | E15 | Permissions/compliance |
| VI-07 | Grave care / entretien de sépultures et autres micro-entreprises historiques | VISION/ROADMAP | E15 | Mémoire du thème, non gate release |
| VI-08 | Creator Monetization, Finom/Finance Ops, marketplaces/paiement/IP | VISION/ROADMAP | E15 | Aucun paiement sans HITL |
| VI-09 | Capability Evolution, MIMO/Distill/Dream/Harvest, Learning, ImprovementCandidate | VISION/ROADMAP | E15 | Evaluation→Oracle→Policy→publication versionnée |
| VI-10 | Source Registry/OSINT, Wayback, veille obsolescence, sécurité/pentest encadrés | VISION/ROADMAP | E15 | Permission et provenance, pas de testing actif sans mandat |
| VI-11 | Providers candidats (Composio/Firecrawl/TGStat/E2B/Orgo/ComfyUI/Flux/Tripo/Perplexity...) | VISION/ROADMAP | E15 | Sources de capacités, aucune autorité concurrente |
| VI-12 | JARVIS desktop, voix/overlay/CDP/Relay; Jev/GIVE/NanoJev décideurs consultatifs | HISTORIQUE / ROADMAP | E15 | JARVIS = outil de dev/exécuteur optionnel, jamais cœur BOT MODE |
| VI-13 | Evaluation adversariale inspirée Arena/Grill, Failure Intelligence | VISION/ROADMAP | E15 | Ne pas ajouter Arena, reprendre seulement gain prouvé |
| VI-14 | MTO complet, UI Cheminement, raisons structurées sans chain of thought | V1-CONDITIONNEL + vision | E15 | Vérifier raccordement UI et modèle causal |

## 3. Pourquoi un GO automatique est encore interdit

1. Image candidate publiée GHCR depuis SHA exact non prouvée par E05 (le build local est utile mais distinct).
2. Workflows E11/E03 utilisant anciennes images : preuves historiques conservées, **pas** artefact final.
3. Modèle réel, fallback 429, spécialisation dynamique et parcours UI pas globalement attestés par 27/28.
4. Crash model-only prouvé selon E02 ; outils externes et soak ~3h pas automatiquement couverts.
5. Dépendances/licences/rollback/image multiarch finale = **décision**, pas déduction de CI.
6. Autorisations humaines pour publication candidate, acceptation risques, merge, stable = gates distincts.

## 4. Ordre de qualification sans recommencer les audits historiques

| Lot | Dépendance | Action et preuve de sortie | Nature |
|---|---|---|---|
| L0 | Immédiat | Enregistrer ce registre, mémo, prompt ; figer SHA et preuves | Documentation/checkpoint |
| L1 | L0 | Tester ciblé UX 1er utilisateur/agents/dynamique/provider/fallback/reçus et DOCX | Exécutable sans coût réel ; HITL sur clés si nécessaire |
| L2 | L1 | Audit lockfile/licences/OS, sauvegarde-restauration staging, build multiarch sans push | Jetable, NO-GO sur risque non arbitré |
| L3 | L1+L2 | Accord **candidate GHCR seulement** ; publier digest immuable, vérifier pull/multiarch, install/mission/rollback | Autorisation humaine obligatoire |
| L4 | L3 | Limitations, protections Git, README, accord humain séparé pour merge/tag/stable | Autorisation humaine obligatoire |

Ce sont des gates, **pas** un nombre garanti de corrections ni un pourcentage fictif.

## 5. Usage, anti-boucle et éditions futures

- Avant chaque lot : contrôler HEAD, PR headRefOid, SHA exact des CI et digest image. Nouveau commit → checkpoint nouveau, preuves historiques conservées.
- Clôture par ligne : preuve/run/commit/log, SHA, digest, assertions positives/négatives, portée/limite, date.
- Ne toucher aux blocs gelés P3/P4/P6 que sur régression documentée. Grouper les correctifs par cause racine.
- Décisions humaines : D-01 scope V1 ; D-02 risques npm/licences ; D-03 publication candidate GHCR ; D-04 merge/tag/release stable ; D-05 crédits, secrets, actions destructives.
- Tests jetables automatiques autorisés ; volumes personnels Chromebook/Mac intouchables sans accord.
- Ce registre couvre les **domaines historiques** ; il ne certifie pas chaque fonction. Réduire les « INCONNU » par tests reproductibles et décisions tracées.


## 6. Checkpoint complémentaire — 18/10/2026, reprise PR #29

**Révision inspectée** : `b49a5bf03d4f48b05f219ae417cb2c0aa99ec4ad` ; worktree initial propre ; PR #29 OPEN/Draft ; Desktop Commander `penguin` Online. Lors du premier relevé, 24 SUCCESS, 3 IN_PROGRESS (Static, Main Integration, Playwright), 1 SKIPPED accessibilité. Résultats encore en cours non extrapolables. Aucun digest GHCR attribué à ce SHA.

**UX-02 / SE-01 — PARTIEL, correction locale en qualification :** `IdeasView.tsx` utilisait à tort `agentsResponse.data[0]` si le Worker BOT MODE était absent, après avoir déjà créé/modifié le projet et l'idée. Correction en cours : recherche du Worker avec permission EDIT avant création/mutation, refus explicite s'il est absent, navigation uniquement vers son ID. Preuve positive attendue : test navigateur sur image du nouveau SHA ; négatif attendu : zéro mutation de projet/idée et aucune mission lancée si le Worker n'est pas disponible. Ne PAS marquer validé tant que ces tests n'ont pas réussi.

**IN-04 / OR-05 — PARTIEL, écart confirmé :** `botmode-v1-fresh-onboarding-e2e.yml` est un scénario historique épinglé à `d4e82dded5df49f17b97e20361c89796b8f1e068` et appelle explicitement `POST /api/agents/botmode/setup`. Le statut SUCCESS de ce workflow au SHA de la PR reflète la version déclenchante du YAML, pas une image ou un onboarding automatiquement réalisés depuis le HEAD. Le code courant expose l'initialisation utilisateur dans `BotModeProjectPanel.tsx`, mais l'absence de clic n'est pas prouvée comme fonctionnelle. Garder le gate ouvert, ne pas créer d'agent en base via scripts legacy.

**IN-08 / IN-07 — BLOQUÉ_HITL** : aucun GHCR candidate attesté pour `b49a5bf03`; D-03 publication doit rester distinct de la décision stable.

**UX-05 — PARTIEL** : workflow accessibilité SKIPPED, jamais comptabilisé comme PASS.

**Nouveau test ciblé :** `client/src/components/Ideas/IdeasView.test.tsx` couvre (1) absence de Worker malgré un agent ordinaire, (2) échec de l’API ACL, (3) sélection explicite du Worker ; il reste NON EXÉCUTÉ avant CI de qualification. Sur `b49a5bf03`, tous les workflows sont maintenant terminés : 27 SUCCESS et 1 SKIPPED accessibilité, 0 FAILURE (contrôles du code de cette révision uniquement).

**Validation locale de correction :** `git diff --check` passé ; `npx prettier --check` bloqué par dépendance locale manquante `prettier-plugin-tailwindcss`, donc lint/format non validés localement. Poursuivre par CI exact SHA et tests négatifs pertinents, sans modifier les volumes personnels.

**IN-04 / OR-05 — nouveau contrôle préparé :** conversion du workflow de premier utilisateur `botmode-v1-fresh-onboarding-e2e.yml` de l'ancien checkout fixe `d4e82dde` au SHA exact déclencheur. Celui-ci construit localement l'image du SHA, crée un utilisateur+JWT, provoque un onboarding explicite autorisé des six agents, vérifie délégation ACL puis reboot et readback. Workflow NON EXÉCUTÉ au moment de l'édition ; le succès éventuel ne prouverait PAS encore un provisioning sans clic ni un pull GHCR du même SHA. Aucun fournisseur réel sollicité.

**SE-05 — Audit npm local du lockfile exact `921516af47296051d5ee2ddda8392e1b274042ba` :** `npm audit --omit=dev --package-lock-only --json`, Node 24.21.0 / npm 11.19.0, `package-lock.json` SHA256 `4b0b6d51afb679bc3b1633f29609d3aa9bdce8515f4df719bf0ddc67d22b44b3`. Résultat 3 modérées (`mammoth` directe, `argparse`, `sprintf-js` transitives), 0 élevée/critique ; audit exit 1 **attendu du fait des trois vulnérabilités, pas PASS sécurité**. Proposition automatique `mammoth@0.3.29` avec changement majeur, NON appliquée. Les 25 alertes du dépôt `main` annoncées par le serveur GitHub sur push concernent la branche par défaut et ne sont pas assimilées à cet audit production courant. **D-02 revue des risques non signée : BLOQUÉ_HITL.**

**Nouveau run exact source first-user :** [#39090842532](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39090842532), commit `921516af47296051d5ee2ddda8392e1b274042ba`, workflow_dispatch, `SUCCESS` ; steps vérifiés : checkout SHA courant, build image locale, install Lite, création compte et JWT, six agents via API native authentifiée, ACL/délégation/idempotence, redémarrage et persistance. **IN-05 : VALIDÉ_SHA_PÉRIMÈTRE pour l'installation Lite source-build et l'auth/restart ; IN-04 / OR-05 : PARTIEL, car POST setup explicite dans le test et création automatique sans clic non attestée. IN-08 : toujours BLOQUÉ_HITL — aucune image GHCR construite/publiée pour ce SHA.**

**SE-06 — qualification de reachability DOCX** : `botmode-v1-mammoth-reachability.yml` converti localement vers checkout HEAD avec comparaison explicite du SHA. Nouveau run du commit de qualification attendu ; la campagne historique green pinned ne vaut pas preuve du lock HEAD. Tant que ce nouveau run n'est pas terminé, **PARTIEL**.

**UX-01 / UX-02 / UX-05 — lot Idées** : [Frontend Unit Tests #39090844941](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39090844941) `SUCCESS` pour SHA `921516af4` (Vite build, TypeScript, client Jest 2 shards et package client verts) avec `IdeasView.test.tsx` dans le code. L'absence de ligne Jest par fichier dans les logs accessibles empêche d'attribuer indépendamment un PASS au test ciblé ; son exécution reste à confirmer via résultat nominatif ou run ciblé. Une suite frontend verte ne remplace pas le parcours navigateur complet ; UX-02 demeure PARTIEL. L'accessibilité est SKIPPED, pas PASS.

**IN-13 — Documentation active corrigée localement :** `README.md` ne doit plus présenter l'ancienne branche `botmode-v1-runtime-fix` comme qualification courante ; il annonce la PR #29 Draft, la non-publication du SHA courant, l'étape explicite de setup et les limites OS. `docs/BOT_MODE_INSTALL.md` conserve la commande candidate `d4e82dde` comme exemple ARCHIVÉ, non preuve HEAD. Cette modification reste à valider au nouveau SHA.


**UX-02 / IN-04 / PC-04 — lot après `ccb9ae9f5`, encore non validé CI :** dans `IdeasView.tsx`, une mission explicitement lancée sans Worker peut demander à l’endpoint natif authentifié de créer les six agents **uniquement si un seul `OpenRouter: openrouter/free` identifiable** est disponible. Readback ACL (`listAgents` avec EDIT) après initialisation avant de créer/modifier le projet ou l'idée ; refus si aucun Worker autorisé, si catalogue payant seul ou ambigu, ou si l'API échoue. Scénarios Jest négatifs et positifs ajoutés. Cette évolution ne couvre PAS encore l’auto-initialisation depuis Chat/Work ni les catalogues Gemini sans garantie de gratuité ; elle ne constitue pas une garantie générale de fallback 429. Aucun test de fournisseur réel ni de modèle payant déclenché. **Statut : PARTIEL / CI à exécuter au prochain SHA.**

**SE-06 — nouveau run exact HEAD** : [#39091502539](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39091502539) `SUCCESS` sur `ccb9ae9f53d71eb33498d45bad794c4a50d747ca`. `BOTMODE_DOCX_LIBRARY_MODULE_LOADS=[]`, `BOTMODE_DOCX_LIBRARY_RUNTIME_REACHABILITY=PASS`, **15/15** tests ZIP/DOCX (2 suites). **VALIDÉ_SHA_PÉRIMÈTRE** pour ces deux conversions bénignes et les 15 régressions ; l'avis de dépendance et le risque DOCX hostile/DoS non borné restent en **PARTIEL / BLOQUÉ_HITL D-02**, aucune extrapolation universelle.

**SE-11 — Protection GitHub `main`, lecture API au SHA `e05c57a8a` :** `allow_force_pushes=false`, `allow_deletions=false`, mais `enforce_admins=false`, **aucun** required status checks et **aucune** required PR review configurée dans la réponse de protection de branche ; aucun ruleset renvoyé. Conclusion **PARTIEL / GATE STABLE BLOQUANT** : la PR #29 reste Draft et sur base `botmode-v1-integrated-candidate-20261014` (non `main`) ; avant D-04, revue de la chaîne PR/merge-base et approbation du durcissement main indispensables. Aucune modification de protection appliquée sans autorisation.

**G4 / G6 — publication GHCR préparée localement, non exécutée :** `botmode-image.yml` contient désormais un garde obligatoire avant les jobs `packages:write`: tag exact `candidate-botmode-v1-<SHA12>`, origine branche seulement, lecture fail-closed des tags GHCR existants (refus candidate/alias SHA déjà pris), input externalisé via env pour éviter l'injection de shell, aucun `latest`, concurrence sérialisée par source SHA. Script `scripts/botmode/guard-candidate-ghcr.sh`, 5 tests négatifs/positifs `test_ghcr_candidate_guard.py` PASS sur la machine. Nouveau mode `verify_guard_only` permet de contrôler le token du runner sans push/build. L'auth CLI locale retourne **HTTP 403 `read:packages`** lors d'une lecture `users/Arkos77/packages/container/librechat-botmode-v1/versions` ; cela ne prouve rien sur le `GITHUB_TOKEN` du runner : un contrôle guard-only est obligatoire avant D-03. Aucun digest/tag n'a été modifié.

**UX-02 / statique au SHA `e05c57a8a17dafbde92a662cd93aa5c3da601953` :** [Frontend #39091743682](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39091743682) SUCCESS avec preuve nominative `PASS src/components/Ideas/IdeasView.test.tsx` (shard 1 : 249 suites / 2806 tests ; shard 2 : 248 suites / 3408 tests), Vite et TypeScript success. [Static #39091743728](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39091743728) : job Static checks en ÉCHEC, cause exacte `IdeasView.test.tsx:79:9` Prettier et ordre des imports **1 fichier sur 91**, pas une régression du runtime. Remède local : chaînage `jest` reformatté, tri exécuté par `node scripts/sort-imports.mts` puis `--check` PASS ; diff check PASS. **Rester PARTIEL tant que nouveau SHA n’a pas confirmé les contrôles.**

**D-03 / G4 — garde GHCR vérifié sur runner, pas de publication :** [#39092833171](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39092833171) `workflow_dispatch`, SHA `e1363e5a7d547a093f466ecc72f377f97ad9a4c6`, job **Fail-closed immutable candidate tag guard SUCCESS** avec `BOTMODE_GHCR_TAG_PREPUBLICATION_GUARD=PASS`. Préflight build, build/push, merge, pull et smoke = **SKIPPED attendu** en mode `verify_guard_only=true`, `publish=false`. Le jeton Actions a l'accès à l'inventaire GHCR ; le jeton CLI local HTTP 403 n'est plus un blocage de cette vérification. Cette preuve ne garantit PAS la non-mutation future des tags par un autre acteur ni la qualification de l'image du SHA final. Durcissement supplémentaire préparé localement après revue de la documentation officielle GitHub Actions : `cancel-in-progress: false` et séparation de groupes de concurrence manuels/PR afin qu'une PR ne puisse annuler une publication en cours. D-03 publication IMMUTABLE demeure BLOQUÉ_HITL.


**OR-01 / OR-03 / PC-01 — qualification du fournisseur libre sur SHA actuel, workflow préparé NON EXÉCUTÉ :** mise à jour de l'unique workflow manuel `.github/workflows/botmode-v1-release-real-provider-gate.yml` pour `checkout github.sha`, construction locale de l'image sans push, `openrouter/free` uniquement, jeton Actions `OPENROUTER_API_KEY` et harness de ce même commit `scripts/botmode/ci-oracle-publication-gate.py`. Redis et routeur multi-modèles sont modifiés seulement dans la stack CI jetable ; router de production et fallback 429 multi-fournisseurs **non couverts**. Le harness exige Oracle `VERIFIED` puis publication et candidat `HUMAN_REVIEW` non publié, avec conservation durable. Un test de connexion gratuit est effectué avant l'essai, sans paiement autorisé. Si le fournisseur retourne 401/429/quotas, enregistrer BLOQUÉ_PROVIDER, sans fausse preuve ni répétitions automatiques de la mission. La validation complète de la mission publique reste en attente d'exécution et de preuve du SHA.

**OR-01 / OR-03 / PC-01 — exécution live Free #39093570016 : FAIL au SHA `4f1514502086680c1fcc99025586eeb724242ab9`. Preuve : checkout et image locale HEAD PASS, préflight réel `OpenRouter/openrouter/free` PASS, setup HTTP 200 et Worker natif stocké `OpenRouter/openrouter/free`, mission Worker démarrée HTTP 200 avec streamId. Le `GET /chat/stream/:streamId?resume=true` a livré **1037 trames SSE / 1 186 511 octets** pendant 180 secondes, sans `final: true` ni frame error, puis curl 28 timeout. **Ce n'est pas une preuve de génération terminée, d'Oracle accepté, de panne 429 ni d'une clé incorrecte**. Le premier prompt demandait une délégation de recherche externe non bornée, potentiellement plus complexe que le smoke; on ne peut pas imputer la cause au modèle ou au transport sans état terminal Redis. Nouveau lot local avant rerun : prompt très court « OK » sans délégation pour isoler génération de base, délai borné 120 s, histogramme SSE agrégé/sanitisé, statut Redis au timeout (aucun contenu). Les tâches multiagents réelles restent NON QUALIFIÉES. Ne pas marquer la V1 GO sur une simple admission 200.


**PC-04 / SE-08 — risque de dépense non autorisée identifié et correction locale (pas encore CI)** : au SHA `4067764df`, le routeur source admet `spendingPolicy=free_first` (y compris des candidats `paid`) et les politiques `librechat.yaml` contenaient une alternative Gemini non qualifiée dans chacun des six rôles, avec quatre spécialistes sans politique de budget explicite. `readModelBudgetState` retourne `free_first` en l'absence de limite activée ; la configuration initiale ne garantissait donc PAS l'absence de sélection coûteuse. Mesure minimale sans créer de router : politiques natives `free_only` pour les six rôles, uniquement 3 alternatives explicites `OpenRouter` avec `pricingTier=free` et identifiant `openrouter/free` ou `:free`; suppression des SIX bindings Gemini des routes **automatiques uniquement** (catalogue fournisseur Gemini manuel inchangé). Nouveau `test_model_routing_free_only.py` PASS local (1 scénario couvrant 6 rôles), JSON valide, CI Current HEAD Release Preflight ajustée pour tester automatiquement le contrat quand `librechat.yaml` change. **Statut PARTIEL jusqu'au run exact SHA.** Limites : identité `:free` ne prouve pas quota actuel, tolérance au modèle indisponible encore non démontrée, capacité de sélection payante volontaire à gouverner par décision explicite.


**OR-01/OR-03 — validation live du Worker + Oracle (`4067764dfb24f3887c5a3bd7f7b19123bc12b3e6`) :** [GitHub Actions #39094215479](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39094215479) `SUCCESS`. Source/image locale SHA exact, OpenRouter `openrouter/free` preflight réel PASS, six agents natifs setup HTTP 200, Worker mission HTTP 200, stream HTTP 200 avec **1 final**, conversation et messages Mongo **1 + 2**, puis **Oracle ACCEPT=VERIFIED, verdict durable et publication autorisée PASS** ; second scénario **HUMAN_REVIEW durable, candidat non publié PASS**, harness versionné exact HEAD PASS. Preuve obtenue avec routeur multi-modèles DÉSACTIVÉ sur la stack de test jetable et prompt initial « OK », donc **VALIDÉ_SHA_PÉRIMÈTRE pour ce chemin précis seulement** : ne prouve PAS délégation des cinq spécialistes réels, ni comportement du routeur default, ni fallback 429, ni image GHCR publique, ni mission longue. L'essai précédent #39093570016 avec recherche/délégation complexe reste FAIL (1037 SSE, timeout), non réécrit rétrospectivement en PASS.

**PC-04 / OR-05 — test libre-service routeur par défaut préparé (à lancer au nouveau SHA)** : `.github/workflows/botmode-v1-release-real-provider-gate.yml` accepte désormais `run_default_free_router=true` en manuel, protégé par un contrôle explicite des six politiques `free_only` et de tous leurs bindings `OpenRouter` gratuits, sans neutraliser le routeur dans la stack jetable. Permet de qualifier la vraie politique free-only installée ; aucune injection de clés payantes. Le mode isolé historique reste possible et sa preuve #39094215479 séparée. Oracle + publication + non-publication sont réexercés si la génération réussit. Test forcé 429 et spécialistes restent gates indépendants.

**PC-03 / OR-07 — distinct provider-tool capability test prepared:** `.github/workflows/botmode-v1-openrouter-tool-gate.yml` was historically pinned to `ea24f476`; updated locally to checkout triggering SHA and perform exactly one `OpenRouter/openrouter/free` provider function-call request with `tool_choice=required`, demanding a syntactically verified `record_evidence({status:'ready'})`, no paid key or GHCR. Until this current source workflow runs, **UNTESTED**. A green test would prove one tool-capable OpenRouter route but **NOT** genuine Worker→specialist delegation, Oracle acceptance, availability on future calls or full task autonomy.

**PC-04 / OR-08 — premier vrai passage du routeur default free-only :** [#39094670848](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39094670848), SHA `e75e7d3d2cd871e597067e38ba7bd1f9ccd3a241`, **workflow global FAIL** : OpenRouter/free preflight PASS, 6 rôles default free-only validés, image source build, setup ACL 200, Worker génération SSE final (139 trames/25,652 octets, HTTP 200, 1 final), **Oracle ACCEPT VERIFIED durable + publication PASS**. La seconde mission `REVIEW` s'est arrêtée au **HTTP 401 de la route Mission**, soit après ~3m50 depuis émission du JWT CI limité à **2 minutes** (`expiresIn: '2m'`), et non un 429 du fournisseur ni preuve d'une faiblesse du modèle. Correction ciblée *uniquement du jeton éphémère de fixture* vers `expiresIn: '15m'`, aucune politique JWT utilisateur modifiée. La revue HUMAN_REVIEW en mode routeur libre activé reste **non qualifiée**, rerun requis.


**PC-03 / OR-07 — vrai appel outil gratuit :** [#39095195551](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39095195551) `SUCCESS` sur le SHA exact `82d7abca180d991bb5375109f33b82a859f535df`. La requête réelle OpenRouter `/api/v1/chat/completions`, modèle `openrouter/free`, a renvoyé `tool_calls` contenant la fonction `record_evidence` avec arguments JSON valides `status=ready` sous `tool_choice=required`. **VALIDÉ_SHA_PÉRIMÈTRE : un seul appel d'outil réel au fournisseur gratuit**. Ne prouve pas la réexécution d'un enfant BOT MODE, la filiation durable de sous-agent ni Oracle. Ne pas multiplier les appels coûteux sans nécessité.

**OR-07 / OR-08 — audit du 18 octobre, HEAD `82d7abca1` :** 30 SUCCESS, 1 SKIPPED accessibilité, 2 FAIL : #39095196717 crash/restart et #39095193886 free real provider. SIGKILL : modèle-only a obtenu le verdict Oracle VERIFIED après recovery, mais Mongo ne contenait pas encore la réponse unique lors de la lecture immédiate ; `NATIVE_RECOVERY_HOST_AUTHORITY_DENIED` figure dans les logs et interdit de classer le moteur comme validé. Correction de qualification **uniquement du test** : `expect.poll` borné à 30 secondes autour du readback Mongo, en conservant EXACTEMENT 1 réponse et unicité des IDs ; **non prouvé tant que CI pas verte**. Real provider : erreur upstream `Upstream idle timeout exceeded`, Redis job complete avec aucun Oracle durable (`CI_ORACLE_ACCEPT_STATE_PRESENT=False`) : cela reste un vrai FAIL de bout en bout, non assimilé à une réussite. Aucune mutation de runtime pour masquer ce timeout, aucun paiement ni publication.

### Checkpoint de qualification consolidé — 18/10/2026, SHA `3cf1084843a1e7af1c398b69fbb06e68022eaeac`

- **OR-12 / OR-14 / OR-15 — VALIDÉ_SHA_PÉRIMÈTRE :** [#39116675418](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39116675418) `SUCCESS` avec `PR28_ORACLE_RUNTIME_CRASH_RESTART_DURABLE_NO_DUPLICATES=PASS`, `PR28_ORACLE_RUNTIME_ACCEPT_PERSISTED_PUBLISHED=PASS`, `PR28_ORACLE_RUNTIME_RELOAD_READBACK=PASS`, `PR28_MODEL_ONLY_POST_SIGKILL_ORACLE_PUBLISHED_ONCE=PASS` et `PR28_ORACLE_INFLIGHT_AUTO_RESUME_EXACTLY_ONCE=PASS`. Le test note aussi `PR28_ORACLE_INFLIGHT_RECOVERY_AUTO_RESUME=NOT_PROVEN` pour un sous-scénario DISTINCT. Ne pas étendre à tous les effets outillés externes ni aux migrations DB.
- **PC-03 / PC-04 / OR-08 — VALIDÉ_SHA_PÉRIMÈTRE :** [#39116699098](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39116699098) `SUCCESS`, préflight réel OpenRouter modèle `openrouter/free`, six politiques native `free_only`, Worker SSE HTTP 200 / 1 final / aucune frame error, mission Oracle ACCEPT `VERIFIED` avec publication durable, puis deuxième mission Oracle `HUMAN_REVIEW` persisté et candidat privé non publié. Aucun coût payant autorisé. Ne prouve ni 429 simulé sur chaîne extérieure ni autonomie multiagent avec enfant réel.
- **IN-04 / IN-05 — VALIDÉ_SHA_PÉRIMÈTRE :** [#39117452670](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39117452670) `SUCCESS` pour image locale exacte, first-user HTTP, création explicite des six agents/ACL, arrêt/redémarrage et persistance. Le chemin auto depuis *Idées* est testé au niveau Jest mais pas encore validé comme onboarding navigateur final ; le pull GHCR n'est PAS couvert.
- **G4 / IN-08 — garde sans publication :** [#39117454440](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39117454440) `SUCCESS`, mode `verify_guard_only=true` ; **aucun build/push/pull** dans ce mode, tags/digests inchangés, GO publication non accordé. La préparation multi-architecture en CI ne vaut pas manifeste public distribué.
- **OR-06 / OR-07 — preuve importante et limite :** [#39116675419](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39116675419) `SUCCESS` sur image locale exact SHA, fixture déterministe, `CI_SUBAGENT_PARENT_TOOL_REQUESTS=1`, `CI_SUBAGENT_CHILD_RESPONSES=1`, `CI_ORACLE_ACCEPT_PERSISTED_STATUS=VERIFIED`, `CI_ORACLE_ACCEPT_PUBLICATION=PASS`, mais `CI_ORACLE_ACCEPT_DURABLE_CHILD_LINEAGE=NOT_PROVEN` et `CI_ORACLE_ACCEPT_CHILD_LINKED=False`. **Le circuit complet d'un enfant durable avec fournisseur réel reste PARTIEL**, ce SUCCESS ne le prouve pas. Deux workflows de contrats/handoffs historiquement épinglés à `54b30a3` sont préparés pour checkout exact PR HEAD et doivent être qualifiés avant de modifier leur statut.
- **IN-13 — documentation de release :** `docs/BOTMODE_V1_GHCR_RELEASE_GATE.md` corrigé pour relier PR #29 et les derniers runs, conserver explicitement D-02 (risque npm/SUL), D-03 (candidate registry) et D-04 (merge/stable). **NO-GO stable** tant que risque/licence/portée, tests final digest, rollback cohérent et décisions humaines ne sont pas clos. `Lint for accessibility issues` reste SKIPPED et ne vaut pas PASS.


**OR-06 / OR-07 — nouveaux contrôles sous-agents sur HEAD `3b54802c610978312e223a5fb940140ed52e112e` :** [handoffs Playwright #39118200640](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39118200640) `SUCCESS`, **12/12** tests UI de transferts imbriqués/parallèles avec modèle mock ; [contrat natif #39118200660](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39118200660) `SUCCESS`, **1/1** test du parent→enfant→parent et propagation d'identité de tenant. Ces deux workflows ne sont plus épinglés à `54b30a3`. **VALIDÉ_SHA_PÉRIMÈTRE** uniquement pour ces handoffs déterministes ; n'impliquent pas un enfant durable OpenRouter réel ni la promotion GHCR. La sonde #39116675419 prouve par ailleurs que la DB contient un enfant avec filiation traversant un restart dans une fixture, mais ne démontre pas que l'Oracle a consommé ce même résultat enfant comme critère de publication (SSE lié non observé). **OR-06 reste PARTIEL** pour la délégation durable complète en conditions provider réel.

**SE-05 / SE-07 — revue sécurité rafraîchie :** le dossier existant `docs/BOTMODE_V1_NPM_RISK_DECISION_20261014.md` a été actualisé avec le commit `3b54802c6`, le lockfile SHA256 `4b0b6d51afb679bc3b1633f29609d3aa9bdce8515f4df719bf0ddc67d22b44b3`, les trois avis de sévérité modérée et les preuves DOCX de sources exactes. Le workflow `botmode-v1-pinned-npm-audit.yml` historiquement épinglé à `54b30a3` est désormais prévu pour checkout PR HEAD ; attendre sa nouvelle qualification CI. **D-02 non signé, NO-GO pour redistribution stable**, indépendamment de l'ensemble de la CI.


### Interprétation stricte des workflows verts (audit de provenance, 18/10/2026)

La recherche dans `.github/workflows` sur la branche PR #29 au checkpoint `a682b782811fbb025a44c309b6e3cca530907df3` révèle **des scénarios historiques à checkout SHA fixé**. Leur statut vert sous la PR n'autorise PAS l'assertion « image/test HEAD ». En particulier :

- `botmode-v1-fresh-ghcr-install.yml`, `botmode-v1-integrated-first-user-acceptance.yml`, `botmode-v1-ghcr-rollback-rehearsal.yml`, `botmode-v1-published-mission-rehearsal.yml` et `botmode-v1-candidate-offline-mission.yml` pointent encore vers `54b30a342bf8f3480d7385b30cfa669b73c92878` ou son digest de distribution historique. Leur preuve reste **HISTORIQUE-PINNÉ**, jamais candidate finale du HEAD.
- `botmode-v1-published-image-install-e2e.yml`, `botmode-v1-fresh-install-smoke.yml`, `botmode-v1-release-readiness.yml`, `botmode-v1-release-packaging-e2e.yml`, `botmode-v1-candidate-ghcr-qualification.yml` restent à `d4e82dded5df49f17b97e20361c89796b8f1e068` : **HISTORIQUE-PINNÉ**.
- `botmode-native-agents-integration.yml`, `botmode-v1-exact-candidate-runtime.yml`, `botmode-v1-live-provider-preflight.yml`, `botmode-v1-oracle-offline-gate.yml` et `botmode-v1-oracle-synthetic-e2e.yml` restent à `ea24f476164153735b5f5c95fe9c7861d4f97a1f` : **HISTORIQUE-PINNÉ**.
- `botmode-onboarding-preflight.yml` utilise `4727adf130acf981f88269b0927ffaf2d4facf04` ; `botmode-v1-oracle-child-exception-diagnostic.yml` utilise `8c6c2c42476a269528a44a00d0cd3387102a610f`. Reste historique.

**Gate de finalisation :** ne pas modifier tous ces checkpoints juste pour les rendre verts. Les substituts modernes sont les workflows **HEAD exact** source-build (premier utilisateur, sonde Oracle avec enfant, SIGKILL, mission OpenRouter gratuite, build multiarch local, DOCX et audit npm). L'acceptation distribution **n'arrive qu'après** autorisation humaine de publier un immutable SHA-tag, attestation du digest multiarch, pull depuis GHCR et redéploiement Lite/rollback de ce même digest ; aucune CI historique ne la remplace.

**IN-10 / IN-11 / SE-09 — correctif sûr de ciblage backup/restore, test local sans Docker réel :** `scripts/botmode/restore.sh` construisait ROOT mais laissait `docker compose` s'exécuter depuis le `cwd` du demandeur, susceptible de viser un mauvais projet. Correction : résoudre d'abord le chemin d'archive relatif au demandeur en absolu, puis `cd "$ROOT"` avant `docker compose`. `scripts/botmode/backup.sh` créait le dossier de destination relatif avant le `cd "$ROOT"`, risquant de sauvegarder ailleurs : destination canonisée en absolu avant changement de répertoire. **4 tests Python isolés** avec exécutable Docker simulé PASS : chemin archive absolu/relatif, refus `BOTMODE_CONFIRM_RESTORE` manquant, bon chemin de projet Compose, dossier de sauvegarde relatif au demandeur. Aucun `mongorestore --drop` réel ni manipulation de volumes ; le gate d'approbation `BOTMODE_CONFIRM_RESTORE=YES` reste inchangé. Les tests sont raccordés au workflow `Current HEAD Release Preflight` pour qualification au prochain SHA. **Ce n'est pas une preuve de restore DB réelle ni de downgrade compatible.**

**UX-02 / SE-01 — contrôle supplémentaire en préparation sur Idées :** lorsque `initializeBotModeAgents` répond `capabilitiesComplete=false`, le lancement doit maintenant échouer explicitement (`BOT_MODE_CAPABILITIES_INCOMPLETE`), avant toute création de projet/modification de l'idée ou navigation vers le Worker. Un test Jest négatif valide le refus de mutation, l'absence de deuxième requête ACL et la présence d'un message utilisateur explicite ; les tests n'ont pas encore été exécutés sur GitHub au SHA de ce correctif. Cela ne prouve pas que les autres parcours Chat/Work couvrent déjà automatiquement le même cas.
