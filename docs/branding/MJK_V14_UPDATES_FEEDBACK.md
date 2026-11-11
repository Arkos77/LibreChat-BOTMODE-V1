# BOT MODE MJK V14 — Retour visible de « Vérifier les mises à jour »

## Symptôme corrigé

Dans **Paramètres → About**, un clic sur « Vérifier les mises à jour » donnait un curseur de chargement, mais l'utilisateur ne voyait pas de résultat. Cela **ne signifie pas** que la version est à jour : toute recherche doit afficher un résultat explicite.

La V13 pouvait laisser le bouton avec son libellé habituel après la requête et afficher l'information uniquement dans un paragraphe discret. La V14 rend le résultat visible **sur le bouton lui-même** et dans un encadré juste au-dessus, et préserve le verdict si le dialogue React est recréé.

## Comportement V14

Après clic volontaire :
- **✓ BOT MODE est à jour** : V1.0.6 est la dernière GitHub Release stable.
- **↗ Nouvelle version disponible** : lien direct vers la release plus récente.
- **⚠ Vérification impossible** : GitHub inaccessible, erreur réseau ou délai dépassé, avec bouton toujours utilisable pour réessayer.

Pendant la demande, le bouton indique « Vérification en cours… » et est désactivé temporairement. Un délai maximal de **8 secondes** empêche un chargement silencieux prolongé. Aucune requête ne part sans clic ; le navigateur utilise `credentials: omit`. Le bouton ne télécharge ni n'installe rien, et n'exécute aucune commande locale.

La ligne de version interne LibreChat `v0.8.8-rc2` reste distincte de BOT MODE V1.0.6. Les mises à jour graphiques du dépôt `main` sont indépendantes des releases officielles ; cette fonction vérifie seulement `releases/latest`.

## Construction sans empilement

Réutiliser l'identité visuelle existante V10–V13. La V14 remplace seulement les ressources du composant d'updates V13 :
- `branding/mjk-v14/update-check.js` : état explicite et persistant durant les remontages de l'interface.
- `branding/mjk-v14/update-check.css` : encadré lisible sombre/clair et responsive.

Le générateur `scripts/branding/stage-v14.py` reconstruit le fichier HTML en réutilisant la V13, **sans ajouter un deuxième bouton, un autre service Docker ou des dépendances**.

## Installation sur les machines concernées

Après sauvegarde des fichiers de composition, des inspect Docker et des volumes :

```bash
python3 scripts/branding/stage-v14.py

# Chromebook (Compose) : test avant stable
python3 scripts/branding/deploy-v14-compose.py --container botmode-v100-test-api-1 --port 3081 --confirm
python3 scripts/branding/deploy-v14-compose.py --container librechat-botmode-api-1 --port 3080 --confirm

# Mac Xubuntu : test Compose puis instance principale standalone
python3 scripts/branding/deploy-v14-compose.py --container botmode-v1-mac-litepp-api-1 --port 3081 --confirm
python3 scripts/branding/deploy-v14-host-mac.py
```

Les noms correspondent aux deux machines personnelles qualifiées ; ne pas les appliquer automatiquement ailleurs. Le digeste de l'image V1.0.6 reste `sha256:e3640ac10833e4743796589b53d8a935d94867d73b0c25e82b4e7e1eba985cdb`. Le tag et la GitHub Release historiques restent inchangés.

## Preuves et limites

- Chromebook et Mac Xubuntu, ports **3080/3081 : 4/4 PASS HTTP 200**, instances V14.
- Tests Chromium sur le HTML effectivement servi : desktop 1280 px et mobile 390 px. Trois scénarios simulés (à jour, plus récent, GitHub indisponible) : PASS.
- Recréation du dialogue About : le dernier verdict reste visible. Aucun appel GitHub avant clic. Aucun débordement horizontal ni erreur JavaScript pendant les tests.
- Le système hôte peut contacter l'API GitHub (HTTP 200). Un test de demande réelle depuis le navigateur avait confirmé l'état V1.0.6 pour V13. **L'affichage authentifié dans ChromeOS après installation V14 nécessite encore réception humaine.**
- Reproduction du fichier depuis Git et les ressources V10–V13 : SHA-256 identique à celui des installations, `1c0d7baf1f8279bb93daa64704ec95a6bde532189b254339bed1ee811532480e`.
- Volumes, MongoDB, agents, permissions MCP et autres projets non modifiés.

**Retour arrière :** sauvegarde locale `~/BOTMODE-BACKUPS/pre-updates-v14-20261111/`, avec ancienne composition V13. Ne pas publier les sauvegardes ni les clés API.
