# BOT MODE — installation reproductible

Ce chemin exécute l'image BOTMODE publiée depuis le code de ce dépôt. Une machine cible n'a pas besoin de compiler LibreChat.

## Cibles

- Linux / Xubuntu : support direct.
- ChromeOS : via Crostini/Linux.
- macOS : Docker Desktop ou runtime Docker compatible.
- Windows : WSL2 ; le chemin natif Windows n'est pas déclaré supporté pour V1.

## Prérequis runtime

- Git
- Docker
- Docker Compose v2
- démon Docker démarré

Node.js 24 et npm restent nécessaires pour le développement source et les tests du dépôt, mais pas pour installer/exécuter l'image publiée.

## Installation

```bash
git clone --depth 1 https://github.com/Arkos77/LibreChat-BOTMODE-V1.git
cd LibreChat-BOTMODE-V1
# Installation stable : utiliser uniquement un commit ou tag dont l'image GHCR sha-<commit> est publiée.
./install.sh
```

**Important :** tant que la PR #14 n'est pas fusionnée, la branche par défaut ne contient pas nécessairement les correctifs de consolidation. Pour tester la candidate, utiliser un checkout explicite de la branche `botmode-v1-consolidation-ci-20261009`, vérifier son SHA, puis publier et vérifier l'image GHCR `sha-<12 premiers caractères du SHA>` correspondante **avant** d'exécuter `./install.sh`. Ne jamais remplacer silencieusement une image manquante par `edge` ou par l'image upstream.

### Prévalidation de la candidate PR #14 (sans installation)

Ne pas utiliser la commande de clonage stable ci-dessus pour valider une PR encore non fusionnée. Pour examiner exactement la candidate :

```bash
git clone --branch botmode-v1-consolidation-ci-20261009 --single-branch \
  https://github.com/Arkos77/LibreChat-BOTMODE-V1.git
cd LibreChat-BOTMODE-V1
git rev-parse HEAD
```

Le tag exigé sera `ghcr.io/arkos77/librechat-botmode-v1:sha-$(git rev-parse --short=12 HEAD)`.
**Ne pas lancer l'installation tant que ce tag n'a pas été effectivement publié et que le test de téléchargement anonyme et les smokes de l'image n'ont pas réussi.** Ne pas remplacer le tag par `edge` : cela supprimerait la garantie de reproductibilité.

Le bootstrap :

1. détecte plateforme, mémoire et AVX ;
2. sélectionne automatiquement `full` ou `lite` ;
3. crée `.env` depuis `.env.example` s'il est absent, sans écraser un fichier existant ;
4. valide Docker Compose ;
5. résout le commit Git courant et tire par défaut `ghcr.io/arkos77/librechat-botmode-v1:sha-<commit>` ;
6. démarre la stack.

Le profil Lite est sélectionné automatiquement sous 4 GiB de RAM ou sur x86_64 sans AVX. L'absence d'AVX n'est pas appliquée aux architectures ARM, où cette exigence MongoDB x86_64 n'a pas de sens. Il utilise MongoDB 4.4.29 et désactive les services locaux lourds (RAG, pgvector, Meilisearch, admin panel). Il affirme aussi le mode scheduler mono-processus.

Forcer Lite :

```bash
./install.sh --lite
```

Forcer Full :

```bash
./install.sh --full
```

Préparer sans démarrer :

```bash
./install.sh --no-start
```

## Cycle de vie

```bash
./start.sh
./stop.sh
./update.sh
./doctor.sh
```

`start.sh` ne relance ni `npm ci`, ni build, ni tests. `update.sh` refuse un checkout détaché (tag/commit), des modifications locales ou une branche sans upstream. Sur une branche propre suivie, il effectue `git pull --ff-only`, puis tire l'image du nouveau commit et redémarre la stack. Pour une release candidate figée, sélectionner explicitement la version suivante après validation de son image GHCR et sauvegarde des données : ne pas exécuter `update.sh` depuis un tag.

## Image runtime BOTMODE

La stack BOTMODE utilise :

```text
ghcr.io/arkos77/librechat-botmode-v1:<tag>
```

Cette image est construite depuis le `Dockerfile` du dépôt. L'installateur utilise par défaut le tag immuable `sha-<commit>` correspondant exactement au checkout local ; `BOTMODE_IMAGE` / `--image` reste disponible pour un override explicite. Le runtime BOTMODE ne doit pas utiliser l'image API upstream `registry.librechat.ai/danny-avila/librechat-dev:latest`.

Le workflow `.github/workflows/botmode-image.yml` publie une image multi-architecture `linux/amd64` + `linux/arm64` dans GHCR.

## Données et permissions

