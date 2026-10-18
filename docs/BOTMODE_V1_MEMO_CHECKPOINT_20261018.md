# BOT MODE V1 — MÉMO DE CHECKPOINT ET CONTRAT DE CONTINUITÉ

**Établi : 18 octobre 2026.** **Référence de continuité actuelle** : [inventaire maître](BOTMODE_V1_INVENTAIRE_MAITRE_20261018.md). Ce mémo devient **un fichier versionné lors du commit Git**, pas une modification automatique de la mémoire personnelle du compte ChatGPT. Les futurs assistants doivent le lire avec le prompt de reprise. Après push de ces documents, le SHA courant sera différent : **ne pas réattribuer 27 PASS au commit documentaire sans vérifier ses propres runs.**

## 1. Objectif final non négociable

**Terminer une BOT MODE V1 réellement utilisable et reproductible**, native dans LibreChat : installer depuis un SHA/tag immuable sur machine neuve, entrer **uniquement les clés API voulues** (les secrets DB sont générés), obtenir les agents natifs initialisés, lancer depuis Chat/Work/Idées/Projet une mission adaptée FAST/DEEP, faire intervenir à la demande Worker + spécialistes avec capacités autorisées, vérifier chaque résultat par Oracle, publier une unique réponse durable visible en conversation/projet. Préserver état, données, pièces jointes, historique MTO et sécurité des actions lors de HITL/pannes/redémarrages.

La **vision complète historique** reste documentée : BOT-0 à BOT-4 ; Opportunity Intelligence et Economic Enablement ; Business Blueprint, sourcing/OSINT, médias/image/vidéo/musique/3D/YouTube/shorts ; agents spécialisés dynamiques, Skills/Improvement/Memory/Experience ; browser, comptes et automatisations externes sous mandat, catalogue et fallback gratuits, ROI. **Ce n'est pas la preuve que tous ces modules sont prêts** ni une autorisation d'élargir arbitrairement la V1.

**Invariants gelés** : un seul orchestrateur/Task Engine/Policy/Auth/Capability Router/scheduler/source durable ; natif LibreChat ; fail-closed pour effets incertains ; contrôle économique et HITL ; aucune capacité externe ne devient deuxième autorité. P3/P4/P6 historiques gelés, sauf régression prouvée. Ne pas ajouter Arena, pas de crédits payants sans ROI/permission.

## 2. Identité Git vérifiée sur machine réelle

- Dépôt public : https://github.com/Arkos77/LibreChat-BOTMODE-V1
- PR : https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/29 ; **OPEN / Draft / non fusionnée**.
- HEAD du checkout et de la PR lors du contrôle pré-documentation : **a20cb0604a24dc5f4da9b41d30d5bcfa0831fc0a**.
- Branche qualification distante : **botmode-v1-final-integration-qualification-20261016**.
- Branche locale : **botmode-v1-final-integration-local-20261016**.
- Base PR : **botmode-v1-integrated-candidate-20261014** (PAS nécessairement main).
- Checkout Chromebook : **/home/kabofrynm/BOTMODE-V1-FINAL-INTEGRATION-20261016**.
- Machine Remote Desktop Commander : **penguin** (ancien device ID e6bf06d3-458d-4a01-a84e-270e7a7a5b78 ; rechercher à chaque nouveau chat).
- Vérification 18/10 : worktree propre ; **28/28 workflows terminés**, dont **27 success, 1 skipped : accessibilité**, 0 failure. CE TOTAL N'ATTESTE PAS UNE RELEASE STABLE NI LE COMPORTEMENT DES PROVIDERS RÉELS.
- Références : SIGKILL Oracle **39085485305**, SDK Cold SIGKILL **39085485272**, Current Head release preflight **39085485285**, subagent actuel **39085485235**, intégration **39085485300**, Playwright **39085485318**, backend **39085485278**, frontend **39085485215**, Static **39085485324**. Tous ces runs ont été inspectés au SHA ci-dessus.
- Release actuelle **NO-GO** : ne pas transformer les 27 PASS en approbation.

## 3. Ce qui est réellement obtenu / ce qui n'est pas encore garanti

**Constaté sur le HEAD** : backend/frontend/static/Playwright et intégration CI verts ; installateur Lite en build éphémère exact SHA puis HTTP+Mongo vert ; modèle déterministe local : reprise serveur après SIGKILL, Oracle et publication unique dans le scénario qualifié ; contrats SDK Redis/Mongo et garde-fous d'effets. Sonde sous-agent qui build le code actuel verte.

**Seulement historique ou simulé** : premières connexions/six agents bootstrappés depuis GHCR, certains rollback/pull/install et probes pinned utilisent encore le commit **54b30a3** et/ou l'image immuable **sha256:07185…**. Les modèles réels, les vraies clés, les capacités externes à effet, les missions de plusieurs heures et tous les chemins UI n'ont PAS un tampon de validation globale sur le HEAD.

