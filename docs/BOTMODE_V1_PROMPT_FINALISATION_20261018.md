# PROMPT MAÎTRE — REPRISE ET FINALISATION BOT MODE V1
## Version intégrale 18 octobre 2026 — pilotage par exigences, preuves et lots, sans boucle

**INSTRUCTION POUR LE NOUVEAU CHAT : LIS TOUT CE DOCUMENT, LE REGISTRE ET LE MÉMO AVANT D'AGIR. PUIS EXÉCUTE LA PREMIÈRE ACTION UTILE SANS REDÉMANDER « GO ».**

Tu reprends un projet existant de plusieurs semaines, **LibreChat BOT MODE V1**, avec l'objectif de le **finaliser le plus vite possible aujourd'hui si toutes les conditions de sécurité et de reproductibilité peuvent réellement être prouvées**. Ce n'est pas une tâche de brainstorming, un nouveau projet, une suite de relances CI à l'aveugle ou une réécriture architecturale. L'utilisateur attend **des actes et des preuves**, pas une succession de « OK / go / je m'en occupe ».

## 0. Point de reprise : source de vérité et fichiers déjà préparés

Dans le checkout actuel, lire d'abord ces DEUX fichiers versionnés sans les redéfinir :

1. **docs/BOTMODE_V1_INVENTAIRE_MAITRE_20261018.md** — registre vivant des exigences ID par ID, périmètres, preuves E01-E17, trous et lots de clôture.
2. **docs/BOTMODE_V1_MEMO_CHECKPOINT_20261018.md** — mémo exact, environnement, SHA, interdits et décisions humaines.

Puis conserver/actualiser LE registre, au lieu d'inventer un deuxième fichier d'avancement. Ce prompt n'est pas un substitut aux lignes de l'inventaire : elles sont le contrat de pilotage.

### Dernier état VÉRIFIÉ sur la machine (18/10, à rafraîchir)

- Repository : https://github.com/Arkos77/LibreChat-BOTMODE-V1
- PR **#29** : https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/29 — **OPEN et DRAFT**, non fusionnée.
- Branche distante : botmode-v1-final-integration-qualification-20261016.
- Branche locale : botmode-v1-final-integration-local-20261016.
- Base PR : botmode-v1-integrated-candidate-20261014, PAS main ; ne pas rebase/merge l'empilement par intuition.
- Worktree : /home/kabofrynm/BOTMODE-V1-FINAL-INTEGRATION-20261016 (penguin/Crostini).
- HEAD du checkout et de la PR lors du contrôle pré-documentation : **a20cb0604a24dc5f4da9b41d30d5bcfa0831fc0a** ; worktree CLEAN.
- **28 workflows du SHA terminés : 27 SUCCESS, 1 SKIPPED (accessibilité), 0 FAILURE**.
- Preuves clés : SIGKILL Oracle #39085485305, SDK cold #39085485272, Current HEAD release preflight #39085485285, Current Image Subagent #39085485235, Oracle HTTP #39085485304, Main Integration #39085485300, Playwright #39085485318, Backend #39085485278, Frontend #39085485215, Static #39085485324.
- Preflight a réellement construit le Dockerfile du SHA exact, démarré une instance Lite éphémère, vérifié HTTP/Mongo et l'audit public. **Il N'A PAS publié cette image sur GHCR ni prouvé le premier parcours utilisateur avec une vraie clé LLM.**
- Beaucoup de probes nommées GHCR install/first-user/rollback ont encore des images historiques épinglées, notamment SHA 54b30a3 et digest sha256:07185… ; succès historiques, PAS une preuve de HEAD distribué.
- Par conséquent **release stable = NO-GO**, même avec CI verte, tant que les exigences V1 pertinentes et décisions humaines ne sont pas satisfaites.

**Attention : le commit qui enregistrera l’inventaire/mémo/prompt fera avancer HEAD au-delà de a20cb060. Les 27 succès cités restent les preuves du code au SHA a20cb060, PAS automatiquement du nouveau commit de documentation.**

**Ces faits sont un checkpoint, pas une donnée éternelle.** Dès ton entrée : relire HEAD, PR SHA, run HEAD et worktree ; si SHA différent, NOUVEAU checkpoint daté, et conserver historique.

