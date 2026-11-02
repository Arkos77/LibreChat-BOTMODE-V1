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
