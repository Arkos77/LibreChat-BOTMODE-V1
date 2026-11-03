# BOT MODE V1 — preuve de l’exécution réelle, décision de correction

## Incident de la mission utilisateur du 02/11/2026, sur la candidate 3081

Lecture **en seule consultation** des checkpoints MongoDB (`agent_checkpoints`) du thread de qualification : le dernier checkpoint du graphe contient quatre entrées `agentOutputs` — observation web de Recherche, résultat Recherche, résultat Analyse, résultat Synthèse — et ses branches de transition vers Analyse et Synthèse. La conclusion précédente « seuls les appels Recherche ont été exécutés » était donc incorrecte.

Le contenu décodé des sorties LangChain montre : Recherche, JSON `result` de 3 221 caractères + sources ; Analyse, exactement le même `result` de 3 221 caractères ; Synthèse, texte similaire de 3 179 caractères toujours titré Recherche. Le problème réel est une **reproduction de sortie** par les étapes aval, pas l'absence d'exécution du graphe. Les six prompts spécialistes existent déjà en MongoDB, contrairement au constat historique antérieur.

## Correction limitée

- Renforcer les instructions des nœuds natifs dépendants : nouvelle analyse propre et synthèse intégrée, sans recopier le rapport amont.
- Ajouter à l'Oracle de fin **et aux transitions natives** un contrôle déterministe des copies exactes de `result` JSON de longueur substantielle (au moins 256 caractères) entre tâches directement dépendantes. La comparaison normalise casse/espaces, ignore les champs de sources et ne lit pas de raisonnement privé. Une copie provoque `BOTMODE_DUPLICATE_TASK_OUTPUT` avant une publication finale ou avant un appel de synthèse inutile.
- Préserver autorisations, checkpoints, modèle gratuit, Redis, P6 et installation principale 3080.

## Qualification restant requise

Tests unitaires Oracle / compilation native, compilation CI sur candidate, puis **une seule mission fonctionnelle** à sujet précis sur 3081. La réussite ne sera reconnue que si les sorties Recherche, Analyse et Synthèse sont distinctes, les vérifications Oracle sont probantes et une publication finale unique est persistée. Les PASS historiques ne sont pas relancés.