**Non décidé / soumis à preuve** : l'image multiarchitecture réelle du dernier SHA n'est pas publiée dans GHCR ; pas de manifest/index/digests publics actuels qualifiés ; risques npm historiques 3 modérés (mammoth/argparse/sprintf-js), notices de licences et alertes de la branche par défaut à réconcilier (pas confondre les portées) ; rollback depuis la nouvelle image publiée, OS non Linux annoncés, support/migrations legacy Helm et bases, bouton renouvellement clé/provider, UI FR/TTS, routage gratuit 429/ROI, création dynamique d'agents avec permissions et effets ; performance multiheures.

**Documentation historique potentiellement périmée** : README évoque encore une ancienne branche de runtime ; documents d'installation citent l'ancienne candidate. Conserver ces références comme histoire ; réécrire les informations actives quand la candidate est gelée.

## 4. Matrice de preuves obligatoire

Pour chaque ligne du **registre unique** :
ID | Périmètre V1/Historique/Roadmap | Comportement attendu | Code/source | SHA & image digest | Preuve de test | Ce que la preuve NE montre PAS | Statut | Cause de blocage | Prochaine action | Approbation éventuelle.

Statuts seulement : VALIDÉ_SHA_PÉRIMÈTRE, VALIDÉ_HISTORIQUE, PARTIEL, INCONNU, FAIL, BLOQUÉ_HITL, ROADMAP. **« Présent dans source » ne vaut pas « validé »**. SKIPPED ne vaut jamais PASS. Si SHA changé, ouvrir une nouvelle ligne de checkpoint, ne pas recycler silencieusement la colonne SHA. Aucun pourcentage inventé.

## 5. Méthode d'exécution accélérée et anti-boucle

