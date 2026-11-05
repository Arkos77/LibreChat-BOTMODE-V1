# BOT MODE — Données, confidentialité et effacement (projet de notice publique)

> **Version de travail — lot 8 de [la qualification publique #141](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/141), 5 novembre 2026.**
> Ce document est un inventaire **fondé sur le code du dépôt**, et non une certification RGPD, une politique de conservation déployée ni la preuve que toutes les données ont été effacées. Ne pas le présenter comme une garantie de conformité ou l'intégrer à une annonce de release avant validation.

## Périmètre et responsabilités

BOT MODE est distribué sous la forme d'un logiciel **auto-hébergé**. L'opérateur de l'installation décide des utilisateurs admis, du réseau accessible, des fournisseurs de modèles, des sauvegardes, de leur conservation et du traitement des demandes de suppression. Une instance volontairement exposée sur Internet, accessible à des tiers, exige en plus une politique de confidentialité adaptée à l'opérateur, un cadre juridique et des contrôles d'exploitation.

**Lite** utilise les services définis dans `docker-compose.botmode.yml` et `docker-compose.botmode-lite.yml` (MongoDB, Redis persistant, volumes de fichiers/journaux). **Full** active également les composants de recherche et de RAG/embeddings configurés (Meilisearch, PostgreSQL/pgvector, service RAG). La liste précise des conteneurs et des destinations dépend du profil et de la version réellement déployés.

## Inventaire des traitements visibles dans le code

| Données ou traces | Source/stockage observé | Mécanisme de contrôle présent | Limites à vérifier |
| --- | --- | --- | --- |
| Compte, session, clés d'accès | MongoDB, collections et méthodes utilisateurs/sessions | Suppression de compte, sessions et clés dans `api/server/controllers/UserController.js` | Durées de session, journaux, comptes SSO et confirmations effectives |
| Conversations, messages, appels d'outils | MongoDB, checkpoints des tâches et journaux associés | `DELETE /api/convos/all` et suppression de compte drainent les tâches, puis suppriment les enregistrements concernés | Résilience aux erreurs partielles, fichiers partagés, caches et répliques |
| Mémoires personnelles/par agent | MongoDB (partitions utilisateur / agent) | `GET/DELETE /api/memories`, `deleteAllUserMemories` lors de suppression de compte | Reprise durable, cohérence des partitions et éventuelles copies en backup |
| Fichiers et pièces jointes | Volume `botmode-uploads` et métadonnées | Nettoyage de fichiers et liens partagés lors de suppression du compte | Backend distant éventuel, copies référencées, RAG/exports et backups |
| Exécutions, missions programmées | Sessions, Redis, messages/checkpoints et planifications | Barrières de suppression, interruption des tâches en cours et purge de plusieurs registres | Réplicas/redémarrages, échecs de purge, ressources externes |
| Recherche, index et embeddings (Full) | Meilisearch, PostgreSQL/pgvector et service RAG selon configuration | Services séparés ; clé d'embedding RAG distincte et soumise à consentement explicite | Purge propagée des index/vecteurs, vérification multi-tenant, rétention des prestataires |
| Journaux et diagnostics | Volume `botmode-logs`, logs des conteneurs et du système hôte | Conteneur/volume dédiés | PII éventuellement journalisée, durée de conservation/rotation et accès exploitant |
| Copies de sauvegarde | `scripts/botmode/backup.sh` crée une archive MongoDB hors du dépôt et son empreinte SHA256 | Archive immuable, restauration contrôlée par `scripts/botmode/restore.sh` | **Une suppression de compte ne purge pas automatiquement les archives antérieures.** L'opérateur doit établir durée, chiffrement, accès, suppression et restauration sûre. |

## Fournisseurs externes et circulation des données

Les modèles et services externes **ne sont pas locaux par défaut** : lorsqu'un utilisateur ou un opérateur sélectionne un fournisseur cloud, des extraits de prompts, de conversations, des données d'outils ou des documents peuvent lui être transmis pour la fonction demandée. Les endpoints configurables figurent notamment dans `librechat.yaml` (dont OpenRouter, Gemini et autres choix). La politique de conservation de chaque fournisseur doit être examinée séparément. Le projet ne peut pas garantir l'effacement chez un tiers à partir de son seul endpoint local de suppression.

Le profil Full dispose d'un accès RAG/embeddings distinct ; `docker-compose.botmode.yml` utilise `BOTMODE_RAG_APPROVED_EMBEDDINGS_API_KEY` plutôt qu'une clé de modèle générique pour autoriser explicitement un prestataire d'embeddings. Les paramètres de connexion externes, MCP, recherche Web et autres outils peuvent transférer les données nécessaires à leur exécution et doivent être évalués selon leur configuration réelle.

La **voix avancée et JARVIS** ne font pas partie de la qualification de la distribution Lite prioritaire : ne pas annoncer un traitement vocal local, une absence de conservation audio ni une politique de consentement non vérifiés.

## Suppression et contrôles disponibles

- Les routes de suppression mémoire ciblent l'utilisateur authentifié dans `api/server/routes/memories.js`, et `api/server/controllers/UserController.js` supprime notamment sessions, messages, conversations, clés, mémoires, fichiers, agents, planifications et liens partagés.
- La suppression du compte avec MFA activée requiert une vérification OTP ou un code de secours ; le code essaie d'interrompre les missions et planifications avant effacement.
- **L'effacement n'est pas prouvé globalement** : la fonction de suppression tolère certains échecs de nettoyage (par exemple checkpoints et environnements de code externes) et peut conserver des traces de diagnostic. Les sauvegardes et copies chez des prestataires externes doivent être gérées séparément.
- Le dépôt ne documente pas encore une **durée unique de conservation par défaut** pour toutes les catégories ; aucune durée n'est inventée ici.
- L'existence de fonctions d'export/suppression et leur réussite sur une candidate **réelle** doivent être démontrées avant de promettre un « droit à l'export » ou un effacement complet automatisé.

## Travaux de qualification avant GO public

1. Tester, sur une instance CI **jetable**, la suppression d'un compte avec conversations, fichiers, mémoires partagées et par agent, appels d'outils, tâches interrompues et planifications ; inspecter les données MongoDB/Redis après suppression.
2. Vérifier Full séparément : purges des index Meilisearch, métadonnées du RAG, embeddings dans pgvector et copies externes ; documenter ou refuser les promesses non prouvées.
3. Définir/implémenter une politique de rotation des journaux, de stockage des fichiers et de conservation des sauvegardes, et clarifier les politiques selon les fournisseurs externes sélectionnés.
4. Vérifier les scénarios d'erreur lors d'un effacement (DB inaccessible, backend fichiers distant, worker externe non joignable, interruption et reprise). Une API 200 ne prouve pas l'absence de données résiduelles dans tous les systèmes.
5. Établir la séparation des responsabilités éditeur du code / opérateur auto-hébergeur, les informations et contrats éventuellement nécessaires pour un service public et les demandes RGPD, avec conseil juridique si requis.
6. Relier preuves, SHA et logs sanitizés à [l'issue #141](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/141). Ne jamais joindre de véritables données personnelles ou de secrets aux artefacts de CI.

**État : lot 8 NON CONCLUANT.** Cette page sert à rendre le périmètre testable et les limites explicites, pas à promettre une certification de confidentialité.
