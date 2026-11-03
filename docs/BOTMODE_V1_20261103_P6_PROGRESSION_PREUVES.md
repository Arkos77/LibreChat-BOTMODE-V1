# BOT MODE — preuve d'exécution et projection de progression (03/11/2026)

## Mission Python/Rust de 3081 : preuve persistante, lecture seule

Conversation MongoDB `2e7966ce-18b6-59c3-9796-8342cdd1b6a8`, plan `p6_7b99bcaabdf9b29658c0d6963464f4fdff39c22d210f85cad6d30f486dd5b7e1`. Le checkpoint racine LangGraph enregistre quatre sorties : le nœud d'observation de Recherche et les trois nœuds de production Recherche, Analyse et Synthèse.

- Recherche : `ok:true`, résultat 3 439 caractères, cinq URL de sources ;
- Analyse : `ok:true`, résultat distinct de 5 455 caractères ;
- Synthèse : `ok:true`, résultat distinct de 3 221 caractères ;
- Message assistant final unique `f5ac57f8-2881-44da-a42e-f614223e6f8d` : un seul bloc de texte, de 3 514 caractères, **identique octet pour octet** à `result` du nœud Synthèse suivi de la section `Sources` construite depuis la Recherche ; un appel d'outil non textuel est conservé séparément dans le message.

L'invariant serveur dans `renderMissionPublication()` interdit cette présentation si un résultat manque, si un verdict Oracle n'est pas `VERIFIED`, ou si la provenance des sources ne passe pas sa contre-vérification. `AgentClient.applyBotModePublicationFilter()` interdit aussi la publication du texte source du modèle au lieu de la présentation validée. La réponse sauvegardée correspond exactement au format de ces deux fonctions. Cela constitue une forte preuve que le contrôle terminal et la publication ont réussi pour cette mission. **Limite : les verdicts bruts n'ont pas été relus directement du job Redis (son entrée a expiré) ; l'unicité de message publié est vérifiée dans MongoDB, et non via un compteur d'émissions P6.**

## Problème d'affichage, non moteur

Le panneau `BotModeProgressPanel` affichait systématiquement `Planifiée — exécution non encore confirmée` pour **toutes** les tâches présentes dans un plan. La projection `createBotModeProjectProjection()` n'exposait pas les statuts Oracle par tâche. Le trace MTO référencé par la réponse ne renvoie pas d'observation lors de la lecture actuelle ; les tâches sont donc marquées planifiées même après une publication complète.

## Correctif conservateur

- Uniquement après la construction de la publication terminale validée, le serveur attache à **la réponse persistée** un reçu réduit `{planId,verifiedTaskIds}`. Les sorties privées, critères Oracle, identifiants internes de nœuds et données du fournisseur ne sont pas copiés.
- La projection authentifiée filtre ce reçu : correspondance exacte au plan de **ce même message**, liste non vide, bornée, complète, sans doublon ni tâche étrangère, et présence d'un contenu public persisté. Aucun statut n'est inféré d'une conversation, d'un plan ou d'un événement générique.
- Le panneau affiche « Exécutée — vérifiée par Oracle » avec une coche uniquement pour les tâches couvertes par ce reçu. Sans reçu valide : statut non confirmé. Aucun changement au graphe, à Oracle, aux spécialistes, au Worker ni à la barrière P6.
- Les missions historiques conservent leur statut non confirmé sans migration implicite. Une éventuelle réconciliation d'un message existant doit se faire séparément, après vérification explicite de ses checkpoints et de sa publication.

Verdict à ce checkpoint : exécution de trois nœuds distincts **PASS**, concordance publication persistée **PASS**, reçu de statut UI **en qualification**, preuve brute Redis P6 **NON CONCLUANT**. Ne pas promouvoir 3080 stable avant le GO utilisateur.
