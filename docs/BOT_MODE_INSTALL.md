# Installer BOT MODE V1.0.3 — guide officiel

**BOT MODE** ajoute à LibreChat un orchestrateur de missions et des spécialistes (Recherche, Analyse, Code, Documents, Rédaction), avec vérification Oracle indépendante et publication contrôlée par P6. La version publique à installer est **[v1.0.4](https://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v1.0.4)**.

Ce guide concerne **une nouvelle installation**. Une installation existante nécessite un inventaire et une sauvegarde préalables : voir [Sauvegarde et retour arrière](BOT_MODE_ROLLBACK.md).

> **Vous installez BOT MODE sur une machine précise ?** Commencez par le **[guide d'installation par système](BOT_MODE_INSTALL_PAR_MACHINE.md)** : Chromebook/Crostini, Ubuntu/Xubuntu, Debian, Fedora, macOS ou Windows/WSL2. Il détaille la préparation de Docker et la sélection automatique Lite/Full. Cette page décrit ensuite le fonctionnement et les vérifications de BOT MODE.

## 1. Vérifier les prérequis

- **Linux AMD64/ARM64**, y compris ChromeOS avec Linux (Crostini), pour les chemins de distribution vérifiés. macOS avec Docker Desktop et Windows avec WSL2 ont des chemins possibles, mais n'ont pas bénéficié de la même qualification matérielle.
- Git, Docker Engine démarré, Docker Compose **v2** et OpenSSL.
- Port **3080** libre et connexion Internet pour récupérer les images.
- De l'espace disque pour l'image et les volumes persistants, avec une marge libre après téléchargement.
- **Node.js et npm ne sont pas nécessaires** pour utiliser l'image publiée.

```bash
git --version
docker --version
docker compose version
docker info >/dev/null
openssl version
```

Si `docker info` échoue, corriger l'accès au démon Docker **avant** de lancer l'installation. Sur ChromeOS, Linux/Crostini doit être activé.

## 2. Télécharger la bonne version

**Ne clonez pas la branche mouvante `main`** pour une installation reproductible. Le couple validé est :

| Élément | Référence |
| --- | --- |
| Tag Git | `v1.0.4` |
| Commit complet | `aface7a55ab9609392d0bb8e7e90553e3db2926c` |
| Image Docker AMD64/ARM64 | `ghcr.io/arkos77/librechat-botmode-v1@sha256:c3d7caa1cf23158d4b2e6fabcc0d3f740507620805fcf254dbd721675b8350ff` |
| Release officielle | [v1.0.4](https://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v1.0.4) |

```bash
git clone --branch v1.0.4 --depth 1 \
  https://github.com/Arkos77/LibreChat-BOTMODE-V1.git

cd LibreChat-BOTMODE-V1

test "$(git rev-parse HEAD)" = \
  aface7a55ab9609392d0bb8e7e90553e3db2926c
```

La commande `test` ne produit rien si la révision est bonne et échoue si elle diffère. **Arrêtez l'installation en cas d'échec.**

## 3. Installer en mode Lite (Chromebook, petites machines, CPU-only)

```bash
BOTMODE_HOST_BIND_IP=127.0.0.1 ./install.sh --lite --image \
  ghcr.io/arkos77/librechat-botmode-v1@sha256:c3d7caa1cf23158d4b2e6fabcc0d3f740507620805fcf254dbd721675b8350ff
```

L'installateur :

1. vérifie l'environnement Git, Docker, Compose, l'architecture, la RAM et le profil choisi ;
2. crée `.env` s'il n'existe pas, sans écraser une configuration préexistante ;
3. génère les identifiants de base de données nécessaires à une installation neuve sans les afficher ;
4. choisit **l'image BOT MODE** publiée depuis le code attendu, et non une image LibreChat upstream générique ;
5. lance la stack Lite : **API LibreChat/BOT MODE, MongoDB 4.4 et Redis 7**, avec volumes de données persistants ;
6. vérifie l'authentification de la base de données avant de déclarer l'installation achevée.

Le mode Lite réduit les services locaux, notamment sur les CPU x86_64 sans AVX. Les services RAG et de recherche locaux lourds ne font pas partie du profil Lite par défaut.

**Alternative pour un hôte compatible Full** (au moins 4 Gio de RAM, AVX sur x86_64) :

```bash
BOTMODE_HOST_BIND_IP=127.0.0.1 ./install.sh --full --image \
  ghcr.io/arkos77/librechat-botmode-v1@sha256:c3d7caa1cf23158d4b2e6fabcc0d3f740507620805fcf254dbd721675b8350ff
```

Le profil Full active d'autres services ; ses intégrations externes ne sont pas toutes qualifiées sur du matériel réel. Pour un petit ordinateur, commencer par **Lite**.

**Réseau et sécurité v1.0.4 :** Docker Compose limite par défaut l'API (3080) et le panneau d'administration Full (3000) à `127.0.0.1`. La commande explicite ci-dessus permet de conserver ce réglage dans `.env` pour les redémarrages. L'accès distant exige un proxy TLS, une authentification, `TRUST_PROXY` adapté au nombre de proxys et des journaux d'accès ne révélant pas les paramètres OAuth `code`/`state`.

## 4. Configurer le fournisseur et démarrer la mission

1. Après installation, **ouvrez localement** le fichier `.env` créé dans le dossier du projet. Ajoutez uniquement les clés des fournisseurs que vous avez choisi d'utiliser. Ne copiez jamais ce fichier dans un ticket, une capture ou un commit Git.
2. Si vous modifiez les clés après un premier démarrage, redémarrez la stack avec les commandes ci-dessous. `stop.sh` ne supprime pas les volumes.
3. Ouvrez **http://localhost:3080**. Créez votre premier compte LibreChat, puis configurez le Worker BOT MODE et ses spécialistes depuis l'interface d'initialisation native.
4. Sélectionnez un fournisseur et un modèle effectivement disponibles et autorisés.

```bash
./stop.sh
./start.sh
./doctor.sh --lite
```

**Modèles et coût :** le routage natif par défaut privilégie des modèles OpenRouter **explicitement gratuits** ; il ne déclenche pas de fallback payant sans autorisation. Une clé/fournisseur valide reste nécessaire, et la disponibilité ainsi que les quotas des modèles gratuits peuvent varier.

**Contrôle de la chaîne :** demande utilisateur → Recherche → Analyse → Synthèse → Oracle → P6 → réponse. Un test réel de cette chaîne à trois étapes a été validé sur le Chromebook ; il ne constitue pas une preuve que toutes les intégrations optionnelles sont actives.

## 5. Commandes courantes

```bash
./install.sh --help       # Aide de l'installateur
./doctor.sh --lite        # Diagnostic et état des conteneurs Lite
./stop.sh                 # Arrête la stack sans supprimer les volumes
./start.sh                # Redémarre avec l'image configurée
```

Autres modes :

```bash
./install.sh --no-start   # Prépare et télécharge sans démarrer
./install.sh --lite       # Choisit automatiquement le tag sha-<commit> correspondant à Git
```

Le **tag Docker `sha-aface7a55ab9` existe** et correspond au digest de `v1.0.4`. Le paramètre explicite `--image ...@sha256:...` reste recommandé pour figer l'image exacte. Les alias `stable` et `latest` ne doivent pas servir de référence pour cette version.

`./update.sh` **refuse** un checkout Git épinglé à un tag (HEAD détaché). Pour mettre à jour une installation existante, ne forcez pas la commande : suivre une procédure de sauvegarde et de changement de version explicite.

## 6. Sauvegardes, migration et retour arrière

Si votre machine utilise déjà LibreChat, BOT MODE ou des volumes Docker portant des données :

- **Ne lancez pas ces commandes par-dessus une installation existante sans examen préalable.**
- Inventoriez les conteneurs, volumes nommés, ports et fichiers `.env` / `librechat.yaml`.
- Sauvegardez MongoDB, Redis, les fichiers, les volumes d'uploads et les configurations, puis testez la restauration.
- Ne modifiez pas les identifiants de bases existantes au hasard. Le bootstrap refuse volontairement une migration d'authentification incertaine.
- Ne faites **jamais** `docker compose down --volumes`, `docker volume prune` ou `git clean -fdx` pour contourner un incident.
- Pour revenir à une ancienne image, vérifiez aussi la compatibilité des **schémas de données** ; revenir au conteneur précédent ne suffit pas toujours.

Voir [le plan de retour arrière](BOT_MODE_ROLLBACK.md).

## 7. Vérifications et limites de qualification

Les preuves directement rattachées au commit/source de la release :

- [Image multiarchitecture publiée, pull public, API Lite et GitHub Release — PASS](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/42321927636).
- [Installation Lite fraîche, vérification des scripts et restauration MongoDB — PASS](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/42298001610).
- [Audits Git/secrets, dépendances et Docker — PASS](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/42298001610).
- Le moteur Oracle/P6 et l'affichage ont été validés sur une mission réelle à trois spécialistes. La dernière correction de formulation Oracle a été testée automatiquement et livrée dans l'image, sans nouvelle mission LLM après cette seule retouche.

**À ne pas confondre avec une certification de sécurité intégrale :** les alertes CodeQL #328, #330 (limitation OAuth) et #63 (callback GET) de la candidate restent ouvertes avec mesures compensatoires et acceptation encadrée dans [l'issue #154](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/154). Les risques des composants tiers et leurs licences peuvent différer de la licence MIT du dépôt. Voir [décisions de risques](BOTMODE_V1_NPM_RISK_DECISION_20261014.md), [procédure de publication](BOT_MODE_PUBLIC_RELEASE.md) et [mentions de tiers](../THIRD_PARTY_NOTICES.md).

## 8. Versions historiques

Les anciens guides et preuves V1.0.0 / V1.0.1 / V1.0.2 documentent l'historique du projet, **pas l'installation recommandée aujourd'hui**. Pour une installation nouvelle, utiliser exclusivement le couple source **v1.0.4** et image par digest donné en haut de cette page.

Ce projet est un **fork communautaire de LibreChat**, et non la distribution officielle du projet LibreChat upstream.
