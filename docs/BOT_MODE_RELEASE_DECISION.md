# BOT MODE V1 — décision de périmètre et critères de publication

Date initiale : 13 octobre 2026 ; état courant en tête : 10 novembre 2026. Statut : **RELEASE NO-GO** jusqu'à levée explicite des réserves.

## V1.0.6 — point de décision au 10 novembre 2026 (PR #180)

**CANDIDATE TECHNIQUE VALIDÉE, RELEASE NON AUTORISÉE.** La version stable publique est toujours **v1.0.5**. La [PR #180](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/180) reste **DRAFT, non fusionnée**. La source qualifiée avant ce complément documentaire est `cec7497ca0978d99702bf8d121f192de66d941e3` : **23 workflows SUCCESS, 2 SKIPPED conditionnels, 0 FAILURE**. *Ce document met à jour la source ; son commit documentaire successeur devra avoir son propre verdict CI avant toute décision finale.*

### Périmètres prouvés et réserves

| Contrat | Verdict actuel | Preuve / limite |
| --- | --- | --- |
| Code et tests candidate (Backend, statiques, Playwright, intégration) | **PASS** sur `cec7497...` | [PR #180](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/180) |
| Lite installation neuve / image conservée après vrai redémarrage | **PASS runner jetable** | [Préflight GitHub Actions #42878161505](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/42878161505) |
| Full RAG natif, pgvector, isolation et embargo coût | **PASS tests spécifiques runner** | [Full RAG #42878161960](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/42878161960) ; ne pas inférer un déploiement Full sur Chromebook/Mac anciens |
| Missions Worker/Oracle/P6 avec modèles synthétiques | **PASS contrat CI**, fournisseur externe non démontré sur candidate | [Contrat #42878162521](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/42878162521) |
| HITL deux approbations HTTP, checkpoint Mongo et exécution unique | **PASS test HTTP simulé** | [Backend #42878162266](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/42878162266), `hitlCheckpoint.e2e.spec.js` ; **R5 réel du Mac TEST 3081 a FAIL**, ne pas le rebaptiser PASS |
| RECHERCHE + `web_search` Keyless et Playwright | **Configuration / disponibilité locale partielles PASS ; mission réelle NON CONCLUANTE** | Six agents et modèle `openrouter/free` réellement présents sur TEST Mac 3081 ; pas de preuve d'un outil navigateur réellement invoqué → Oracle/P6 sur OCI v1.0.6 |
| Alertes CodeQL propres à la vue PR | **2 HIGH ouvertes à arbitrer** | #331 et #332 `js/missing-rate-limiting` ; les routes MCP OAuth ont `requireJwtAuth` puis `mcpOAuthPollLimiter` avec tests 429/Retry-After sur les deux routes. Pas de dismissal automatique |
| Dette CodeQL historique sur `main` | **307 OPEN (134 HIGH / 173 MEDIUM), triage partiel** | [Issue #154](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/154) ; comptes distincts par ref, pas la preuve de 307 défauts nouveaux introduits par cette PR |
| Sauvegardes Mac/Chromebook v1.0.5 | **Présence et intégrité gzip PASS ; restauration réelle/multi-volumes NON CONCLUANTE** | Archives PROD 3080 du 10/11 retrouvées et contrôlées sans lire les secrets ; aucune migration autorisée |
| Exposition locale | **Non conforme à localhost strict sur trois points d'écoute existants** | Mac PROD 3080 `0.0.0.0`, Chromebook PROD/TEST 3080/3081 `0.0.0.0` et `[::]` ; accès public non démontré, aucun changement sans fenêtre de maintenance |
| Référence image v1.0.6 publiable AMD64 + ARM64 | **NON CONCLUANTE** | Aucun digest GHCR candidat public ni tag v1.0.6 inventé ; builds CI non équivalents à publication |
| Droit de publier et de mettre à jour les machines | **NON ACQUIS** | GO humain de publication **séparé** du GO de déploiement ; aucun GO implicite à partir d'un « ok, continue » |

### Dernières portes, sans empiler

1. **L1** : formaliser les risques d'exploitation des installations (MongoDB 4.4 hors support, trois binds non loopback, sauvegardes multi-volumes) sans intervenir sur les machines stables ; vérifier les seuls critères V1 vraiment obligatoires.
2. **L2** : véritable réception HITL / recherche native / Oracle-P6 **sur une image candidate identique au code livré**, sous session et permissions autorisées ; à défaut, délimiter explicitement la fonctionnalité non démontrée et décider si elle est hors promesse V1. Ne pas présenter le test simulé comme une preuve du fournisseur externe.
3. **L3** : trier les risques HIGH pertinents à la distribution (et disposer #331–#332 sur preuve de code et test) ; réexaminer #109 et #37 à l'échéance 16 novembre ; contrôler secrets, licences, support Lite/Full et préparer les notes et artefacts exacts.
4. **Avant release** : obtenir **GO de publication explicite**, construire/vérifier la même image multiarch candidate par digest, contrôle du pull anonyme, puis seulement tag Git et GitHub Release. Déploiement local, s'il est demandé, exige une autorisation **distincte**.

**Verdict de sortie : `L1=PARTIEL / L2=CI PASS, RÉEL NON CONCLUANT / L3=PARTIEL / RELEASE=NO-GO`.** Aucun secret copié dans ce document ; aucun paiement, merge, tag, publication ou déploiement.

**V2 privée** : [issue #181](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/181), uniquement **après** clôture de la V1.0.6. Les travaux V2 ne bloquent pas cette release.

---



## Gates vérifiés sur la candidate

- GO1 inférence externe Gemini → Worker → un spécialiste observé → Oracle durable : [run 38318687920](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38318687920) PASS sur le runtime immuable `d4e82dd`.
- GO2 installation Full, services MongoDB/pgvector/Meilisearch/RAG présents, API HTTP et authentification PostgreSQL : [run 38325143577](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38325143577) PASS.
- GO2 installation Lite, arrêt/redémarrage et donnée MongoDB préservée : [run 38325143730](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38325143730) PASS.
- GO3 distribution/authentification Full et Lite : [run 38325143523](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38325143523) PASS.
- GO3 motifs secrets suivis Git : [run 38325143446](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38325143446) PASS.
- GO3 vulnérabilités npm **production** : [run 38325143543](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38325143543) PASS au seuil High/Critical, mais **3 moderate + 6 low** encore signalées.

## Périmètre Helm — décision recommandée (non approuvée)

Le backfill historique `chart-1.9.1` appartient au pipeline legacy Helm, pas à l'image GHCR ni au runtime BOT MODE V1. Le run [38300420245](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38300420245) montre un refus GitHub App de création de référence à cause de la permission `workflows`.

**Proposition :** classer ce backfill comme incident externe/non bloquant **uniquement pour une release distribuée par Docker Compose/GHCR**, à condition qu'aucun artefact Helm ne soit promis aux utilisateurs V1 et que les pipelines Helm ne se déclenchent pas par la release BOT MODE. Une publication Helm est **NO-GO** jusqu'à obtention d'une permission autorisée et un run réussi. Ne pas modifier de droits, créer de tag ou contourner le contrôle pour clore artificiellement le problème.

## Réserves obligatoires avant une distribution stable

1. **Rollback données :** le test Lite prouve stop/start, **pas** la restauration après migration. Une stratégie de sauvegarde et restauration testée sur un environnement éphémère doit être validée avant de présenter la V1 comme migration sans risque. Cf. [BOT_MODE_ROLLBACK.md](BOT_MODE_ROLLBACK.md).
2. **Sécurité :** l'audit npm ne couvre pas les dépendances de développement, vulnérabilités de conteneurs, secrets stockés ailleurs ni protections réseau. Les 3 moderate/6 low de production doivent être triées et explicitement acceptées ou corrigées.
3. **Support OS :** tests Full/Lite réalisés sous runners Linux. ChromeOS/Crostini, macOS/ARM et Windows WSL2 sont décrits comme cibles, mais non validés exhaustivement.
4. **Chaîne publication :** ne pas inférer qu'un job vert autorise de lui-même le merge, un tag `v*` ou la promotion `:latest`. Exiger la revue du diff final empilé (#14, #18, #20), une qualification du SHA livré, des instructions utilisateurs et un GO humain explicite.

## Décision

GO1, GO2 installation/stop-start et GO3 contrôles ciblés sont **VALIDÉS dans leur périmètre**. GO4 Helm historique reste **BLOQUÉ dans le périmètre Helm**, avec proposition de séparation Docker encore soumise à décision. GO5 release stable = **NO-GO**.

Les PR #14, #18 et #20 restent DRAFT non fusionnées. Aucun tag stable ni image `:latest` ne doit être publié.

## Mise à jour du checkpoint de qualification — 13 octobre 2026

Le SHA exact de la PR #20 est `03ae2fbcce305fdd27a5f682687812135c0211a6` : **15/15 workflows GitHub Actions SUCCESS**, notamment [Playwright E2E](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38330642509), [Backend](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38330642458), [Frontend](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38330642499), [Full](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38330642478), [Lite](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38330642519), [KaTeX trial](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38330642490), secrets et npm production. Le correctif KaTeX `0.18.10` est intégré au lockfile et validé sur cette candidate. La régression `userGroup` n'a pas été reproduite dans les trois passages isolés (106 tests chacun), et le backend complet est vert sur ce SHA.

**Distinction des décisions** : **GO pour la qualification technique automatisée de cette candidate**, mais **NO-GO pour une distribution stable à ce stade**. L'ensemble des contrôles CI verts ne prouve pas une migration/restore réelle, les OS non-Linux ou l'absence de tous risques résiduels.

**Décisions encore ouvertes avant GO5 :** 1) qualification sauvegarde → restauration de données après migration (ou périmètre expressément limité aux nouvelles installations et sans promesse de migration), 2) acceptation documentée des risques npm modérés/faibles et revue des images conteneur, 3) choix explicite du périmètre Docker Compose/GHCR sans Helm historique, 4) compatibilité OS annoncée limitée à ce qui a été effectivement testé, 5) approbation humaine du SHA et de la release. **Ne pas fusionner les PR #14/#18/#20 ni publier de tag stable ou :latest sans ce GO final.**

## Qualification finale candidate avant décision humaine — 13 octobre 2026

**Dernier SHA vérifié en totalité** : `3666942594415f3591be95376178d1861792c359` — **21/21 workflows SUCCESS**, dont [Playwright](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38400337087), backend, frontend, statiques, Docker et sécurité. Les tests de restauration démontrent sur runners Linux jetables : MongoDB 8, PG15/pgvector, Meilisearch 1.35.1, volumes fichiers, sauvegarde coordonnée, API Full restaurée HTTP fonctionnelle, Worker réel et ACL propriétaire conservés, plus survie d'un checkpoint HITL à une reconnexion/reconstruction du saver. **Ils ne démontrent pas une reprise de mission après migration de schéma ni un downgrade des bases.**

**Périmètre technique candidat proposé, NON APPROUVÉ** : nouvelles installations via Docker Compose/GHCR ; le rollback est qualifié uniquement avec schémas et versions compatibles, avec sauvegarde et restauration testée. **Aucune promesse de migration in-place automatique, de downgrade de schéma ou de compatibilité rétroactive des données.** Toute mise à niveau de données existantes exige une qualification de migration dédiée et un point de retour validé.

**Support OS à publier sans surpromesse** : chemin Docker Compose vérifié sur runners Linux x86_64 ; ChromeOS/Crostini, macOS Intel/ARM et Windows/WSL2 restent des cibles documentées, mais **non qualifiées en CI sur machines correspondantes**. L'image GHCR figée actuellement testée est `sha-d4e82dded5df`, qui précède certains changements de dépendances/CI sur la branche de release. Aucun tag stable sans construction/vérification de l'artefact correspondant au SHA choisi.

**Sécurité npm actualisée** : [audit 38400336978](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38400336978) : `0 critical, 0 high, 3 moderate, 0 low`. Trois avis modérés restent sur `mammoth` et transitive `argparse`/`sprintf-js`; analyse d'exposition et décision d'acceptation **ouvertes**, cf. [BOT_MODE_DEPENDENCY_RISKS.md](BOT_MODE_DEPENDENCY_RISKS.md). Les scans effectués ne sont pas une preuve d'absence de tous risques conteneurs ou secrets.

**GO4 Helm** : exclusion de Helm recommandée **uniquement** pour une première distribution Docker Compose/GHCR. Décision d'exclusion encore soumise au GO humain ; pipeline legacy Helm bloqué séparément.

**GO5 : NO-GO jusqu'à** revue des trois PR empilées, qualification de l'image publiée du SHA de livraison, traitement/acceptation des 3 moderate et des risques conteneur, déclaration explicite des OS supportés et du périmètre Docker-only, décision humaine de publication. Ne pas fusionner, tagger ou promouvoir `:latest` à partir d'une CI verte seule.

## Contrôle de publication de l'image — procédure de GO5 (non exécutée)

Le workflow existant `.github/workflows/botmode-image.yml` peut construire deux architectures (`amd64`, `arm64`), fusionner leurs digests en manifest multiarchitecture, vérifier le pull GHCR anonyme et effectuer un smoke Lite. Son déclenchement manuel **publie** cependant un artefact dans GHCR ; ne pas l'exécuter sans autorisation de publication d'une candidate. Les workflows ordinaires `Docker Build Smoke Tests` et `Full/Lite` ne remplacent pas cette qualification : certains exécutent encore l'image candidate historique `sha-d4e82dded5df`.

**Checklist impérative avant GO stable** :

1. Geler le SHA **effectivement livré**, après revue des différences combinées des PR #14, #18 et #20 (la CI de branche n'est pas une revue de code).
2. Obtenir l'accord humain préalable à la publication **d'une image candidate seulement** ; exécuter ensuite le workflow de construction multiarchitecture et relever le digest immuable du manifest.
3. Vérifier sur ce **même SHA et ce même digest** les pulls AMD64/ARM64, le démarrage Lite et Full, l'API HTTP, l'onboarding natif, les droits ACL et les tests de restauration nécessaires ; classer les contrôles non exécutés comme tels.
4. Confirmer explicitement le périmètre V1 (Docker Compose/GHCR, Linux qualifié ; Helm et migrations de schéma exclus sauf qualification et accord distincts) et les trois vulnérabilités modérées npm non encore acceptées.
5. Demander un second GO humain distinct pour fusion, tag `v*`, promotion de `:latest` ou annonce publique. **La publication d'une candidate ne vaut pas autorisation de stable.**

Cette section est un protocole de vérification, **pas** un compte rendu d'exécution de build/push.
