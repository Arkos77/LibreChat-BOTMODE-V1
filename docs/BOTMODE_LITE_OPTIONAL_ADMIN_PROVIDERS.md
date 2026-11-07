# BOT MODE Lite — administration facultative des fournisseurs IA

> **Statut : candidat en qualification (PR #157).** Ne modifie pas une installation en cours sans sauvegarde et décision de déploiement. Aucune exécution sur les machines utilisateurs pendant la qualification GitHub.

## Pourquoi le bouton d'ajout n'apparaît pas dans le chat

Le sélecteur de modèles LibreChat sélectionne des fournisseurs **déjà configurés**. Il n'est pas un éditeur de fournisseurs. `apiKey: user_provided` permet d'entrer une clé personnelle pour un fournisseur déjà déclaré, **pas de créer ce fournisseur**.

Le panneau d'administration officiel est un service distinct. BOT MODE Lite le désactive au démarrage normal pour préserver la RAM. Le profil optionnel `admin` permet de démarrer **uniquement ce service existant**, sans activer Meilisearch, RAG ou pgvector.

## Préparation (opérateur uniquement)

1. Sauvegarder le `.env`, le `librechat.yaml` et la base MongoDB de l'instance à configurer. Ne jamais copier ni publier ces secrets dans GitHub.
2. Vérifier que l'image de l'API et le panneau d'administration sont compatibles, et que l'utilisateur LibreChat dispose réellement du rôle ADMIN ou de `access:admin`.
3. Définir **en privé**, dans le fichier `.env` local, `ADMIN_PANEL_SESSION_SECRET` avec au moins 32 caractères aléatoires, et conserver ce secret. Ne pas remplacer une valeur existante. Pour une interface locale HTTP, `ADMIN_PANEL_SESSION_COOKIE_SECURE=false` peut être nécessaire ; utiliser HTTPS et le cookie sécurisé hors accès local. Le panneau est lié par défaut à `127.0.0.1` via `BOTMODE_ADMIN_PANEL_BIND_IP`.
4. Choisir `ADMIN_PANEL_PORT` si le port 3000 est déjà occupé. Vérifier que `DOMAIN_CLIENT` renvoie vers **la même instance API** (port Lite hôte et URL navigateur), et qu'aucun autre LibreChat n'est ciblé.

## Démarrage sur une installation Lite **déjà mise à jour et qualifiée**

À exécuter **dans le dossier de la même instance BOT MODE**, après décision explicite de déploiement :

```bash
docker compose -f docker-compose.botmode.yml -f docker-compose.botmode-lite.yml --profile admin up -d admin-panel
```

Ouvrir `http://127.0.0.1:3000` (ou le port `ADMIN_PANEL_PORT` choisi), se connecter avec le compte ADMIN, puis ouvrir la configuration des endpoints personnalisés. Ajouter le nom, la base URL, les modèles et la méthode de clé du fournisseur souhaité. **Ne pas enregistrer de clé en clair dans le dépôt** ; utiliser la saisie sécurisée du panneau ou une référence d'environnement autorisée.

Le backend LibreChat dispose déjà de routes d'administration avec vérification des capacités et de protections des secrets. L'affichage du fournisseur dans le sélecteur et l'inférence réelle doivent être validés séparément. Un fournisseur nécessitant une API incompatible avec le protocole choisi ne devient pas compatible simplement en renseignant une URL.

## Arrêter uniquement le panneau facultatif

```bash
docker compose -f docker-compose.botmode.yml -f docker-compose.botmode-lite.yml --profile admin stop admin-panel
```

Cette commande **n'arrête pas BOT MODE**. Éviter `docker compose down` pour désactiver le panneau : cela arrêterait aussi les autres services.

## Critères de qualification avant mise à jour publique

- Le démarrage Lite **sans** `--profile admin` n'active pas le panneau.
- Le profil optionnel n'active pas les services Full Meili/RAG/pgvector.
- Le panneau ne démarre pas avec un secret de session absent.
- Le login ADMIN est autorisé, le non-admin refusé ; création/modification d'un endpoint personnalisé et lecture masquée des clés vérifiées.
- Les tests d'inférence, modèles et permissions restent distincts du simple enregistrement de configuration.
- Mesurer la mémoire du panneau optionnel avant de le recommander pour un Chromebook à faible RAM.

Documentation LibreChat : https://www.librechat.ai/docs/configuration/admin_panel et https://www.librechat.ai/docs/configuration/librechat_yaml.
