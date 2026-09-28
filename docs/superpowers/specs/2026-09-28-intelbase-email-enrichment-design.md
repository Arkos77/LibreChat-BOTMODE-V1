# IntelBase email enrichment — design

Date: 2026-09-28
Status: design approuvé en conversation ; implémentation non commencée.

## Intention et réussite

Ajouter IntelBase.is comme fournisseur OSINT externe optionnel de BOT MODE dans le runtime natif LibreChat. Le premier usage est une recherche ciblée `osint.email.enrich`, en lecture seule, pour un acteur et une finalité autorisés. BOT MODE conserve Policy/Auth, Task Engine, décision, stockage durable et Oracle. Une réponse IntelBase est une observation, jamais une permission, une identité confirmée ou un verdict Oracle. Réussite : un appel autorisé produit une observation bornée et attribuée ; un appel non autorisé n'émet aucune requête ; les sorties sensibles ne gagnent ni MTO, ni Memory, ni logs, ni prompts par ce chemin.

## Sources et certitudes

- Documentation officielle : https://intelbase.is/docs décrit `POST https://api.intelbase.is/lookup/email`, `x-api-key`, adresse email, `timeout_ms` de 100 à 120000, `include_data_breaches` et sélection de modules. Clé payante et IP inscrite sur liste autorisée ; 400, 401, 403, 429 et 500 documentés.
- https://intelbase.is/pricing décrit quotas selon forfait et annonce bulk, monitoring et webhooks pour Business/Enterprise. Aucun contrat technique d'endpoint correspondant n'a été identifié dans la référence API consultée.
- https://intelbase.is/privacy-policy et https://intelbase.is/terms-of-service décrivent conservation de requêtes et résultats, possible conservation dissociée du compte sans durée définie, et transmission de l'email à des fournisseurs de données. L'usage est restreint par les conditions du service, notamment l'interdiction de recherches visant des mineurs.
- Dans le checkout `5417d88`, `packages/api/src/agents/orchestrator/routing.ts` classe des candidats déjà autorisés ; `api/server/services/ToolService.js` charge les outils par agent ; `api/server/services/MCP.js` et `packages/api/src/mcp/MCPManager.ts` constituent le chemin MCP. `packages/api/src/mcp/authority` est une preuve d'autorité à déploiement désactivé par défaut. `packages/api/src/agents/oracle/types.ts` fournit la frontière de preuve Oracle.

## Approches examinées

1. Adaptateur REST hôte, TypeScript dans `packages/api`, raccordement JS minimal dans `api` : retenu. Il correspond à l'API documentée et peut appliquer un contrôle des données avant l'envoi.
2. Exposer IntelBase comme serveur MCP : écarté pour cette tranche ; aucun serveur MCP IntelBase ni contrat de ses outils n'est prouvé. Un pont MCP inventé étendrait inutilement la surface d'exécution.
3. Appeler directement IntelBase depuis le routeur ou Oracle : écarté ; le routeur classe des ressources admissibles et Oracle vérifie des preuves, ils n'effectuent pas la recherche externe.

## Contrat de la tranche 1

Un adaptateur générique de fournisseur de recherche externe reçoit un contexte hôte explicite : identité propriétaire/tenant et tâche lorsqu'elle existe, capability, finalité, classification des données, autorisation native et budget. Ces identités ne sont jamais déduites d'un `traceId`, d'un modèle ou d'une réponse fournisseur. Sa première implémentation IntelBase accepte exactement une adresse email validée et une intention de recherche bornée. Elle ne reçoit pas le corps libre de la conversation comme requête.

La politique d'envoi est appliquée avant toute connexion : fournisseur activé par configuration hôte, acteur et périmètre connus, permission positive, finalité admise, données minimales, interdiction des secrets et des recherches connues ou présumées visant un mineur, budget disponible. L'absence d'un contrôle nécessaire bloque l'appel. Le secret est résolu côté serveur au dernier moment par un mécanisme existant audité avant implémentation ; il ne traverse ni le modèle, ni le routeur, ni les événements. Aucun lookup réel n'est lancé par défaut.

L'appel HTTP utilise uniquement l'endpoint documenté, une limite de temps bornée et une réponse de taille limitée. Pour minimiser la collecte, `include_data_breaches` est désactivé dans cette première tranche ; l'enrichissement de comptes et la qualification d'exposition éventuelle demandent des contrats distincts. Les `401` (qui recouvrent clé, forfait, IP et quota journalier), `403`, `429`, erreurs de serveur et délais sont des issues distinctes et bornées, sans réessai automatique susceptible de multiplier les recherches. Aucun diagnostic ne doit reproduire la clé, l'email, les données retournées ou un corps d'erreur arbitraire.

