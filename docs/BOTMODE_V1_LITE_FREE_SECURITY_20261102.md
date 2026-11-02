# BOT MODE V1 — Sortie Lite, modèle hébergé gratuit et sécurité

Checkpoint de qualification du 2 novembre 2026, branche isolée `simplify/botmode-v1-lot-a-20261102`. Tous les contrôles locaux dans ce document sont **non destructifs**. Ne pas assimiler une validation de configuration à un déploiement ou à un test serveur.

## Profil Chromebook Lite — constat réel

- Machine distante : Chromebook ChromeOS Linux x86_64, **2 747 Mio RAM totale**, environ **515 Mio RAM disponible au moment de la mesure**, **0 swap**. Disque 34 Gio, **7,9 Gio libres**.
- Quatre conteneurs existaient déjà et tournaient : deux API LibreChat et deux MongoDB, dont une installation « test ». Ils ne doivent pas être arrêtés, recréés ni remplacés. Environ 1,07 Gio RAM consommée par leurs processus Docker déclarés, autres processus non comptés. Ces nombres sont instantanés et non une garantie de capacité.
- `docker compose -f docker-compose.botmode.yml -f docker-compose.botmode-lite.yml --profile lite config --quiet` : **PASS** en lecture seule après injection de valeurs **fictives** pour les deux variables nécessaires `BOTMODE_MONGO_PASSWORD` et `POSTGRES_PASSWORD` (sans lire ou modifier aucun `.env`). Sans ces variables dans le worktree isolé, l'analyse de configuration échoue comme prévu ; cette erreur ne signifie pas que l'installation en place est mal configurée.
- La configuration Lite n'active que `api` et `mongodb` ; elle exclut le panneau admin, Meili, RAG et vectordb via les profils `full` ou les dépendances facultatives. Les services sélectionnés n'ont pas de `mem_limit` défini dans le rendu de Compose ; ils ne sont donc pas bornés en mémoire par le fichier.
- **Verdict Lite : PASS syntaxe/profil, NON CONCLUANT pour exécution de la nouvelle candidate sur la machine.** Ne pas démarrer de troisième pile Docker ni reconstruire localement sur un appareil avec 515 Mio disponibles et aucun swap. Exécution intégrée source-built GitHub disponible sur runners isolés.

## Sécurité — inventaire factuel GitHub

- API Dependabot du dépôt : **17 alertes ouvertes**, **6 high / 7 medium / 4 low** au 02/11/2026. Cela concerne le dépôt tel qu'analysé par Dependabot ; ne pas prétendre que chaque alerte est exploitable dans le profil Lite.
- **14 alertes de dépendances de développement** dans `package-lock.json` (happy-dom, vite, postcss-selector-parser, deepmerge, serialize-javascript, elliptic). Elles concernent principalement outils de test/build et nécessitent correction/qualification avant stabilisation du dépôt. `npm audit --omit=dev` ne constitue pas un examen de sécurité suffisant du pipeline de construction.
- **2 alertes high runtime** de `follow-redirects` signalées dans `packages/data-provider/react-query/package-lock.json` : le verrou secondaire contient la version vulnérable **1.16.0** ; le verrou racine `package-lock.json` de la candidate contient déjà **1.16.1**. Axios déclare `^1.16.0`. Cette divergence doit être corrigée ou le verrou secondaire obsolète retiré *après preuve qu'il n'est pas utilisé* ; elle n'est pas une preuve d'exposition de l'API Lite en production. Advisories GHSA-q3jh-wrc6-jgq8 et GHSA-8r9p-f939-6h3c.
- **1 alerte high runtime Go** sur `otel/langfuse-fanout/go.mod`, `google.golang.org/grpc v1.83.1`, correctif disponible **v1.83.2**. L'advisory GHSA-2v4p-qf9q-27wj vise des serveurs gRPC configurés avec `xds.NewGRPCServer`, exposés à un DoS sous conditions. Ce sous-projet Go n'apparaît pas référencé dans `Dockerfile` ou le Compose Lite de la candidate. Corriger ce module s'il doit être livré, vérifier sa portée avant de conclure « exploitable » ou « sans risque ».
- **Risque D-02**, accepté provisoirement jusqu'à réévaluation le 16 novembre 2026 (#37) : suivi distinct, non clos automatiquement par les constats ci-dessus.
- **Verdict sécurité : REVUE EN COURS / NO-GO release stable** tant que traitement et tests de non-régression des alertes réellement pertinentes ne sont pas terminés, ou qu'une décision de risque documentée n'est pas autorisée. Ne pas lancer `npm audit fix --force`, des changements de version majeurs Vite ou une migration Go en lot aveugle.

