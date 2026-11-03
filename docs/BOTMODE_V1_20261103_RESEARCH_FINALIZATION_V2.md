# BOT MODE V1 — Recherche, finalisation et provenance v2

## Preuve réelle du troisième rejet (03/11/2026)

Sur la candidate 3081 du commit `bd0c3f19`, mission `448d4ba1-50f5-46da-8127-0bdcdf530e55`, nœud Recherche `p6_64792138e0ad46bf94781c24a963a2a8083b75175cb3dc1a1199b8c75881205c`, Oracle a reçu `ok: true` avec un `result` de 219 caractères : « J'ai obtenu des premiers éléments ... Je complète maintenant ... », et `sources: ""`. L'outil `web_search` avait pourtant exécuté son appel et le serveur avait conservé **cinq URL vérifiables** dans Redis. Le checkpoint Mongo possédait les quatre messages normaux (objectif, appel assistant, résultat d'outil, réponse JSON partielle). Le contrôle `research-v2` a correctement renvoyé `REJECTED [CRITERION_MET, CRITERION_FAILED]` sur `output:sources`, sans exécuter Analyse ni Rédaction et sans publication P6.

Les deux précédentes tentatives consistant à rendre les instructions plus explicites n'ont pas empêché le modèle gratuit d'émettre un statut intermédiaire. Une nouvelle modification superficielle des instructions générales ne suffit donc pas.

## Correctif ciblé, sans nouvel orchestrateur

- Nouvelle version de politique **researchExecutionVersion=2** pour les **nouvelles missions**. Les plans v1 restent autorisés et compilés avec leur topologie historique, sans requalification ni migration silencieuse de checkpoints.
- La transition SDK native `web_search → Recherche (rapport)` reçoit un **prompt de routage spécifique à la mission**, construit juste après la validation de l'observation par `beforeTransition`, en exploitant les URL déjà enregistrées par le serveur.
- Les URL sont sélectionnées **uniquement** parmi les appels d'outil `web_search` réussis et présents dans les messages de la mission, puis dédupliquées, plafonnées à 12 et transmises sous forme JSON. Un état incohérent (aucune URL corrélée, alors qu'un résolveur est disponible) échoue sans publication.
- Le prompt exige un **rapport final fondé sur les résultats déjà observés**, contenant des sources à l'identique, avec `ok:false` si les preuves sont insuffisantes. Le routage et les outils autorisés du SDK restent inchangés ; pas de phase supplémentaire, pas de nouvelle requête web imposée, pas de contournement Oracle.
- Le moteur Oracle continue d'évaluer indépendamment les URL effectivement rapportées par le spécialiste, et ne déduit **jamais** que la présence d'une URL prouve automatiquement le contenu des affirmations.

## Qualification de sécurité

Tests de non-régression attendus : (a) le prompt final v2 contient les URL hôte exactes mais jamais les URL d'un ancien appel ; (b) les sources non corrélées empêchent l'accès à la seconde phase ; (c) la v1 conserve le nœud de transition historique ; (d) la CI TypeScript, le contrat natif, le transport HTTP/SDK et les tests de reprise passent ; (e) une seule mission réelle sur 3081 démontre Recherche, Analyse, Rédaction, Oracle VERIFIED et P6 unique.

**Statut à la création du document :** source candidate uniquement, nouvelle mission de bout en bout **NON CONCLUANT**. Pas de publication stable ni modification 3080 sans preuve complète.
