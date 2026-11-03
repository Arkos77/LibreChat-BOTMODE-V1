# BOT MODE V1 simplifiée — décision sur la persistance des spécialistes (02/11/2026)

## Preuves acquises

La mission réelle OpenRouter gratuite sur Chromebook 3081 a démontré : Worker → spécialiste → résultat persisté dans le message parent → Oracle VERIFIED → une publication finale P6. Voir `docs/BOTMODE_V1_REAL_FREE_CHROMEBOOK_20261102.md` et le checkpoint GitHub de la PR #107, commentaire 6583984181. Aucune conversation enfant autonome Mongo avec `subagentThread.parentConversationId` n'a été retrouvée sur ces essais : cette garantie est NON CONCLUANTE, pas PASS.

## Décision de périmètre V1

Pour déclarer une mission simple **terminée**, ne pas imposer un transcript enfant Mongo autonome lorsque le résultat du spécialiste est enregistré dans le message parent, la vérification Oracle est VERIFIED et P6 publie une seule finale. Conserver le système de conversations enfants existant et son comportement, mais ne pas l'inscrire comme critère obligatoire du parcours simple validé.

Cette décision **ne certifie pas** la reprise d'une conversation enfant après interruption et **ne supprime aucun contrôle**. La reprise de tâches actives, l'isolation tenant/utilisateur, les ACL, le contrôle d'annulation, les leases/fences, la suppression cohérente de conversations et le suivi des résultats doivent continuer à fonctionner avant toute promotion stable. Une mission demandant explicitement une reprise de thread enfant doit être qualifiée séparément.

## Vérification des dépendances de sécurité, sans mutation

- `api/server/services/Endpoints/agents/subagentThreadStore.js` relie l'état enfant à Mongo (lease, claim et release, owner admission fence, save/get, cancel), aux événements et au drainage à l'arrêt.
- `api/server/middleware/validate/subagentThreadTurn.js` applique le contrôle d'un tour enfant et la condition de reprise humaine `requires_action` avec identité utilisateur/tenant.
- `api/server/routes/convos.js` expose consultation, activité et contrôle des threads enfants et intègre leur annulation à la suppression de conversations.
- `packages/api/src/agents/subagentThreads.ts` et `packages/api/src/agents/guard.ts` portent les contrôles natifs correspondants.

En conséquence : **ne pas supprimer ces mécanismes en V1**. Leur retrait serait un changement fonctionnel et de sécurité distinct, non justifié par le seul constat d'absence de transcript dans les deux tests live.

## Statut et suites

- PASS : parcours simple réel gratuit, résultat enfant dans parent, Oracle et P6.
- NON CONCLUANT : transcript enfant autonome / reprise de ce transcript, outils `web_search`, `file_search`, `execute_code` en exécution réelle.
- À FAIRE : qualification ciblée des outils indispensables ; contrôle release de la candidate, sans retester inutilement la mission déjà PASS.
- NO-GO stable tant que le périmètre de release et les contrôles finaux ne sont pas approuvés.

Aucun nouveau runtime, broker, service RAG/Code ou image Docker requis par cette décision ; préserver le port 3080, les images et sauvegardes de rollback.
