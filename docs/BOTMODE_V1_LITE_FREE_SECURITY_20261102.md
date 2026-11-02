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