Les données MongoDB et les répertoires runtime de LibreChat utilisent des volumes Docker nommés. Cela évite de dépendre des UID/GID du système hôte, notamment sous ChromeOS Crostini/containerless.

`.env` et `librechat.yaml` restent montés depuis le dépôt en lecture seule dans le conteneur API.

## Configuration

Après création de `.env`, renseigner uniquement les credentials réellement utilisés. Ne jamais committer `.env`.

### Bases de données et migration

Le bootstrap génère `BOTMODE_MONGO_PASSWORD` et `POSTGRES_PASSWORD` dans `.env` lorsqu'ils sont absents ; il protège le fichier avec `chmod 600`. Ces mots de passe sont utilisés par MongoDB, l'API LibreChat, PostgreSQL/pgvector et l'API RAG. Ne pas inclure le fichier `.env` dans un paquet distribué ni dans Git.

**Important :** Docker n'applique les identifiants d'initialisation MongoDB/PostgreSQL qu'à un répertoire de données neuf. Lorsqu'un volume de données BOTMODE préexiste sans marqueur d'initialisation, le bootstrap arrête l'installation au lieu d'activer aveuglément l'authentification. Faire une sauvegarde, effectuer une migration explicite des comptes et mots de passe, puis seulement reprendre le déploiement ; ne pas supprimer les volumes pour contourner le contrôle.

Une validation `./doctor.sh` ne remplace pas un test réel des identifiants en conteneur. Le durcissement doit être revérifié sur les profils `full` et `lite` avant publication.

Le fichier `librechat.yaml` du dépôt est monté automatiquement dans `/app/librechat.yaml`.

## Vérifications développeur

Pour vérifier le code source local :

```bash
./scripts/botmode/verify-runtime-distribution.sh
./scripts/botmode/verify-reproducibility.sh
```

Le second chemin nécessite Node.js/npm et les dépendances installées.

## Invariants

- aucune réinstallation npm lors d'un simple démarrage ;
- aucun remplacement silencieux d'un `.env` existant ;
- aucun secret dans Git ;
- image API construite depuis le code BOTMODE ;
- profil Lite compatible avec les CPU x86_64 sans AVX ;
- un seul scheduler/owner durable ;
- aucune suppression automatique des volumes de données.

## Validation Chromebook

Le premier test propre a mis en évidence quatre défauts de distribution désormais couverts par cette architecture :

- OOM provoqué par un second `npm ci` sur 2,7 GiB de RAM ;
- MongoDB 8 incompatible avec un CPU sans AVX ;
- permissions de bind mounts sous Crostini/containerless ;
- lancement d'une image LibreChat upstream au lieu du code BOTMODE cloné.

Le prochain test Chromebook doit repartir de zéro uniquement après publication d'une image BOTMODE candidate.

## Provisionnement des agents BOT MODE (installation existante)

Ce provisionnement n'est **pas** déclenché par `bootstrap.sh` : il nécessite le
choix explicite du compte LibreChat existant et d'un provider/modèle réellement
configurés. Ne pas réinitialiser MongoDB ni les volumes.

Depuis le répertoire de la candidate en fonctionnement, lancer le diagnostic
en lecture seule dans le conteneur API :

```bash
docker compose -f docker-compose.botmode.yml -f docker-compose.botmode-lite.yml \
  exec -T api node scripts/botmode/inspect-agent-bootstrap.js
```

Pour provisionner le Worker si aucun agent BOT MODE n'existe, relever d'abord
l'`_id` MongoDB du compte utilisateur choisi de façon authentifiée, puis exécuter
la commande suivante avec **cet ID uniquement**, un provider et un modèle
configurés. Ne jamais copier de mot de passe ni de clé API dans cette commande.

```bash
docker compose -f docker-compose.botmode.yml -f docker-compose.botmode-lite.yml \
  exec -T api node scripts/botmode/provision-worker.js \
  --apply --user-id '<OBJECT_ID_UTILISATEUR>' --provider '<PROVIDER>' --model '<MODEL>'
```

Le provisionneur refuse les utilisateurs inexistants, les comptes tenant-scoped,
les doublons appartenant à une autre personne et les rôles ACL manquants. Un
Worker existant appartenant au même utilisateur est laissé intact. Ce chemin
ne configure pas encore les cinq spécialistes : le script préexistant
`seed-default-specialists.js` ne doit être exécuté qu'après une vérification
des effets de ses mises à jour sur la base en place. Un nouvel agent ne garantit
pas non plus qu'un provider ou ses outils soient fonctionnels ; le test de
mission reste obligatoire.

Le script d'inspection permet de vérifier les agents et ACL présents, mais ne
constitue pas une preuve que le lancement d'une mission réussira.