## 1. Ce que l'utilisateur veut réellement — ne plus oublier de fonctionnalités

### 1.1 La vraie expérience finale

Une personne lambda doit pouvoir cloner une version de BOT MODE V1 validée, lancer **./install.sh**, laisser l'installateur choisir Lite si RAM limitée ou x86_64 sans AVX, renseigner **uniquement les clés API fournisseurs souhaitées**, et commencer dans LibreChat en français. Les identifiants internes DB/secrets sont créés/protégés automatiquement. Pas de préchargement manuel d'agents, pas de « docker debugging », pas de mode de développement ou de deuxième orchestrateur obligatoire.

Depuis **Chat / Work / Idées / Projet**, l'utilisateur décrit une idée ou une mission. BOT MODE doit :
- comprendre les objectifs, contraintes, temps, argent, autorisations ;
- décider **FAST** (réponse chirurgicale simple) versus **DEEP** (mission long terme) ;
- Directeur/Orchestrateur créer ou sélectionner **un ou plusieurs spécialistes à la demande**, leur attribuer outils/permissions minimaux, paralléliser seulement si justifié ;
- préparer un MissionContract durable + plan Task Tree/DAG, exécuter via le runtime **natif** LibreChat, réessayer/replanifier/fallback seulement sous mandat ;
- réunir sources, preuves, artefacts, coûts et traçabilité **MTO / Cheminement** ;
- soumettre à **Oracle/QA indépendant** ; garder candidats privés et pièces jointes ; publier UNE réponse finale durable visible à la bonne place dans l'UI ; fournir le refus/HITL quand non vérifié ;
- persister MongoDB/Redis/état, résister crash/worker/provideur/rate limits, reprendre sans rejouer des actions externes déjà terminées, sans boucler ni facturer plusieurs modèles sans ROI.

**Ne jamais annoncer « toujours une réponse » si aucun fournisseur n'est disponible :** garantir au minimum une erreur compréhensible, reprise possible, et fallback autorisé si une alternative gratuite existe.

### 1.2 Architecture GELÉE (noyau natif)

Rôles conceptuels : BOT-0 Worker, BOT-1 Specialist, BOT-2 Expert, BOT-3 Orchestrator, BOT-4 Director ; ce ne sont PAS cinq services ou cinq runtimes indépendants.

Pipeline canonique :
USER→ROOM/PROJECT→DIRECTOR/ORCHESTRATOR→INTENT/CONSTRAINTS→DECISION→POLICY/AUTH/BUDGET/RISK/MANDATE→TASK ENGINE/DAG→AGENT FACTORY→CAPABILITY/RESOURCE/MODEL ROUTING→NATIVE LIBRECHAT AGENTS/SUBAGENTS→TOOLS/WEB/RAG/CODE/BROWSER/MCP/MEDIA→EVIDENCE/PROVENANCE/MTO→INDEPENDENT ORACLE/QA→PUBLICATION BARRIER→RESULT/ARTIFACT→LEARNING.

Interdictions absolues :
- second orchestrateur, Task Engine, scheduler source de vérité, model/capability router duplicatif, MCP registry indépendant, stockage canonique parallèle, moteur permissions concurrent ;
- exposer un résultat privé avant Oracle accepté ; faire passer VERIFIED pour COMMITTED/PUBLISHED ; fabriquer un receipt/evidence ; rejouer un effet incertain ;
- transformer un outil/provider/skill ou JARVIS en autorité centrale ; tolérer un tool non autorisé ; ajouter Arena comme module ;
- réouvrir des phases acquises (P3/P4/P6 notamment) sans test montrant une régression réelle.

**Policy/Auth/Budget/Risk/HITL** est vérifié aussi **à l'instant de l'effet**, pas seulement à la planification. Autonomie analytique maximale sous mandat, actes extérieurs soumis à autorisation proportionnée.

### 1.3 Vision complète originale : préserver TOUS LES DOMAINES SANS les déclarer implémentés

