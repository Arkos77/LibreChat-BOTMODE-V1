# BOT MODE — résultat et provenance des recherches

## Périmètre

Ce lot complète le correctif de mode durable déjà installé. L’admission serveur impose un résultat non vide à chaque tâche BOT MODE. Les critères de réussite existants, preuves indépendantes et demandes de revue humaine sont conservés ; le client ne peut pas remplacer la réussite par ok=false.

Pour les objectifs qui demandent web_search, le serveur impose research-v1 : un champ result non vide et un champ scalaire sources contenant les URL HTTP(S), une par ligne. Ces URL doivent être citées dans result et présentes dans les artefacts structurés d’un appel natif terminé pour cette tâche. Un JSON textuel de recherche, un outil en erreur, un autre nœud ou un lien inconnu ne donnent aucune preuve de provenance. L’admission vérifie la présence effective de web_search dans les outils initialisés, définitions ou registre autorisés.

Le buffer existant conserve séparément preuve de critère et URL pour un même appel. Les observations sont bornées, isolées par tâche, copiées, vérifiées lors de la persistance et contrôlées contre les conflits de replay. L’état Oracle durable existant porte ces observations optionnelles ; aucun nouveau service ou orchestrateur n’est ajouté. Le contexte auparavant inline dans l’initialisation est extrait dans un module TypeScript testé directement.

## Vérifications locales

- 117 tests ciblés API dans 10 suites et 392 tests hôte dans 4 suites réussis.
- Typage complet du workspace API, lint sans avertissement, imports, format et diff vérifiés.
- Revue indépendante unique par lot ; les cas Important ont chacun été reproduits puis corrigés, sans seconde campagne de revue.
- Limite de l’environnement : la tentative initialize.spec.js ne peut démarrer MongoMemoryServer (code100), bloquant 93 tests. Ils ne sont pas déclarés réussis ; les fonctions extraites sont testées hors base. Le comportement intégré reste à qualifier dans l’image exacte.
- Aucun fournisseur externe, image reconstruite, publication ou installation pour ce nouveau lot à ce stade. La version installée précédente reste conservée.

## Portée du verdict

La présence d’un résultat et la provenance d’un lien sont vérifiables. Elles ne prouvent pas qu’une page confirme chaque affirmation, qu’un paiement arrivera sous quatre jours ou qu’une synthèse ne contient aucune erreur. Les contrats scalaires historiques restent compatibles ; les critères spécifiques aux livrables et la recette réelle restent des validations distinctes. Aucune promotion stable/latest ni validation globale de BOT MODE n’est décidée.
