# BOT MODE V1 — préqualification web_search sur Chromebook 3081

Date : 02/11/2026. Contrôles en lecture seule sur `botmode-v100-test-api-1`.

- Agent RECHERCHE : capacité `web_search` autorisée (migration six agents déjà PASS).
- Conteneur 3081 : aucune variable d'environnement nommée SERPER, TAVILY, SEARX, KEENABLE, FIRECRAWL, JINA, COHERE ou WEB_SEARCH.
- `librechat.yaml` monté depuis l'installation de test : aucune section `webSearch` globale.
- Des credentials individuels chiffrés pourraient exister côté compte LibreChat : **non inspectés**, donc absence globale != preuve qu'aucun utilisateur ne peut rechercher.
- L'API `/api/agents` exige l'authentification (HTTP 401 sans session) ; ne pas contourner cette protection et ne pas afficher les secrets.

Verdict : `web_search` **NON QUALIFIÉ en exécution réelle** ; il manque au moins une configuration système démontrée de fournisseur + extraction, ou la preuve d'une configuration utilisateur valide. Aucun appel de modèle, nouvelle clé, fournisseur externe, service ou coût engagé. Le contrôle ne démontre pas un défaut de l'agent. Ne pas installer SearXNG sur la machine Lite sans plan de ressources. Vérification ultérieure via la configuration native utilisateur, ou ajout explicite d'un fournisseur autorisé, puis test réel unique.

Documentation : https://www.librechat.ai/docs/features/web_search et https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/web_search
