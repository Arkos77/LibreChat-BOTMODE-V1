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

**Archive de qualification, PAS l'image du code actuel :** la candidate historique `sha-d4e82dded5df` est publiée et a passé des tests Lite. La PR #29 est toujours en qualification Draft (18/10/2026), sans image GHCR démontrée pour son dernier SHA. Ne pas utiliser la commande historique ci-dessous comme validation de la V1 actuelle. Pour reproduire l'ancienne candidate, utiliser une copie de travail jetable et **ne jamais effacer les volumes existants**.

```bash
git clone https://github.com/Arkos77/LibreChat-BOTMODE-V1.git botmode-v1-candidate
cd botmode-v1-candidate
git checkout --detach d4e82dded5df49f17b97e20361c89796b8f1e068
test "$(git rev-parse HEAD)" = d4e82dded5df49f17b97e20361c89796b8f1e068
docker pull ghcr.io/arkos77/librechat-botmode-v1:sha-d4e82dded5df
./install.sh --lite
```

Ce test n'est autorisé que sur un environnement **jetable ou dédié**, sans données utilisateur. Le profil Full et le rollback restent à qualifier pour la V1. La candidate n'est pas encore une release stable.

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

**Protection V1 (PR #43, qualification sur PR #49) :** avant toute mutation Git, `update.sh` refuse la mise à jour si le service API Compose fonctionne encore. Si Redis est configuré, le changement de version automatisé est toujours **bloqué**, même API arrêtée : la reprise d'une mission Redis active **entre versions** n'est pas qualifiée. Il faut achever les missions, sauvegarder, puis suivre une procédure de migration validée pour le profil concerné. Ne jamais forcer des commandes Docker sur les volumes pour contourner ce refus. Les installations existantes doivent rester sur leur image déjà validée tant que la nouvelle image immuable n'est pas qualifiée.

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

### Embeddings et contrôle des coûts Full/RAG

Le profil **Full** ajoute RAG Lite et PostgreSQL/pgvector. RAG Lite exige un fournisseur d'embeddings configuré : **aucune clé Chat générale (`OPENAI_API_KEY`, OpenRouter, Gemini, etc.) ne doit être automatiquement reprise par ce sidecar**. Sur la source de qualification [PR #48](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/48), seule la clé dédiée `BOTMODE_RAG_APPROVED_EMBEDDINGS_API_KEY`, renseignée volontairement, est transmise comme `RAG_OPENAI_API_KEY`. Les variables dédiées `BOTMODE_RAG_EMBEDDINGS_PROVIDER`, `BOTMODE_RAG_EMBEDDINGS_MODEL` et `BOTMODE_RAG_EMBEDDINGS_BASEURL` configurent le moteur et son endpoint. **Un fournisseur tiers peut facturer chaque embedding : ne fournir cette clé qu'après autorisation explicite des dépenses.** Sans fournisseur RAG, la recherche documentaire peut être indisponible, mais aucune facturation implicite ne doit survenir.

Un endpoint local compatible, par exemple Ollama lorsqu'il est installé et configuré avec un modèle d'embeddings adapté, peut constituer une option sans coût fournisseur, **non qualifiée par les tests RAG actuels**. Les CI de [PR #45](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/45) et PR #48 vérifient vrai RAG/pgvector avec **embeddings simulés sur runner jetable**, pas la qualité d'un modèle externe.

### JWT partagé, première installation et upgrade

Sur **installation neuve uniquement**, le bootstrap de la PR #48 crée `JWT_SECRET` et `JWT_REFRESH_SECRET` si absents de `.env`, afin que l'API LibreChat et le service RAG utilisent la même signature. **Une installation existante ne doit jamais voir ses JWT changés automatiquement.** Si un ancien `.env` est dépourvu de `JWT_SECRET`, le mode Full/RAG n'est pas réputé opérationnel : une migration vérifiée est nécessaire pour maintenir les sessions existantes. Ne pas générer un JWT divergent ni supprimer les volumes pour débloquer la situation. Les tests CI conservent les JWT existants, mais ne démontrent pas toute migration réelle depuis les versions historiques.

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

## Provisionnement natif des agents BOT MODE

Le provisionnement est effectué **après création d'un compte LibreChat et configuration d'un fournisseur/modèle autorisé**, par l'API native protégée `POST /api/agents/botmode/setup`. Le service crée le Worker et ses cinq spécialistes, configure les droits ACL et les relations de délégation ; l'opération est idempotente et les agents persistent après redémarrage.

Sur une installation neuve, configurer la clé API du fournisseur dans `.env`, redémarrer si nécessaire, puis s'authentifier dans LibreChat. Depuis l'interface d'onboarding BOT MODE, sélectionner un fournisseur et un modèle disponibles : le navigateur doit appeler la route native sous l'identité de l'utilisateur authentifié. La route `GET /api/agents/botmode/setup-status` permet de vérifier l'inventaire et les droits.

**Ne pas provisionner des identifiants MongoDB manuellement** et ne pas exécuter `provision-worker.js` ou `seed-default-specialists.js` pour remplacer ce chemin API. Ne jamais afficher ni transmettre des tokens JWT ou des clés API dans les logs.

Preuves sur la candidate `d4e82dd` :
- [Installation publique GHCR + onboarding natif six agents et persistance](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38307011447)
- [Gate réel Gemini → Worker → spécialiste → Oracle → publication](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38318687920)

Le dernier gate a validé un spécialiste réellement exécuté, les verdicts Oracle durables `VERIFIED` et `HUMAN_REVIEW`, la publication acceptée et la rétention de la candidate rejetée. Il ne qualifie pas individuellement tous les spécialistes ni tous les systèmes d'exploitation.

Pour préparer une restauration sans perte de données, consulter [le plan de rollback](BOT_MODE_ROLLBACK.md). Les restaurations ont été testées sur des environnements CI jetables (MongoDB, PostgreSQL/pgvector, Meilisearch, fichiers et API avec Worker/ACL), mais **le retour arrière après migration de schéma et la reprise complète d'une mission depuis une sauvegarde physique ne sont pas qualifiés**. Ne jamais considérer ces essais comme une autorisation de modifier les volumes d'une installation existante.

## État de publication

Ne créer aucun tag `v*`, ne fusionner aucune PR et ne promouvoir aucune image vers `latest` avant une décision explicite GO/no-go, la vérification des risques résiduels et la documentation du rollback. La candidate est disponible uniquement avec son tag `sha-<commit>`.
