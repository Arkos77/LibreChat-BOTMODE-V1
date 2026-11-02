# BOT MODE V1 simplifiée — prompts métier et droits d'outils

**Checkpoint du 2 novembre 2026.** Branche `simplify/botmode-v1-lot-a-20261102` uniquement. L'installation ChromeOS Lite déjà validée (API+Mongo+Redis sur port 3081, digest `sha256:4e31fef8ec5e89bbb7f2668f39695cf76af85620cda306332e12a76c5fb242bc`) n'est PAS modifiée par ce lot de source.

## Correction de la seule chaîne native existante

`api/server/routes/agents/v1.js` définit maintenant les consignes complètes pour les **six rôles natifs** dans un objet de configuration statique, sans ajouter de moteur, modèle routeur, rang Bot 0–4, orienteur autonome, nouveau service ou 4C replay :

- **Worker** : seulement organisation, délégation native à **0/1/N spécialistes**, collecte, comparaison des preuves et synthèse finale. **Aucun outil métier direct : `tools: []`**. Ne jamais prétendre avoir mené une recherche ou un test sans résultat. Ne pas rejouer un provider incertain.
- **RECHERCHE** : faits, sources primaires, dates/fraîcheur, citations et incertitudes ; `tools: ['web_search']` uniquement.
- **ANALYSE** : choix, faisabilité, risques, dépendances, hypothèses versus preuves, recommandations ; `tools: []`.
- **CODE** : conception, changements limités, vérifications réelles, prudence sur production et secrets ; `tools: ['execute_code']` uniquement.
- **DOCUMENTS** : lecture du corpus autorisé et RAG, pages/sections, preuves et confidentialité ; `tools: ['file_search']` uniquement.
- **RÉDACTION** : livrable clair et adapté, respect des preuves, distinctions décision/proposition ; `tools: []`.

Le contrôleur de création natif LibreChat reste seul responsable de l'autorisation effective des outils et de l'ACL. La configuration conserve le choix explicite du fournisseur/modèle, les identités natives et le graphe de délégation existant. Aucun modèle payant ni appel distant n'est ajouté.

## Détection explicite des six anciens agents déjà créés

Le préflight GET `/agents/botmode/setup-status` conserve ses champs existants et ajoute **`configurationComplete`, `unconfiguredInstructions`, `unexpectedCapabilities`, `missingCapabilities`**. Les prompts génériques de l'ancienne création et les droits inattendus par rôle sont refusés comme preuve de complétude ; une consigne personnalisée de l'utilisateur n'est pas écrasée et n'est pas comparée à un texte canonique figé. Le POST `/agents/botmode/setup` ne donne plus `capabilitiesComplete=true` simplement parce que six agents existent et que les outils *minimaux* sont accordés : il inclut la détection des prompts insuffisants et des outils supplémentaires. Les éléments `created`, `existing` et les identifiants ne changent pas.

**Important** : aucune migration automatique. Les six agents du port 3081 déjà créés appartiennent à l'utilisateur et portent encore des consignes très courtes (59 à 79 caractères) et un Worker avec `web_search`. Ils restent en place jusqu'à **une procédure explicite d'édition autorisée** via le contrôleur natif, avec sauvegarde/version avant modification et contrôle du graphe. La publication d'une image de source corrigée ne suffit **pas**, à elle seule, à corriger ces documents MongoDB.

## Vérification de non-régression attendue

Tests ciblés seuls : validation pure des droits, routes HTTP (droits d'accès, première création, deuxième passage sans écraser, modèle gratuit), persistance MongoDB réelle via `mongodb-memory-server`. Les assertions exigent **six prompts métiers non vides** (tous >300 caractères), `Worker.tools=[]`, exactement les outils autorisés par chaque spécialiste, `configurationComplete=true` sur installation neuve et `false` pour un Worker ancien qui conserve un outil métier ou un spécialiste qui conserve un prompt générique. L'ancien inventaire doit rester intact si un deuxième setup est demandé.

**Verdict avant CI : NON CONCLUANT**. Ne pas réexécuter les E2E navigateur, Oracle/P6 ni source-built image tant que les tests de l'onboarding seul n'ont pas réussi. Maintenir la V1 stable **NO-GO**. La release `v1.0.1`, `main` et les environnements Chromebook/MacBook restent inchangés.

## Suppression du self-spawn conditionnel au fournisseur

L'ancien onboarding pouvait activer `Worker.subagents.allowSelf=true` uniquement lorsqu'il lisait `openrouter/free`, créant un mode de délégation implicite distinct des cinq spécialistes enregistrés. En V1 simplifiée, **`allowSelf=false` pour tous les fournisseurs**, y compris OpenRouter gratuit : seulement les cinq spécialistes déclarés et autorisés peuvent être délégués, avec sélection de 0/1/N selon la mission. Ce correctif ne choisit pas un fournisseur payant, n'ajoute aucun modèle et n'affecte pas la capacité native de déléguer aux cinq agents. Les tests de persistance Mongo et du parcours HTTP gratuit vérifient que l'auto-délégation n'est plus activée.