L'utilisateur ne veut pas seulement un fork Docker fonctionnel. Les anciens PROMPTS MAÎTRES comprennent :
- Opportunity Intelligence : WATCH→SIGNAL→SOURCE/VERIFICATION→OPPORTUNITY→QUALIFICATION ; France, francophonie, Europe, monde ;
- Economic Enablement : Business Model Router, Business Blueprint, Execution Contract, coût/risque/ROI, éligibilité juridique/fiscale, revenu/marge, financement/marketplaces/emplois/aides, veille proactive ;
- sources de marchés produits/brands/UGC, services locaux/expériences, sourcing Asie (1688/Taobao/Weidian/Yupoo) et logistique, grave care/entretien de sépultures, creator economy, marketplaces freelances, sécurité sous autorisation ;
- mémoire/Experience Store, Dream/Distill/Harvest, Skills/Workflow Registry, improvement candidats, Skill Evolution, Failure Intelligence, evaluation adversariale sans ajouter Arena, obsolescence provider/modèle/skills ;
- médias image/vidéo/audio/voix/musique/3D/Spatial, pipelines créatifs, publication YouTube/shorts/social sous mandat ; web search/RAG/provenance/documents ;
- Browser/Computer, comptes/connecteurs, sandbox, A2A/MCP, resource/source registry, OSINT légal, Channel Gateway/Rooms, extension JARVIS voix ;
- familles modèles OpenAI, Google/Gemini, Mistral, DeepSeek, Qwen, GLM, MiniMax, Hugging Face, Ollama, Grok, Anthropic, et OpenRouter ; gratuit-first/fallback, coût/plafond payant/ROI, renouvellement clé API par provider, catalogue actualisable.

Tous ces thèmes sont des **exigences de vision**, MAIS il faut distinguer : (i) fonction livrée V1 contractuelle, (ii) fonction existante sans preuve, (iii) obligation release, (iv) ROADMAP V1.1+. Jamais supprimer une orientation pour embellir le pourcentage de clôture ; ne pas tenter d'implémenter tout le catalogue multimédia/business ce soir si ce n'était pas promis par la V1.

## 2. Sources historiques à relire intelligemment, sans repartir de zéro

**Library fichiers ChatGPT** :
- BOT_MODE_MASTER_FINAL_CONSOLIDE_V1.1_20260926.txt : 152 sections, philosophie/architecture de référence, fonctions vision et preuves historiques ; lire intégralement ou au minimum tous ses chapitres thématiques utiles, sans utiliser ses anciens HEAD comme vérité courante.
- BOT_MODE_Continuite_Consolidee_2026-09-27.md et Texte collé(20260927-060346).txt — PROMPT MAÎTRE V8.2.
- BOTMODE_V1_PROMPT_REPRISE_INTEGRAL_20261018.md, BOTMODE_V1_AUDIT_PREUVES_2026-10-17.md.
- Méthodes : Texte collé(20261016-095107).txt, Texte collé(20261016-191457).txt, Texte collé(20261017-182831).txt.
- Conversations/decisions du 7–18 octobre : architecture gelée, MissionContract/StateStore/heartbeat/watchdog/recovery, modèle Gemini test, premier utilisateur, Oracle publication, problèmes CI/RAM, JARVIS/Relay, desiderata UX FR/providers.

**Dépôt au HEAD** : README.md, docs/BOT_MODE_INSTALL.md, docs/BOTMODE_V1_GHCR_RELEASE_GATE.md, docs/BOTMODE_V1_NPM_RISK_DECISION_20261014.md, docs/BOTMODE_V1_FINAL_GATE_20261014.md, docs/BOT_MODE_RELEASE_DECISION.md, docs/BOT_MODE_ROLLBACK.md, THIRD_PARTY_NOTICES.md, issue #19, scripts install/bootstrap/doctor/update/backup/restore, workflows de CI, source runtime, tests.

**Hiérarchie de vérité** : code de HEAD + comportement observé + logs/sha/digests > décision récente explicite utilisateur > documents maîtres (vision) > hypothèses anciennes. Les anciennes versions sont archives, pas source de bugs actuels. Si certaines sources ne sont pas accessibles, dire lesquelles et noter UNKNOWN ; ne jamais dire « tout relu » si faux.

## 3. Inventaire unique, critères de décision, preuves

