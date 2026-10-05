# BOT MODE — installation reproductible

Ce chemin prépare LibreChat/BOT MODE sans modifier les données existantes ni installer de paquets système avec sudo.

## Cibles

- Linux / Xubuntu : support direct.
- ChromeOS : via Crostini/Linux.
- macOS : support direct avec Docker Desktop ou un runtime Docker compatible.
- Windows : utiliser WSL2 et suivre le chemin Linux ; le bootstrap natif Windows n’est pas déclaré supporté.

## Prérequis

- Git
- Node.js 24.x (la version de référence est dans `.nvmrc`)
- npm
- Docker avec Compose v2 (`docker compose`)
- démon Docker démarré

Le bootstrap refuse de lancer sudo et ne tente pas d’installer automatiquement ces prérequis système.

## Installation

```bash
git clone <DEPOT_BOTMODE> LibreChat
cd LibreChat
./scripts/botmode/bootstrap.sh --check-only
./scripts/botmode/bootstrap.sh
```

Si `.env` est absent, le bootstrap copie `.env.example` vers `.env` et applique des permissions restrictives. Il ne remplace jamais un `.env` existant.

Après le bootstrap, renseigner uniquement les credentials réellement nécessaires dans `.env`. Ne jamais committer ce fichier.

Pour démarrer la stack après configuration :

```bash
./scripts/botmode/bootstrap.sh --start --skip-install --skip-build
```

Le démarrage Docker reste opt-in. Sans `--start`, le script valide seulement l’installation, les builds, Compose et les tests BOT MODE.

## Options utiles

```text
--check-only    Vérifie uniquement les prérequis.
--start         Démarre Docker Compose après validation.
--skip-install  Saute npm ci.
--skip-build    Saute les builds packages/client.
--skip-verify   Saute les tests de reproductibilité BOT MODE.
```

## Chromebook

Le Chromebook sera la cible finale de validation depuis zéro. Crostini suit le chemin Linux. Sur une machine à faible mémoire, ne pas considérer le profil complet comme acquis : les modèles locaux et services optionnels lourds doivent rester désactivables et un profil allégé devra être utilisé ou finalisé avant le démarrage permanent.

## Invariants de sécurité

- aucun `sudo` dans le bootstrap ;
- aucun effacement de données ;
- aucun remplacement d’un `.env` existant ;
- aucun secret dans Git ;
- aucun second scheduler/runtime BOT MODE ;
- le démarrage des conteneurs est explicite avec `--start`.

## Preuve locale du 5 octobre 2026

Un clone isolé du HEAD `446c783`, sans `.env` et sans `node_modules`, a été créé sous `~/backups/botmode-repro-check-20261005/LibreChat`.

Résultats :

- `npm ci` : PASS, 2 980 paquets installés depuis le lockfile ;
- `scripts/botmode/verify-reproducibility.sh` : 38/38 tests PASS ;
- `npm run build:packages` : PASS ;
- build client CI : PASS ;
- `docker compose config --quiet` : PASS avec `.env.example` copié temporairement en `.env` et UID/GID locaux ;
- aucun `.env` conservé dans le clone de preuve ;
- worktree du clone propre après validation.

Cette preuve valide le checkout, le lockfile, les builds et la configuration Compose sur la machine actuelle. La preuve matérielle finale sur une vraie machine nettoyée reste le futur test Chromebook.
