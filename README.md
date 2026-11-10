# BOT MODE V1 — LibreChat, de la demande à une réponse vérifiée

**BOT MODE transforme LibreChat en espace de missions multi-agents.** Un orchestrateur prépare le travail, mobilise les spécialistes utiles, regroupe leurs résultats et ne publie la réponse finale qu'après les contrôles prévus.

**Ce n'est pas un nouveau moteur de chat :** BOT MODE s'intègre directement au runtime de [LibreChat](https://github.com/danny-avila/LibreChat), avec ses conversations, ses projets et son interface.

**Version stable publiée : [v1.0.5](https://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v1.0.5) — 10 novembre 2026.** Source Git `0973da6cc8cfc5b35616e26132d0945fff147ebe`, image Docker précompilée pour Linux AMD64 et ARM64. Le profil **Lite** vise notamment les Chromebooks sous Linux, les machines CPU-only et les petits environnements sans AVX.

> **À retenir :** installer le tag Git `v1.0.5` et l'image correspondant au **digest exact** ci-dessous. Les alias Docker `stable` et `latest` peuvent encore pointer vers une ancienne version.

## Pourquoi BOT MODE ?

Au lieu d'attendre qu'un seul agent accomplisse toutes les étapes, BOT MODE structure les missions :

```text
Votre demande dans LibreChat
            │
            ▼
   BOT MODE Worker
   organise la mission
            │
            ▼
 Recherche → Analyse → Synthèse
            │
            ▼
  Contrôles indépendants Oracle
            │
            ▼
 Publication unique sous barrière P6
            │
            ▼
      Réponse finale
```

- **Orchestration native :** le Worker coordonne les étapes et les spécialistes, sans devenir un outil d'exécution universel.
- **Spécialistes à responsabilités distinctes :** Recherche, Analyse, Code, Documents et Rédaction/Synthèse ; chacun n'utilise que les capacités autorisées pour sa tâche.
- **Contrôle des résultats :** Oracle vérifie indépendamment les étapes ; la barrière P6 protège la publication de la réponse finale.
- **Missions durables :** état de mission, preuves et résultats conservés pour la consultation et la reprise selon le scénario.
- **Intégration LibreChat :** conversations, projets, progression visible et résultats conservés.
- **Profil Lite :** image prête à l'emploi, MongoDB et Redis légers, sans compilation locale lourde.

**Parcours réel vérifié en V1.0.3 :** Recherche → Analyse → Synthèse, 3 étapes Oracle VERIFIED, une publication P6 et la persistance des résultats. D'autres capacités dépendent des outils et services configurés ; elles ne sont pas toutes validées sur toutes les plateformes.

## Installation par machine

**Choisissez votre système avant de copier les commandes :** [Chromebook ChromeOS / Crostini](docs/BOT_MODE_INSTALL_PAR_MACHINE.md#chromebook--chromeos-et-linux-crostini), [Ubuntu / Xubuntu](docs/BOT_MODE_INSTALL_PAR_MACHINE.md#ubuntu-ou-xubuntu--pc-linux-et-macbook-sous-linux), [Debian](docs/BOT_MODE_INSTALL_PAR_MACHINE.md#debian--autre-pc-linux), [Fedora](docs/BOT_MODE_INSTALL_PAR_MACHINE.md#fedora--autre-pc-linux), [macOS](docs/BOT_MODE_INSTALL_PAR_MACHINE.md#macos--mac-intel-ou-apple-silicon) ou [Windows / WSL2](docs/BOT_MODE_INSTALL_PAR_MACHINE.md#windows-1011--wsl2-et-docker-desktop).

Le **[guide d'installation adapté à chaque machine](docs/BOT_MODE_INSTALL_PAR_MACHINE.md)** explique comment préparer Git, Docker et Compose v2, puis propose les commandes de la **v1.0.5** pour un ordinateur neuf. **L'installateur choisit Lite ou Full automatiquement** selon la mémoire et l'AVX sur x86_64 ; sur macOS/Windows, l'installation reste à qualifier sur matériel réel. Pour démarrer avec le profil Lite explicitement, utilisez les commandes ci-dessous.

## Installation rapide — nouvelle machine

### Prérequis

- Linux AMD64 ou ARM64, ou **ChromeOS avec Linux (Crostini)** ; d'autres plateformes utilisent Docker mais n'ont pas toutes la même qualification réelle.
- Git, Docker Engine actif, **Docker Compose v2** et OpenSSL.
- Connexion Internet pour télécharger l'image Docker.
- Port **3080** disponible. Prévoir de l'espace disque pour les images et les volumes persistants.

Vérifiez Docker :

```bash
git --version
docker --version
docker compose version
docker info >/dev/null
openssl version
```

### Installer BOT MODE V1.0.4 en profil Lite

Sur une **installation neuve**, copiez les commandes suivantes :

```bash
git clone --branch v1.0.5 --depth 1 \
  https://github.com/Arkos77/LibreChat-BOTMODE-V1.git

cd LibreChat-BOTMODE-V1

# Vérifier la révision publiée : la commande s'arrête en cas d'écart.
test "$(git rev-parse HEAD)" = \
  0973da6cc8cfc5b35616e26132d0945fff147ebe

# Conserver explicitement l'accès local (réglage par défaut en v1.0.5).
BOTMODE_HOST_BIND_IP=127.0.0.1 ./install.sh --lite --image \
  ghcr.io/arkos77/librechat-botmode-v1@sha256:27708c107dc434a59a2e6a5fe4e3501ae5f6c13bfdb064464932c88a0c2a4c80
```

L'installateur vérifie Docker/Compose, prépare le fichier local `.env`, génère les identifiants de base de données nécessaires sur une installation neuve, télécharge l'image et démarre les services.

**Sécurité v1.0.5 :** l'API (port 3080) et le panneau d'administration Full (port 3000) écoutent sur `127.0.0.1` par défaut dans Docker Compose. Pour conserver un choix explicite lors des redémarrages, notez `BOTMODE_HOST_BIND_IP=127.0.0.1` dans `.env`. Un accès distant exige un proxy TLS, un contrôle d'accès et une configuration de `TRUST_PROXY` adaptée. Ne journalisez pas les paramètres OAuth `code`/`state` sur le frontal.

**Après le démarrage :**

1. Configurez **votre propre clé de fournisseur** dans `.env` (par exemple un modèle gratuit disponible via OpenRouter). Ne publiez jamais ce fichier et ne transmettez jamais vos clés.
2. Si vous avez modifié `.env` après le premier démarrage, appliquez ces changements avec `./stop.sh` puis `./start.sh` ; les volumes de données sont préservés.
3. Ouvrez **http://localhost:3080**, créez votre compte, puis terminez l'initialisation BOT MODE depuis l'interface LibreChat.
4. Vérifiez l'état des services avec `./doctor.sh --lite`.

**Attention :** ces commandes sont destinées à une machine ou installation neuve. **N'exécutez pas une nouvelle installation par-dessus une stack existante** sans sauvegarde, inventaire des volumes et procédure de migration.

### Autres commandes utiles

```bash
./install.sh --help   # Options et profils disponibles
./doctor.sh --lite    # Diagnostic
./stop.sh             # Arrêt sans suppression des volumes
./start.sh            # Redémarrage avec l'image configurée
```

Le profil peut être choisi automatiquement avec `./install.sh --image <IMAGE_VALIDÉE>` ; le profil **Full** demande au moins 4 Gio de mémoire et, sur x86_64, un CPU compatible AVX. Pour une version épinglée, **n'utilisez pas `./update.sh`** : il refuse volontairement les tags Git détachés.

Le [guide complet d'installation](docs/BOT_MODE_INSTALL.md) couvre la configuration, le provisionnement natif des agents, les sauvegardes et les migrations.

## Image officielle et reproductibilité

- **Code source :** [tag v1.0.5](https://github.com/Arkos77/LibreChat-BOTMODE-V1/tree/v1.0.5)
- **Commit :** `0973da6cc8cfc5b35616e26132d0945fff147ebe`
- **Image :** `ghcr.io/arkos77/librechat-botmode-v1@sha256:27708c107dc434a59a2e6a5fe4e3501ae5f6c13bfdb064464932c88a0c2a4c80`
- **Architectures :** Linux AMD64 / ARM64
- **Preuves :** [image multiarchitecture, téléchargement public, smoke Lite et publication](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/42321927636), [installation Lite et restauration MongoDB sur runner jetable](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/42298001610), [audit npm et sécurité du conteneur](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/42298001601).

La **v1.0.5** a été vérifiée sur runners GitHub Linux AMD64/ARM64, avec pull public et démarrage Lite de l'image GHCR lors de sa publication. Les essais sur Chromebook concernent notamment la release historique **v1.0.3** ; ils ne garantissent pas la compatibilité de chaque matériel.

## Modèles, coûts et sécurité

- Le routage natif par défaut est prévu pour les **modèles explicitement gratuits** configurés dans OpenRouter. Aucun fallback payant automatique n'est autorisé par défaut. **Gratuit ne signifie pas accès illimité :** les fournisseurs imposent leurs propres conditions, disponibilités et quotas.
- Aucune clé API personnelle n'est fournie ni attendue dans Git. Les fichiers `.env` locaux ne doivent jamais être commités.
- Les contrôles automatisés de publication et de provenance de l'image ont réussi. **Cela ne vaut pas certification de sécurité exhaustive :** les trois alertes CodeQL résiduelles de la candidate (#328, #330 et #63) restent ouvertes, avec mesures compensatoires et acceptation documentées dans [l'issue sécurité #154](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/154).
- Pour signaler une faille, privilégiez un [signalement privé sur GitHub](https://github.com/Arkos77/LibreChat-BOTMODE-V1/security/advisories/new), sans publier de secrets ni de détails exploitables dans une issue.
- **Licences :** dépôt sous MIT, avec des licences tierces distinctes pouvant imposer d'autres restrictions. Lire [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), notamment avant toute redistribution commerciale.

## Documentation

- [Guide d'installation et premier démarrage](docs/BOT_MODE_INSTALL.md)
- [Sauvegardes et retour arrière](docs/BOT_MODE_ROLLBACK.md)
- [Méthode de publication publique](docs/BOT_MODE_PUBLIC_RELEASE.md)
- [Risques de dépendances suivis](docs/BOTMODE_V1_NPM_RISK_DECISION_20261014.md)
- [Release v1.0.5 et notes de version](https://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v1.0.5)

## English summary

**BOT MODE V1 is a native multi-agent orchestration extension for LibreChat.** A Worker coordinates specialized research, analysis and writing steps; independent Oracle checks and a P6 publication barrier control the final answer. A prebuilt, digest-pinned **Lite** Docker image supports Linux AMD64/ARM64, including low-memory CPU-only installations. For setup, use the commands above and the [installation guide](docs/BOT_MODE_INSTALL.md). Free-model access depends on provider quotas and credentials.

## Crédits

BOT MODE est basé sur [LibreChat](https://github.com/danny-avila/LibreChat) et conserve son attribution et sa licence de base. **Ce dépôt est un fork communautaire, pas la distribution officielle du projet LibreChat upstream.**

- LibreChat et ses contributeurs
- Les bibliothèques et fournisseurs intégrés, soumis à leurs licences respectives

Licence du dépôt : [MIT](LICENSE). Voir les [mentions de tiers](THIRD_PARTY_NOTICES.md).
