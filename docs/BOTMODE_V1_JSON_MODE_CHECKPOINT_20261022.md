# JSON mode — correction isolée du 22 octobre 2026

Branche : fix/pr77-json-mode-transmission-20261022, issue de PR77 au commit documentaire 06e207266f0a3209d9f9152a880a6f1f5d58dd6a.

Le run réel autorisé 39832255634 a établi Worker REJECTED / INVALID_CANDIDATE, candidat de 59 caractères INVALID_JSON. Il ne détermine pas le contenu exact ni la cause complète de cette sortie.

## Défaut local reproduit et correction

Le harnais vérifiait le support catalogue de response_format sans activer JSON mode. Ajouter ce paramètre à addParams seul ne suffit pas : le convertisseur le plaçait dans un champ constructeur ignoré par le SDK. Les véritables requêtes HTTP locales des deux adaptateurs ne contenaient pas response_format.

La correction active json_object sur l'endpoint du seul probe à cinq tâches, puis déplace cet addParams explicite vers modelKwargs après sélection d'API et application de dropParams. Le clone compatible du fallback hérite du réglage. Le chemin Responses API, la suppression explicite et le probe original hors cinq tâches restent inchangés.

Diff applicatif limité à 13 lignes dans packages/api/src/endpoints/openai/llm.ts. Pas de modification Oracle, planner, autorisations, modèles, prix ou credentials.

## Vérification locale

- Reproduction rouge : 3 tests échouent sur response_format absent (configuration et HTTP des deux adaptateurs).
- Avec configuration seule : les deux captures SDK restent rouges.
- Après conversion : 16/16 tests API ciblés PASS (format, host routing, compatibilité et fallback HTTP 429).
- Config / LLM / free host decisions : 234/234 PASS, dont trois assertions mode JSON / Responses API / dropParams.
- npm run build --workspace=@librechat/api : PASS.
- Bash syntaxe, git diff --check et Prettier : PASS.
- Seul le catalogue public est substitué dans la fixture de test ; les initialisations et requêtes SDK sont réelles et limitées au loopback. Aucune inférence externe.
- Une assertion historique de classification des paramètres attendait l'ancien champ ignoré ; elle attend désormais le transport effectif par modelKwargs.

## Portée

Le source/digest publié ceb60eca989b reste inchangé et ne contient pas ce correctif. Ce nouveau source est désormais construit et contrôlé dans une image locale AMD64 (preuve ci-dessous), mais n'est pas qualifié par une mission réelle. Aucun nouveau modèle appelé, secret utilisé, image publiée, merge ou tag stable/latest. Les validations synthétiques existantes ne sont pas réattribuées à ce nouveau source.

Conclusion limitée : transmission JSON démontrée localement sur primaire et adaptateur de fallback. Pas de preuve nouvelle des cinq tâches, du fallback réel ou de P6 réel ; NO-GO stable conservé.

## Qualification de l'image locale exacte — terminée

[Run #39837273986](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39837273986) : **SUCCESS**, job 120028760160, le 22 octobre 2026 à 21 h 12 (Paris).

- Source applicatif exact : `a7ba172929168132d6b0fe44c56d0e3f17b40d80`.
- Branche d'opération : `ops/json-image-a7ba17292916-r2` ; commit de pilotage `bbb191a65f0abd12b8af9ebe9e7e6e534f729f71`. Le checkout du build porte sur a7ba1729, pas sur ce commit de pilotage.
- Build Dockerfile cible node, AMD64, push=false / load=true : PASS.
- BUILD_COMMIT exact et empreintes SHA-256 du convertisseur LLM, du preflight et du test SDK dans le conteneur : PASS.
- ID de configuration de l'image locale : `sha256:268c9146d6bd7349d2aababb149c58e629c268a07609d121c6dba97a22f38fb3`. Ce n'est pas un digest de registre publié.
- Quatre contrôles exécutés depuis les fichiers de l'image, par un lanceur d'assertions Node minimal : conservation des paramètres, probe original inchangé, vraie requête SDK primaire, vraie requête SDK adaptateur compatible de fallback. **4/4 PASS** ; CI_IMAGE_JSON_MODE_PRIMARY_AND_FALLBACK=PASS.
- Docker --network none : seul le loopback du conteneur est disponible. Catalogue substitué et réponse HTTP locale de fixture ; aucune inférence fournisseur, clé réelle ou accès réseau fournisseur.
- Suppression de l'image locale et fin du job : SUCCESS. Aucune publication GHCR, aucun tag ou installation utilisateur modifié.

Le premier run [#39836260622](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39836260622), commit de pilotage ceead73aaae442d5b914c6971531483d9b65fbf5, a construit l'image et confirmé ses empreintes, puis échoué sur une méthode toBe manquante dans le lanceur d'assertions. Correction du lanceur uniquement, vérifiée localement avant le second run ; aucun changement applicatif. La deuxième exécution importe des couches du cache mais effectue son propre chargement/contrôle d'image. Le premier run reste FAILURE et n'est pas compté comme qualification complète.

Portée acquise : image AMD64 exacte et transmission de JSON mode démontrées. Ni l'exécution d'un fallback automatique dans cette image, ni cinq tâches Oracle réelles, ni P6 réel ne sont prouvés par ces quatre contrôles. Le source/digest GHCR ceb60eca989b reste inchangé. NO-GO stable conservé.
