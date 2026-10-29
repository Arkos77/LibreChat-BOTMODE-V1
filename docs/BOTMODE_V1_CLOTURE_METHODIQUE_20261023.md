# Clôture méthodique — état du 23 octobre 2026

La méthode demandée est enregistrée dans [BOTMODE_V1_METHODE_CLOTURE_20261023.md](BOTMODE_V1_METHODE_CLOTURE_20261023.md) et référencée par AGENTS.md. Continuer de manière autonome les travaux autorisés et réversibles; ne solliciter que les validations humaines réellement nécessaires.

## État prouvé
- Source applicative figée : a6f6fee3c7dcfb5877fe798f759966774a046a58. Régression CI antérieure : 109 tests réussis, run 39855394250.
- Dernière mission réelle : run 39857859228, worker rejeté INVALID_CANDIDATE, 59 caractères INVALID_JSON; spécialistes/P6 non prouvés. Cette mission a consommé son autorisation. Aucune nouvelle mission réelle pendant cette préparation.
- Nouveau diagnostic local : 25 tests ciblés réussis dans quatre suites. SDK réel, HTTP local, graphe natif cinq tâches, Oracle, streaming, confidentialité et préchargement Node; aucun fournisseur externe.
- Aucun nouveau build, appel modèle, publication ou fusion pendant cette préparation. Aucun nouveau correctif applicatif déduit du seul résultat de 59 caractères.

## Prochain lot concret, inactif
[Workflow proposé](qualification/BOTMODE_V1_OBSERVED_FREE_MISSION_a6f6fee3c7dc_PROPOSAL.yml), hors .github/workflows. Source a6 inchangée; helpers figés à 80deacecb5aafd4ed08a2b730b4542ca79ab8270 et vérifiés par SHA256.
Une seule mission par exécution; relances de run interdites. Une nouvelle activation exige une autorisation spécifique et ne doit jamais être répétée sous le même accord.
Hypothèse à tester : imposer require_parameters avec le mode JSON. Ce n'est pas une cause établie du précédent rejet. Comparaison par empreinte entre réponse HTTP et entrée Oracle, sans contenu, clé, prompt ou raisonnement dans les traces.
Contrôles avant build; compilation unique; archive de l'image non configurée conservée un jour comme artifact Actions, sans publication GHCR, pour permettre sa réutilisation; métadonnées seules trois jours.
Les défauts trouvés en revue ont été corrigés : comparaison vide non acceptée, contrôle des paramètres et correspondances, JSONL correctement séparé, préférences fournisseur préservées. YAML, Bash, Python, configuration simulée, montage et cas positifs/négatifs de complétude validés.
Une correspondance multiple reste explicitement ambiguë; aucune attribution unique n'est inventée.

## Reste à décider ou prouver
La prochaine mission réelle instrumentée requiert validation humaine (accord précédent consommé). Les cinq verdicts et P6 doivent réussir avant toute conclusion correspondante.
Les autres obligations de l'inventaire maître restent ouvertes : D01 et preuves fonctionnelles restantes, portée/échéance D02; D03 nouvelle publication et D04 fusion/stable/latest/installation non autorisés. Aucun pourcentage ou délai global de finalisation n'est affirmé.
