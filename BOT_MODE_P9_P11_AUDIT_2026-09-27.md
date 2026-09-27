# BOT MODE — audit P9/P11 du 27 septembre 2026

## État vérifié

| Frontière | Preuve dans le code | Conclusion |
| --- | --- | --- |
| Validation du modèle primaire | `initializeClient` appelle `validateAgentModel`, puis `initializeAgent` pour un seul agent. Le validateur vérifie que son modèle figure dans `modelsConfig[provider]`. | Catalogue de disponibilité pour le modèle sélectionné, pas une liste de bindings résolus et autorisés. |
| Model spec | `endpointOption.spec` sélectionne une entrée par nom dans `appConfig.modelSpecs.list`; les paramètres choisis sont fusionnés dans l'agent initial. | Une spec sélectionnée, pas plusieurs alternatives pour le même agent. |
| Agents connectés et sous-agents | `discoverConnectedAgents` forme la topologie; les sous-agents lazy sont validés à leur chargement. `createRun` convertit `agents` en `agentInputs` et edges du graphe. | Plusieurs membres de graphe ne sont pas plusieurs modèles interchangeables d'un même binding. |
| Reprise | `ResumeAgentController` rappelle `initializeClient` avec le job, le traceId MTO et le corps persistant. | Aucun pool de candidats distinct n'est restauré ni autorisé sur reprise. |
| P9 / P11 | `rankAuthorizedResources`, `routeAuthorizedModelBindings`, `createDecisionRecord`, `fromDecisionRecord` sont exportés et testés, sans appel hôte de production. | Contrats prêts pour une source hôte explicite; activation de production non prouvée. |

## Corrections de cette passe

- P9 rejette désormais tout candidat modèle dont `binding.agentId` est absent ou vide. Tous les candidats doivent avoir le même agent logique. Le test rouge reproduisait l'acceptation d'un binding sans identité.
- P11 exige un timestamp valide fourni par l'hôte. Le record n'invente plus l'heure courante, ce qui évite une observation différente lors d'un rejeu. Le test rouge reproduisait la génération implicite.

Ces corrections n'ajoutent aucune permission, aucun fallback implicite, aucun nouveau provider ni appel de production.

## Entrée nécessaire à l'activation

Un futur appel hôte devra fournir pour **un même agent logique** plusieurs bindings distincts, chacun résolu et autorisé par les mécanismes LibreChat existants (provider, modèle, credentials, ACL/capability et politique de budget). Il devra prouver cette admissibilité à l'initialisation **et à la reprise**, choisir la décision, puis fournir traceId, identité d'événement et timestamp du record P11. Le routeur ne doit jamais interpréter `agentInputs`, `modelSpecs.list` ou le catalogue global comme cette autorisation.

La prochaine preuve est un producteur réel de ces bindings dans l'hôte. En son absence, P9/P11 restent des contrats opt-in fail-closed; aucun choix de modèle n'est fabriqué pour produire un événement DECIDED.
