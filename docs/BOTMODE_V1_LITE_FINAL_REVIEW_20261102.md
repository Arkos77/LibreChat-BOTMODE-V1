# BOT MODE V1 Lite — revue finale ciblée, 02/11/2026

## Contrôles PASS
- Installation principale 3080 et candidate 3081 HTTP 200, sans mutation de 3080.
- Test statique `scripts/botmode/tests/test_lite_free_config.py` PASS (1 test).
- Worktree de simplification propre avant ce rapport.
- Missions précédemment vérifiées : Worker → spécialiste → résultat parent → Oracle VERIFIED → P6 finale unique sur OpenRouter gratuit ; puis `web_search` Keenable réel, tool_call completed, URL de source et message final en MongoDB. Non relancées.

## Écart encore ouvert avant GO stable
- Profil Lite : `RAG_API_URL=` vide, aucun backend Code Interpreter configuré. `file_search` et `execute_code` ne sont pas qualifiés en opération réelle.
- `api/server/routes/agents/v1.js` calcule `configurationComplete` à partir des prompts, droits et capacités autorisées des agents, pas depuis des sondes de disponibilité des services RAG / Code Interpreter.
- `client/src/components/Chat/Input/ToolsDropdown.tsx` présente File Search sous `fileSearchEnabled && canUseFileSearch` ; ceci ne constitue pas une preuve de santé du backend RAG. Les paramètres d'outils existent également dans `BadgeRowContext.tsx`.
- Aucun test navigateur récent ne démontre que l'interface de la candidate Lite annonce explicitement les limitations Code/RAG. Vérifier l'affichage, ou documenter et marquer ces fonctions comme indisponibles avant GO stable. Éviter les correctifs UI périphériques non justifiés.
- Historique Mongo d'une conversation enfant autonome : non concluant sur la mission live. Le résultat dans le parent est PASS ; cette limite a été explicitement documentée comme non bloquante pour le parcours simple seulement.

## Décision
Verdict de revue : **NO-GO stable, en attente de qualification de l'interface/capacités affichées et de la décision explicite sur le périmètre Lite.** Aucun nouvel outil, service lourd ou rerun gratuit n'est requis pour ce constat. Ne pas fusionner la branche, retagger stable, ni nettoyer les sauvegardes Docker avant approbation et préparation du rollback. Les deux risques LOW sont acceptés uniquement temporairement sur candidate jusqu'au 16/11/2026 (issue #109).
