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

Le source/digest publié ceb60eca989b reste inchangé et ne contient pas ce correctif. Ce nouveau source n'a pas encore été construit en image OCI ni qualifié par une mission réelle. Aucun nouveau modèle appelé, secret utilisé, image publiée, merge ou tag stable/latest. Les validations synthétiques existantes ne sont pas réattribuées à ce nouveau source.

Conclusion limitée : transmission JSON démontrée localement sur primaire et adaptateur de fallback. Pas de preuve nouvelle des cinq tâches, du fallback réel ou de P6 réel ; NO-GO stable conservé.