Ne PAS refaire une matrice parallèle. Charger docs/BOTMODE_V1_INVENTAIRE_MAITRE_20261018.md et enrichir **ses ID**. Pour chaque ligne :

ID / engagement exact / périmètre V1 ou roadmap / code actuel / preuve positive ET négative / SHA source / digest image le cas échéant / run/job/log / limitations / décision de scope / statut / prochaine action / besoin humain.

Statuts : VALIDÉ_SHA_PÉRIMÈTRE, VALIDÉ_HISTORIQUE, PARTIEL, INCONNU, FAIL, BLOQUÉ_HITL, ROADMAP. **Jamais** clôturer sur « fichier présent », « nom du workflow », « compilé », « 100 % », ou ancienne image. Un SKIPPED est SKIPPED. Les preuves ne sont pas transposables entre différents commits ou images. Si pas de preuve, c'est INCONNU, non un échec ni un PASS.

### Gates concrets (ne pas confondre leur nombre avec le nombre réel de corrections)

- G0 Continuité : inventaire, checkpoint, arbre Git propre, scope V1 et roadmap, causes réellement restantes.
- G1 Application : premier utilisateur/agents auto, mandat, Chat/Work/Idées, FAST/DEEP, Worker→N spécialistes→Oracle→publication Mongo+UI.
- G2 Sécurité et durée : HITL, permissions, effect receipts, négatifs ACL, SIGKILL API/worker, Redis/Mongo, retry/fallback, double crash, pas de duplicate/loop ; campagne longues missions selon promesse.
- G3 Fournisseurs : vraie clé autorisée sur HEAD, 429, panne, fallback gratuit, plafond coût, diagnostics, UX clés/provideurs, TTS/FR si promis.
- G4 Distribution : source HEAD build + image candidate GHCR immuable, manifest amd64/arm64, pull, Lite/Full, HTTP, auth, DOCX, migrations supportées, backup/restore/rollback réel.
- G5 Risques/doc : npm/DOCX/licence, image/secret scanning, README commandes install update doctor, limites OS/migrations/Helm, release notes, protections Git.
- G6 Autorisation humaine : candidate GHCR puis séparément merge/tag/alias stable, aucun coup de force.

Les gates G1–G5 se préparent autant que possible **en parallèle** par lots indépendants. Autorisations G6 seulement au moment indispensable, sans promettre GO quand un gate échoue.

## 4. MÉTHODE PRODUCTIVE — obligatoire pour éviter de tourner en rond

### 4.1 Une seule reconnaissance, puis agir

Phase read-only brève : outil Desktop/gh, pwd, branche, git rev-parse HEAD, git status, PR #29 HEAD/base/Draft, CI du SHA exact, savoir quels tests/builds utilisent l'ancienne image (54b30a3 / sha256:07185…) et quels tests la vraie. L'inventaire existe : ne PAS repartir sur 150 audits de code.

Dès le premier blocage réel : suivre UNE trace causale (symptôme, test rouge, premier état divergent, méthode source, pourquoi), corriger LA cause, puis tests locaux et voisins avant push. Grouper plusieurs corrections de la même cause dans UN lot. Ne pas polluer le repo avec une série de micro-commits de diagnostic ou des tests artificiellement assouplis. Un échec de fixture/pin n'est pas automatiquement un bug runtime ; un test vert sur fixture ne vaut pas succès réel.

### 4.2 Ordre de tests le plus rapide avec meilleures preuves

1. Lire les assertions, SHA, digest, contexte ; examiner le premier log rouge sans déverser les 10 000 lignes.
2. Reproduire localement avec script court ; sur Chromebook RAM limitée, éviter build Docker concurrent. Écrire un test négatif qui échoue avant le patch quand possible.
3. Patch minimal, puis script ciblé, tests des voisins/propriétés, `node --check`, lint/format, typecheck/build selon portée ; `git diff --check`.
4. Commit court **seulement après** vérifications locales, push sur branche de qualification autorisée ; consulter CI sur exact SHA. Tester end-to-end au checkpoint consolidé, pas à chaque micro-modification.
5. Relier preuve résultat au même SHA et digest et mettre à jour statut de la ligne dans l'inventaire. Ne pas attendre « go » pour passer au lot suivant indépendant.
6. Après CI en file d'attente, ne pas faire 30 appels d'attente passifs ; avancer sur risques/doc/qualification indépendante. Sur processus asynchrones, lire PID jusqu'au vrai exit code ; ne pas affirmer SUCCESS à « started » ou « queued ».
7. Rapporter l'essentiel seulement : SHA, preuve exacte, ce qui a changé, ce qui reste, acte humain requis ; ne pas raconter les microétapes.

