# BOT MODE — FEUILLE DE ROUTE MAÎTRE DE MISE À JOUR V1.0.6

> **Note d'archivage (11/11/2026) :** cette feuille est le plan original du 10 novembre, pas le statut actuel. La **V1.0.6 a été publiée** via [GitHub Release](https://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v1.0.6) : tag Git `416bf00898a6b0fb2eaf271ee4671d30ea55ccf0`, digest OCI AMD64/ARM64 `sha256:e3640ac10833e4743796589b53d8a935d94867d73b0c25e82b4e7e1eba985cdb`, [preuves GHCR](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/42953398588). Les travaux et tests terminés sont enregistrés dans [issue #179](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/179) et [PR #180](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/180). Les limites matériels / sécurité restent applicables ; aucun déploiement des machines personnelles n'est autorisé.

**Révision du plan :** 10 novembre 2026 (complétée après vérifications des sources officielles et des workflows)  
**Statut :** PLAN DE QUALIFICATION — aucun correctif exécuté ni validation V1.0.6 acquise  
**Dépôt public :** https://github.com/Arkos77/LibreChat-BOTMODE-V1  
**Version de départ :** v1.0.5 — tag/source `0973da6cc8cfc5b35616e26132d0945fff147ebe`  
**Image publique de départ :** `ghcr.io/arkos77/librechat-botmode-v1@sha256:27708c107dc434a59a2e6a5fe4e3501ae5f6c13bfdb064464932c88a0c2a4c80`  
**Dernier `main` consulté :** `a1ccb4c78ab7471d84a68e4002517fd0f3ef501c` (documentation PR #178 après le tag)  
**Destination :** v1.0.6, *uniquement si toutes les portes de validation obligatoires passent*.  
**Propriétaire de la décision finale :** propriétaire du dépôt.  
**Périmètres :** Lite et Full Linux AMD64/ARM64 ; niveau de qualification matériel et fonctionnel explicité séparément.  
**Règle principale :** CONSERVER → RÉUTILISER → ADAPTER → REMPLACER → CRÉER en dernier recours.  
**Règle de mémorisation :** le document versionné et un checkpoint GitHub sont les sources de vérité ; aucune inscription automatique en mémoire permanente ChatGPT n’est présumée.

> **Important.** Cette feuille de route est un PLAN, pas un compte rendu d'exécution. Les validations historiques restent reconnues, mais aucune étape v1.0.6 n'est marquée PASS sans preuve sur le bon SHA et, lorsqu'il est pertinent, sur la bonne image OCI. Une fermeture administrative ne remplace pas un test fonctionnel.

---

## 0. Objectif, périmètre et définition exacte de « clôturé »

### 0.1 Résultat attendu

Obtenir UNE version V1 corrective qui :

1. démarre, s'arrête et redémarre de façon reproductible en conservant **exactement la même image OCI épinglée** et la configuration utilisateur ;
2. maintient sans régression le Worker, les cinq spécialistes, la sélection et les droits, Oracle, la barrière de publication P6 unique et la persistance déjà démontrée ;
3. propose une recherche Web fonctionnelle sur le parcours natif `web_search`, avec option sans clé et gestion claire des quotas ;
4. protège la reprise des missions nécessitant autorisation humaine, avec verdict précis sur les reprises successives ;
5. affiche honnêtement en **Lite** l'absence de backend Code Interpreter et RAG par défaut ;
6. qualifie en **Full** le runtime complet et les capacités RAG explicitement annoncées, sans dépenses implicites ;
7. dispose de contrôles satisfaisants d'isolation des utilisateurs, d'autorisation et de sécurité opérationnelle, avec risques résiduels dûment acceptés ;
8. possède guides, version, image, restauration, limites d'usage et notices cohérents ;
9. est publié une seule fois avec image **AMD64 + ARM64** dont le digest correspond au tag exact ;
10. fige la V1 fonctionnellement. La V2 personnelle évoluera à part ; la V1 peut continuer à recevoir des **correctifs de sécurité/maintenance** si nécessaires.

### 0.2 Ce que « Full validé » veut dire

- **Full runtime PASS** : services réellement lancés et sains, auth et connexion API ↔ dépendances, redémarrage, persistance, restrictions réseau.
- **Full RAG PASS** : ingestion réelle de document de test, création d'embeddings (service local/mocking déterministe isolé), stockage pgvector, recherche avec citation/provenance, isolation entre propriétaires, suppression et stabilité après redémarrage ; parcours utilisateur par navigateur testé si l'on annonce « import et question sur un document dans l'interface ».
- **Full Code PASS** : uniquement si un backend de code sécurisé et réellement exploitable est présent ; faute de cela, **Code demeure non inclus par défaut dans V1.0.6, même en Full**. Un nom de spécialiste CODE ou un bouton UI ne prouve pas l'exécution.
- Une CI Full sur runner Linux ne qualifie pas automatiquement macOS, Windows, toutes les machines ou une installation publique exposée sur Internet.

### 0.3 Ce qui n'est PAS une condition de clôture V1

- Niveau BOT 0–4 ; nouveau routeur de capacités ; second orchestrateur, scheduler ou moteur de tâches ; automatisme 4C en cas de SIGKILL incertain ; duplication d'un appel externe dont le résultat est inconnu.
- Ajout automatique de spécialistes permanents, de JARVIS, de voix, de vidéos, de FIBO, de MotionBricks, de Playwright comme remplacement natif de recherche, de nouveaux MCP ou d'un catalogue infini de fournisseurs.
- Installation Full sur le Chromebook N5030 / 2,7 Gio / sans AVX, ou sur le Mac Xubuntu d'environ 3,7 Gio de RAM, puisque le bootstrap exige **au moins 4 Gio** et l'AVX sur x86_64. Full est qualifié en environnement **approprié**.
- Certification de toutes les plateformes, tests de pénétration exhaustifs, « zéro alerte », disponibilité sans limites des API gratuites ou garantie de migration transversion de schéma.

### 0.4 Discipline des verdicts

| Verdict | Signification | Action |
|---|---|---|
| **PASS** | Preuve datée, SHA, image/digest et résultat matériel à l'appui | Ne plus rejouer sans régression pertinente. |
| **FAIL** | Critère réellement non satisfait ; cause/phase consignée | Correctif ciblé, puis seul contrôle lié. |
| **NON CONCLUANT** | Test non réalisé, quota, service indisponible, preuves incomplètes | Ne pas transformer en PASS ; lever le prérequis, réessayer une fois si utile ou documenter une limite de périmètre. |
| **N/A documenté** | Fonction explicitement exclue de ce profil | Vérifier qu'elle n'est pas vendue/affichée comme opérationnelle. |

Une action sensible de mutation (base, agent, fichier de configuration, système, PR, merge, publication) est enregistrée avec son autorisation et son rollback. Les secrets ne sont jamais copiés dans les preuves.

---

## 1. État initial et acquis à ne pas perdre

| Référence | État au 10/11/2026 | Règle |
|---|---|---|
| Release officielle v1.0.5 | Publiée, CI de publication 6/6 PASS, tag `0973da6...`, OCI AMD64/ARM64 | Ne pas réécrire tag/image. |
| Dernier `main` | PR documentaire #178 fusionnée, SHA `a1ccb4...`, POSTÉRIEUR au tag | Ne pas confondre `main` avec le contenu exact de v1.0.5. |
| Chromebook principal 3080 | v1.0.5, HTTP 200 ; backup et nettoyage ciblé faits | Production protégée. |
| Mac Xubuntu principal 3080 | v1.0.5, HTTP 200 ; backup et conteneur précédent conservé pour rollback | Production protégée. |
| Mac test 3081 | Instance distincte, configuration Keenable sans clé chargée au 09/11 ; `web_search` à restaurer en UI | Ne pas prendre les résultats 3081 pour une preuve de version 3080/v1.0.5. |
| Worker → spécialistes → Oracle → P6 | Missions réelles antérieures PASS | Rejouer seulement ce qui est affecté par un correctif. |
| Missions multi-HITL R5 | Échec réel terminal sans P6 ; checkpoints intermédiaires présents | **NON CONCLUANT / FAIL scénario** tant que la cause n'est pas isolée. |
| Recherche R6 Playwright seul | FAIL `BOTMODE_WEB_SEARCH_UNAVAILABLE` sans `web_search` | **Ne jamais retirer `web_search` du parcours natif**. |
| Full RAG | Workflows/contrats et tests historiques réutilisables, mais pas encore preuve finale pour image OCI v1.0.6 | Faire une qualification Full spécifique et honnête. |
| Sécurité OAuth CodeQL | #328 HIGH, #330 HIGH, #63 MEDIUM acceptés sous conditions prouvées | Acceptation **≠ correction** ; ne pas dismiss en masse. |
| Alertes de dépendances | #109 LOW échéance 16/11 ; #37 D-02 échéance 18/11 (acceptations historiquement bornées à d'autres SHAs) | Réexaminer sur **v1.0.6** ; aucune prorogation tacite. |

**Sources de référence :** issue [#19](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/19), [#175](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/175), [#154](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/154), [#47](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/47), [#109](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/109), [#37](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/37), [release v1.0.5](https://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v1.0.5).

---

## 2. Organisation : EXACTEMENT 3 lots maîtres

**LOT 1 — PRÉFLIGHT ET INVENTAIRE (L1.01–L1.08)**  
Lecture seule sur les installations et le dépôt. Cartographier les risques et prouver les prérequis.

**LOT 2 — CORRECTIONS MINIMALES ET QUALIFICATION (L2.01–L2.10)**  
Une PR candidate DRAFT, tests ciblés et qualification distincte Lite/Full sur environnements jetables. Un seul parcours réel par défaut identifié ; pas de boucle de génération payante.

**LOT 3 — SÉCURITÉ, DOCUMENTATION, RELEASE ET CLÔTURE (L3.01–L3.09)**  
Décision de risques, gates CI et humains, release unique, distribution, suivi, rapport final.

**Chaîne obligatoire :** LOT 1 PASS → correctifs justifiés du LOT 2 → gates Lite et Full PASS → sécurité et documentation LOT 3 PASS → GO humain de publication → v1.0.6 → GO humain distinct pour déploiement local → clôture V1.  
Le contenu d'un lot peut être étudié en parallèle **en lecture**, pas fusionné, publié ni déployé en parallèle sans maîtrise des dépendances.

---

# LOT 1 — PRÉFLIGHT, INVENTAIRE ET VERROUILLAGE

## L1.01 — Geler la base et ouvrir UN point de suivi

**Actions :**
- Relever le SHA actuel de `main`, la source et l'arbre du tag v1.0.5, le digest GHCR, la dernière release, les PR et les issues ouvertes pouvant concerner la sortie.
- Définir une branche candidate dédiée **à partir de `main` vérifié**, à créer **uniquement au passage du LOT 2** ; par exemple `release/v1.0.6-final-qualification-20261110`.
- Utiliser une issue maîtresse unique ou un checkpoint permanent lié à #19, contenant les IDs d'étapes, les preuves et les liens vers **les tickets existants** ; éviter de créer vingt tickets en doublon.
- Distinguer explicitement « code source », « CI sur source », « image candidate », « image publiée », « configuration locale test », « installation principale ».

**Sortie :** manifeste de base + liste fermée des défauts v1.0.6 + backlog hors V1. **PASS** si chaque action renvoie à un élément vérifiable.

## L1.02 — Inventaire des installations et contrôle de non-interférence

**Mac 3080 et Chromebook 3080 :** lecture seule des identifiants d'image, ports, conteneurs, volumes, états de santé, montages, RAM/disque, fichiers de configuration localisés. **Aucune impression de valeurs de secrets**.  
**Mac 3081 :** vérifier image/version effective, `web_search` actuellement absent ou présent, YAML `webSearch` (noms des fournisseurs uniquement), rôle de l'agent RECHERCHE, état de santé.  
**Autres projets :** ne pas inspecter, arrêter ou nettoyer PangaraBOT, JARVIS/GRIOT, ancien JARVIS, autres conteneurs hors périmètre.  
**Précaution :** un port HTTP 200 ne démontre ni l'exécution d'une mission ni l'intégrité d'une base.

**Sortie :** tableau Machine / Port / Digest / Profil / Sauvegarde / Services / État / Décision « ne pas toucher ». **PASS** si la séparation PROD/TEST est indiscutable.

## L1.03 — Sauvegardes et capacité de retour

- Localiser les sauvegardes du 10/11/2026 ; vérifier leur présence, permissions privées, tailles, checksums gzip et documentation de restauration ; **ne pas effectuer de restauration destructive sur les données réelles**.
- Déterminer ce qui est sauvegardé : MongoDB, Redis éventuel, PostgreSQL/pgvector Full, Meilisearch, images/uploads/fichiers, volumes de skills, `librechat.yaml`, `.env`, montages et états nécessaires.
- Prévenir qu'un `mongodump` seul **ne constitue pas** une sauvegarde cohérente de tout Full.
- Définir le retour arrière du runtime sur schéma compatible ; **interdire** rollback de base à travers une migration de schéma non qualifiée.
- En environnement jetable : réutiliser les workflows de backup/restore existants, ne pas concevoir un second mécanisme.

**Sortie :** matrice sauvegarde → méthode vérification → couverture → restauration supportée → limites.

## L1.04 — Audit des six agents existants, sans réinitialisation

| Agent | Contrôle obligatoire |
|---|---|
| **Worker / orchestrateur** | Zéro outil métier direct, délégation uniquement aux spécialistes, prompts non vides, sélection contrôlée. |
| **RECHERCHE** | Prompt pertinent, `web_search` présent, aucune fausse URL, priorité aux sites officiels si exigés ; outils MCP facultatifs distincts. |
| **ANALYSE** | Travail de synthèse/raisonnement, limites sur les outils, citations transmises sans invention. |
| **CODE** | Compétence et restrictions d'exécution ; `execute_code` n'est pas synonyme de backend effectif. |
| **DOCUMENTS/RAG** | Politique d'accès fichiers et `file_search` seulement si service disponible pour le profil. |
| **RÉDACTION** | Restitution exploitable, sans outils métier inutiles, sans publication doublée. |

- Vérifier owner, tenant, ACL, prompts, liste d'outils, modèles/fallback, descriptions, persistance et non-écrasement lors du seeding.
- **Attention v1.0.5 :** le prompt source-officielle introduit dans le code de provisionnement ne remplace pas les prompts de comptes **déjà créés**. Toute mise à jour se fait via UI/API LibreChat authentifiée, sauvegarde et action explicite ; **jamais** par écriture MongoDB directe.

**Sortie :** matrice attendus/réels/différences, sans clé. **PASS** si les différences bloquantes sont recensées et les profils non modifiés par inadvertance.

## L1.05 — Recherche Web gratuite et providers

- Lire les règles du moteur natif : `packages/api/src/agents/orchestrator/research.ts` et `sources.ts` exigent `web_search` exécuté ; Playwright/Firecrawl ne sont **pas** des substitutions transparentes.
- Vérifier la configuration `webSearch: searchProvider: keenable; scraperProvider: keenable; rerankerType: none` ; selon LibreChat officiel, ces services sont disponibles sans clé **avec quota limité**, donc ne pas promettre « gratuit illimité ».
- Confirmer côté Agent Builder que la carte `web_search` est activable et enregistrable sans solliciter de clé Serper/Firecrawl ; si l'UI réclame encore une clé, diagnostiquer l'origine de cette boîte **sans en acheter**.
- Séparer les clés LLM (OpenRouter/Gemini) des clés de recherche ; documenter erreurs 400/401/429/réseau sans confondre leurs causes.
- Inspecter l'initialisation MCP : un outil déclaré dans YAML, authentifié, initialisé et réellement utilisable sont **quatre états distincts**.

**Sortie :** préflight validant le chemin natif `web_search`, le fournisseur réel et la non-dépense.

## L1.06 — Capacités Lite / Full et garde-fous ressources

- **Lite :** MongoDB 4.4.29, Redis 7, API ; `RAG_API_URL=` vide dans l'override ; aucun service lourd RAG/Meili/pgvector par défaut ; vérifier état UI Code/RAG.
- **Full :** MongoDB 8.0.20, Meilisearch 1.35.1, PostgreSQL/pgvector, RAG sidecar ; vérifier versions, volumes, authentification, JWT API↔RAG, état du runtime et besoin effectif de Redis pour les missions avancées.
- **Ressources :** Full minimum ≥4096 MiB RAM, AVX x86_64 ; utiliser un runner Linux jetable compatible, pas le Chromebook ou le Mac sous-dimensionnés. **Sur ARM64, vérifier ARMv8.2-A ou ultérieur pour MongoDB 8**, indépendamment du manifeste image ARM64.
- **Sécurité coût :** RAG ne doit jamais hériter de `OPENAI_API_KEY` général ; seul `BOTMODE_RAG_APPROVED_EMBEDDINGS_API_KEY` autorise un credential RAG distinct. Pas de fournisseur payant pour CI.
- **UI :** `configurationComplete` renseigne les droits/prompts mais **pas** la santé réelle de `file_search`/`execute_code`.

**Sortie :** tableau de capacités **réellement qualifiables** par profil ; liste des fonctions à masquer/désactiver/documenter.

## L1.07 — Audit installation, redémarrage, images et pipelines

**Risque prioritaire de code confirmé à examiner sur le tag v1.0.5 :**

- `start.sh` appelle `scripts/botmode/bootstrap.sh --no-pull` ;
- le bootstrap choisit `BOTMODE_IMAGE_VALUE="${BOTMODE_IMAGE:-}"`, puis, sans argument, retombe sur `ghcr.io/arkos77/librechat-botmode-v1:sha-${HEAD12}` ;
- hors `--check-only`, il **réécrit** `BOTMODE_IMAGE=` dans `.env`.

**Hypothèse de défaillance :** après `install.sh --image <digest-OCI>`, un `./start.sh` ordinaire peut remplacer le digest conservé par un tag SHA, voire ne pas disposer localement du tag (`--no-pull`). L'analyse du code est une preuve du risque ; l'effet terminal doit être testé dans une **installation jetable avec image et volume isolés**.

Inspecter aussi : validation des creds Mongo, refus des anciens volumes non migrés, comportement `--no-start`, `--check-only`, droits de `.env` UID1000, secrets JWT existants non régénérés, priorité entre variables shell et `.env`, idempotence et redémarrage.

**Sortie :** reproduction minimale et décision « correctif nécessaire ou faux positif » avant PR.

## L1.08 — Triage sécurité, documentation, distribution

- Recenser les constats CodeQL encore ouverts sur **le commit publié** (pas seulement sur une PR ancienne) ; rapprocher #154, #130, #126, #124 ; distinguer code actif, build, test et upstream. Ne pas reprendre aveuglément les chiffres de novembre 4–6 comme ceux de novembre 10.
- Inventorier les alertes Dependabot sur le lockfile/source exacts ; traiter #109 LOW et #37 D-02 à leurs dates, sans appliquer mécaniquement les acceptations anciennes à la nouvelle release.
- Contrôler absence de secrets, policy privée de vulnérabilités, binding loopback par défaut, HTTPS / `TRUST_PROXY` / logs OAuth pour déploiements distants, isolation owner/tenant/fichiers, licences tierces Nodebox.
- **Dette à déclarer explicitement :** MongoDB 4.4 Lite est arrivé en fin de support le 29/02/2024 (source officielle MongoDB). Ne jamais vendre ce profil comme recevant encore les correctifs de sécurité de MongoDB ; contrôler que MongoDB n’est pas exposé publiquement et demander une décision encadrée sur la distribution auto-hébergée locale. Ne pas changer automatiquement vers Mongo 5+ (AVX obligatoire sur x86_64).
- Constats documentaires **déjà observés** : le tag v1.0.5 embarque un README et un guide encore marqués v1.0.4 ; `main` a été actualisé après le tag mais conserve quelques en-têtes ou textes v1.0.4 ; `.github/SECURITY.md` annonce encore v1.0.3 comme « dernière ». Corriger sur la candidate v1.0.6 **avant** le nouveau tag ; **ne jamais réécrire v1.0.5**.
- Auditer le pipeline de publication : une fusion `main` touchant `client/**`, `api/**`, etc., déclenche également `.github/workflows/dev-images.yml` (images génériques Docker Hub/GHCR), qui a échoué faute de credentials. **Prévoir la suppression contrôlée de cet effet non souhaité pour la PR v1.0.6** ; ne pas créer des identifiants Docker Hub.

**Sortie LOT 1 :** registre fermé de problèmes P0/P1/P2, vérifications préalables, stratégie de tests, références et décision GO LOT 2. Ne pas lancer la PR avant de disposer de ce registre.

---

# LOT 2 — CORRECTIONS MINIMALES + QUALIFICATION LITE ET FULL

## L2.01 — Une seule PR DRAFT de correctifs indispensables

- Créer une branche candidate distincte et une PR **DRAFT**, avec base `main` et SHA exact consignés.
- **Pas d'empilement de PR expérimentales.** N'ajouter à la PR que les fichiers touchant les défauts réellement observés ; ne pas modifier Worker/Oracle/P6 sans preuve d'un défaut sur ces composants.
- Réutiliser les tests `scripts/botmode/tests/*`, les suites existantes et les workflows disponibles.
- Une correction = une preuve de cause = un test négatif initial + un résultat PASS ; regrouper plusieurs fichiers uniquement lorsqu'ils résolvent une cause commune.
- Ne pas merger/publier/déployer sans les gates.

## L2.02 — Correctif P0 de conservation d'image lors du redémarrage

**Contrat attendu, sans imposer d'implémentation prématurée :**

1. Si `--image` est fourni, la référence exacte est utilisée puis persistée explicitement.
2. Si `BOTMODE_IMAGE` est fourni explicitement en variable de shell, son ordre de priorité est documenté et testé, sans substitution implicite dangereuse.
3. Sinon, si `.env` possède déjà `BOTMODE_IMAGE=...`, **réutiliser cette référence sans la modifier** ; sa présence doit être lue avant toute écriture `.env`.
4. Si aucun choix n'existe, choisir un défaut **immuable et cohérent avec la source** ; ne jamais démarrer à partir du tag mutable `edge` par oubli.
5. `--check-only` ne doit ni écrire dans `.env` ni créer/arrêter de conteneur.
6. `--no-pull` ne doit pas servir silencieusement une autre image ; en l'absence de l'image prévue, échouer avec diagnostic plutôt que basculer.
7. Aucun mot de passe, JWT, `librechat.yaml`, profil, port, réseau ou montage ne change lors d'un redémarrage ordinaire.

**Tests ajoutés à la suite existante** `test_bootstrap_regression.py` :
- `RST-01` installation explicitement épinglée au digest → arrêt → `./start.sh` → même digest/image ID ;
- `RST-02` relance sans `--image` → `.env` inchangé pour `BOTMODE_IMAGE` ;
- `RST-03` `--check-only` lecture seule même si `.env` est absent/partiel ;
- `RST-04` override explicite contrôlé avec priorité non ambiguë ;
- `RST-05` image épinglée introuvable → échec clair, sans fallback implicite ;
- `RST-06` credentials et JWT inchangés, redémarrage idempotent ;
- `RST-07` Lite et Full respectent leurs profils et services sans migration tacite.

**Critère PASS :** essai sur runner jetable avec la **même image** avant/après, vérifié par `docker inspect` et le contenu de `.env` sans afficher de secret. Un simple test textuel est insuffisant pour la conclusion globale.

## L2.03 — Remise en état et validation de `web_search` sans clé

**Préflight de TEST 3081 Mac uniquement, après inventaire/autorisation :**

1. Confirmer la sauvegarde du YAML contenant `searchProvider=keenable`, `scraperProvider=keenable`, `rerankerType=none` ; vérifier configuration réellement chargée et version du test.
2. Dans le Constructeur d'agent LibreChat authentifié, **réactiver `web_search`** sur RECHERCHE et enregistrer (ne pas supprimer Playwright/Firecrawl pour essayer de tromper le moteur).
3. Vérifier en lecture seule la présence de l'outil dans l'agent.
4. Lancer **UNE recherche réelle** ciblée vers un domaine officiel connu ; contrôler URL de source retournée, extrait pertinent, tool_call completed, provenance et absence de clé payante.
5. Test négatif : domaine officiel absent → réponse « source officielle non retrouvée », aucune URL fabriquée.
6. Si quota Keenable/réseau : `NON CONCLUANT` externe et diagnostic distinct ; ne pas contourner les limites ou multiplier les essais.

**Portée de preuve :** vérifier la même logique sur candidate v1.0.6, dans une instance qualifiée ; un test sur un autre digest ne suffit pas à valider l'OCI finale.

## L2.04 — Reprise HITL et erreurs de mission : correctif seulement si démontré

- Conserver le correctif v1.0.5 de préservation du `chatProjectId` ; **ne pas relancer les tests déjà PASS** du même patch.
- Avec les traces du R5 et le code actuel, isoler l'étape exacte où la deuxième reprise échoue (contrôleur, état/autorité, persistance, outil, Oracle, publication). Les erreurs d'auth d'anciennes missions ne sont **pas** automatiquement la cause du R5.
- Vérifier absence d'exécution **avant** approbation, refus explicite, reprise du bon propriétaire et du bon projet, checkpoint durable lors de la pause, non-duplication d'effet externe, absence de double publication.
- Scénarios strictement bornés : `HITL-01` simple approbation (conserver PASS si version inchangée), `HITL-02` refus fail-closed, `HITL-03` deux approbations successives avec reprise et publication finale unique, `HITL-04` projet et isolation owner/tenant, `HITL-05` erreur terminale claire sans effet non autorisé ni faux PASS.
- Si la cause du double HITL ne peut pas être résolue sans réarchitecture : **interdire de prétendre le support complet multi-HITL**, inscrire une limitation et confirmer l'échec sûr. Si le support multiple est explicitement annoncé comme fonction V1, **NO-GO** jusqu'à correction.
- Ne pas reconstruire le mécanisme ancien 4C/SIGKILL ni faire de replay automatique d'un effet dont la réussite est inconnue.

## L2.05 — Agents, droits et interface : corrections minimum

- Comparer prompts et outils des six agents existants à la source v1.0.6 ; proposer un **patch de configuration ciblé**, avec sauvegarde et confirmation, jamais un reset général.
- Worker outils métiers `[]`, spécialistes strictement dans leur rôle ; les outils Code/Documents sans backend doivent être absents de l'interface **ou** explicitement signalés indisponibles.
- En Lite : vérifier en **navigateur réel** l'absence de promesse Code/RAG ; les tests statiques `test_lite_ui_capabilities.py` ne suffisent pas seuls.
- En Full : n'annoncer `file_search` que si backend + test E2E ; contrôle de permissions et statut de disponibilité, pas seulement le booléen `configurationComplete`.
- Ne pas installer de nouvelle UI ni modifier le panneau BOT MODE validé, sauf bug directement reproductible.

## L2.06 — Test Lite de la candidate exacte (machine jetable)

**Préflight** : Git SHA fixé, OCI candidate unique, Mongo 4.4.29/Redis, port isolé, aucune clé réelle, aucune donnée utilisateur, mémoire/disque surveillés.

| ID | Test | PASS uniquement si… |
|---|---|---|
| LITE-01 | Installation neuve par `install.sh --lite --image <digest>` | API et dépendances healthy, auth Mongo effective, volumes créés à noms isolés. |
| LITE-02 | Arrêt/reprise avec `start.sh` | Digest OCI, paramètres, fichiers et données conservés. |
| LITE-03 | Onboarding initial | Six agents/ACL conformes, pas de doublons à réexécution. |
| LITE-04 | Délégation existante / mission | Preuve antérieure réutilisée ; test ciblé uniquement si modifié. |
| LITE-05 | Web search natif | Résultat et source vérifiables, absence d'API payante implicite. |
| LITE-06 | Refus/validation HITL | Fail-closed, reprise permise, résultat conforme au périmètre annoncé. |
| LITE-07 | Interface | Code/RAG non disponibles clairement, aucune confusion permission vs backend. |
| LITE-08 | Quotas et absence de fournisseur | Erreur explicite, pas de faux succès ou fallback payant. |
| LITE-09 | Exposition réseaux | Bind local par défaut et ports non voulus fermés. |
| LITE-10 | Persistance | Mission/résultat consultable après redémarrage ; pas de duplicate P6. |

**GO Lite** : tous les P0 Lite PASS, tous les P1 restants documentés/acceptés avec portée et échéance. Ne pas utiliser les installations stables comme banc d'essai.

## L2.07 — Préflight Full : ressources, auth, effet financier

- Runner Linux AMD64 avec AVX, RAM ≥4 Gio (marge réelle pour les services), disque libre et quotas de CI suffisants ; isoler noms Compose, ports, réseau et volumes.
- Reprendre `docker-compose.botmode.yml` et les images externes épinglées ; contrôler leur digest et conformité arch.
- Vérifier connexion API↔Mongo 8, pgvector/Postgres, Meilisearch, RAG, paramètres JWT/refresh, clé Meili et absence d'exposition externe.
- Vérifier le besoin réel ou non de Redis en profil Full : le Compose de base ne déclare pas Redis comme Lite ; ne pas supposer que les garanties de reprise via Redis existent en Full sans test. Si un service supplémentaire est nécessaire, préférer la configuration native existante et qualifier explicitement son coût/impact.
- RAG : aucun `env_file: .env` général dans le sidecar ; `OPENAI_API_KEY` vide ; `RAG_OPENAI_API_KEY` seulement depuis `BOTMODE_RAG_APPROVED_EMBEDDINGS_API_KEY` ; si aucun fournisseur approuvé, **refus sûr et lisible** ; jamais d'appel vers OpenAI général.
- Réutiliser `check_rag_compose_cost_fence.py`, le workflow `.github/workflows/botmode-v1-rag-credential-cost-gate.yml`, les tests Full déjà créés ; **ne pas réinventer un serveur mock**.
- **Piège de déclenchement CI :** le workflow `botmode-v1-full-rag-native-acceptance.yml` n’est lancé automatiquement sur PR que lorsque certains fichiers de tests/workflow changent ; une modification de la stack ou du runtime peut laisser ce contrôle absent. Prévoir un lancement manuel explicite sur la branche/HEAD candidat ou mettre à jour de façon ciblée le filtre `paths`, puis vérifier le SHA et le résultat terminal. Un run `workflow_dispatch` n’est pas nécessairement reconnu comme « required check » d’une PR.

## L2.08 — Full : qualification RAG réelle, propriétaire et effacement

Réutiliser l'existant `scripts/botmode/ci-full-rag-native-acceptance.py`, `scripts/botmode/ci-mock-embeddings.js` et `.github/workflows/botmode-v1-full-rag-native-acceptance.yml`, en les exécutant/adaptant **sur le SHA candidate exact et l'image appropriée**.

| ID | Épreuve | Preuve exigée |
|---|---|---|
| FULL-01 | Installation Full neuve | Tous services utiles démarrés ; auth Mongo, PG et JWT API↔RAG. |
| FULL-02 | Démarrage image candidate publique | Même digest/arch que celui destiné à la release ; ne pas valider seulement un build local différent. |
| FULL-03 | Dépense interdite par défaut | Aucune clé LLM globale copiée au RAG ; aucun appel externe quand embeddings non approuvés. |
| FULL-04 | Ingestion document/test | Un document réel/fixture est parsé et indexé avec embeddings déterministes locaux. |
| FULL-05 | Durabilité pgvector | Lignes de vecteurs et métadonnées réellement persistées et consultables. |
| FULL-06 | Recherche avec provenance | Résultat renvoie source, fileId et extrait attendus ; pas de réponse inventée. |
| FULL-07 | Graphe natif/agent | Le contexte documentaire est consommé par le graphe réel, reçu/outils présents. |
| FULL-08 | Propriété et confidentialité | Deuxième utilisateur n'accède pas au document ; aucun accès croisé. |
| FULL-09 | Documents non pertinents | Absence de provenance fausse ou d'attribution hors sujet. |
| FULL-10 | Suppression | Document et vecteurs supprimés ; pas d'artefacts résiduels préjudiciables. |
| FULL-11 | Redémarrage | Config, état, indices et accès conservés ; référence OCI inchangée. |
| FULL-12 | Parcours navigateur | **Obligatoire si** la V1 annonce l'upload et le questionnement documentaire depuis l'UI publique. |
| FULL-13 | Sauvegarde/restauration | Réutiliser la CI Full de restauration sans migration transversion non prouvée. |

**Attention :** un mock d'embeddings local peut prouver l'intégration et l'isolation, pas la pertinence sémantique universelle d'un modèle public. Rédiger exactement cette limite.

**GO Full** : FULL-01 à 11 PASS ; FULL-12 si la promesse UI est maintenue ; FULL-13 selon le périmètre de restauration annoncé ; toutes les protections financières PASS. Si RAG non validé, **ne pas déclarer « Full/RAG clôturé »**. Ne pas forcer Full sur tes petites machines.

## L2.09 — Sécurité négative liée aux modifications (pas audit infini)

- Auth : HTTP 401/403 corrects, invalidation de session, requêtes non authentifiées refusées, escalade de rôle impossible.
- Isolation : impossible d'accéder aux agents, missions, checkpoints, messages, pièces jointes, données vectorielles d'autrui.
- HITL : pas d'autorisation fabriquée, refus prépondérant, aucun effet avant approbation.
- RAG/MCP : endpoints privés, clés masquées, aucune redirection non fiable ni requête à fournisseur externe non approuvé.
- Anti-abus OAuth : conserver la protection HTTP 429/Retry-After documentée et ses contraintes ; ne pas désactiver CodeQL, ne pas dismiss les trois alertes par commodité.
- Vérifier le passage à Full n'expose pas par erreur les ports Meili/PG/RAG au réseau extérieur.
- **Comptes et administration publics :** conserver les résultats PASS déjà obtenus pour inscription / création du premier compte, identification et expiration de session ; vérifier les seuls chemins touchés par les changements. Le renouvellement de mot de passe doit refuser sans fuite l'absence de SMTP, les jetons expirés/réutilisés et les demandes concernant un autre compte. Aucune simulation de courrier n'est une preuve de remise d'e-mail réelle.
- **Fournisseurs/modèles :** si l'interface de configuration est annoncée, vérifier le parcours Admin d'ajout/enregistrement et le refus non-admin, ainsi que la présence dans `GET /api/models` / `GET /api/endpoints` ; réutiliser les PASS historiques de la PR fournisseurs et vérifier si leur code a effectivement été incorporé à la version candidate. Un modèle visible en menu n'est ni une preuve d'inférence ni une preuve de gratuité.
- **Données personnelles et rétention :** contrôler suppression de compte, fichiers/conversations, isolation des sauvegardes et suppression des données de test ; ne pas effacer les données privées utilisateur dans une campagne de tests.

**Réutiliser les tests existants de sécurité** ; déclencher les suites larges seulement pour les fichiers réellement concernés.

## L2.10 — Gate de la PR DRAFT et bilan des corrections

- Diff minimal, aucune modification inattendue du moteur, tests ciblés PASS au HEAD exact ; revue des modifications de chaque fichier.
- Contrôle TS/JS lint, types, tests unitaires/intégration pertinents, CI, CodeQL, Docker AMD64/ARM64, RAG/Full et image candidate lorsque applicable.
- Une suite générale FAIL bloque le merge **si** liée à la modification ou à un invariant de sécurité ; un incident externe infrastructure/quota doit être identifié séparément et ne devient pas PASS.
- Si corrections multiples : les regrouper dans une candidate stabilisée, **pas une succession de mini-commits de diagnostic**.
- Archiver résultat de L2 et SHA final : `LITE=PASS / FULL=PASS / SECURITY=... / HITL=...` ; aucune publication avant LOT 3.

---

# LOT 3 — SÉCURITÉ, DOCUMENTATION, RELEASE ET CLÔTURE

## L3.01 — Décision de sécurité de la source exacte v1.0.6

- Collecte actuelle CodeQL et Dependabot **sur la candidate/source précise**, avec chiffres à jour, distinction nouvelle alerte/résiduelle/historique.
- Pour chaque risque pertinent à la distribution : `corrigé` (preuve), `non atteignable` (preuve), `compensé / accepté` (responsable, conditions, durée, périmètre exact), `NON CONCLUANT` ou `à corriger` (NO-GO si critique).
- #328 HIGH initiation OAuth, #330 HIGH callback OAuth et #63 MEDIUM GET `code/state` : ne pas les présenter comme supprimés ; retester les protections seulement si leur code/configuration change ; consigner les prérequis TLS, `TRUST_PROXY`, logs frontaux sans paramètres sensibles, Redis partagé si plusieurs répliques.
- #109 LOW : réévaluation le **16/11/2026**, sur branches/lockfiles actuellement concernés, avec nouveau propriétaire/risque si v1.0.6 les embarque ; aucune prolongation implicite.
- #37 D-02 `mammoth → argparse → sprintf-js` : réévaluation prévue le **16/11**, expiration ferme **18/11 à 23:59 Europe/Paris** pour la décision de l'ancien SHA. Une correction/acceptation ultérieure doit référencer la nouvelle source.
- Ne pas fusionner des findings de `main` et d'un ancien commit dans une affirmation générale non démontrée ; pas de `npm audit fix --force`.
- Vérifier licence MIT/mentions tiers ; Nodebox Sustainable Use License : ne pas annoncer de redistribution commerciale sans analyse adéquate.
- Risque **distinct** des alertes npm/CodeQL : la version MongoDB 4.4 du profil Lite est **hors support depuis le 29/02/2024** ; enregistrer une décision de risque et des restrictions d’exploitation précises. L’absence d’alerte GitHub ne neutralise pas la fin de support.
- Vérifier canal de signalement privé GitHub et politique de divulgation responsable.

## L3.02 — Documentation publique v1.0.6 cohérente **avant le tag**

Mettre à jour sur la **même source candidate** :

- `README.md` ;
- `docs/BOT_MODE_INSTALL.md` ;
- `docs/BOT_MODE_INSTALL_PAR_MACHINE.md` ;
- `.github/SECURITY.md` ;
- `docs/BOT_MODE_ROLLBACK.md` ;
- `docs/BOT_MODE_RELEASE_DECISION.md` / `docs/BOT_MODE_RELEASE_AUDIT.md` selon existence et actualité ;
- `docs/BOT_MODE_DATA_PRIVACY_PUBLIC.md` et `THIRD_PARTY_NOTICES.md` uniquement si le périmètre change ;
- ébauche des notes de release v1.0.6 et matrice Lite/Full.

**Ordre évitant une circularité SHA/digest :** avant le tag, les guides suivis dans Git doivent annoncer **v1.0.6**, fournir les commandes avec le tag de version immuable `:v1.0.6` (ou renvoyer à la GitHub Release pour copier la référence OCI par digest), **sans insérer un faux digest ni un SHA encore inconnu**. Après construction/publication, consigner **le SHA source exact et le digest OCI exact dans les notes de GitHub Release**. Une PR **documentaire seulement**, après la sortie si utile, peut reporter ces valeurs sur `main` ; elle ne doit pas être décrite comme incluse rétroactivement dans le tag. Ne jamais modifier le tag Git après publication : le contenu des guides qui y figurent doit être cohérent dès sa création.

**Obligatoires :** installation neuve ≠ migration ; lien de release et version exacts ; vrais prérequis AVX/RAM ; Code/RAG selon profils ; clé Keenable facultative et quotas ; modèles `:free` soumis aux quotas ; santé de service ≠ capacité vérifiée ; absence de support macOS/Windows non testés ; sauvegarde multi-volumes Full ; limites HITL ; code sécurité accepté ; aucune promesse de coût zéro hors fournisseurs choisis.

**Piège à éviter :** la v1.0.5 a reçu une correction documentaire sur `main` après son tag, si bien que le tag conserve un guide daté. Pour v1.0.6, relire les documents **dans le tag source lui-même** ou s'assurer que la publication de notes générées depuis le tag est atomique ; ne jamais modifier un tag historique.

## L3.03 — Contrôle de secrets, images, licences et données

- Audit sur **tous les fichiers suivis et le diff** de la candidate : `.env` réels exclus, pas de jetons/cookies/identifiants dans code, scripts, logs, fixtures de publication ou notes.
- `scripts/botmode/audit-public-release.sh` sur SHA exact ; revue de l'historique propre ajouté si nécessaire ; pas d'archive publique issue d'un dossier local contenant des fichiers ignorés.
- OCI : audit vulnérabilités des dépendances runtime + images natives et images sidecar Full, provenance, manifestes AMD64/ARM64, SBOM/attestations réellement présentes si annoncées (une option YAML ne vaut pas preuve d'attestation publiée).
- Prévoir GHCR **uniquement pour la release BOT MODE** : ne pas provoquer par inadvertance les images génériques `librechat-dev` vers Docker Hub ; confirmer impact du workflow `dev-images.yml` sur le merge `main` et établir une **stratégie minimale explicite d'exclusion** autorisée (modification contrôlée du trigger ou garde de publication), sans désactiver la sécurité CI et sans nouveaux secrets Docker Hub.

## L3.04 — Épreuve de reproductibilité finale

- Sur runner frais, clone du **SHA source candidat exact**, installateur + image candidate AMD64, puis ARM64 sur runner compatible : pull anonyme, aucun alias mutable, démarrage Lite, `doctor` et test API authentifié pertinent.
- Full : runner compatible séparé, OCI candidat **effectivement publié en candidat**, ingestion RAG + isolation + protection des coûts, démarrage et redémarrage vérifiés.
- Refuser un GO si un test ne concerne que `main` mouvant, une image déjà modifiée, un faux service non comparable ou un tag antérieur.
- Vérifier les limites d'architecture, la taille de l'image, l'absence d'exposition des ports internes et les artefacts de provenance.

## L3.05 — Décision humaine GO / NO-GO AVANT publication

**GO uniquement si :**

1. LOT 1 complet ; **LITE** et **FULL** satisfont leurs portes obligatoires distinctes ;
2. défaut de digest au redémarrage résolu et validé ;
3. recherche Web native gratuite réellement vérifiée ou dépendance explicitement qualifiée avec comportement sûr ;
4. HITL conforme au périmètre annoncé et fail-closed ;
5. pas de dépenses implicites ni de secrets exposés ;
6. risques de sécurité pertinents traités/acceptés avec décision nouvelle et échéance ;
7. documentation exacte et non contradictoire ;
8. CI/image candidats vérifiés sur le bon SHA ;
9. politique de publication GHCR, triggers `main` et effets secondaires maîtrisés ;
10. propriétaire autorise **explicitement** la création du tag, la promotion GHCR et la GitHub Release.

**NO-GO** pour : Full RAG prétendument fonctionnel mais E2E FAIL, régression d'isolation, données mises en danger, sécurité critique non traitée, image redémarrant sous une autre version, faux P6, ou audit de distribution non concluant.

**Cas d'échec d'une fonction optionnelle** : désactiver et documenter si elle est explicitement hors promesse V1. Pour **Full RAG**, ne pas retirer discrètement la fonctionnalité si c'est une condition du GO utilisateur : retourner `FULL=NON CONCLUANT/FAIL` et demander une décision de périmètre avant toute publication.

## L3.06 — Publication **unique** v1.0.6

Après GO explicite :

1. verrouiller le HEAD final de source, l'arbre Git et le diff ;
2. préparer un workflow ponctuel équivalent au pipeline v1.0.5, **réutilisé et corrigé pour v1.0.6**, avec contrôle d'absence préalable du tag et de toute substitution de source ;
3. build/push **par digest** des images AMD64 et ARM64 dans GHCR ;
4. créer un manifeste multiarchitecture **candidat** immuable ;
5. vérifier pull anonyme, démarrage Lite et qualification Full déjà liée à ce même candidat ;
6. seulement ensuite promouvoir `ghcr.io/arkos77/librechat-botmode-v1:v1.0.6` ;
7. publier GitHub Release + tag Git exact, notices et limites ;
8. inspecter GHCR de l'extérieur, comparer commit/tag/digest, attestation si annoncée ;
9. **ne pas déplacer silencieusement** `latest`, `stable`, `edge`, ni modifier v1.0.5 ;
10. ne pas publier `librechat-dev`/Docker Hub comme effet secondaire sans décision spécifique.

**Sorties :** URL release, SHA Git, digest index OCI, digests enfants AMD64/ARM64, liens CI, verdicts Lite/Full, statut alertes et rollback.

## L3.07 — Vérification post-publication sans intervention machine

- Refaire uniquement contrôles indispensables à la **publication**, pas tous les tests déjà PASS : tag Git↔SHA exact ; index GHCR↔digest exact ; architectures ; public pull ; guides du tag ; notes ; attestation si promise.
- Relever que les machines personnelles peuvent encore tourner en v1.0.5 : **publication ne signifie pas déploiement**.
- Ouvrir un défaut ciblé uniquement si la version officielle diffère de la candidate vérifiée ; ne pas bricoler le tag après coup.

## L3.08 — Déploiement optionnel sur les machines, décision distincte

Le déploiement de v1.0.6 sur les installations 3080 **n'est pas inclus automatiquement** dans la décision de publication. Après autorisation séparée :

1. préflight per-host (ports, digest actuel, service, espace, dépendances) ;
2. sauvegarde privée fraîche et vérifiable, incluant l'ensemble du périmètre de l'hôte ;
3. source exacte et image v1.0.6 par digest, compare pre/post ;
4. changement ciblé **de la seule API** si schéma/Compose/config inchangés, ou procédure de migration séparée **si** une modification de dépendances est nécessaire ;
5. santé HTTP, authentification, bon agent/projet, publication fonctionnelle ciblée si le déploiement touche le runtime ;
6. conservation de la version précédente de l'image/du conteneur selon compatibilité ;
7. `3081` et autres projets inchangés ;
8. aucun `docker system prune --volumes`, `down -v`, reset de base, nettoyage général, rotation de secrets ;
9. rollback documenté et décidé si incident.

Sur Chromebook et Mac anciens, **Lite demeure le profil conseillé**. Full reste validé sur runner/serveur compatible ; ne pas convertir ces machines à Full.

## L3.09 — Clôture administrative, archivage et séparation V2

Créer **un seul procès-verbal V1.0.6** :

- identité exacte du code, de la release, des digests et des preuves ;
- résultats `LITE`, `FULL_RUNTIME`, `FULL_RAG`, `CODE`, `HITL`, `WEB_SEARCH`, `RESTART`, `SECURITY`, `BACKUP`, `DOC`, `RELEASE` ;
- tous PASS requis ou N/A explicites, sans statut inventé ;
- risques acceptés, atténuations, responsable, dates, indicateurs et réévaluations programmées ;
- périmètre matériel/OS officiellement qualifié, limites de quota, précision des coûts ;
- sujets transférés **hors V1** à la V2 personnelle ;
- référence des tickets à fermer avec preuves, tickets à conserver pour maintenance/sécurité ;
- décision : **V1 fonctionnellement gelée / maintenance de sécurité autorisée** ; **V2 locale/privée séparée**.

Aucune suppression des archives, anciens checkpoints, sauvegardes ou versions publiées. Clôturer seulement les issues effectivement résolues ou renvoyées au registre de maintenance, pas les alertes non réglées.

---

## 3. Matrice des risques et parades (référence rapide)

| ID | Incident susceptible de bloquer | Impact | Détection la plus courte | Parade / critère |
|---|---|---|---|---|
| R01 | `start.sh` remplace le digest | Mauvaise image / indisponibilité | Installation à digest → redémarrage jetable | Réutiliser l'image enregistrée et tester. |
| R02 | Différence `main` / tag v1.0.5 | Documentation ou CI trompeuse | Comparer contenu dans tag, pas seulement `main` | Corriger avant v1.0.6 et figer le tag. |
| R03 | PROD 3080 confondue avec TEST 3081 | Faux PASS | Digest et config du conteneur | Rapports séparés par digest/port. |
| R04 | `web_search` absent | Recherche fail immédiat | Contrôle RECHERCHE + observateur natif | Réactiver dans UI et tester appel réel. |
| R05 | Keenable quota / indisponibilité | Résultat absent | HTTP/outil réseau, statut quota | Erreur explicite, pas d'achat/fallback payant. |
| R06 | HITL deuxième reprise échoue | Mission sans P6 | Trace typée, scénario R5 minimal | Correctif ciblé ou périmètre limité annoncé. |
| R07 | Tool permissions ≠ backend | UI trompeuse / erreurs | Vérifier backend et clic UI | Masquer/désactiver ou qualifier. |
| R08 | Mongo 8 sur CPU sans AVX | Full ne démarre pas | Préflight hôte | Runner compatible ; pas de Full sur Chromebook. |
| R09 | RAM/disque insuffisants | OOM / stabilité faible | Mesures runner + log | Profil Lite ou NO-GO matériel. |
| R10 | Sidecar RAG hérite clé payante | Dépense involontaire | Inspect Compose résolu / test mock | Allowlist, credential RAG explicite. |
| R11 | JWT API/RAG divergent | 401 RAG | Test auth sidecar, tests `check_rag` | Identité JWT partagée sans rotation historique. |
| R12 | RAG démarre sans ingestion/récupération | Fausse qualification Full | `ci-full-rag-native-acceptance.py` | Ingestion, vecteurs, sources, isolation. |
| R13 | Redis absent en Full malgré besoin durable | Reprise partiellement perdue | Analyse dépendances/runtime Full | Réutilisation native et validation distincte. |
| R14 | Sauvegarde Mongo seule | Données Full perdues | Inventaire volumes/DB | Snapshot coordonné + restore jetable. |
| R15 | Migration Mongo schéma incompatible | Perte au rollback | Comparaison DB/version | Interdiction migration/rollback non prouvés. |
| R16 | Un rôle voit les docs d'autrui | Fuite de données | Test autre owner | Bloquant tant que non isolé. |
| R17 | CodeQL HIGH laissé sans qualification | Risque sécurité public | Fiche exacte vs SHA | Correction/acceptation compensée avec échéance. |
| R18 | Acceptation npm ancienne expirée | GO sécurité invalide | #109 16/11 ; #37 18/11 | Nouvelle décision sur source exacte. |
| R19 | Merge déclenche publication Docker Hub générique | Images non prévues / CI FAIL | Analyse `dev-images.yml`/`tag-images.yml` | Exclusion ciblée autorisée, sans nouveaux secrets. |
| R20 | Publication sur SHA différent de celui testé | Régression non qualifiée | Manifest CI + Git tag + OCI | Refuser promotion si discordance. |
| R21 | Guide du tag obsolète | Installation erronée | Vérifier README/docs dans tag | Version/commandes exactes avant release. |
| R22 | Port exposé en historique | Accès non voulu | Inspect port host et proxy | Loopback / TLS / ACL selon mode. |
| R23 | Licences tiers mal annoncées | Redistribution risquée | Notices licences, Nodebox | Avertissement et périmètre correct. |
| R24 | Nettoyage endommage autre projet | Perte de données | Inventaire précis périmètre | Aucun prune global, protection PangaraBOT/JARVIS. |
| R25 | Reset mot de passe ou config Admin trompeuse | Compte bloqué / accès excessif | Tests refus, expiré, identité, catalogue | Réutiliser PASS ciblés ; expliciter SMTP requis. |
| R26 | Suppression compte/fichiers incomplète | Risque de confidentialité | Contrôles de propriété, purge et rétention | Documenter la portée réelle des données et sauvegardes. |
| R27 | MongoDB 4.4 Lite est hors support fournisseur depuis le 29/02/2024 | Risque de vulnérabilités futures non corrigées | Politique de cycle de vie officielle MongoDB + Compose Lite | Documenter la dette et les restrictions d'exposition, décision explicite sur le risque résiduel ; aucune montée AVX forcée sur petit matériel. |
| R28 | Test Full/RAG non déclenché par filtres `pull_request.paths` | Faux PASS par omission de CI | Analyser triggers de `botmode-v1-full-rag-native-acceptance.yml` et changements de la PR | Déclenchement explicite sur ref/HEAD exact ou couverture `paths` adéquate ; preuve du run terminal. |
| R29 | MongoDB 8 ARM64 exige au minimum ARMv8.2-A | Full ARM64 peut ne pas démarrer malgré image multiarch | Vérification ISA cible et démarrage natif de Mongo | Distinguer présence du manifeste ARM64 et compatibilité CPU ; documenter les modèles non compatibles. |

---

## 4. Matrice de couverture TEST → FICHIER / WORKFLOW RÉUTILISABLE

| Besoin | Fichier / workflow existant | Action v1.0.6 |
|---|---|---|
| Installer/redémarrer | `scripts/botmode/bootstrap.sh`, `start.sh`, `scripts/botmode/tests/test_bootstrap_regression.py` | Étendre RST-01–07, test dynamique jetable. |
| Installation globale | `.github/workflows/botmode-bootstrap-regression.yml` | Rejouer **uniquement sur HEAD modifié**. |
| Comptes / reset password / admin | PR #142, #161 et suites de sécurité auth / admin natives ; ticket fournisseurs #156, PR #157 | Réutiliser les PASS ; ne tester à nouveau que si la candidate touche les routes ou la configuration concernées. |
| Lite sans RAG | `docker-compose.botmode-lite.yml`, `scripts/botmode/tests/test_lite_free_config.py` | Vérifier variables, services, coûts. |
| Visibilité de Code | `scripts/botmode/tests/test_lite_ui_capabilities.py`, `client/src/components/Chat/Input/ToolsDropdown.tsx` | Ajouter E2E navigateur, sans refonte. |
| Recherche | `packages/api/src/agents/orchestrator/research.ts`, `sources.ts` et leurs tests `.spec.ts` | Ne pas remplacer `web_search` ; une seule recherche keyless réelle. |
| HITL | `api/server/controllers/agents/__tests__/hitlCheckpoint.e2e.spec.js`, `packages/api/src/stream/__tests__/hitlResumeRedis.stream_integration.spec.ts`, tests client approvals | Ajouter/réutiliser scénario deux reprises. |
| Coût RAG Full | `.github/workflows/botmode-v1-rag-credential-cost-gate.yml`, `scripts/botmode/tests/check_rag_compose_cost_fence.py` | Sur source exacte. |
| RAG intégré | `.github/workflows/botmode-v1-full-rag-native-acceptance.yml`, `scripts/botmode/ci-full-rag-native-acceptance.py`, `ci-mock-embeddings.js` | Source et OCI candidat précis ; UI si promise. |
| Runtime Full | `.github/workflows/botmode-v1-full-runtime-smoke.yml` | **Ne pas réutiliser tel quel son vieux tag SHA `d4e82...`**, l'adapter à v1.0.6. |
| Restauration | `.github/workflows/botmode-v1-coordinated-restore.yml`, `botmode-v1-full-pinned-external-restore.yml`, `docs/BOT_MODE_ROLLBACK.md` | Tests jetables uniquement, schéma compatible. |
| Sécurité | `.github/workflows/botmode-codeql-security.yml`, `botmode-v1-pinned-npm-audit.yml`, `botmode-v1-rag-credential-cost-gate.yml` | Comparer CodeQL/Dependabot exacts ; décisions résiduelles. |
| Audit public | `scripts/botmode/audit-public-release.sh`, `.github/workflows/botmode-v1-public-release-audit.yml` | Sans contenu `.env` réel ni secrets. |
| Images/release | `.github/workflows/botmode-v105-one-time-release.yml`, `tag-images.yml`, `dev-images.yml` | Adapter workflow sans recopier verrou de SHA périmé, corriger effets de publication. |
| Onboarding | `api/server/routes/agents/v1.js`, `scripts/botmode/seed-default-specialists.js`, `provision-worker.js` | Non-écrasement des agents existants et ACL. |

---

## 5. Journal de preuve standard : FORMAT UNIQUE

Pour chaque étape :

```text
BOTMODE_V106_GATE_ID: <L1.01 | RST-01 | LITE-... | FULL-... | SECURITY | RELEASE>
DATE_UTC: <date-heure>
CIBLE: <runner jetable | Mac TEST 3081 | source Git | candidate GHCR>
SOURCE_SHA: <SHA complet>
IMAGE_INDEX_DIGEST: <sha256... ou N/A pour contrôle source>
COMPOSE_PROFILE: <lite | full | N/A>
CONFIG_FINGERPRINT: <hachage neutre sans secret, si utile>
TEST: <commande ou workflow + URL du run>
RESULT: <PASS | FAIL | NON CONCLUANT | N/A>
OBSERVATION: <résultat concis sans contenu sensible>
CAUSE_SI_FAIL: <phase/code prouvés, pas hypothèse présentée comme fait>
CORRECTION: <commit/PR ou N/A>
RISQUE_RESTANT: <description et issue>
AUTORISATION: <référence de décision si mutation>
NEXT_ACTION: <une seule action utile>
```

Ne jamais mettre un jeton, mot de passe, cookie, réponse contenant des données personnelles, contenu `.env` ou en-tête Authorization dans le journal. Utiliser des comptes et documents fictifs sur CI.

---

## 6. Arbre de décision anti-boucle

```text
Un critère échoue-t-il réellement ?
  ├─ NON → garder PASS ; ne pas retester.
  └─ OUI → le résultat concerne-t-il le SHA/l'image/profile attendus ?
      ├─ NON → NON CONCLUANT ; corriger le préflight.
      └─ OUI → panne externe/quota ?
          ├─ OUI → erreur explicite et zéro paiement ; N/C ou limite documentée.
          └─ NON → risque de sécurité ou persistance ?
              ├─ OUI → STOP / NO-GO ; preuve + correctif minimal.
              └─ NON → fonction optionnelle hors promesse ?
                  ├─ OUI → désactiver et documenter, pas de chantier V1.
                  └─ NON → corriger cause exacte et faire le test touché.
```

Une erreur nouvelle ne déclenche **pas** automatiquement une nouvelle couche, un spécialiste, un conteneur, un fournisseur ni un refactoring. Préférer un correctif local et des preuves circonscrites.

---

## 7. Calendrier logique, dépendances et checkpoints

**Sans promesse de durée.** La séquence dépend des PASS, non d'un nombre de jours.

| Passage | Dépend de | Condition pour avancer |
|---|---|---|
| **CP-0 — Référence figée** | Lecture GitHub | v1.0.5, main, 3080/3081 identifiés. |
| **CP-1 — Préflight OK** | L1.01–L1.08 | Écarts triés, sauvegardes connues, aucune mutation. |
| **CP-2 — Correctifs ciblés prêts** | CP-1 | PR DRAFT faible diff, test redémarrage PASS, correctifs justifiés. |
| **CP-3 — Lite GO** | CP-2 | LITE-01–10 conformes, limites UI/HITL honnêtes. |
| **CP-4 — Full GO** | CP-2, Full compatible | FULL-01–11 et UI si promise, coût/propriétés PASS. |
| **CP-5 — Sécurité et docs GO** | CP-3 + CP-4 | Risques qualifiés, docs du futur tag cohérents. |
| **CP-6 — GO propriétaire** | CP-5 | Autorisation formelle release, impacts CI connus. |
| **CP-7 — v1.0.6 publiée** | CP-6 | Tag/digest/AMD64/ARM64/notes vérifiés. |
| **CP-8 — Déploiement éventuel** | CP-7 + autorisation séparée | Machines protégées, backups, retour possible. |
| **CP-9 — V1 clôturée** | CP-7, CP-8 si demandé | Rapport final et limites, V2 hors dépôt public. |

**Rendez-vous sécurité fermes :** 16 novembre 2026 (#109 LOW et réexamen D-02), 18 novembre 2026 23:59 Paris (fin ancienne dérogation D-02). Si v1.0.6 est publiée avant ces dates, elle ne doit pas contourner la réévaluation applicable ; si elle est publiée après, les acceptations échues doivent avoir été régularisées ou corrigées avant GO.

---

## 8. Livrables finaux à conserver

1. `BOTMODE_V106_BASELINE_AND_SCOPE` — source, images, profils, états de départ.
2. `BOTMODE_V106_AGENT_AND_TOOLS_MATRIX` — six agents, autorisations, prompts, services.
3. `BOTMODE_V106_RISK_REGISTER` — R01–R26, P0/P1/P2, propriétaires et verdicts.
4. `BOTMODE_V106_TEST_EVIDENCE` — un registre unique avec liens CI et résultats datés.
5. `BOTMODE_V106_LITE_ACCEPTANCE` — critères LITE et exclusions.
6. `BOTMODE_V106_FULL_ACCEPTANCE` — runtime, RAG, coûts, propriétaire, UI, Code en N/A si non qualifié.
7. `BOTMODE_V106_SECURITY_DECISION` — findings résiduels et échéances.
8. `BOTMODE_V106_PUBLIC_INSTALL_AND_ROLLBACK` — guides exacts et sauvetage des données.
9. `BOTMODE_V106_RELEASE_RECEIPT` — SHA, OCI, CI, GHCR, GitHub Release.
10. `BOTMODE_V1_FINAL_CLOSEOUT_V106` — GO Lite, GO Full, limites, maintenance et transfert V2 personnelle.

**Dépôt :** ne créer ces fichiers comme documents distincts que si les preuves ou l'exploitation l'exigent ; éviter dix copies redondantes. Un checkpoint maître peut contenir des sections et renvoyer aux sorties CI déjà disponibles.

---

## 9. Sources vérifiées pour l'élaboration de cette feuille

### Projet et incidents

- [BOT MODE V1 — issue de reprise #19](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/19) : release, PR #176–178, déploiement 3080 Mac/Chromebook, sauvegardes.
- [v1.0.5 — GitHub Release](https://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v1.0.5) : source et OCI.
- [#175 — intégrations / reprise R5-R6 / Keenable TEST](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/175).
- [#154 — sécurité CodeQL et risques acceptés](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/154).
- [#47 — coût implicite d'embeddings RAG](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/47).
- [#109 — deux LOW, échéance 16/11](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/109).
- [#37 — D-02, échéance 18/11](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/37).
- [#141 — qualification publique Lite/Full et périmètre de distribution](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/141).

### Code et guides de la release

- [`bootstrap.sh` v1.0.5](https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/v1.0.5/scripts/botmode/bootstrap.sh) et [`start.sh`](https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/v1.0.5/start.sh).
- [`docker-compose.botmode.yml`](https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/v1.0.5/docker-compose.botmode.yml) et [`docker-compose.botmode-lite.yml`](https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/v1.0.5/docker-compose.botmode-lite.yml).
- [Tests bootstrap existants](https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/main/scripts/botmode/tests/test_bootstrap_regression.py).
- [Full RAG Native Acceptance](https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/main/.github/workflows/botmode-v1-full-rag-native-acceptance.yml).
- [RAG no implicit spend](https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/main/.github/workflows/botmode-v1-rag-credential-cost-gate.yml).
- [Plan de retour arrière](https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/main/docs/BOT_MODE_ROLLBACK.md).
- [Documentation d'installation par machine](https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/main/docs/BOT_MODE_INSTALL_PAR_MACHINE.md).
- [Politique de sécurité](https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/main/.github/SECURITY.md).

### Références externes vérifiées

- [LibreChat — Web Search, Keenable sans clé](https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/web_search).
- [MongoDB — exigences AVX x86_64 à partir de MongoDB 5](https://www.mongodb.com/docs/manual/administration/production-notes/).
- [Docker — précédence et interpolation de variables Compose](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).

---

## 9 bis. Recherches techniques complémentaires et méthode de travail (10/11/2026)

Ces vérifications ont été ajoutées **avant toute exécution** de la V1.0.6. Elles prolongent le plan sans créer un nouveau chantier ni remettre les anciens PASS en cause.

### 9 bis.1 — Sources officielles et conséquences

| Sujet | Fait vérifié | Conséquence v1.0.6 | Référence officielle |
|---|---|---|---|
| MongoDB 4.4 Lite | Fin de vie fournisseur au **29/02/2024**. | Ajouter R27 ; déclarer dette de sécurité et limites auto-hébergement, sans upgrade AVX incompatible. | https://www.mongodb.com/legal/support-policy/lifecycles |
| MongoDB 5+ x86_64 | Instruction AVX requise ; MongoDB 8 Full ARM64 exige ARMv8.2-A minimum. | Contrôles ISA sur runners natifs ; l'existence d'une image OCI ARM64 ne garantit pas son démarrage sur tout ARM. | https://www.mongodb.com/docs/manual/administration/production-notes/ |
| Docker Compose | Variables **du shell** prioritaires sur `.env` lors de l'interpolation ; `environment` côté conteneur suit un ordre distinct. | Tester `--image`, `BOTMODE_IMAGE`, `.env` et redémarrage `start.sh` selon leur priorité effective. | https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/ |
| Recherche Web | `web_search` natif de LibreChat, Keenable sans clé mais limité en requêtes. | Contrôler tool Agent Builder + appel réel + échec quota sûr. | https://www.librechat.ai/docs/features/web_search et https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/web_search |
| Full/RAG | RAG sidecar et pgvector ; les embeddings exigent un fournisseur configuré. | Distinguer disponibilité du service, traitement d'un document, réponse sourcée et absence d'appel payant implicite. | https://www.librechat.ai/docs/configuration/rag_api |
| GitHub Actions `paths` | Filtrage peut empêcher un run ; un contrôle requis non exécuté peut rester PENDING. | Ne pas déduire PASS de l'absence de job ; vérifier SHA + déclenchement + état terminal. | https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow et https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs |
| `workflow_dispatch` | Peut s'exécuter sur une branche/référence ; fichier présent sur branche par défaut nécessaire. | Lancer en sélectionnant la branche candidate, puis prouver le SHA ; contrôler séparément les required checks. | https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows |
| Publication GHCR | Pull par digest permet d'identifier précisément l'image. | Vérifier source, digest index et plateformes sur la sortie finale ; ne pas substituer `latest`. | https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry |
| SBOM/provenance | Des attestations peuvent être liées à l'image poussée ; un build local chargé n'est pas équivalent. | N'annoncer SBOM/signature qu'après inspection du digest de l'image **publique**. | https://docs.docker.com/build/metadata/attestations/ |

### 9 bis.2 — Cadence opérationnelle stricte

1. **Au début d'un chat :** lire la feuille maîtresse complète, les 1–2 derniers checkpoints GitHub et l'état du SHA/digest ; ne pas reconstruire la vérité depuis une vieille conversation seule.
2. **Au début d'un lot :** indiquer précisément ce qui est déjà PASS, ce qui manque, les actions de lecture seule et les mutations envisagées. Pas de modification sur production sans autorisation propre.
3. **Pendant un lot :** agir par actions cohérentes, produire des preuves, traiter la cause exacte et ne pas empiler d'alternatives ; utiliser les outils GitHub existants, puis runners jetables.
4. **En cas de FAIL :** récupérer code d'erreur, étape, origine, SHA et configuration **non sensible**, proposer un correctif minimal, tester uniquement le scénario lié. Maximum **une nouvelle tentative motivée** sans nouvelle preuve ; au-delà, STOP et NON CONCLUANT au lieu d'une boucle.
5. **Après un lot :** ajouter au point de suivi unique le statut PASS/FAIL/NON CONCLUANT, l'URL du test, SHA/digest, les restrictions et la prochaine action. Ne jamais écrire « fait » si la preuve manque.
6. **Pour les décisions à effet extérieur :** branches/PR peuvent être préparées dans le lot prévu ; fusion, publication, clé/coût, mutation de machine/données et nettoyage demandent une autorisation explicite appropriée. Ne pas confondre GO de publication et GO de déploiement local.
7. **Au terme de la V1 :** un bilan unique Lite/Full, un registre résiduel de maintenance, une version publiée si toutes les portes sont satisfaites. La V2 personnelle reste séparée et n'ajoute rien au cœur public V1.

### 9 bis.3 — Mémo de reprise durable (non sensible)

`BOTMODE_V1.0.6` : **PLAN, NON EXÉCUTÉ**. Départ : release `v1.0.5`, SHA `0973da6cc8cfc5b35616e26132d0945fff147ebe`, digest `sha256:27708c107dc434a59a2e6a5fe4e3501ae5f6c13bfdb064464932c88a0c2a4c80`, dernier `main` `a1ccb4c78ab7471d84a68e4002517fd0f3ef501c`. **Trois lots** : L1 inventaire en lecture seule (L1.01–L1.08) → L2 correctifs minimaux et qualification séparée Lite/Full (L2.01–L2.10) → L3 sécurité/docs/release/clôture (L3.01–L3.09). **Conserver** le Worker, cinq spécialistes, Oracle/P6, PASS, sauvegardes et installations 3080. **Règle :** conserver/réutiliser/adapter/remplacer/créer, par lots, verdicts avec preuve, gratuit, sans empilement. **Blocages** : digest au redémarrage, `web_search` Keenable sans clé, double HITL, Full RAG et coût, UI Lite Code/RAG, effets Docker Hub, Mongo4.4 EOL, sécurité #154, réévaluations #109 et #37. **V2 exclusivement personnelle**. Ne jamais supposer que ce mémo est déjà inscrit dans la mémoire permanente ChatGPT : référencer le fichier versionné et le checkpoint GitHub.

---

## 10. PROMPT DE REPRISE À COPIER DANS UN NOUVEAU CHAT

> **BOT MODE V1.0.6 — REPRISE STRICTE.** Lire intégralement la feuille `BOTMODE_V1.0.6_FEUILLE_DE_ROUTE_MAITRE_2026-11-10.md` et le checkpoint maître GitHub de l'issue #19 avant de commencer. Source de départ : GitHub Release v1.0.5, tag `0973da6cc8cfc5b35616e26132d0945fff147ebe`, image OCI `sha256:27708c107dc434a59a2e6a5fe4e3501ae5f6c13bfdb064464932c88a0c2a4c80`. V1.0.6 est seulement PLANIFIÉE. Exécuter EXACTEMENT par LOT 1 inventaire → LOT 2 correctifs minimaux et qualification séparée Lite/Full → LOT 3 sécurité/docs/GO/release unique/clôture. Respecter les verdicts PASS/FAIL/NON CONCLUANT, conserver les PASS Oracle/P6, ne pas empiler de couches et ne pas payer de service. Priorités : vérifier puis corriger la préservation de l'image OCI au redémarrage, rétablir/tester `web_search` natif Keenable gratuit, qualifier HITL multiple ou documenter clairement une limite, vérifier Lite UI, qualifier Full RAG avec embeddings locaux/fixture sans clé payante, préserver ACL et sauvegardes, traiter sécurité et échéances (#109/#37), harmoniser les guides de la future release avant tag, éviter Docker Hub générique. Production 3080 du Mac et du Chromebook, TEST 3081, PangaraBOT, JARVIS et données sont intouchables sans nouvelle autorisation ciblée. Ne jamais forcer Full sur Chromebook/Mac sous 4 Gio ; utiliser runners jetables compatibles. v1.0.6 ne sera publiée qu'après GO humain explicite et preuves de Lite ET Full ; mise à jour des machines seulement sur autorisation DISTINCTE. V2 exclusivement personnelle, hors scope V1. Commencer au premier sous-lot NON PASS, ne jamais rejouer les PASS historiques.

---

**État à la rédaction :** FEUILLE DE ROUTE PRÊTE, AUCUNE CORRECTION EXECUTÉE. **Prochaine opération autorisée par la feuille : LOT 1 en lecture seule.**

---

## Checkpoint de qualification complémentaire — 10 novembre 2026 (preuves attachées au SHA)

> Le présent état ne transforme **aucun** ancien PASS en résultat du futur tag de publication. Il décrit les contrôles terminés sur le SHA indiqué au moment de la mesure, sans prétendre qu'une release v1.0.6 existe déjà.

- **Source candidate précédente** : `530a7d74764c3d892b7af2840355af0146c2eff5`, PR #180 DRAFT. **20 workflows SUCCESS, 2 SKIPPED, 1 Playwright E2E en cours** au checkpoint ; les suites Static Checks, Backend Unit Tests, Full RAG Native, Lite Current HEAD Release Preflight, contrat Mission/Oracle et CodeQL avaient PASS. Le dernier commit d'essai HITL HTTP `45f8dc2a29af609712e7fe6f83cee288c611965a` est un nouveau HEAD : ne pas déclarer ses 23 contrôles PASS avant les résultats effectifs.
- **HITL** : une reprise HTTP déjà PASS dans `hitlCheckpoint.e2e.spec.js`. Deux reprises SDK avec `FakeChatModel` / Mongo jetable **PASS** sur `1c311223...` (run Backend Unit Tests #42845382258). Test supplémentaire **deux POST /agents/chat/resume et deux décisions successives** ajouté sur `45f8dc2...`, verdict **NON CONCLUANT tant que le job CI n'a pas terminé**. R5 réel de TEST 3081 reste FAIL historique ; une simulation réussie ne le corrige pas rétroactivement.
- **Web Search** : Keenable Search/Fetch public HTTP 200 depuis TEST Mac, configuration native keyless `keenable/keenable/none` et tests de provenance PASS ; **mission complète réelle outil → spécialiste → Oracle/P6 avec fournisseur externe NON CONCLUANTE**, distincte du fixture du navigateur synthétique.
- **Sécurité** : sur `main`, inventaire agrégé du run #42847558708 **307 OPEN (134 HIGH, 173 MEDIUM)** ; pas de clôture automatique. Triage exact dans #154 ; `admin/config.ts` contient déjà validations de propriétés sensibles et suites négatives. `npm audit --omit=dev` sur SHA `530a7d7...` : **0 constat** dans les cinq niveaux, run #42847559129 ; ce résultat n'annule pas CodeQL/Dependabot ou les décisions #109 / #37.
- **Publisher générique** : `.github/workflows/tag-images.yml` exclut déjà `v1.0.6` ; la PR ajoute une garde **ciblée au dépôt BOT MODE** dans `.github/workflows/dev-images.yml` pour que le merge sur `main` ne publie pas automatiquement des images LibreChat génériques sur GHCR/Docker Hub. Cette garde doit elle-même PASS sur le nouveau HEAD.
- **Préparation de distribution** : README / guides continuent de donner **la release officielle v1.0.5** comme repli, en rappelant que v1.0.6 est candidate ; **aucun digest v1.0.6 inventé**, tag/manifest/promotions et GH Release interdits avant qualification et GO distinct. Les notes de publication devront fournir SHA source tag et digest multiarchitecture réellement vérifiés.

**Verdicts provisoires** : L1 inventaire essentiellement documenté (pas de clôture globale certifiée), L2 technique largement PASS dans son périmètre synthétique mais HITL/Web Search réels restant NON CONCLUANTS, L3 sécurité **NO-GO** tant que les alertes HIGH pertinentes ne sont pas traitées/acceptées par une décision nouvelle. Pas de modification des conteneurs 3080/3081, Mac, Chromebook, JARVIS ou PangaraBOT.