## Compatibilité du fournisseur hébergé, zéro paiement

- Vérification publique de l'API `https://openrouter.ai/api/v1/models` au 02/11/2026 : `nvidia/nemotron-3-ultra-550b-a55b:free` a `pricing.prompt=0`, `pricing.completion=0`, et supporte `tools`. Il s'agit d'une observation de catalogue, pas encore d'une preuve d'appel réussi.
- Une unique vérification manuelle dans le workflow GitHub existant est ajoutée (`free_hosted_only`), **sans installation npm ni Docker** : secret GitHub `OPENROUTER_API_KEY` non affiché, nouvelle vérification tarifaire juste avant requête, refus si prix non nul ou modèle autre qu'un `:free`, **un POST maximum**, `max_tokens=96`, aucun fallback/réessai. On ne transmet aucun historique privé, document utilisateur ou donnée du projet.
- Résultat du test hébergé : **NON CONCLUANT avant run**. Même si l'appel d'outil passe, il ne qualifie qu'un endpoint OpenAI-compatible gratuit, pas la mission complète LibreChat+Oracle/P6 avec un vrai modèle extérieur. Gratuit = tarif de modèle nul, mais quota et disponibilité variables.

Aucun changement sur `main`, la release officielle `v1.0.1`, les conteneurs, les ports, les volumes, les secrets, les fichiers `.env` ni sur l'image officielle. Le moteur V1 conserve l'arrêt sûr `OUTCOME_UNKNOWN` sans replay automatique et les résultats des qualifications précédentes.

## Mise à jour candidate : test hébergé réussi et correctif du verrou secondaire