### 4.3 Priorité et arbitrage

Classer les tâches par **blocage release**, **gravité utilisateur**, **risque sécurité/données**, **dépendances**, **valeur preuve/coût d'exécution**. Chemin critique prioritaire. Préparer plusieurs lots en parallèle intellectuellement, mais exécuter les mutations Git de manière sérialisée pour ne pas écraser des changements. Si l'exigence n'est pas clairement dans V1, NE PAS l'écarter silencieusement : consigner proposition scope et la faire approuver seulement si elle modifie le produit promis.

### 4.4 Méthode technique de suivi

- Run ledger : `SHA | workflow run ID | image ref/digest | scope | assertions/artefacts | conclusion | limite`.
- Change ledger : `ID exigence | premier échec | cause | fichiers | test local | commit | run HEAD | résolution`.
- Décision ledger : `D-01 scope, D-02 risques, D-03 candidate, D-04 stable, D-05 données/coûts`.
- À chaque reprise : lire le dernier ledger/checkpoint, **pas les 150 derniers messages** si le contenu est déjà consolidé.
- Versionner avec le code l'inventaire et le mémo, et ne créer un nouveau prompt que lors de changement substantiel de scope ou de chat.

## 5. Outils et périmètre réel d'autorisation — travailler directement

### 5.1 Desktop Commander Remote (prioritaire)

La machine Chromebook Linux Crostini se nomme **penguin** ; Remote était Online au checkpoint. Découvrir le device actuel ; l'ancien ID e6bf06d3-458d-4a01-a84e-270e7a7a5b78 peut avoir changé. Le checkout est situé dans /home/kabofrynm/BOTMODE-V1-FINAL-INTEGRATION-20261016.

Utiliser les outils Remote pour commandes, fichiers, logs et tests. Ne demande PAS au user de relancer npx Desktop Commander si l'appareil est en ligne. N'utiliser le terminal du Chromebook que dans ce checkout et des conteneurs de test JETABLES, sans modifier les conteneurs API/Mongo personnels, candidates 002/003, sauvegardes ou volumes utilisateurs. Le Chromebook ~2,7 GiB RAM sans AVX est limité : build lourd et multiarchitecture = GitHub Actions.

Commande initiale lecture seule (adapter aux outils authentifiés) :

    cd /home/kabofrynm/BOTMODE-V1-FINAL-INTEGRATION-20261016
    pwd
    git rev-parse HEAD
    git branch --show-current
    git status --short
    git log -5 --oneline
    gh pr view 29 --json state,isDraft,headRefOid,headRefName,baseRefName
    gh run list --branch botmode-v1-final-integration-qualification-20261016 --limit 40 --json databaseId,workflowName,status,conclusion,headSha

Ne pas croire qu'un SHA de la mémoire est encore celui du dépôt. Ne pas se fier uniquement au nom d'un workflow ou à un job vert. Vérifier les tâches ayant exécuté des images SHA historiques/fixtures.

### 5.2 GitHub

gh CLI, connector GitHub si présent, et tests GitHub Actions constituent les preuves distantes. Inspecter issue #19 (feature freeze), PR #29, ancien stack PR #14/#18/#20/#21/#23/#25/#26/#27/#28 **uniquement lorsque le lien de filiation ou un conflit le nécessite**. Éviter de retester toutes les vieilles PR.

Les modifications non destructives et les commits/pushes sur la branche de qualification sont autorisés selon les consentements déjà exprimés. **Aucun merge PR, aucune modification de main, tag stable, GHCR candidate publish, alias latest, réécriture historique, force push ou modification de secrets** sans approbation humaine explicite.

### 5.3 JARVIS/Relay Chromium en secours UNIQUEMENT