1. **Read once, act many** : vérifier une fois HEAD, PR, 28 workflows, leur code/image/digest, périmètre ; lire les maîtres anciens pour les décisions, pas pour reprendre les vieux bugs. Charger l'inventaire versionné ; chercher uniquement les lacunes/blocages.
2. **Priorité chemin critique / ROI** : installer SHA courant → agents/identités/provider réel → mission FAST/DEEP Worker/spécialistes→Oracle→publication durable → interruption/reprise → image candidate GHCR → restauration et release. Le reste non bloquant va au backlog sans disparaître.
3. **Un lot = un problème observable** : attendu/réel → première divergence → code exact → root cause → correction minimale cohérente → tests négatifs et voisins → format/typecheck/build pertinent → diff check → commit → push qualification → CI du même SHA → mise à jour du registre. Pas 10 micro-commits diagnostiques.
4. **Budget d'attente** : exécuter tests locaux rapides d'abord ; CI lourde seulement aux checkpoints consolidés. Pendant les longues CI, examiner les autres manques indépendants ; ne pas faire tourner 3 test suites Docker gourmandes sur Crostini (RAM ~2.7GiB, pas d'AVX). Sur process distant, relever PID puis lire sortie jusqu'au statut terminal ; « Process started » N'EST PAS « test réussi ».
5. **Preuves indépendantes** : tests source vs image GHCR/pinned ; modèle simulé vs provider réel ; single run vs durabilité ; owner ACL vs code de permission ; image build vs pull du registre ; backup script vs restauration testée.
6. **Rester dans son mandat** : commits/pushes sur branche de qualification autorisés dans le travail de projet ; PAS de merge, release stable, tag, publication GHCR, rotation secrets, dépense, actions sensibles/destructives ou modification des volumes personnels sans approbation séparée. Les tests jetables sont autorisés quand sûrs.
7. **Style opérationnel** : ne pas demander « OK/GO » entre lots ; court statut seulement si preuve substantielle, sinon exécuter. Si bloqué humain, fournir UN acte concret à valider et préparer tous les contrôles indépendants.

## 6. Chemin d'outils (sans recréer un second système)

- Priorité **Desktop Commander Remote** sur penguin, machine déjà connectée au checkpoint. Vérifier statut avant reconnecter. Terminal ouvert. Checkout ci-dessus.
- **gh** authentifié pour PR #29, issue #19, checks, logs, base, images. Différencier job success et workflow success ; inspecter les lignes d'erreur bornées.
- JARVIS/Relay/Chromium CDP **fallback seulement** si Desktop Remote réellement indisponible ; historique JARVIS UI 3000, API 8741, CDP 9222, ~/.jarvis/chatgpt-relay/conversation-url.txt, ledger/audit V2. JARVIS est un exécuteur, **pas** l'autorité BOT MODE. Ne pas consommer une limite Desktop Commander inutilement ou lancer Codex payant sans valeur.
- GitHub Actions pour images multiarch, tests SIGKILL, MongoDB/Redis/Playwright/full runtime lourds ; conteneurs et volumes utilisateur **intouchables**.

## 7. Décisions humaines et limites de release

- **D-01 Scope V1** : contrat réellement annoncé (new installs Docker Compose/GHCR Linux prouvées ; Full/Crostini/macOS/ARM/WSL2, migrations in-place, Helm — support honnête). Ne pas éluder les engagements d'autonomie.
- **D-02 Risques** : revue du lockfile final/advisories/third-party licence et acceptation signée ou remédiation.
- **D-03 GHCR candidate uniquement** : demande d'accord explicitement limitée à un TAG IMMUABLE candidate, jamais latest ; ensuite manifest amd64/arm64 + pull public + smoke.
- **D-04 Stable** : autorisation distincte merge/permissions GitHub/tag/release stable/promotion.
- **D-05 Données/crédits** : approbation distincte pour provider payant, action sur compte/volume/credentials, usage réel de clés externes.

Si un gate est inconnu : NO-GO avec action précise, pas de certitude temporelle ni pourcentage arbitraire. Un test non exercé est UNTESTED, non un succès.

## 8. Prochaine action exécutable après reprise

1. Lire **cet inventaire** et la PR réelle, récupérer le statut Git/CI du **nouveau** SHA, vérifier que le registre n'a pas un doublon récent.
2. Résoudre les premières lacunes factuelles **sans clés coûteuses** : audit des checks UI/agents/skills, test de création sous mandat, première installation image build HEAD, négatifs ACL et mission externe. Ne pas ouvrir tous les tickets historiques.
3. Préparer le dossier candidate (SHA, SHA package-lock, preuves E01-E17, image build E05, sécurité/npm/licences, rollback plan) et identifier les approbations effectivement nécessaires.
4. Seulement après preuve des gates L1/L2, demander autorisation candidate GHCR D-03 ; ensuite L3, D-02 et D-04 selon résultats.
5. En fin de lot, mettre à jour un seul registre, ce mémo, puis conserver un checkpoint vérifié sans dérive.

**Résumé :** objectif = livraison utilisable et reproductible fidèle à la vision, pas « une CI verte ». Conserver les preuves acquises, éviter les relectures et corrections cycliques, ne pas forcer une release non sûre.


## Reprise du 18 octobre — delta après b49a5bf03

Connexion Remote `penguin` confirmée ; `git status` initialement vide ; local HEAD=PR #29 head=`b49a5bf03d4f48b05f219ae417cb2c0aa99ec4ad`, PR ouverte en Draft. Sur ce SHA au premier relevé : 24 succès, 3 workflows en cours, 1 accessibilité ignoré. Le scénario onboarding historique référence l'ancienne révision `d4e82dde` et appelle l'initialisation manuelle. Écart concret `IdeasView.tsx` : fallback sur un agent arbitraire ; correctif isolé en préparation, aucune assertion E2E revendiquée. Test local Prettier indisponible (`prettier-plugin-tailwindcss` manquant), pas de contournement des dépendances. Rester NO-GO jusqu'aux preuves HEAD et aux approbations D-02/03/04.

**Qualification Idées ajoutée :** nouveau test Jest ciblé (absence Worker, erreur API, route Worker), exécution en attente du CI après push. Les 28 workflows de `b49a5bf03` sont terminés : 27 succès + 1 accessibilité ignoré. Aucun succès n’est attribuable par avance au futur commit.

**Prochaine qualification indépendante :** workflow native first-user converti en checkout SHA déclencheur ; ne compter qu'après run terminé avec SHA et logs. Cette action ne publie aucune image. Le premier utilisateur reste un onboarding HTTP explicite, donc zéro étape technique non prouvé.

**Audit sécurité du lock HEAD `921516af4` :** npm production actuel = 3 modérées, 0 élevée/critique (`mammoth`, `argparse`, `sprintf-js`) ; lock SHA256 `4b0b6d51afb679bc3b1633f29609d3aa9bdce8515f4df719bf0ddc67d22b44b3`. Aucune mise à jour de dépendance entreprise ; D-02 toujours ouverte. Le serveur GitHub signale séparément 25 vulnérabilités sur la branche *main*, périmètre différent.

**Run utilisateur réel sur image locale HEAD (fixture fournisseur seulement) :** #39090842532 SUCCESS au SHA `921516af4` ; checkout, image construite sans GHCR, premier compte, JWT, setup REST explicite des six agents, ACL, délégation, idempotence et reprise stop/start. En attente : onboarding sans clic, mission LLM réelle, publication autonome, digest public et rollback staging.

**CI frontend source `921516af4` :** #39090844941 SUCCESS (build Vite, tsc, deux shards et client Jest) mais trace nominative du nouveau test Idées absente ; ne pas généraliser au navigateur. Docs README/install mis à jour en local pour lever références anciennes, et workflow DOCX refactoré pour SHA exact ; commit de ce lot à enregistrer séparément.

**Lot UX libre-service en préparation** : auto-initialisation native lors du premier clic de mission Idées si le catalogue contient un unique OpenRouter `openrouter/free`. Sinon le sélecteur explicite Projet reste nécessaire, aucun modèle payant choisi automatiquement. Tests : seul agent étranger, erreur API, gratuit unique, catalogue payant seul, Agent Worker trouvé. Pas de claim PASS avant CI.

**DOCX sur source HEAD :** #39091502539 `SUCCESS` au SHA `ccb9ae9f5`, trace Mammoth deux conversions sans argparse/sprintf-js et 15/15 tests ZIP/DOCX ; avis npm non résolus, revue D-02 intacte.

**Protection main** : API GitHub : force-push/deletion refusés, mais aucune review obligatoire, aucun status check requis, enforce-admins désactivé, aucun ruleset renvoyé. Décision D-04/G5 ouverte, aucune mutation de paramètre effectuée.

**Publication GHCR** : durcissement local de la chaîne `botmode-image.yml` (SHA candidate unique, refus tag existant, rejet edge/latest, branche requise, sérialisation SHA, 5 tests script PASS) ; endpoint des versions GHCR inaccessible via token local (403 read:packages). Mode guard-only sans publication ajouté pour vérifier la permission Actions avant D-03, résultat en attente.

**Échec statique isolé sur e05c57a8 :** job Static checks #39091743728 en failure : seul `IdeasView.test.tsx` a une erreur Prettier ligne 79 et un ordre d'imports divergent, malgré Jest nommé PASS #39091743682. Fix ciblé par tri officiel `scripts/sort-imports.mts` et format du chaînage ; contrôle local de tri PASS, 5 tests gardiens GHCR PASS. Attendre requalification SHA, ne pas inventer une résolution CI.

**GHCR guard only vérifié :** #39092833171 SUCCESS sur `e1363e5a`, contrôle d'absence tag complet, sans aucun build/push/merge/pull (tous SKIPPED). Token Actions OK. Durcissement local restant : aucun run PR ne doit interrompre une éventuelle publication manuelle via `cancel-in-progress`; source YAML préparée, pas encore CI validée.

**Live free Oracle gate préparé** : unique workflow manuel réel OpenRouter/free désormais checkout SHA déclencheur, image locale non publiée, harness intégré à la révision, vérification Oracle accept/review + persistance Redis attendue ; production multi-model router volontairement hors périmètre (CI jetable). Exécution à venir, aucune réussite présumée.

**Échec live réel #39093570016 (`4f1514502`) :** OpenRouter/free preflight et image HEAD PASS, six agents + Worker stocké, mission HTTP 200; 1037 événements SSE en 180 s, pas de frame finale, timeout. Cause profonde NON déterminée (ancien prompt avait délégation complexe). Préparation d'un smoke Worker « OK » distinct, histogramme de types sûr + statut Redis en cas d'expiration. L'Oracle live et la délégation restent NO-GO, aucune dépense modèle payant, CI à refaire sur nouveau SHA.

**Sécurité coûts — changement proposé sur branche de qualification :** au lieu du précédent `free_first` + six chemins automatiques Gemini non explicitement gratuits, les 6 host routes natifs seront `free_only`, 3 options OpenRouter réellement nommées free par rôle ; aucun modèle payant choisi par défaut. Script de validation Python 1 test PASS, intégré dans workflow current HEAD source ; protocole des fournisseurs payants manuel reste possible sans être activé par défaut. CI du prochain SHA obligatoire.

**Validation live réelle #39094215479 (`4067764df`) :** OpenRouter/free direct PASS, Worker SSE final et persistance Mongo 2 messages/1 conversation, Oracle ACCEPT VERIFIED/publish + REVIEW HUMAN_REVIEW/suppression PASS, image source-built jetable. **Seul périmètre prouvé : routeur multiniveau désactivé**, prompt OK ; ne pas conclure spécialistes/429/longue mission ni GHCR. Un test optionnel source-matched du routeur default free-only est préparé à partir du prochain commit après contrôle local des 6 rôles.

**Free provider tool-calling** : manual workflow historically pinned converted locally to current triggering SHA, one functional `tool_choice=required` using OpenRouter/free. Pending real runner; do not mistake provider tool call for a persisted native subagent.

**Routeur free_only réel #39094670848 (`e75e7d3d2`) :** Worker SSE final et Oracle ACCEPT VERIFIED + publication PASS avec routeur multi-candidats ACTIF ; workflow FAIL seulement lors du REVIEW : HTTP 401 après expiration du JWT fixture à 2 min, authentification jamais renouvelée. Correctif local JWT CI 15 min (pas la politique production), retest des deux scénarios requis.

**Free tool calling #39095195551** : SUCCESS au SHA `82d7abca1`, un vrai `tool_calls` OpenRouter/free avec schéma fonction strict et `status=ready`. Complète les preuves de capacité externe; ne prouve pas délégation/Oracle multi-agents.

**Reprise 11h43, HEAD 82d7abca1 :** CI 30 SUCCESS, 1 SKIPPED, 2 FAIL (#39095196717 recovery publication Mongo immédiate absente malgré VERIFIED, #39095193886 upstream idle timeout + Oracle absent). Patch Playwright local : poll borné Mongo 30s, exigence de publication exactly-once inchangée ; nécessite qualification CI. Ne pas considérer un verdict Redis suffisant pour une publication utilisateur.

**État consolidé 18/10 à la reprise de `3cf108484` :** crash/restart Oracle #39116675418 SUCCESS (readback Mongo exactly-once, model-only après SIGKILL) ; fournisseur OpenRouter/free en mode free_only sur HEAD #39116699098 SUCCESS (Worker terminal, Oracle VERIFIED/published et HUMAN_REVIEW durable/non publié) ; première installation source-built #39117452670 SUCCESS (six agents/ACL via POST explicite) ; GHCR guard-only #39117454440 SUCCESS, strictement sans publication. Sonde #39116675419 démontre appels parent/enfant en fixture mais déclare elle-même `CI_ORACLE_ACCEPT_DURABLE_CHILD_LINEAGE=NOT_PROVEN`. Reste à tester la filiation durable réelle. Documentation release rectifiée, deux workflows handoff historiques convertis en HEAD exact **en local**, non validés avant nouveau run. D-02 risques npm/licence, D-03 digest/manifest/pull GHCR et D-04 merge/tag maintenus NO-GO ; accessibilité SKIPPED.


**Handoff nouvelle source (`3b54802c6`) :** #39118200640 12/12 Playwright mock et #39118200660 1/1 contrat SDK parent→enfant→parent, tous deux SUCCESS sur HEAD ; ne pas prétendre child durable réel avec fournisseur. Revue risque npm/licences rafraîchie dans le fichier EXISTANT `BOTMODE_V1_NPM_RISK_DECISION_20261014.md`. Audit de prod réépinglé à PR HEAD à qualifier par CI ; 3 modérées historiques, D-02 pas accepté. Stable et publication candidate toujours NO-GO sans décision humaine.


**Inventaire des CHECKOUTS HISTORIQUES (sans les relancer)** : audit sur PR29 `a682b7828` : plusieurs workflows publiés/fresh-GHCR/pinned-Oracle/rollback utilisent explicitement `54b30a3`, `d4e82dde`, `ea24f476`, `4727adf` ou `8c6c2c4`. Leur statut CI SUCCESS ne couvre jamais le digest/source HEAD. Le détail des fichiers est consigné uniquement dans l'inventaire maître (même document, pas de registre parallèle). Lancer seulement la distribution réellement source-matched et approuvée, pas une série de reproductions historiques.

**Protection données backup/restore** : correctifs ciblés dans les scripts existants : restore résout l'archive avant de se placer dans le bon checkout, backup conserve le répertoire donné par l'appelant. Les 4 tests avec Docker simulé passent, contrôle réel de confirmation `BOTMODE_CONFIRM_RESTORE=YES` intact. Prochain run preflight HEAD vérifiera ces invariants sans créer ni restaurer de DB réelle. D-03/04/05 restent humains.

**Correctif Idées local (non validé CI)** : refuser un lancement lorsque l'API native déclare `capabilitiesComplete=false` même si le modèle gratuit peut créer un Worker ; test dédié « aucune mutation projet/idée, pas de navigation » ajouté. En attente de commit et CI ; ne pas classer UX-02 VALIDÉ tant que la nouvelle révision n'a pas réussi le gate frontend.

**Preflight installation HEAD #39119461750 : SUCCESS** sur `0cedd5121` ; deux jobs (audit/contrat Docker/dry-run/4 tests backup-restore avec Docker simulé ; vraie installation Lite du build local exact + HTTP). Le correctif UX capacités incomplètes est sur le commit LOCAL `73edf36c0` mais doit être poussé puis qualifié séparément, aucun PASS CI attribué à ce patch.

**Backup atomique (lot local à qualifier)** : les scripts existants refusent désormais un faux backup réussi quand Mongo est absent, un dump interrompu/vide, tout remplacement d'archive ; checksum SHA256 du dump final ; refus de restore vide/corrompu avant Docker et approbation explicite intacte. 10 tests Docker simulé locaux PASS. Linux/macOS hash pris en compte. Aucun test de restauration physique ou migration trans-version revendiqué. Inventaire maître et plan rollback mis à jour, sans nouveau fichier maître.

**Correction du 18/10 après `02f509923` :** Frontend et source-built Lite preflight SUCCESS (#39121458798, #39121458732), Runtime Image 2 arches pre-push SUCCESS (#39121458803), publication volontairement SKIPPED. Job Static checks FAIL #39121458727 : UNE erreur `no-nested-ternary` à `IdeasView.tsx:389`, Prettier PASS. Patch local uniquement if/else, à valider sur nouveau SHA. Les autres jobs Playwright et intégration étaient encore actifs au relevé ; aucun résultat final inventé.

**Lot authentification Mongo / contrôle de restauration réelle (non validé CI)** : Static #39122247152 FAIL uniquement Prettier ligne 392, correctif retour ligne en local. Une lacune plus importante a été trouvée : backup/restore utilisent actuellement `mongodump`/`mongorestore` sans `--auth` Mongo. Correction pour credentials d'admin dans le conteneur, jamais exportés en logs hôte, 10 simulations PASS. Preflight HEAD étendu d'un job GH-hosted autonome, Mongo isolé et credentials aléatoires, canari avant/après, refus corruption et vrai restore. Ne pas l'assimiler à un rollback transversion ni prendre des volumes utilisateurs. Publication stable demeure NO-GO.

**Blocage immédiat repris 15h25 Paris, 18/10 :** deux échecs identiques de rollback ancien digest, #39128908867 / #39129124830 (image publiée `94b11f...` fonctionnelle Lite + stop/start, ancienne `sha-d4e82dded5df` non prête HTTP au bout de 180s). Ne pas confondre avec le succès #39128908747 sur *un autre* digest `07185a...`. Script existant ajusté pour diagnostic conteneur/logs et *roll-forward* vers digest candidat sûr après erreur, mais le rollback reste FAIL jusqu'à preuve de cause/remédiation. Ne jamais forcer une migration DB ni toucher le Chromebook.

**Diagnostic exact 18/10, #39131768930** : lors de la bascule de `94b11ff...` vers `sha-d4e82dded5df`, le conteneur API redémarre `EXIT=1` sur erreurs Mongo `Authentication failed`; le roll-forward sur `94b11ff...` échoue aussi. Le dump/restart initial de la candidate a bien réussi. Ajout de tests d'auth Mongo root et concordance URI/mot de passe en booléen **sans sortir d'identifiants**, à qualifier sur prochain SHA, sans prétendre que le problème est corrigé. **Rollback NO-GO**.

**Staging credentials sync à requalifier** : l'ancien test de rollback fonctionnel pré-remplissait `.env`, contrairement aux nouveaux tests qui généraient des mots de passe différents via bootstrap et GITHUB_ENV. Workflow corrigé avec une seule paire d'identifiants CI, assertion préalable. Verdict rollback toujours NO-GO avant PASS CI sur digest `94b11ff...`.

**PROUVE 18/10 — rollback staging digest GHCR résolu (#39132997099 SUCCESS)** : correction des mots de passe de CI dans .env et GITHUB_ENV -> PASS d'égalité, installation GHCR anonyme index OCI `94b11ff...`, persistance Mongo après stop/start, admin auth PASS, cycle API nouvelle→ancienne→nouvelle avec document canari PASS. Les précédents échecs `Authentication failed` étaient du harness de test et ne justifiaient pas modifier Mongo ou les volumes personnels. Reste NO-GO stable pour migrations de schéma/rollback multi-services réel, Oracle enfant fournisseur réel, accessibilité, npm/licence, PR stack/main, accord humain promotion. Le code runtime/source publié 13edaa4f4 et les tags GHCR demeurent inchangés.

**Qualification GHCR premier utilisateur à lancer** : même workflow d'onboarding intégré, maintenant source `13edaa4f4` et index OCI `94b11ff...`, avec assertion réelle ".Config.Image". Attente CI; ne pas rouvrir les validations anciennes, ne pas attribuer leurs PASS au nouvel index. Préserve la fixture de clé et aucun appel fournisseur payant.

**NOUVELLE PREUVE 18/10 — installation GHCR public + premier utilisateur #39133784761 SUCCESS** sur digest immuable OCI `94b11ff...` : login/JWT, premier utilisateur, six agents + ACL/délégation, config de modèle, idempotence, persistance compte/tokens/agents après redémarrage; aucune clé réelle consommée. Le seul échec voisin #39133784723 provient du guard de changement qui bloque un fichier de workflow d'onboarding nouvellement modifié ; ajout de ce fichier unique à la liste blanche de *qualification* et masquage des secrets éphémères CI. Pas de nouvelle image ni changement runtime. Attendre nouvel essai pour le gate statique du HEAD de qualification. Les risques npm/licence et les missions multi-agents externes réelles restent distincts.

**Nouvel essai mission sur digest GHCR exact (non encore exécuté)** : le workflow de mission précédemment vert était historiquement épinglé à la PR14 et à `07185a...` ; maintenant source `13edaa4f4` + image publiée `94b11ff...`, fixtures chargées depuis les scripts du même checkout, Docker inspect obligatoire. Ne pas confondre test de modèle simulé avec fournisseur externe réel ou Oracle recevant un enfant durable. CI à obtenir, pas de nouveau registre ni de clés personnelles.

**Dernier checkpoint du 18/10 — premier OCI Worker→Oracle (mock) + rollback confirmés :** SHA qualification `894bac992` : [#39135180559](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39135180559) SUCCESS, Worker SSE terminal, Oracle VERIFIED/publié et HUMAN_REVIEW retenue, Mongo persistance ; MAIS `CI_SUBAGENT_UPDATE_COUNT=0`, donc absence de preuve de spécialiste enfant réel. [#39135180557](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39135180557) SUCCESS rollback API OCI publié avec Mongo canari. 29 SUCCESS, 1 accessibilité SKIPPED et Static #39135180583 FAILURE lors de la détection des changements (timeout API GitHub, pas erreur de code démontrée), rerun du job en échec demandé. Inventaire MAÎTRE existant mis à jour, pas de deuxième inventaire. Prochaine priorité : enfant réel fournisseur externe consommé par Oracle + risque/licence/accessibilité, aucun merge/tag stable.

**18/10 17h — phase finale OR-06** : #39139635754 SUCCESS, source-built HEAD : parent appelle l'outil sous-agent (delta1), réponse enfant (delta1), 1 enfant Mongo lié et terminal durable avant ET après restart, verdict Oracle VERIFIED publié. Aucun événement enfant SSE (starts/stops=0), fournisseur modèle simulé : donc ne pas présenter comme spécialiste externe réellement inféré. Requalification de cette SONDE sur digest OCI GHCR exact `94b11ff...` sans rebuild ni accès clé payante, image inspect et diff source runtime stricts, prête à lancer sur prochain SHA. Gate externe réel + consommation Oracle restent ouverts.

**18/10 — SUCCESS enfant durable sur OCI publié #39140359622** : image 94b11ff... réellement tirée anonymement et démarrée, runtime source inchangé, parent→outil sous-agent→réponse enfant, Mongo unique lié durable/terminal avant/après restart, Oracle VERIFIED/publié et REVIEW supprimé. Modèle *simulé*, événements sous-agent absents du SSE principal ; le canal séparé subagent activity n'est pas couvert par ce run. Native ARM64 image/SDK smoke gratuit sur runner `ubuntu-24.04-arm` préparé, CI encore non validée. D-02 licences/npm, accessibilité, vrai modèle externe enfant et migrations restent ouverts.

**18/10 17h — validation ARM64 native supplémentaire :** #39141139755 SUCCESS sur runner `ubuntu-24.04-arm`; OCI 94b11ff... pull public arm64 + `node` et `@librechat/agents` exécutés sans réseau, pas seulement manifeste ou émulation. Couverture limitée au binaire/SDK, **pas** API HTTP, Mongo ni agent multi-runs ARM64. Inventaire et release gate existants actualisés; qualification runtime GHCR sous-agent synthétique #39140359622 SUCCESS, free-provider externe encore ouvert.

**D-04 confirmé read-only le 18/10** : branche main sans status checks obligatoires, approbations ni enforcement admins dans l'API de protection consultée ; PR29 toujours Draft, base empilée et seulement `MERGEABLE` techniquement. GO stable humain requis pour protection et ordre de fusion, aucun réglage modifié. Résultat ARM64 natif image/SDK #39141139755 PASS et modèle synthétique délégué sur OCI #39140359622 PASS sont tracés dans l'inventaire.

**Stack PR validé en lecture seule** : #26 Draft base main, #29 Draft base branche #26; #27/#28 autre branche empilée. #24/#6 CONFLICTING. Vérifier ascendance/déduplication avant promotion, ne jamais fusionner sur la foi d'un statut technique MERGEABLE. Branch protection sans approvals/checks stricts reste bloqueur humain.

**OR-07 à qualifier** : mode manuel et gratuit uniquement `live_free_provider=true` du workflow OCI child existant, nouveau gate strict `ci-live-free-child-oracle-gate.py`, sans fixture et avec `openrouter/free` officiel. Preuves à obtenir parent/outil/enfant Mongo réel → Oracle VERIFIED publié → restart durable, sinon verdict NO-GO explicite. Ne pas confondre exécution automatique synthétique PASS avec une inférence externe. Pas de publication d'image, de secret loggé, d'appel payant ou de volume local.

**UX a11y cause SKIPPED documentée** : workflow a11y.yml conditionné au repo upstream sauf dispatch manuel ; secret AXE_LINTER_API_KEY non configuré dans le repo actuel (seuls noms vérifiés). Aucun PASS accessibilité revendiqué. Variante locale axe-core Playwright à qualifier séparément ; ne pas réclamer de clé payante ni contourner axe.

**OR-07 #39143670066 FAILURE pré-inférence** : fixture/OCI PASS, configuration réelle `openrouter/free` PASS, conteneur API recréé mais /api/config non prêt pendant 120s ; PAS de preuve d'appel fournisseur. Instrumentation de diagnostic runner ajoutée (état Docker, HTTP, Mongo ping, catégories de log) sans imprimer clé, no-go externe inchangé. Relancer une seule qualification après stabilisation CI, ne pas augmenter quotas, ne pas ouvrir phase de modèle payant.

**OR-07 origine #39144561594** : conteneur healthy running, Mongo admin PASS, HTTP 000 sur 3090 ; saut de `BOTMODE_HOST_PORT=3090` entre deux steps Actions indépendants, retour Compose implicite à 3080. Script CI corrige le port et assert Docker Compose port avant tout appel externe. Reprendre le même test manuel `openrouter/free`, aucun retry payant; **aucune inférence réelle observée sur ce second run**.

**OR-07 #39145162040** : API port corrigé et HTTP /api/config PASS mais POST mission renvoie 503 instantanément; source `serverReady` protège génération pendant post-listen, `/readyz` est la readiness métier. Gate live corrigé pour attendre /readyz 200 120s max, état toujours non validé tant que run externe ne prouve enfant Mongo→Oracle. Aucune preuve d'inférence fournisseur dans ce run.

**18/10 OR-07 #39145646693 : avancée réelle, mais NO-GO enfant** — OpenRouter/free externe atteint API et génère 1 final SSE, Oracle VERIFIED + publié, 1 enfant Mongo lié. Il reste NON TERMINAL pendant ~45s : ne PAS classer toute la chaîne multiagents validée ni prétendre que l'Oracle a consommé l'enfant. Nouveau test ordonne `run_in_background:false` et exige Mongo status completed avant readback Oracle, aucun error/cancelled, restart durable ; diagnostique terminal retardé sur fenêtre bornée sans jamais transformer la fin tardive en succès complet. Source OCI inchangée, pas de paiement.

**OR-07 / 18-10 latest** : run manuel #39146733556 FAILURE par timeout de lecture SSE après start libre externe, sans readback Redis/Mongo ; CI HEAD deaa6c870 = 30 SUCCESS, 1 duplicate CANCELLED, accessibilité SKIPPED. Un nouveau lecteur SSE borné/stop-on-final (offline tests PASS) avec classification safe Redis/child est préparé dans le script CI seul. Ancienne preuve #39145646693 : parent+Oracle final/publié mais enfant Mongo lié NON terminal; cette preuve ne compte pas comme chaîne Worker→enfant→Oracle validée. Pas de nouvelle image ni provider payant. Qualification du lecteur SSE et de l'état réel à venir.

**OR-07 root cause test 18/10** : #39148677947 FAILURE comme attendu malgré OpenRouter/free SSE final 22 événements + Oracle VERIFIED/publié, car aucun `subagentThread` Mongo créé. L'ancien contrat ne rendait PAS l'appel obligatoire : worker et mission `basic`, planificateur DIRECT possible, texte modèle ≠ dépendance. Fixture CI corrigée pour 2 tâches structurées worker `basic` → spécialiste `research_specialist_ci` / `dependsOn:['worker']`; vérifier `SEQUENTIAL`, identité agent spécialiste et les deux verdicts Oracle. Nested child reste séparé et NON prouvé si absent ; toute activité enfant inachevée avant Oracle est refusée. Aucune modification runtime. Prochain run manuel `openrouter/free` à qualifier après fin des CI préexistantes, pas de succès anticipé.

**CHECKPOINT IMPORTANT 18/10 — LIVE provider PASS #39150077172** : PR29 commit de qualification `4ee221bf9` ; `openrouter/free` vrai, OCI GHCR index `94b11ff...` inchangé, plan STRUCTURÉ `SEQUENTIAL` **Worker→spécialiste** par capability gap, IDs de tâches/agents vérifiés, deux verdicts Oracle `VERIFIED` durables, publication unique et SSE 28 événements / 1 final / 0 erreur. `BOTMODE_LIVE_FREE_STRUCTURED_SPECIALIST_ORACLE=PASS`. Aucun `subagentThread` imbriqué sur CE run (`NOT_OBSERVED`), donc NE PAS convertir ce succès en validation nested child externe; celui-ci reste simulé en CI avec durable restart. Garder D-02/D-04, migration/rollback multi-services, accessibilité, stabilité/free-provider multi-run ouverts ; pas de stable ni de merge. Mise à jour du document GHCR et PR nécessaire sans recopier de second inventaire.

**UX accessibilité lot gratuit (18/10, PENDING)** : workflow distinct 'botmode-v1-free-a11y.yml' préparé avec scans axe-core/Playwright sans Deque API key, configuration e2e corrigée pour initialiser MongoMemoryServer et Chrome cohérent, aucun volume personnel. Ne pas marquer A11Y validée avant run SUCCESS ; le workflow SaaS historique reste SKIPPED. Gate stable et approbation humaine inchangés.

**UX A11Y preuve 18/10 :** #39151912466 SUCCESS, 6/6 scans axe-core Playwright Chrome réel dans Mongo e2e isolé, sans clé SaaS ; ceci clôt la lacune d'automatisation A11Y sur ces six vues, pas le test manuel clavier/lecteur d'écran/mobile. Logs de découverte de modèles Gemini 400 et MCP échouées par configuration de test sans vrais secrets, non assimilables à échec des scans ou à preuve d'un fournisseur fonctionnel. Un septième scan spécifique Projet BOT MODE est ajouté au même workflow, en attente de sa propre validation. Aucun moteur runtime ou image GHCR modifié.

**A11Y contrôle ciblé #39152443770** : 6/7 réussis; seule la nouvelle vue Projet BOT MODE échoue sur axe aria-required-children CRITICAL, faux role=row auto de ReactVirtualized Grid inner container. Solution appliquée à ProjectChatList.tsx (role et containerRole presentation, tabIndex=-1), sans désactiver les tests; septième requalification en attente. Aucun changement moteur, fournisseur ni volume utilisateur.

**A11Y Project follow-up #39152925373** : 6 PASS, septième FAIL désormais sur aria-allowed-attr CRITICAL : default aria-readonly=true interdit sur List role=presentation. Correction supplémentaire appliquée localement : props aria-readonly=null et aria-label=null typées, neutralisation explicite des defaults React Virtualized Grid sans retirer le scan ni modifier le moteur. Prochain run doit démontrer 7/7, statut pending jusque-là.

**CHECKPOINT UX A11Y 18/10 — succès confirmé :** #39153359628 SUCCESS au SHA code 'be7bc850c' : 7/7 tests gratuits axe-core/Playwright, **y compris fiche Projet BOT MODE**. Deux violations ARIA CRITICAL trouvées par les tests #39152443770 et #39152925373 puis corrigées dans ProjectChatList.tsx, sans masquage de règle. Couverture automatisée validée sur sept vues/états ; lecteur d'écran, clavier manuel/mobile et UX mission complète encore ouverts. Deque SaaS toujours SKIPPED distinct. À la suite, priorité release D-02 npm/licence, D-04 protections et ordre de merge, migrations/rollback, décision humaine finale ; pas de nouveau workflow a11y à ajouter.
