# BOT MODE V1 Lite — contrôles UI, MCP et release (02/11/2026)

## 1. Interface
- `interface.fileSearch=false` appliqué au seul fichier monté 3081 ; capacité d'agent `file_search` préservée. Affichage navigateur non encore testé.
- `execute_code` reste autorisé aux agents, alors qu'aucun service Code Interpreter n'est configuré. `ToolsDropdown.tsx` affiche le contrôle Code si le compte a RUN_CODE et si la capacité est activée ; pas de condition de disponibilité du backend. Un correctif de visibilité client doit être qualifié dans une nouvelle image avant GO : ne pas retirer les droits des agents existants.

## 2. MCP périphériques
- Logs réels avant correction : serveur `github` refuse un en-tête Authorization ; `fetch` échoue à l'initialisation ; d'autres erreurs ENOENT npm. Pas de preuve d'incident sur la chaîne BOT MODE.
- Les trois MCP à démarrage automatique `mcp-docs`, `fetch`, `github` sont configurés `startup=false` dans le seul LibreChat YAML monté 3081, avec sauvegarde privée avant modification. `higgsfield` et `notion` étaient déjà `startup=false`.
- Après redémarrage : HTTP 3080 et 3081 = 200, Redis healthy, MongoDB opérationnel. Logs récents ne reproduisent pas les erreurs de connexion MCP de démarrage. Les serveurs restent configurés, mais ne sont pas testés manuellement ni considérés fonctionnels.

## 3. Release
- PASS antérieurs conservés : délégation Worker → spécialiste → parent, Oracle VERIFIED, P6 unique, OpenRouter gratuit, web_search Keenable réel.
- NON CONCLUANT : absence d'erreur UI côté navigateur, bouton Code effectivement indisponible, reprise autonome de transcript enfant et services Code/RAG.
- Release **NO-GO** tant que le parcours utilisateur de l'interface Lite n'affiche pas correctement les limites et que le correctif éventuel n'a pas été qualifié sur une image candidate. Ne pas fusionner, retagger ou nettoyer Docker avant preuves et décision distincte.
- Deux risques LOW acceptés sur candidate seulement jusqu'au 16/11/2026 (issue #109).
