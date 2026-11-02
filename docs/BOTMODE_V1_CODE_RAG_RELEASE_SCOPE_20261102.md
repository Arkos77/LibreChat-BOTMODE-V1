# BOT MODE V1 Lite — périmètre Code et Documents/RAG (02/11/2026)

## Vérifications sur Chromebook 3081
- Services actifs dans `botmode-v100-test` : `api`, `mongodb`, `redis` ; pas de RAG ni de Code Interpreter.
- Le profil `docker-compose.botmode-lite.yml` force `RAG_API_URL=` ; aucune exécution RAG n'est attendue de cette distribution.
- La configuration d'environnement Code Interpreter requise n'est pas présente dans l'API 3081.
- `GET /agents/botmode/setup-status` vérifie les droits d'outils, prompts et délégations ; son `configurationComplete` n'est PAS un test de disponibilité des backends `file_search` ou `execute_code`.
- 3080 et 3081 répondent HTTP 200 ; test API OOM=false, restart=0.

## Critères de release proposés
- PASS acquis : mission Worker + spécialiste + Oracle VERIFIED + P6 unique sur modèle réellement gratuit ; `web_search` exécuté réellement avec outil `completed`, source et réponse persistée.
- NON QUALIFIÉ / NON DISPONIBLE en Lite : exécution de code `execute_code` et recherche documentaire `file_search`. Ne jamais les présenter comme PASS.
- Si la V1 stable doit annoncer l'exécution Code ou l'analyse documentaire RAG, ces fonctions restent des critères bloquants jusqu'à connexion et qualification réelle.
- Si la V1 stable est déclarée *Lite sans Code Interpreter ni RAG*, ces fonctions doivent être explicitement annoncées comme indisponibles, et l'interface ne doit pas promettre une exécution impossible. Décision de périmètre release nécessaire avant GO.
- Aucun nouveau conteneur ni backend lourd sur cette machine à 2,7 Gio RAM / sans swap.

## Vigilance
Ne pas confondre autorisation d'outil et service opérationnel ; aucune nouvelle génération gratuite n'a été lancée pour ce lot. Conserver la release officielle et 3080 inchangés tant que la qualification globale n'est pas acceptée.