Ancien chemin :
ChatGPT → JARVIS Desktop/API (127.0.0.1:3000 et :8741) → Relay V2 → Chromium CDP (:9222) → commandes autorisées → résultat avec task_id/exit_code. Fichiers historiques : ~/.jarvis/chatgpt-relay/conversation-url.txt, v2-ledger.jsonl/v2-audit.jsonl (vérifier noms exacts locaux), commandes scan/status/branch/head/remotes/diffcheck/log/test/quit.

**JARVIS n'est pas un deuxième cerveau ni un runtime BOT MODE.** Le Relay est un mécanisme facultatif pour piloter l'environnement de développement. Ne pas réinstaller cette chaîne si Desktop Commander fonctionne. Un transport fermé, timeout ou token JWT expiré NE vaut PAS preuve que la commande distante est passée ; revérifier l'état Git/process. Appliquer scope+approval+ledger si le fallback devient nécessaire.

### 5.4 Clés, volumes et paiements

N'afficher ni copier aucune vraie clé, .env, token ou cookie dans le chat, Git, fichiers d'inventaire, artefacts CI ou logs. Ne pas appeler de fournisseur payant sans consentement à budget/plafond/fournisseur/scénario. Ne pas supprimer volumes, comptes, messages, sauvegardes ; pas de docker compose down -v, prune -a, reset DB ni mutation de candidate personnelle. Tester sur GitHub runner ou conteneur isolé. Demander permission seulement pour un acte sensible concret.

## 6. Campagne de preuves finale, négatifs indispensables

Un scénario réel doit produire un receipt/conclusion de bout en bout, pas seulement des extraits textuels. À couvrir suivant le périmètre V1 revendiqué :

**Installation et premier utilisateur** : clone d'un commit/tag stable + pull du digest GHCR EXACT ; install Lite sans outils de dev ; HTTP/auth Mongo ; première création utilisateur et JWT ; auto-agents ; liste UI visible ; clé provider via UI/secrets ; mission avec persist Mongo ; stop/start et replay ; aucun secret dans artefacts.

**Mission normale** : Idée/Work/Chat → objectif/plan durable → un Worker → un spécialiste créé/sélectionné par mission → tool grants contrôlés → Oracle vérifie des critères indépendants → candidat durable → publication unique → réponse finale dans conversation/fiche Idée/Projet, pièces jointes privées/ACL.

**Interruption** : kill worker, SIGKILL API en cours de mission ; kill provider/429 → retry typé/fallback autorisé ; Redis/Mongo indisponibles et restauration ; watchdog stop boucle ; HITL pendant 30 min puis resume ; mission ~3 h sans dérive contexte si annoncée ; cancellation tardive avec committed préservé ; multi-recovery sans duplicate ; effet externe incertain jamais rejoué sans preuve ; seconde panne au milieu de publication finale. Ne pas relâcher les garde-fous pour faire passer le test.

**Sécurité** : user A ne peut consulter les jobs/source/agents de B ; permissions révoquées empêchent l'outil ; path d'effet vérifie mandat au moment de l'action ; NO AUTH = NO ACTIVE CYBER/OSINT TEST ; pièce jointe/file RAG/docx sans XSS/ZIP bomb ; rate limits/budget testés sans paiement réel.

**Routage** : fonctionnement Gemini/OpenRouter et catalogues réellement configurés ; gratuits-first, réaction 429, crédits zéro, provider outage ; payant sous ROI/HITL ; modèles création/médias et renouvellement de clé lorsque promis. Si l'accès à une vraie clé est indispensable, lancer d'abord tous les tests déterministes sans coût, puis demander UNE approbation précise.

**Distribution** : build non publiant source SHA exact ; une publication candidate GHCR immuable **après accord** ; manifeste et digests linux/amd64+arm64, pull de ces digests, install, auth, mission, sauvegarde/restore/rollback ; pas de latest avant approbation stable ; archiver tag/digest/lockfile SHA/runs/logs. Pas de promesse de migration in-place ou OS non testés sans décision de périmètre.

**Développement non prioritaire** : médias tous providers, Channel Gateway, Economic Enablement automatique, sourcing/marketplaces/YouTube 24/24, MIMO/Dream, skills auto-améliorants, multimodal complet et providers nouveaux restent dans l'inventaire vision si non contractuels V1 ; les préserver, mais ne pas sacrifier la release reproductible pour coder tous les futurs verticaux.

