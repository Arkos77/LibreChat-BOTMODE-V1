# BOT MODE MJK V13 — Vérifier les mises à jour depuis Paramètres → About

La V13 ajoute un bloc **« Mises à jour BOT MODE »** à l'onglet **About** des paramètres, à la demande de l'utilisateur.

## Fonctionnement

Le bouton **« Vérifier les mises à jour »** interroge les releases officielles du dépôt `Arkos77/LibreChat-BOTMODE-V1` sur GitHub, **seulement après un clic**.

- La distribution installée est identifiée comme **BOT MODE V1.0.6**. La version `v0.8.8-rc2` visible juste au-dessus est celle du moteur LibreChat ; elles ne doivent pas être confondues.
- Quand la dernière release GitHub est identique : « BOT MODE V1.0.6 est à jour parmi les releases officielles ».
- Quand une version stable plus récente existe : son numéro est affiché avec un lien direct vers ses notes de publication.
- Si le réseau ou GitHub est indisponible : message d'indisponibilité, sans prétendre que la version est à jour.
- Un lien **« Notes des versions »** reste disponible indépendamment de la recherche.
- Le bloc s'affiche dans les modes **clair et sombre**, y compris après réouverture des paramètres, avec état accessible au lecteur d'écran.

**Sécurité :** aucune installation, aucun téléchargement d'exécutable, aucun redémarrage et aucune modification de fichier ou de Docker au clic. La requête GitHub est `GET` avec `credentials: 'omit'`, déclenchée manuellement ; aucun secret du serveur n'est transmis. L'interface n'exécute aucune commande reçue depuis Internet.

**Limite :** ce contrôle regarde uniquement la **dernière GitHub Release stable**, et non les nouveaux commits de `main`, les correctifs visuels séparés ou les avis de sécurité. Installer réellement une mise à jour nécessite un nouveau lot : sauvegarde des données, contrôle de compatibilité, validation sur 3081, puis déploiement autorisé sur 3080.

## Architecture et compatibilité

La V13 réutilise l'intégralité des éléments validés MJK V10 → V12 : logo flamant rose, globe de connexion, initiales roses, palette sombre et claire, ports et volumes. Deux petits fichiers sont ajoutés dans `branding/mjk-v13` :

- `update-check.js` : insertion idempotente du bouton dans le composant About existant, sans recompilation du bundle React.
- `update-check.css` : style de la carte et états interactifs.

Le script ne s'ajoute que si un dialogue contient les lignes « Version » et « Commit ». La reconstruction utilise l'image V1.0.6 figée au digest :

`sha256:e3640ac10833e4743796589b53d8a935d94867d73b0c25e82b4e7e1eba985cdb`

**Ne pas réutiliser cet index HTML sur une autre version de LibreChat sans requalification.**

## Installation et retour arrière

Après sauvegarde des configurations, des informations d'inspection et des données :

```bash
python3 scripts/branding/stage-v13.py

# Chromebook Crostini — instance de test puis instance principale
python3 scripts/branding/deploy-v13-compose.py --container botmode-v100-test-api-1 --port 3081 --confirm
python3 scripts/branding/deploy-v13-compose.py --container librechat-botmode-api-1 --port 3080 --confirm

# Mac Xubuntu — instance de test Compose
python3 scripts/branding/deploy-v13-compose.py --container botmode-v1-mac-litepp-api-1 --port 3081 --confirm

# Mac Xubuntu — instance principale standalone uniquement
python3 scripts/branding/deploy-v13-host-mac.py
```

Les noms de conteneurs ne sont valables que pour les deux machines qualifiées, pas pour toute installation tierce. Les scripts préservent les volumes et prévoient un retour arrière sur la configuration précédente. Ne jamais publier de fichiers `.env`, d'inspections Docker complètes ou de sauvegardes de base de données.

Sauvegardes locales : `~/BOTMODE-BACKUPS/pre-updates-v13-20261111/`.

## Validation du 11 novembre 2026

- Mac Xubuntu et Chromebook Crostini AMD64 : **4/4 PASS HTTP 200** (ports 3080 et 3081), digest de l'image inchangé et **montages des données inchangés**.
- Index HTML V13 identique sur les deux machines et reproductible à l'octet depuis le dépôt : SHA-256 `7d2a0a9bed63abe41b5a229546efaca51af4911e767cfd1ae2ecc9980d811ff1`.
- Tests Chromium sur la version réellement servie : desktop 1280px et mobile 390px, mode sombre/clair, **bouton unique** même après réouverture, aucune erreur JavaScript ni débordement horizontal.
- Tests de trois scénarios réseau : release identique, release supérieure, erreur GitHub : PASS.
- Test réel via le bouton et l'API GitHub : **V1.0.6 dernière release**, à la date de qualification.
- Pas de modification de MongoDB, des permissions MCP, des agents ou de JARVIS/PangaraBOT.

L'inspection visuelle dans la session authentifiée reste une étape distincte des tests simulés. Le tag et la GitHub Release officiels V1.0.6 ne sont pas modifiés.
