# Correctif MJK V12 — Avatar à initiales réellement rose

**But :** corriger le problème observé sur Chromebook : l’avatar du compte reste vert malgré un halo rose/bleu. Il ne s’agit pas d’un défaut des initiales, mais de la couleur incluse dans le SVG généré par DiceBear.

## Correction

Le code natif de LibreChat génère un avatar de type `data:image/svg+xml;utf8,…`, avec un rectangle contenant une couleur issue de sa palette et un texte blanc (par exemple `PB`). Le filtre CSS des versions précédentes ne suffisait pas à assurer la bonne couleur.

La V12 :
- repère **uniquement** l’image SVG DiceBear du bouton utilisateur `nav-user` ;
- remplace la couleur du rectangle de fond autorisée par `#F52999` (rose MJK), dans le navigateur ;
- conserve le texte SVG d’origine, donc les véritables initiales et leur couleur blanche ;
- conserve la bordure et le halo bleu/rose ainsi que le logo MJK supérieur ;
- laisse toute photo de profil personnelle, toute image non DiceBear et les autres avatars non concernés **inchangés** ;
- surveille les remontages du bouton au fil des changements de page, sans requête réseau ni modification du compte.

Le correctif consiste en un petit script embarqué dans le `index.html` V1.0.6. **Il n’ajoute aucun service Docker, aucun module npm ni aucun volume.** Le globe MJK V11 est conservé.

## Installation reproductible

La V12 réutilise les fichiers graphiques V10 et le globe V11, sans recopier tous ces assets sur Git.

```bash
# Depuis le dépôt V1, sauvegarder la configuration et inspecter les conteneurs.
python3 scripts/branding/stage-v12.py

# Chromebook, installation Compose existante : tester 3081 puis 3080.
python3 scripts/branding/deploy-v12-compose.py --container botmode-v100-test-api-1 --port 3081 --confirm
python3 scripts/branding/deploy-v12-compose.py --container librechat-botmode-api-1 --port 3080 --confirm

# Mac Xubuntu : tester d'abord l'instance Compose 3081.
python3 scripts/branding/deploy-v12-compose.py --container botmode-v1-mac-litepp-api-1 --port 3081 --confirm

# Mac 3080 : cas spécifique d'un conteneur standalone.
python3 scripts/branding/deploy-v12-host-mac.py
```

Les scripts vérifient la compatibilité avec l’image officielle V1.0.6 :

`sha256:e3640ac10833e4743796589b53d8a935d94867d73b0c25e82b4e7e1eba985cdb`

**Ne pas appliquer à une autre version sans requalification.** Les noms de conteneurs correspondent aux installations personnelles décrites, pas à toutes les installations LibreChat.

## Tests et limites

- **4/4 services locaux : PASS**. MacBook Xubuntu et Chromebook Crostini, ports 3080/3081 : HTTP 200, titre BOT MODE, code V12 et digest OCI attendus.
- **Reproduction : PASS**. L’index V12 généré depuis le dépôt possède exactement le même SHA-256 que les deux machines.
- **Navigateur Chromium simulé : PASS**. SVG DiceBear vert `#008577` devenu `#F52999`, initiales `PB` intactes, avatar non concerné et photo non modifiés.
- **Réception dans la session connectée du Chromebook : à confirmer visuellement** après rechargement complet.
- Modes clair/sombre, contraste et globe : V11 conservés sans nouvelles modifications.

La V12 ne change ni la base MongoDB, ni les volumes, ni les secrets, ni les comptes, ni les permissions MCP, ni la logique des agents. La release et le tag historiques V1.0.6 restent figés.

## Sauvegarde et retour arrière

Les fichiers V11 et les inspections sont conservés localement dans :

`~/BOTMODE-BACKUPS/pre-avatar-v12-20261111/`

Les scripts permettent de restaurer V11 si le contrôle ne passe pas. Ne pas publier les inspections Docker, les sauvegardes ou les configurations `.env`.