La normalisation utilise une allowlist réduite : identifiant du fournisseur, capability, catégorie d'observation, source/module, date de récupération, dates de source si fournies, nombre borné d'indices de compte et statut de vérification initial. Les champs libres (`data`, profile, email, password, hash, login, IP, phone, autofill et fichiers) sont exclus de MTO/Memory/logs/prompts. Si une vue détaillée devient nécessaire, son stockage protégé, son ACL, son cycle de vie et sa suppression formeront une tranche séparée. Les éventuelles relations email→account demeurent des indices, jamais une identité vérifiée.

La vérification Oracle est séparée : un critère hôte, une preuve indépendante et une comparaison temporelle sont requis pour qualifier une conclusion. Un succès HTTP ou une confiance déclarée par IntelBase ne suffit pas. Aucun effet externe de remédiation ou publication n'est déclenché par la seule observation.

## Raccordement et limites

La sélection réutilise `AuthorizedResourceCandidate` uniquement après résolution/autorisation hôte. Le chemin d'outil reste lié à l'agent exécutant via `initialize.js` et `ToolService`. Les détails de raccordement à l'outil, de secret et de capacité seront arrêtés dans le plan après lecture des interfaces natives précises ; aucun nouveau Task Engine, runtime, registre global ou autorité MCP n'est introduit. Le mode sans configuration IntelBase garde exactement le comportement existant.

Hors tranche : username/domain lookup direct, breach et stealer logs, bulk, monitoring, webhooks, Evidence Graph durable, apprentissage automatique, fallback implicite et décision dynamique multi-provider. Leur statut demeure UNKNOWN ou À REVALIDER jusqu'à une documentation technique et une preuve de besoin.

## Tests et preuves attendues

- Refus avant transport pour configuration absente, permission/périmètre/finalité manquants, entrée invalide, secret dans l'entrée, risque mineur connu, budget insuffisant.
- Requête autorisée sur transport simulé : URL, méthode, en-têtes, corps minimal, délai et aucune fuite de clé ou d'email dans la télémétrie.
- Normalisation de réponses vides, multiples et malformées ; bornes de taille ; aucun mot de passe, hash, IP ou champ libre dans l'observation.
- Traitement distinct des réponses 400/401/403/429/500, délai et indisponibilité ; aucun retry automatique ; absence d'appel réel dans les tests.
- Attribution propriétaire/tenant/agent/tâche, isolation et reprise ; résultat fournisseur seul insuffisant pour un verdict Oracle accepté ; aucune mutation Task Engine depuis l'observation.
- Tests ciblés puis voisins, typecheck `packages/api`, builds concernés, ESLint et `git diff --check`. Un test live ciblé attend une configuration autorisée, une clé et une IP admissible, sans rechercher une personne tierce sans mandat.

## Risques et prochaine preuve

La politique publiée n'établit pas une durée de conservation bornée chez IntelBase ; elle déclare aussi des fournisseurs de données tiers. Les règles internes de finalité et de données sortantes doivent être fixées avant activation réelle. La prochaine preuve de code est le point précis de chargement de l'outil natif et du secret serveur, puis un test rouge qui démontre le refus avant le transport.

## Décision propriétaire du 28 septembre 2026 : adresses de tiers

Le propriétaire autorise la recherche d'adresses email de tiers. Le contrat n'est donc pas limité aux adresses qu'il contrôle. Par défaut, chaque lookup tiers devra être présenté pour une approbation humaine portant sur l'adresse exacte, la finalité, l'agent et le coût/plafond annoncé ; une édition de l'adresse ou de la finalité exige une nouvelle décision. Les cas connus ou présumés concernant un mineur restent refusés. Cette décision de produit n'est pas une approbation globale de requêtes futures ni une preuve que la cible est majeure.

L'audit du checkout montre que `AutonomyMandate` lie utilisateur, tenant, agent, conversation, capacité et durée, mais pas l'adresse ni la finalité. Le HITL natif peut demander une décision sur les arguments d'un appel et revérifier avant effet, mais aucun raccordement IntelBase ne fournit encore une approbation durable vérifiable par son adaptateur. `BudgetReservation` réserve des `tokenCredits` LibreChat ; il ne représente pas à lui seul le quota ni le prix IntelBase. L'outil demeure indisponible jusqu'à une preuve de liaison exacte à la décision humaine et à une règle hôte de budget fournisseur. Aucun identifiant de mandat ou de réservation ne doit être fabriqué à partir de la réponse du modèle.