- Run GitHub Actions [#41434734726](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/41434734726), commit exact `b3535661424086e8965b351fb1b5898d3fc5a418` : **SUCCESS** pour le seul job `free-hosted-compatibility` (les tests Docker/Jest ont été volontairement sautés). La clé OpenRouter est fournie par secret GitHub, jamais affichée ; le script contrôle d'abord les tarifs **0 entrée/0 sortie** et la présence de `tools` sur `nvidia/nemotron-3-ultra-550b-a55b:free`, puis émet **une seule requête**. Preuves : `BOTMODE_FREE_HOSTED_ZERO_PRICE_AND_TOOLS=PASS`, `BOTMODE_FREE_HOSTED_TOOL_CALLS_COUNT=1`, `BOTMODE_FREE_HOSTED_LIVE_TOOL_CALL=PASS`, `BOTMODE_FREE_HOSTED_VERDICT=PASS`. Cela démontre **un outil sur modèle gratuit hébergé**, pas l'exécution complète de BOT MODE avec ce modèle ; les modèles gratuits restent soumis à quotas/indisponibilité.
- Correctif sécurité **strictement ciblé sur la branche candidate** : le verrou secondaire `packages/data-provider/react-query/package-lock.json` est aligné sur l'entrée `follow-redirects@1.16.1` du verrou racine, déjà validé par `npm ci` dans les CI précédentes. Version, URL d'archive, empreinte d'intégrité et métadonnées proviennent de la même entrée fiable ; JSON parsé et `git diff --check` PASS. Le manifeste Axios accepte cette version via `^1.16.0`. **Aucun `package.json`, verrou racine ni code de production modifié**. Ce changement traite la cause des **deux alertes high** GHSA-q3jh-wrc6-jgq8 et GHSA-8r9p-f939-6h3c sur le verrou secondaire **dans la candidate seulement**. GitHub peut continuer de les signaler sur la branche par défaut tant qu'aucune fusion n'a eu lieu. Ne pas clôturer manuellement les alertes.
- Le Go `google.golang.org/grpc@v1.83.1` dans `otel/langfuse-fanout` et les 14 avis de dépendances de développement demeurent **ouverts**, avec hiérarchisation des risques et correctifs à qualifier séparément. Le sous-projet Go n'est pas référencé par le build Lite vérifié ; ne pas en déduire qu'il serait sûr dans tous les profils. La release reste NO-GO avant décision de traitement/acceptation des risques résiduels.

## Correctif gRPC Go optionnel (candidat)

L'advisory officielle GitHub [GHSA-2v4p-qf9q-27wj](https://github.com/advisories/ghsa-2v4p-qf9q-27wj) confirme que le risque de déni de service concerne certains serveurs Go créés via `xds.NewGRPCServer` et utilisant des requêtes sans `:authority` ni `Host`. La version du module `otel/langfuse-fanout` a été alignée **strictement de `google.golang.org/grpc v1.83.1` à `v1.83.2`**, avec les deux sommes officielles de `sum.golang.org` vérifiées, sans mise à jour majeure ni modification de l'API Lite ou du module principal.

Un contrôle `go_security_only` a été ajouté au workflow de sécurité Docker **déjà existant** : checkout exact, installation du Go requis par le module sur runner GitHub, `go mod download`, `go mod verify`, `go test ./...`, contrôle du verrou commité, **sans relancer la matrice Docker ni solliciter le Chromebook**. Verdict Go : **en qualification** avant résultat de cette CI. Ne pas fermer manuellement les alertes GitHub de la branche par défaut avant fusion/décision de release.

## Bilan final de la correction Go

Le run #41437922901 est PASS : grpc-go 1.83.2, x/net 0.58.0, x/sys 0.47.0 et x/text 0.41.0 ; go mod tidy, go mod verify et go test sans differences du verrou.

## Vite 8.2.4 : qualification terminee

Run GitHub #41439007720, commit 8607a19f : PASS. npm ci propre, builds data-provider, data-schemas, client-package et frontend avec Vite 8.2.4. Changement de trois champs seulement dans package-lock.json, dependances et plages peer identiques a Vite 8.2.2. Aucun manifeste ou code applicatif modifie.

Bilan sur la branche candidate : 4 alertes HIGH sur 6 disposent d un correctif verifie (2 follow-redirects, 1 grpc-go, 1 vite). Deux HIGH happy-dom restent a traiter : correctif 21.0.4 exigeant une mise a jour majeure non engagee. Les autres alertes dev sont a qualifier separément ; elles ne sont pas automatiquement supprimees sur main.

Go grpc-go : run #41437922901 PASS, go mod tidy reproductible, go mod verify et go test sur la version 1.83.2 et ses trois dependances transitives ajustées.

Aucun nouveau deploiement Lite Chromebook, aucune fusion ou release. Verdict release stable : NO-GO.

## Qualification HAPPY DOM 21.0.4 (candidate)

Les alertes high GHSA-c8p4-j97h-3vg8 et GHSA-834v-8h66-3h79, ainsi que l alerte medium GHSA-5fpq-26gf-qwcr, concernent le package de test Jest happy-dom, installe auparavant en 20.8.9. La version officielle corrigee 21.0.4 a ete selectionnee, avec le wrapper @happy-dom/jest-environment dans la meme version. Manifest client, verrous npm et Bun sont synchronises sur les metadonnees et empreintes du registre npm. Nouvelle dependance transitive buffer-image-size 0.6.4 incluse dans le verrou npm, deja connue du verrou Bun.

Changement majeur confine aux outils de test : Happy DOM 21 desactive par defaut les chargements CSS et iframe susceptibles de causer des SSRF ; ne pas reintroduire les anciens comportements non securises pour faire passer des tests.

Le workflow Docker Security Distribution dispose maintenant de l option happy_dom_security_only : un seul job GitHub qui teste npm ci propre, les builds des packages requis, les six suites Jest avec directives @jest-environment Happy DOM, et les seules references Happy DOM dans le verrou Bun, sans regenérer l ensemble du graphe. La qualification ne vaut PASS que si ces tests reussissent ; aucun test API Oracle/P6 precedemment acquis n est relance.

Verdict avant run : NON CONCLUANT. Branch candidate uniquement ; aucune installation personnelle, fusion, release ou modele payant touche.

### Qualification Happy DOM 21.0.4 — preuve Jest et limitation Bun

Le run [#41456636540](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/41456636540) sur le commit `027c9f2d` démontre que `npm ci`, les builds requis, 2 suites/24 tests Jest Data Provider et 4 suites/42 tests React **PASS** : 66 tests sur 66. Son statut global était FAIL à l étape **optionnelle** `bun install --frozen-lockfile`, car Bun v1.3.6 veut régénérer son verrou global. Un diagnostic isolé [#41457231807](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/41457231807) a prouvé que la résolution Bun modifie des dépendances **sans rapport avec Happy DOM** (par exemple `zod`, `mermaid`, `dicebear`) à cause de dérives et de `overrides` imbriqués non gérés ; aucune de ces versions n a été intégrée. Le diagnostic s'est terminé avec un code 141 provoqué par la troncature volontaire `head` du diff sous `pipefail` ; cela n invalide pas les constatations observées.

Décision de simplification : pas de régénération générale `bun.lock`, pas de correction aveugle des dépendances externes ; conserver seulement les références et empreintes Happy DOM 21.0.4 dans le verrou Bun. La CI ciblée `happy_dom_security_only` valide `npm ci` et les 66 tests, puis contrôle les références Happy DOM du verrou Bun **sans prétendre que `bun install --frozen-lockfile` est PASS**. La reproductibilité globale avec Bun demeure NON CONCLUANTE hors du périmètre de la V1 basée sur npm. Sur la branche candidate, les 3 avis `happy-dom` (2 high, 1 medium) sont couverts par le patch 21.0.4 ; les alertes sur `main` demeurent jusqu'à intégration.

### Cloture Happy DOM — CI source exacte PASS

Run GitHub [#41457660628](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/41457660628), HEAD exact `0ed706f3904261b8d86205ad22309642e67a6c3d` : **SUCCESS**. `npm ci` propre, builds requis, 24/24 tests Data Provider et 42/42 tests React/Jest **PASS (66/66)**. Controle des références et versions Happy DOM dans npm et Bun **PASS**. Le changement dev-only a été qualifié sans correction de production ni ajout de replay 4C.

**Limite explicitement conservée** : le précédent échec `bun install --frozen-lockfile` est dû à une dérive générale du verrou Bun et aux `overrides` imbriqués non supportés. La régénération exploratoire ferait varier d autres paquets sans rapport avec Happy DOM (`zod`, `mermaid`, `dicebear`) : **aucune mise à jour générale n a été intégrée**. Reproductibilité globale de Bun = NON CONCLUANTE, sans incidence démontrée sur les installations `npm ci` de V1.

Au 2 novembre 2026, l API Dependabot signale toujours **17 avis ouverts sur main** : 6 HIGH, 7 MEDIUM, 4 LOW. Dans la **branche candidate uniquement**, les six avis HIGH disposent de correctifs (`happy-dom` x2, `vite` x1, `follow-redirects` x2, `grpc` x1), avec preuves npm/Jest/build/Go ciblées. Parmi les MEDIUM, les avis `happy-dom` et `vite` sont également couverts ; les deux avis `postcss-selector-parser` nécessitent encore traitement. Les LOW `deepmerge`, `serialize-javascript`, `elliptic` restent a analyser ; avis `vite` LOW couvert par le patch. **Il ne s agit pas d une clôture d alertes GitHub sur main ni d une autorisation de publication.**

## Lots résiduels npm — correctifs compatibles en qualification

Les deux avis MODERATE GHSA-rj75-hqrm-r3gf sur `postcss-selector-parser` concernent les deux séries présentes simultanément dans le verrou root. L'advisory publiée par PostCSS confirme `6.1.5` et `7.1.6` comme correctifs des séries 6.x et 7.x (attaque de consommation CPU liée à un sélecteur plat long, pertinente pour l'analyse synchrone de CSS non fiable). La candidate remplace strictement **1 entrée 6.1.4 → 6.1.5 et 13 entrées imbriquées 7.1.5 → 7.1.6** dans `package-lock.json`, sans changer aucun manifeste ni la version majeure des dépendances parentes. Les métadonnées officielles npm `dependencies`, `engines`, `resolved` et `integrity` ont été comparées avant insertion. Source : https://github.com/advisories/GHSA-rj75-hqrm-r3gf

L'avis LOW GHSA-m5mm-p8h7-m29v de `serialize-javascript` concerne les fonctions sérialisées dont le texte peut être influencé par un tiers. La candidate remplace l'unique entrée du verrou **7.0.5 → 7.1.3**, qui conserve les mêmes dépendances et contraintes Node. Source : https://github.com/advisories/GHSA-m5mm-p8h7-m29v

Un seul contrôle CI optionnel `residual_npm_only` a été ajouté au workflow de sécurité existant pour revérifier sur le **SHA exact** les versions corrigées, lancer `npm ci`, compiler le frontend et exercer les deux versions du parseur ainsi que la sérialisation ; aucun moteur BOT MODE ni aucune clé API n'est sollicité. Verdict : **NON CONCLUANT avant résultat de la CI**. Les avis LOW `deepmerge` (GHSA-gcqx-w48m-w2h4) et `elliptic` (GHSA-848j-6mx2-7j84) n'ont pas de `first_patched_version` selon Dependabot au moment de la revue, restent dans le périmètre des dépendances de développement et nécessitent une décision de risque motivée plutôt qu'une montée de version inventée. Ne pas clôturer les alertes de la branche principale.

## Clôture technique de la revue de sécurité résiduelle (2 novembre 2026)

**Dernier run sur la candidate** : [#41464628497](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/41464628497), commit testé `5476320ce8266866a1ac13477b568424206e946b`, **SUCCESS**. Sur le SHA exact, le workflow a vérifié le verrou npm patché, installé proprement via `npm ci`, compilé le frontend et exercé les deux variantes du parseur CSS ainsi que `serialize-javascript`. Marqueurs `BOTMODE_RESIDUAL_NPM_LOCK_EXACT_PIN=PASS`, `BOTMODE_RESIDUAL_NPM_PACKAGE_SMOKE=PASS`, `BOTMODE_RESIDUAL_NPM_PATCH_CLEAN_BUILD=PASS`. Aucun système du Chromebook ni fournisseur de modèle utilisé.

- GHSA-rj75-hqrm-r3gf : les **deux alertes MODERATE** de `postcss-selector-parser` sont traitées dans le verrou npm de la candidate, avec 1 entrée 6.1.5 et 13 entrées 7.1.6 ; versions correctives reconnues par GitHub, sans changement de majeure pour chaque branche.
- GHSA-m5mm-p8h7-m29v : l'alerte LOW de `serialize-javascript` est traitée par `7.1.3` (correctif officiel).
- GHSA-gcqx-w48m-w2h4 : **LOW `deepmerge@4.3.1`**, risque de pollution du prototype lors d'une fusion d'objets non fiables. Aucune version corrigée dans l'advisory GitHub consultée. Une seule entrée du verrou racine, marquée développement ; pas d'import direct détecté dans les fichiers suivis par Git (cela ne prouve pas l'impossibilité d'une exposition transitive). **Risque résiduel NON ACCEPTÉ**.
- GHSA-848j-6mx2-7j84 : **LOW `elliptic@6.6.1`**, défaut rare de l'implémentation ECDSA pouvant provoquer une signature incorrecte et, dans certaines conditions, une fuite de clé. Aucune version corrigée dans l'advisory GitHub consultée. Une seule entrée du verrou racine, marquée développement ; imports directs non détectés, mais une utilisation transitive ou dans le bundle reste possible. **Risque résiduel NON ACCEPTÉ**.

**Comptage avec les 17 avis enregistrés sur la branche par défaut** : les correctifs ciblés de la branche candidate couvrent **6/6 HIGH, 7/7 MEDIUM et 2/4 LOW**, soit **15/17 avis connus**. Les deux LOW sans correctif ne sont pas traités par une montée de version imaginaire. Cette couverture est un inventaire de correctifs et de tests, **pas** un rapport Dependabot évalué sur la candidate ni une preuve que l'application entière est sans vulnérabilité. `main` conserve ses 17 alertes tant que la branche n'est pas fusionnée. Le diagnostic global Bun reste NON CONCLUANT (la voie de build qualifiée est npm).

**Historique de décision au checkpoint initial** : l'acceptation des deux risques LOW n'était pas encore accordée. **Cette réserve est levée uniquement dans les limites de l'autorisation du 02/11/2026 et du ticket #109 détaillés ci-dessous.** Le propriétaire doit également confirmer la qualification pratique du profil Lite (sur Chromebook avec peu de RAM disponible, une troisième pile ne doit pas être installée). La dérogation D-02 (#37, revue prévue le 16 novembre) reste indépendante. **Aucun GO stable ni fusion n'est autorisé par ce document.**

## Décision utilisateur confirmée — acceptation LOW limitée (02/11/2026)

**Statut : ACCEPTATION TEMPORAIRE ET CONDITIONNELLE des deux risques faibles, autorisée explicitement le 2 novembre 2026.** L'accord concerne **uniquement la branche candidate V1 simplifiée** `simplify/botmode-v1-lot-a-20261102` et expire **le 16 novembre 2026 inclus**. Ticket de suivi dédié : [GitHub #109](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/109). Cette décision actualise les anciennes mentions « NON ACCEPTÉ » et « décision en attente » du présent rapport ; ces mentions reflètent l'état **avant** autorisation.

- **GHSA-gcqx-w48m-w2h4** — `deepmerge@4.3.1`, LOW, développement, risque de prototype pollution lors de la fusion d'objets non fiables, pas de version corrigée indiquée par Dependabot lors du constat. **ACCEPTÉ TEMPORAIREMENT sur la candidate**, non corrigé.
- **GHSA-848j-6mx2-7j84** — `elliptic@6.6.1`, LOW, développement, comportement de signature ECDSA incorrect sous certaines conditions, pas de version corrigée indiquée. **ACCEPTÉ TEMPORAIREMENT sur la candidate**, non corrigé.

**Justification de portée :** chaque dépendance est marquée comme *development* dans `package-lock.json`, aucun import direct trouvé dans les fichiers suivis. Cela réduit la surface présumée sans garantir l'absence de chemin transitif, de paquet inclus dans le bundle, de secrets ou d'exposition runtime. Les deux avis ne sont pas clôturés ni marqués corrigés ; `main` conserve ses 17 alertes historiques avant intégration des correctifs candidats.

**Limites non négociables :** cette acceptation ne vaut ni GO de release, ni autorisation de merge, ni transfert vers `main`, ni déploiement sur Chromebook, ni publication d'image GHCR. Le statut V1 reste **NO-GO stable** jusqu'aux autres contrôles et à une décision de sortie distincte. Le profil Lite exécuté sur le Chromebook réel, le modèle hébergé gratuit sur une mission intégrale, et la reproductibilité globale Bun restent NON CONCLUANTS. La décision D-02 liée à l'issue #37 reste indépendante.

**Critères de réévaluation :** au plus tard le **16/11/2026**, vérifier les nouvelles versions/correctifs et avis officiels, les dépendances transitives effectives et les usages secrets/runtime, puis corriger et qualifier ou demander un nouveau mandat. Réévaluer sans attendre si la sévérité augmente, si une nouvelle surface d'attaque est démontrée ou si un correctif est publié. **Aucun renouvellement automatique**. Suivi officiel : [issue #109](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/109).

## Contrôle de cohérence Lite/P6 — écart de distribution et correction candidate (02/11/2026)

Un audit en lecture seule a confirmé que le **profil Lite distribué avant correction** ne contenait que `api` + `mongodb`, avec **aucun Redis**. Or les E2E antérieurs à verdict Oracle/P6 étaient exécutés sur GitHub avec un **Redis non distribué, injecté temporairement** par `scripts/botmode/ci-real-idea-runner.sh`. L'API utilisait donc, dans le Lite livré, les streams et jobs `InMemoryJobStore`, contrairement à la résilience Redis qualifiée en CI et à l'objectif de durabilité C2. **Ce trou de preuve interdit un GO stable sans correction et nouveau test.**

**Correction minimale candidate uniquement** : `docker-compose.botmode-lite.yml` contient maintenant un Redis 7 Alpine **interne**, aucune publication de port réseau hôte, **limite mémoire 160 Mio**, stockage persistant AOF `--appendonly yes --appendfsync everysec` sur volume Docker nommé, dépendance API sur healthcheck Redis, `USE_REDIS=true`, `USE_REDIS_STREAMS=true`, `REDIS_URI=redis://redis:6379` et conservation des résultats de mission `STREAM_KEEP_COMPLETED_JOBS=true`. Le service est une brique de stockage native du projet, **pas un moteur/broker supplémentaire**. Profil Lite corrigé : **API + MongoDB + Redis**, sans RAG/vectorDB/Meili/admin. Le test E2E source-built ne doit plus injecter de Redis caché : il vérifie directement la distribution effective du profil Lite.

`verify-runtime-distribution.sh` exige ce profil, son absence de port exposé, son volume AOF et les variables natives. Compose du candidat : syntaxe et résolution des trois services **PASS en lecture seule avec identifiants fictifs** ; l'exécution de la candidate sur GitHub reste à revérifier après modification. Les quatre conteneurs et deux installations actuellement opérationnels sur Chromebook (`3080`, `3081` HTTP 200) sont **des versions anciennes**, et non une preuve d'installation de la candidate. Ressources actuelles : **2 747 Mio RAM totale, ~542 Mio disponibles, 0 swap, ~7,8 Gio libres**. **Aucune nouvelle pile ne sera démarrée sur cette machine sans libérer volontairement de ressources et sans approbation distincte pour changer les conteneurs existants.**

Le risque LOW `deepmerge`/`elliptic` est accepté temporairement sur la seule candidate jusqu'au 16/11/2026 (issue #109) ; aucune fusion, publication ou GO de production n'a été autorisée.

### Résultat vérifié — profil Lite distribué, Redis AOF et mission intégrée : PASS sur runner isolé

Run GitHub [#41467068287](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/41467068287), source exacte `29d3aa5464ce1f12e4ce4d5549c69c395235c92e`, **SUCCESS** (construction OCI depuis le commit, pas de push GHCR, suppression de la pile CI en fin de test). Contrairement aux anciennes qualifications, **aucun Redis n'est injecté par le script E2E** : l'API, MongoDB 4.4.29 et Redis 7 avec AOF proviennent directement du Compose Lite de la candidate. Le fournisseur de modèle reste une fixture déterministe locale (aucun appel distant).

Marqueurs du run :

- `CI_REAL_IDEA_EXACT_EPHEMERAL_IMAGE=PASS` : conteneur API issu du commit exact.
- `CI_ONE_CHILD_PARENT_TOOL_REQUESTS_DELTA=1`, `CI_ONE_CHILD_CHILD_RESPONSES_DELTA=1` : appel natif d'un spécialiste effectivement exécuté.
- `CI_ONE_CHILD_MONGO_CHILD_COUNT=1`, `CI_ONE_CHILD_MONGO_COMPLETE=1`, `CI_ONE_CHILD_MONGO_ERRORS=0`, `CI_ONE_CHILD_MONGO_LINKED=True` : conversation enfant, résultat terminé et relation parent-enfant conservés en MongoDB.
- `CI_ONE_CHILD_INITIAL_SSE_FINAL_COUNT=1`, `CI_ONE_CHILD_ORACLE_JOB_STATUS=complete`, `CI_ONE_CHILD_ORACLE_VERIFIED=TRUE`, `CI_ONE_CHILD_P6_PARENT_MONGO_COMMITTED=TRUE`, `BOTMODE_C3_ONE_CHILD_ORACLE_VERIFIED_P6_ONCE=PASS` : **sur une seule mission, Oracle VERIFIED et exactement une finale P6 persistée**, sous le profil Lite effectif.
- `BOTMODE_LITE_REDIS_AOF_PERSISTS_AFTER_REAL_RESTART=PASS` : écriture d'une clé de test isolée, redémarrage **effectif** de Redis, lecture de la clé persistée puis nettoyage. La preuve porte sur la durabilité AOF d'une clé et non sur une mission encore en vol au moment du redémarrage ; ne pas extrapoler à une reprise automatique des appels fournisseurs incertains.
- `BOTMODE_LITE_DURABLE_INTERNAL_REDIS=PASS` et `BOTMODE_RUNTIME_DISTRIBUTION=PASS` en vérifications locales non mutantes avec valeurs d'environnement factices : Redis sans port hôte, limite mémoire, volume persistant et API dépendant de sa santé.

**Verdict : PASS de la distribution Lite source exacte et de sa mission Oracle/P6 avec 1 spécialiste sur runner GitHub.** Le compromis RAM/CPU est volontairement minimal : un Redis interne léger, pas de nouveau runtime. **NON CONCLUANT sur le matériel Chromebook** (RAM disponible ~542 Mio, zéro swap, deux API/Mongo antérieures en activité, aucun espace pour démarrer une troisième pile en sécurité). Ne pas qualifier la compatibilité CPU sans AVX ni l'empreinte mémoire réelle de cette nouvelle image par extrapolation depuis le runner ; aucun conteneur du Chromebook n'a été modifié. Le modèle gratuit hébergé n'a été qualifié que pour un appel d'outil isolé, pas dans ce run.

L'acceptation temporaire des deux risques LOW `deepmerge` et `elliptic` reste limitée à la candidate jusqu'au 16 novembre 2026, issue GitHub #109. **La publication officielle et la migration de l'installation utilisateur restent interdites sans décision humaine distincte.**
