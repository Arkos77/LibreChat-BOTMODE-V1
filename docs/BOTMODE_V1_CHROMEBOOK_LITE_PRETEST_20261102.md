# BOT MODE V1 — Chromebook Lite : préqualification réelle du port 3081

**Checkpoint du 2 novembre 2026** — candidate `simplify/botmode-v1-lot-a-20261102`; code E2E validé au SHA `29d3aa5464ce1f12e4ce4d5549c69c395235c92e`, puis documentation seulement. **Statut : PRÉPARATION PASS, déploiement matériel de la candidate NON EFFECTUÉ.**

## Mandat et limites

L'utilisateur a accepté la préparation d'un **remplacement temporaire du LibreChat de test au port 3081**, avec sauvegarde et retour arrière. **Ne toucher sous aucun prétexte** au LibreChat principal `3080`, à ses volumes, à l'installation MacBook, à la release stable `v1.0.1`, ni à `main`. L'accord de test ne vaut **pas** autorisation de publier une image GHCR candidate ni de fusionner ou publier une release.

## État matériel constaté (en lecture seule)

- Chromebook `penguin`, ~2 747 Mio RAM totale, ~557 Mio disponibles, **aucun swap**, ~7,8 Gio disque libre. Deux API LibreChat et deux MongoDB existaient et restent en service.
- Principal : `librechat-botmode-api-1`, image `ghcr.io/arkos77/librechat-botmode-v1:sha-4ed6be2bc015`, port `3080`, HTTP `200`.
- Test : `botmode-v100-test-api-1`, image locale **à conserver pour rollback** `botmode-native-research:c25e749314278fe77d4ae2cef4277a040ce8822e`, port `3081`, HTTP `200`. MongoDB de test : `botmode-v100-test-mongodb-1` (`mongo:4.4.29`), volume nommé `botmode-v100-test_botmode-mongo-data`. Ensemble Compose existant : `botmode-v100-test`.
- Le conteneur API de test utilisait ~467 Mio, la base de test ~84 Mio. La candidate Lite ajoute un Redis interne léger limité à **160 Mio**, avec AOF et volume persistant ; les chiffres réels de consommation après démarrage restent **à mesurer**.

## Sauvegarde opérationnelle vérifiée — test 3081 uniquement

Dossier privé **sur le Chromebook, non dans Git** : `/home/kabofrynm/BOTMODE-BACKUPS/BOTMODE-V1-TEST3081-PRETEST-20261102`, permissions `0700`, fichiers `0600`, SHA256 contrôlés, total sauvegardé ~760 Kio (taille compressée des données logiques, distincte de la taille physique du volume MongoDB).

- `mongo-all.archive.gz` : export **logique MongoDB** de l'instance test, créé par `mongodump --archive --gzip` sous l'identité MongoDB du conteneur. Archive gzip vérifiée. La sauvegarde ne remplace pas une copie cohérente du fichier WiredTiger ou un test de restauration complet.
- `test3081-config.tar.gz` : `.env` et `librechat.yaml` de l'installation test, **contient des secrets** ; ne jamais afficher, publier ni transférer sur GitHub.
- `test3081-compose.tar.gz` : les deux fichiers Compose provenant du checkout de qualification d'origine.
- `test3081-api-volumes.tar.gz` : répertoires persistants `/app/data`, `/app/logs`, `/app/uploads`, `/app/client/public/images`, `/app/skill` ; archive vérifiée.
- `test3081-containers-inspect.json`, `test3081-volumes-inspect.json` et `SHA256SUMS` : références du conteneur, de ses volumes et sommes de contrôle. **Le fichier inspect peut contenir des variables sensibles** ; aucune de ces archives ni leur contenu ne doit être commité.

## Test de configuration du futur remplacement — PASS sans mutation

Exécuté avec `docker compose config --quiet` et `config --format json` : projet explicite `botmode-v100-test`, répertoire de données et `.env` de l'installation de test existante, configuration candidate `docker-compose.botmode.yml` + `docker-compose.botmode-lite.yml`, port API `3081`, **trois services actifs seulement** (`api`, `mongodb`, `redis`), MongoDB 4.4.29 et **aucun port Redis exposé**. Les bind mounts `.env`/`librechat.yaml` sont définis. Aucune commande `compose up/down/recreate`, `pull`, `docker build`, `docker image prune` ou `docker volume rm` n'a été exécutée.

## Bloquant constaté

Aucune image de la candidate `29d3aa54...` ni du HEAD simplifié n'est **présente localement ou répertoriée dans les tags GHCR**. Le run GitHub E2E #41467068287 construit l'image sur un runner éphémère avec `push:false` et `load:true`, puis détruit la pile et l'image. Le Chromebook ne doit **pas** réaliser de build complet (RAM faible et 0 swap). Installer une image historique ne qualifierait **pas** la V1 simplifiée. **Ne pas arrêter le 3081 tant qu'une image du SHA exact n'est pas disponible et que l'espace disque requis n'est pas revérifié.**

### Prochain prérequis — nouvelle autorisation humaine nécessaire

Autoriser séparément la création d'**une image GHCR à tag immuable de candidate de test seulement** (jamais `latest`, `edge`, alias stable ni release), ou choisir une méthode de transfert d'image privée validée. Après image disponible, vérifier sa provenance exacte, le budget disque et l'état de la sauvegarde ; ne recréer que les services du projet Compose `botmode-v100-test` avec la configuration test existante et le port `3081`, sans `down --volumes` et sans détruire l'ancienne image. Tester HTTP, MongoDB, les agents, l'empreinte RAM/CPU, et l'absence de régression de la configuration. En cas de problème, restauration du conteneur API historique et de sa configuration/volumes depuis les artefacts privés. Toute migration de schéma Mongo doit faire l'objet d'un contrôle séparé avant déploiement.

**Décision de sortie actuelle :** aucune image candidate sur Chromebook, aucun remplacement de 3081, aucun déploiement de release. Les résultats E2E sur runner Linux restent PASS ; **test matériel sur candidate : NON CONCLUANT**.
