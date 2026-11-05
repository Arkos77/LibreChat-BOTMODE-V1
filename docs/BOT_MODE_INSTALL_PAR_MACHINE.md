# BOT MODE V1.0.3 — installation selon votre machine

**Choisissez votre système, préparez Docker, puis installez une seule fois BOT MODE.** L'installateur natif détecte le système, la mémoire et l'AVX sur x86_64, et choisit automatiquement le profil **Lite** ou **Full**. Il reste possible de forcer `--lite` ou `--full`.

Ce guide concerne **une nouvelle installation**, pas la migration d'un LibreChat/BOT MODE existant. Les commandes de préparation de Docker ci-dessous ne doivent **pas** être exécutées sur un hôte où Docker et des volumes importants fonctionnent déjà : passez directement aux vérifications, puis à l'installation de BOT MODE. Sauvegardez et vérifiez la restauration de toute installation existante avant de changer quoi que ce soit.

**Version figée :** [v1.0.3](https://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v1.0.3) ; commit `724afac023b4a47a49bba72895c7c2d15ad3e292` ; image Linux AMD64/ARM64 `ghcr.io/arkos77/librechat-botmode-v1@sha256:a09a07f21c2075b79ba132b831bb13d31a1f51b980000967a7e1191036811598`. Les alias Docker `stable` et `latest` ne sont **pas** les références de cette version.

## Choisir son système

| Système | Préparation de Docker | Profil conseillé | Niveau de qualification BOT MODE |
| --- | --- | --- | --- |
| [Chromebook ChromeOS](#chromebook--chromeos-et-linux-crostini) | Linux/Crostini (Debian), Docker Engine | **Lite** | Mission réelle et runtime qualifiés sur un Chromebook |
| [Ubuntu / Xubuntu Linux](#ubuntu-ou-xubuntu--pc-linux-et-macbook-sous-linux) | Docker Engine Ubuntu | **Auto**, ou Lite sur petit PC | Chemin Linux + image AMD64 validés ; chaque machine reste à tester |
| [Debian Linux](#debian--autre-pc-linux) | Docker Engine Debian | **Auto** | Chemin d'installation basé sur Docker officiel |
| [Fedora Linux](#fedora--autre-pc-linux) | Docker Engine Fedora | **Auto** | Procédure documentée, pas de qualification matérielle BOT MODE |
| [macOS](#macos--mac-intel-ou-apple-silicon) | Docker Desktop pour Mac | **Lite d'abord** | Procédure préparée, **pas** de réception BOT MODE sur Mac macOS |
| [Windows 10/11](#windows-1011--wsl2-et-docker-desktop) | WSL2 + Docker Desktop + Ubuntu | **Lite d'abord** | Procédure préparée, **pas** de réception BOT MODE sur Windows |

Les machines **ARM 32 bits** et **Windows natif sans WSL2** ne sont pas déclarés supportés pour cette image. Un **MacBook installé sous Xubuntu est une machine Linux** : suivre Ubuntu/Xubuntu, *pas* la section macOS.

### Vérifications communes (avant toute installation)

Dans un terminal **Linux/macOS** — ou dans le terminal **Ubuntu WSL2** sous Windows — vérifiez :

```bash
git --version
openssl version
docker --version
docker compose version
docker info >/dev/null
uname -m
```

Docker doit répondre **sans `sudo`** pour que `./install.sh` fonctionne dans votre session. Si `docker info` échoue, configurez l'accès au démon Docker ; **ne réinstallez pas Docker à l'aveugle**.

Vérifiez également qu'aucune autre application n'utilise le port **3080**, que vous disposez de plusieurs Gio libres pour les images/volumes et que vous connaissez les emplacements de vos sauvegardes. Pour une installation nouvelle, évitez les autres stacks LibreChat sur les mêmes ports ou volumes.

---

## Chromebook — ChromeOS et Linux (Crostini)

**Statut :** profil Lite réellement testé sur un Chromebook CPU-only ; les restrictions Crostini varient selon l'appareil et les politiques d'administration.

1. Dans ChromeOS, ouvrez **Paramètres → À propos de ChromeOS → Développeurs → Environnement de développement Linux → Configurer**. Google installe un environnement **Debian** et ouvre l'application Terminal. [Instructions officielles ChromeOS](https://support.google.com/chromebook/answer/9145439?hl=fr).
2. Dans le **terminal Linux**, vérifiez la distribution et l'espace disque :

```bash
cat /etc/os-release
uname -m
df -h ~
sudo apt-get update
sudo apt-get install -y git openssl ca-certificates curl
```

3. Si Docker est **déjà installé et fonctionne** (`docker info`, `docker compose version`), **sautez l'installation Docker ci-dessous**. Sinon, sur une instance Debian **neuve**, suivez la section [Docker Engine sur Debian](#debian--autre-pc-linux). La procédure officielle n'utilise pas `curl | sh`.
4. Vérifiez l'accès Docker. Si Docker a été installé, mais n'est pas démarré, essayez `sudo systemctl start docker` si systemd fonctionne ; sur certains conteneurs Crostini, `sudo service docker start` est nécessaire. Si le démon ne peut pas démarrer, **arrêtez ici** : votre environnement Crostini peut limiter Docker.
5. Après `docker info` réussi, allez à [Installer BOT MODE](#installer-bot-mode--commandes-communes) et choisissez **Lite** en cas de faible mémoire ou d'absence d'AVX.

**Important :** ne supprimez jamais le conteneur Linux de ChromeOS, ses volumes ou son disque pour « réparer » l'installation ; cela pourrait effacer des données. Aucune compilation Node.js sur ce Chromebook n'est nécessaire.

## Ubuntu ou Xubuntu — PC Linux et MacBook sous Linux

**Statut :** chemin Linux AMD64 qualifié en CI ; une machine ancienne ou avec peu de RAM doit utiliser **Lite**.

1. Ouvrez un terminal et vérifiez Ubuntu/Xubuntu :

```bash
cat /etc/os-release
uname -m
sudo apt-get update
sudo apt-get install -y git openssl ca-certificates curl
```

2. **Si Docker fonctionne déjà**, ne le désinstallez pas et n'exécutez pas la préparation du dépôt APT. Pour un **hôte Ubuntu/Xubuntu neuf sans Docker**, vérifiez d'abord que la version Ubuntu est prise en charge par le [guide officiel Docker Engine Ubuntu](https://docs.docker.com/engine/install/ubuntu/), qu'aucun paquet Docker concurrent n'est installé et que `/etc/apt/sources.list.d/docker.sources` n'existe pas déjà.

3. Sur cet hôte neuf uniquement, configurez le dépôt **officiel signé** puis installez Docker Engine et Compose v2 :

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

La commande `systemctl` concerne un Linux utilisant systemd ; si votre environnement ne l'emploie pas, suivez la gestion de services de votre distribution. Ne supprimez **aucun** paquet Docker existant sans inventaire de ses volumes/conteneurs.

4. Vérifiez Docker puis passez aux [commandes BOT MODE communes](#installer-bot-mode--commandes-communes). Si votre MacBook tourne sous **Xubuntu**, cette section est celle qui s'applique.

## Debian — autre PC Linux

Le Chromebook Crostini installe normalement Debian. Sur une instance Debian **neuve**, après vérification de la version compatible dans les [instructions Docker Debian](https://docs.docker.com/engine/install/debian/) et absence de conflit avec un Docker existant :

```bash
sudo apt-get update
sudo apt-get install -y git openssl ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: $(. /etc/os-release && echo "$VERSION_CODENAME")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
```

Démarrez Docker avec `sudo systemctl start docker` si systemd est disponible, ou `sudo service docker start` dans un environnement utilisant ce gestionnaire. Après vérification de l'accès au démon, suivez les [commandes BOT MODE communes](#installer-bot-mode--commandes-communes).

Si la version de Debian n'est pas prise en charge par le dépôt officiel, **arrêtez**, ne remplacez pas arbitrairement le nom de version pour contourner l'erreur.

## Fedora — autre PC Linux

**Statut :** préparation Docker documentée, mais aucun test matériel Fedora spécifique à BOT MODE V1.0.3.

Sur un Fedora neuf compatible avec le [guide officiel Docker Fedora](https://docs.docker.com/engine/install/fedora/), sans Docker concurrent :

```bash
sudo dnf install -y git openssl curl dnf-plugins-core
sudo dnf config-manager addrepo \
  --from-repofile https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

Les installations plus anciennes de Fedora peuvent utiliser une syntaxe `dnf config-manager` différente : suivre **celle indiquée pour la version installée** dans la documentation Docker, sans forcer un dépôt incompatible. Puis exécutez les [vérifications communes](#vérifications-communes-avant-toute-installation).

Pour une autre distribution Linux, utilisez les [procédures Docker officielles](https://docs.docker.com/engine/install/) de votre distribution. Une image Linux AMD64/ARM64 ne garantit pas à elle seule un fonctionnement validé sur toutes les distributions.

### Accès Docker sans sudo (Debian, Ubuntu, Fedora, Crostini)

Si `sudo docker info` fonctionne mais `docker info` refuse la connexion, **le compte utilisé par BOT MODE doit pouvoir parler au démon**. Sur un système administré par vous, vous pouvez ajouter votre utilisateur au groupe Docker :

```bash
sudo usermod -aG docker "$USER"
```

**Attention : le groupe `docker` accorde des privilèges équivalents à root.** Réfléchissez à cette autorisation ; ne l'accordez pas automatiquement à des utilisateurs non fiables. Fermez puis rouvrez la session (ou démarrez un nouveau shell avec `newgrp docker`), et vérifiez `docker info`. Alternative : [mode rootless Docker](https://docs.docker.com/engine/security/rootless/) à configurer séparément, non qualifié pour BOT MODE V1. [Explications officielles](https://docs.docker.com/engine/install/linux-postinstall/).

---

## macOS — Mac Intel ou Apple Silicon

**Statut :** image Linux AMD64/ARM64 disponible via Docker Desktop, mais **pas de réception BOT MODE V1.0.3 sur macOS**. Ne pas confondre Mac matériel et machine **Xubuntu Linux**.

1. Vérifiez que votre Mac utilise une **version de macOS prise en charge** et que les [prérequis Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/) sont satisfaits. Docker Desktop demande au moins **4 Gio de RAM**, et ses conditions d'utilisation sont distinctes des licences du projet BOT MODE.
2. Téléchargez la version officielle **Docker Desktop pour Mac Intel** ou **Mac Apple Silicon** ; installez et ouvrez l'application Docker, puis attendez que le moteur soit démarré.
3. Dans **Terminal** macOS, vérifiez :

```bash
uname -m
git --version
openssl version
docker --version
docker compose version
docker info >/dev/null
```

Si Git est absent, installez les outils de ligne de commande Apple via `xcode-select --install`, puis revenez aux vérifications. Vérifiez dans Docker Desktop que les ressources **réellement allouées à Docker** permettent de lancer les conteneurs. Le bootstrap lit la RAM **du Mac**, pas nécessairement la limite mémoire allouée par Docker Desktop.

**Pour un premier essai sur macOS, forcez `--lite`**, même sur un Mac doté de plus de 4 Gio. Passez ensuite aux [commandes d'installation communes](#installer-bot-mode--commandes-communes). Full n'est pas déclaré qualifié sur macOS.

---

## Windows 10/11 — WSL2 et Docker Desktop

**Statut :** chemin proposé, **pas encore qualifié sur un PC Windows réel**. BOT MODE ne propose pas un installeur Windows `.exe` : l'installation se déroule dans **Ubuntu sous WSL2**, avec des conteneurs Linux via Docker Desktop.

1. Ouvrez **PowerShell en administrateur** (sur une machine qui n'a pas encore WSL), installez WSL puis redémarrez Windows si demandé :

```powershell
wsl --install -d Ubuntu
wsl --update
wsl -l -v
```

Vérifiez que la distribution Ubuntu utilise **WSL version 2**. Si vous avez déjà WSL, ne réinstallez pas la distribution : vérifiez simplement `wsl -l -v`.

2. Installez [Docker Desktop pour Windows](https://docs.docker.com/desktop/setup/install/windows-install/). Dans ses paramètres, utilisez un moteur **WSL2 / conteneurs Linux**, puis activez **Settings → Resources → WSL Integration → Ubuntu**. Docker recommande de **ne pas installer un deuxième Docker Engine dans Ubuntu WSL** en parallèle de Docker Desktop. [Guide Docker WSL2](https://docs.docker.com/desktop/features/wsl/).

3. Ouvrez le terminal **Ubuntu WSL2** (pas PowerShell) :

```bash
sudo apt-get update
sudo apt-get install -y git openssl ca-certificates curl

uname -m
docker --version
docker compose version
docker info >/dev/null
```

Si `docker info` ne fonctionne pas dans Ubuntu, vérifiez l'intégration WSL de Docker Desktop avant d'aller plus loin.

4. **Clonez le projet dans le système de fichiers Linux** (par exemple dans `~/`), pas dans `/mnt/c/`, afin de limiter les problèmes de permissions et de performance. Exécutez ensuite les [commandes BOT MODE communes](#installer-bot-mode--commandes-communes).

5. Après démarrage, essayez **http://localhost:3080** dans le navigateur Windows. Le fonctionnement dépend de l'intégration réseau WSL2/Docker Desktop ; en cas d'échec, vérifiez les paramètres et les ports avant toute modification du pare-feu.

La quantité de RAM détectée est celle de l'environnement Linux WSL2 ; elle peut être différente de la RAM totale de Windows. Pour un premier essai, forcez `--lite` jusqu'à validation locale. [Référence Microsoft WSL](https://learn.microsoft.com/fr-fr/windows/wsl/install).

---

## Installer BOT MODE — commandes communes

**Une fois Docker prêt, quel que soit le système**, ouvrez un terminal Linux (ChromeOS, Ubuntu/Xubuntu, Debian/Fedora, WSL2) ou Terminal macOS.

Sur une **nouvelle installation**, sans dossier BOT MODE préexistant :

```bash
git clone --branch v1.0.3 --depth 1 \
  https://github.com/Arkos77/LibreChat-BOTMODE-V1.git

cd LibreChat-BOTMODE-V1

# Si cette vérification échoue, arrêtez-vous : ne lancez pas l'installateur.
test "$(git rev-parse HEAD)" = \
  724afac023b4a47a49bba72895c7c2d15ad3e292
```

**Mode automatique** : il choisit **Lite** si moins de **4 Gio de RAM** ou si le CPU x86_64 manque d'AVX ; **Full** autrement. Référencez systématiquement le digest validé :

```bash
BOTMODE_HOST_BIND_IP=127.0.0.1 ./install.sh --image \
  ghcr.io/arkos77/librechat-botmode-v1@sha256:a09a07f21c2075b79ba132b831bb13d31a1f51b980000967a7e1191036811598
```

Sur une petite machine, un Mac avec ressources Docker limitées ou une installation Windows WSL2 non encore qualifiée, utilisez **Lite explicitement** :

```bash
BOTMODE_HOST_BIND_IP=127.0.0.1 ./install.sh --lite --image \
  ghcr.io/arkos77/librechat-botmode-v1@sha256:a09a07f21c2075b79ba132b831bb13d31a1f51b980000967a7e1191036811598
```

Pour une machine Linux compatible et suffisamment dimensionnée, Full peut être demandé explicitement via `--full` ; le bootstrap **refuse Full** si le CPU x86_64 n'a pas AVX ou si la RAM détectée est inférieure à 4 Gio. Full inclut davantage de services locaux, ce qui exige des ressources supplémentaires.

**Pourquoi `BOTMODE_HOST_BIND_IP=127.0.0.1` ?** Cette variable limite le port HTTP à l'hôte pendant la première installation. La configuration Docker de base peut sinon écouter sur toutes les interfaces (`0.0.0.0`). Une fois `.env` créé, **ajoutez-y** `BOTMODE_HOST_BIND_IP=127.0.0.1` avant tout redémarrage, pour conserver ce choix (sauf si vous souhaitez explicitement administrer un accès réseau distant sécurisé). N'exposez pas directement un service non sécurisé sur Internet.

### Premier démarrage et diagnostic

1. Le bootstrap crée `.env` si absent, prépare les secrets nécessaires à une nouvelle installation et télécharge l'image **sans build Node local**.
2. Configurez **vos propres clés fournisseur** dans `.env` et conservez ses permissions privées. Aucun accès modèle payant automatique n'est autorisé par BOT MODE par défaut ; les quotas des modèles gratuits peuvent changer.
3. Si vous modifiez `.env`, redémarrez avec `./stop.sh` puis `./start.sh` **uniquement sur cette installation** ; cela ne supprime pas les volumes.
4. Dans le navigateur du même ordinateur, ouvrez **http://localhost:3080**, créez le compte, puis terminez l'initialisation BOT MODE dans LibreChat.
5. Testez les services :

```bash
docker compose version
docker info >/dev/null
./doctor.sh
curl -fsS http://localhost:3080/api/config >/dev/null
```

Si Docker fonctionne mais que le navigateur ne répond pas, vérifiez les ports, le conteneur API et les journaux **sans diffuser de secrets**. Sur ChromeOS et WSL2, le chemin navigateur ↔ service Linux dépend aussi du transfert réseau fourni par la plateforme.

**Gestion courante :** `./start.sh`, `./stop.sh`, `./doctor.sh`. La commande `./update.sh` refuse un checkout de tag figé et ne doit pas être forcée : la migration vers une future release se prépare séparément, avec sauvegarde préalable.

### Sécurité, données et limites

- **Ne pas installer par-dessus** un LibreChat/BOT MODE existant. Ne pas supprimer des volumes, ne pas exécuter `docker system prune --volumes` ou `git clean -fdx` pour « réparer » une machine.
- La compatibilité de l'image et un démarrage Docker **ne prouvent pas** que toutes les fonctions métier sont qualifiées sur macOS, Windows et chaque distribution Linux.
- Les validations déjà acquises portent notamment sur la mission multi-agent à trois étapes, Oracle/P6, la distribution GHCR AMD64/ARM64 et les tests Lite. La qualification globale des alertes CodeQL/Dependabot reste **un chantier distinct** : [issue #130](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/130).
- BOT MODE est un **fork communautaire** de LibreChat, pas la distribution officielle de LibreChat upstream. Le dépôt est sous licence MIT, avec des obligations propres aux dépendances tierces.

Pour une configuration avancée, les volumes, les migrations et la gestion des spécialistes, consultez le [guide d'installation](BOT_MODE_INSTALL.md) et le [guide de restauration](BOT_MODE_ROLLBACK.md).

## Sources officielles pour préparer les systèmes

- [Google — activer Linux sur Chromebook](https://support.google.com/chromebook/answer/9145439?hl=fr)
- [Docker — installation sur Debian](https://docs.docker.com/engine/install/debian/)
- [Docker — installation sur Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Docker — installation sur Fedora](https://docs.docker.com/engine/install/fedora/)
- [Docker — utilisation du groupe Docker](https://docs.docker.com/engine/install/linux-postinstall/)
- [Docker — Docker Desktop sur Mac](https://docs.docker.com/desktop/setup/install/mac-install/)
- [Docker — Docker Desktop avec WSL2](https://docs.docker.com/desktop/features/wsl/)
- [Microsoft — installation WSL2](https://learn.microsoft.com/fr-fr/windows/wsl/install)

Ces liens ont été consultés pour la présente documentation. Les instructions des éditeurs peuvent évoluer indépendamment de la version figée de BOT MODE.
