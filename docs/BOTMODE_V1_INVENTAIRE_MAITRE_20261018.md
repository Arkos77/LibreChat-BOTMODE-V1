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