## 7. Plan d'exécution dès maintenant, sans interruptions inutiles

**Lot A — Delta réel / pas de nouvelle architecture**
- Charge l'inventaire versionné. Vérifie Git et CI une fois. Marque exactement quelles lignes bloquent réellement le périmètre V1, quelles preuves pinned ne valent pas HEAD. Détecte d'éventuelles docs périmées.
- Fais un UNIQUE plan de lots priorisé, puis **attaque directement** le premier blocage pouvant être résolu sans consentement. Ne propose pas un énième audit complet.

**Lot B — Prouver les flux V1 qui manquent sur code HEAD**
- Premier utilisateur/agents auto, création spécialiste dynamique et autorisations, vrai parcours UI, providers/fallback gratuit, Oracle/UI, sécurité des effets ; diagnostic et correction minimal si preuve d'échec.
- Sur le même SHA, préparer/ou compléter les tests négatifs ciblés, pas les 28 workflows entiers par défaut.
- Si un test nécessiterait paiement, vrai compte externe ou modification de volume, documenter le blocage ; travailler sur les autres exigences en attendant.

**Lot C — Sécurité, documentation et candidat prêt à publier**
- Audit npm de production exact, risques DOCX et licences, hardening/recovery, backup/restore, support OS et périmètre Helm/migrations.
- README et guide Lite/Full tenant compte du SHA réel, commandes testées, limites vérifiables ; geler SHA et lockfile.
- Construire le dossier candidat complet : aucun push GHCR sans approbation ; préparer workflow de build/push spécifique et scénario rollback.

**Lot D — Demande de GO candidate et vérification post-publication**
- Demander explicitement **autorisation publication d'image candidate IMMUTABLE**, avec SHA, cible, caractère public/privé, coût/risque ; cela N'EST PAS un GO stable.
- Une fois autorisé : contrôler digest, deux plateformes, pull depuis GHCR (pas build local), première installation+missions, rollback/restauration sur staging. Enregistrer preuves.

**Lot E — Décision stable distincte**
- Contrôler toutes les lignes V1 : VALIDÉ au bon SHA/digest ou limites/résidus acceptés humainement.
- Préparer changelog, repo protections, docs, notes de sécurité et procédure de rollback. Si gate manquant : « NO-GO / cause / preuve / action ».
- Si tout est accepté : demander approbation **séparée** pour merge/tag/release stable. Ne PAS activer latest/merge sur la seule base des CI.

**Cette séquence est une priorisation, pas une estimation certaine de durée ni la permission de reporter les exigences contractuelles.**

## 8. Conditions d'arrêt, messages et mémoire de travail

Travailler en continu tant qu'il y a des actions réellement possibles. Stop seulement pour :
- validation humaine (publication candidate, risques/licence, merge/release, dépense/clé, mutation personnelle) ;
- danger effectif pour données, secrets, sécurité ;
- outil inaccessible après une tentative de reconnection bornée (ne pas inventer un succès) ;
- tests en cours à attendre quand aucun autre lot utile n'est exécutable.

Statut utilisateur idéal : **preuve précise → action effectuée → nouveau SHA/CI → prochain blocage**, 2–5 phrases. Ne pas demander GO entre corrections courantes. Si un long run est en cours, continuer les lots parallèles non conflictuels et ne pas poller toutes les 3 secondes.

À chaque checkpoint :
- mettre à jour l'inventaire maître et le mémo avec SHA, nouvelle preuve, statut, limitation, prochaine action ;
- committer ces modifications sur branche de qualification si elles constituent un lot cohérent ; ne pas recréer un nouveau fichier « audit final » à chaque chat ;
- conserver l'historique des validations acquises, créer un appendice pour tout changement de SHA ;
- ne jamais affirmer « tout lu » si une source distante n'était pas accessible.

**Ton objectif n'est pas d'exécuter des tests pour faire des tests, mais de finaliser une V1 native LibreChat, autonome sous mandat, reproductible depuis une image publiée, sûre et fidèle à son ambition. Commence immédiatement par la vérification courte du HEAD puis la première tâche à forte valeur du registre.**
