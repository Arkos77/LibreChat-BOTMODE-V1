# BOT MODE — rejet Oracle Recherche, 03/11/2026

## Sources de preuve (candidate 3081, sans reprise/republication)

Mission ayant échoué, identifiant de tâche `b8424c77-a536-4a1e-b986-c34ce38dfb46/research`, nœud `p6_621f96b17bf17a6c54a940c1a2e41a1439a9d6d5d52cc1fec2e172bb0fa62333`.

- Checkpoint MongoDB du thread `224082fe-7d46-5633-8d03-de9627b9baf6`, namespace `1793667661910` : Recherche a produit un objet JSON contenant `result`, `sources` et `ok:false` ; analyse et synthèse non exécutées dans cette mission.
- Le **vrai objectif du plan** n'était pas une étude Python vs Rust, mais le texte générique injecté par `BotModeProjectPanel.launchMission`: « Lance une mission BOT MODE et produis un résultat vérifiable... ». Le modèle a choisi un sujet de remplacement, un guide externe Hermes Bot Mode, puis reconnu que le sujet demandé manquait (`ok:false`).
- Redis `missionOracleState` : le contrat `botmode:completed` exige `ok:true` et a rejeté la déclaration `false`. La validation `research-v2` a aussi rejeté les URL sources. Le corpus observé par l'hôte contenait `youtu.be/...?...` et un chemin Reddit complet, tandis que le résultat citait une URL YouTube convertie et un lien Reddit tronqué.
- **Le rejet est légitime ; il n'y a pas de panne Docker/OpenRouter à corriger.** Oracle bloque correctement la publication si la complétion n'est pas établie et si les sources citées ne sont pas les URL exactement observées. Ne pas affaiblir cette vérification.

## Correctif limité

1. Le bouton de lancement de mission exige un objectif utilisateur explicite suffisamment descriptif et n'expédie plus une instruction générique. Les bindings agents, le choix auto/manuel et le mode `analyze` restent inchangés.
2. Rappeler au nœud Recherche de copier les URL **à l'identique**, y compris les paramètres et chemins, sans conversion d'alias.
3. Les tests UI vérifient qu'un objectif absent/trop vague ne déclenche aucune mission et que le texte saisi devient réellement l'objectif envoyé.

## Verdict

PASS : décision de sécurité Oracle (a rejeté le résultat invérifiable). FAIL : mission utilisateur de bout en bout avec bouton générique. Correctif en qualification : la mission réelle de bout en bout reste **NON CONCLUANT** sur le nouveau commit, tant que les tests CI puis un parcours réel n'ont pas été exécutés. Ne pas remplacer la release stable 3080.
