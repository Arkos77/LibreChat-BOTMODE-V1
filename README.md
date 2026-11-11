# BOT MODE V1 — LibreChat multi-agents avec vérification des réponses

**BOT MODE transforme LibreChat en espace de missions multi-agents.** Un Worker coordonne les spécialistes utiles ; Oracle vérifie les résultats et la barrière P6 contrôle la publication de la réponse finale.

**Version publique stable : [v1.0.6](https://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v1.0.6)** · Image Docker Linux AMD64/ARM64 · Profils **Lite** (CPU, faible mémoire) et **Full** (matériel plus récent).

## Fonctionnement

**Demande → Worker → Recherche / Analyse / autres spécialistes → Oracle → P6 → réponse finale.**

- **Spécialistes distincts :** Recherche, Analyse, Code, Documents et Rédaction/Synthèse, selon les capacités autorisées et configurées.
- **Résultats vérifiés :** Oracle contrôle les étapes ; P6 évite les publications finales multiples.
- **Missions durables :** état, résultats et éléments de preuve conservés selon le scénario.
- **Intégration native :** conversations, projets et interface de [LibreChat](https://github.com/danny-avila/LibreChat).

Les parcours Recherche → Analyse → Synthèse avec Oracle VERIFIED et publication P6 ont été vérifiés dans le périmètre documenté ; **toutes les capacités ne sont pas disponibles ni validées dans tous les profils**.

## Aperçu

<p align="center">
  <img src="branding/mjk-v10/assets/logo.svg" width="92" alt="Emblème MJK de BOT MODE">
</p>

<p align="center">
  <img src="branding/mjk-v11/login-preview-v11.webp" width="850" alt="Aperçu de la connexion BOT MODE, thème MJK rose et bleu avec globe">
</p>

*Le thème MJK illustré est une personnalisation graphique. Il n'est pas inclus dans l'image officielle v1.0.6 et ne constitue pas une nouvelle release.*

## Installer BOT MODE

**Choisir sa plateforme :** [Chromebook / Crostini, Ubuntu, Xubuntu, Debian, Fedora, macOS ou Windows / WSL2](docs/BOT_MODE_INSTALL_PAR_MACHINE.md). Les images **Linux AMD64/ARM64** ont été qualifiées en CI ; les procédures macOS natif et Windows/WSL2 **ne sont pas qualifiées sur matériel réel** pour v1.0.6.

**Installation neuve Lite (Linux) :** Git, Docker Engine, Docker Compose v2 et OpenSSL doivent être installés, avec le port 3080 libre.

```bash
git clone --branch v1.0.6 --depth 1 \
  https://github.com/Arkos77/LibreChat-BOTMODE-V1.git
cd LibreChat-BOTMODE-V1

# Vérifier la source officielle avant l'installation.
test "$(git rev-parse HEAD)" = \
  416bf00898a6b0fb2eaf271ee4671d30ea55ccf0

# Installer avec une image épinglée et un accès local.
BOTMODE_HOST_BIND_IP=127.0.0.1 ./install.sh --lite --image \
  ghcr.io/arkos77/librechat-botmode-v1@sha256:e3640ac10833e4743796589b53d8a935d94867d73b0c25e82b4e7e1eba985cdb
```

Après installation, configurer **sa propre clé de fournisseur** dans le fichier local `.env`, redémarrer les services si nécessaire (`./stop.sh`, puis `./start.sh`), ouvrir **http://localhost:3080**, puis vérifier avec `./doctor.sh --lite`.

Le profil **Full** exige au moins **4 Gio de mémoire** et, sur x86_64, un CPU compatible **AVX**. Le [guide complet](docs/BOT_MODE_INSTALL.md) couvre la configuration. **Ne pas exécuter l'installation neuve sur une instance existante** : sauvegarder, inventorier les volumes et suivre une procédure de migration qualifiée.

## Sécurité et limites

- **Accès local par défaut** (`127.0.0.1`). Un accès distant exige TLS, contrôle d'accès et configuration proxy adaptée.
- **Lite sur CPU anciens :** MongoDB 4.4.29 est en fin de support fournisseur. Réserver ce profil à un environnement local protégé ; ne pas exposer la base de données.
- **Modèles :** privilégier les fournisseurs explicitement gratuits ; les quotas et la disponibilité dépendent du fournisseur. Aucun fallback payant automatique par défaut.
- **Fonctions :** Code Interpreter et Documents/RAG ne sont pas inclus ni validés dans le Lite par défaut.
- **Risques connus :** la publication n'est pas une certification de sécurité exhaustive. Les risques OAuth MCP et de dépendances sont suivis dans le [registre de sécurité](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/154). Ne jamais publier de clés ni de fichier `.env`.

## Documentation et provenance

- [Installation par machine](docs/BOT_MODE_INSTALL_PAR_MACHINE.md) · [Guide complet](docs/BOT_MODE_INSTALL.md) · [Sauvegarde et retour arrière](docs/BOT_MODE_ROLLBACK.md)
- [Release v1.0.6 et notes](https://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v1.0.6) · [Preuves de qualification CI/GHCR](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/42953398588) · [Vie privée](docs/BOT_MODE_DATA_PRIVACY_PUBLIC.md)
- [Documentation de l'habillage MJK](docs/branding/MJK_V11.md) · [Licences tierces](THIRD_PARTY_NOTICES.md) · [Licence MIT](LICENSE)

**English:** BOT MODE is a community LibreChat fork with specialist orchestration, Oracle verification and P6 final-response controls. The pinned Lite Docker image targets Linux AMD64/ARM64; other environments require separate qualification.

Basé sur [LibreChat](https://github.com/danny-avila/LibreChat) et ses contributeurs. **Ce dépôt communautaire n'est pas la distribution officielle de LibreChat.**
