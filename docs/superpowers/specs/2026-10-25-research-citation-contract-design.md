# Proposition — séparer provenance et présentation des sources

État : proposition à décider, pas correctif appliqué. 25 octobre 2026.

## Constat établi

Source actuelle : 77970644e275fd201edc2391588351b6ce93fbd6.
Mission réelle : https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40205245845.
Le candidat exact contient un résultat substantiel, ok=true et une source qui correspond à l'observation native de la tâche. Il omet l'URL dans result. L'Oracle rejette research-v1 sur output:sources ; result-v1 passe. Les preuves brutes et le nettoyage PASS sont conservés dans le rapport de qualification, version 28.

`supportsResearchResult` impose que chaque URL déclarée soit observée et citée dans result, et que chaque URL trouvée dans result appartienne aux sources déclarées. `schema.ts` n'impose que des champs scalaires ; la duplication des URL y est décrite en langage naturel. `native.ts` impose aussi cette duplication par instruction. Le correctif 7797064 supprime le contexte de présentation concurrent, mais la mission réelle démontre qu'il ne suffit pas.

Cette duplication est explicite dans `docs/BOTMODE_V1_RESULT_SOURCE_CONTRACT_20261023.md`. Elle ne doit pas être supprimée silencieusement. La provenance d'un lien ne prouve déjà pas qu'il confirme chaque affirmation.

## Alternatives

1. Renforcer encore les consignes : changement léger, mais ne supprime pas la dépendance à l'obéissance du modèle. Non recommandé après l'essai observé.
2. Ajouter une contrainte regex au schéma : pourrait imposer la présence d'une URL, mais ne prouve pas à elle seule la correspondance entre result, sources et observations natives. La prise en charge précise de cette contrainte par l'endpoint gratuit actuel n'est pas établie. Pas de nouvel essai pour présumer cette capacité.
3. Versionner le contrat et séparer provenance et présentation : option recommandée à décider. Le modèle fournit le contenu et ses sources ; l'Oracle vérifie leur provenance ; le logiciel présente la liste déjà validée. Cette option change explicitement le critère de duplication, sans retirer les contrôles de provenance.

La documentation OpenRouter confirme la prise en charge des sorties structurées par endpoint, mais ne constitue pas une preuve d'application de toute contrainte regex sur l'endpoint testé : https://openrouter.ai/docs/guides/features/structured-outputs. La fiche du modèle confirme response_format, sans établir ici cette contrainte particulière : https://openrouter.ai/nvidia/nemotron-3.5-super-vl:free. Les possibilités de NVIDIA NIM ou d'un autre fournisseur ne sont pas transférées à cet endpoint.

## Périmètre proposé pour le prochain lot hors ligne

Introduire un contrat explicite research-v2 pour les nouvelles missions, sans modifier research-v1 ni revalider sous v2 une ancienne mission rejetée. Conserver les candidats bruts et leurs verdicts originaux. Les champs scalaires result, sources et ok restent compatibles avec les mécanismes existants.

Le nouveau contrat exige un result non vide, une liste de sources non vide et bornée, et l'appartenance de chaque source aux observations natives terminées de la même tâche. Toute URL présente dans result doit appartenir à cette liste. L'absence d'URL dans le texte n'est plus un rejet lorsque la liste validée est présentée séparément. Les critères de réussite, preuves indépendantes, contradictions et revue humaine gardent leur rôle actuel ; ok=false ou null ne deviennent jamais une réussite.

La présentation doit afficher les sources vérifiées avec le résultat sans demander au modèle de les recopier. Elle intervient après les validations de toutes les tâches ; elle ne répare pas le candidat soumis à l'Oracle et n'invente aucune source. Le même contenu rendu doit être transmis dans le SSE final et enregistré dans Mongo. Un rendu absent ou une source perdue bloque la publication ; aucune réussite n'est déduite de la seule présence d'une liste interne.

Les tâches analyse et synthèse doivent recevoir les données validées ; la publication finale doit conserver la liste des sources utilisées et validées pour cette mission. Ne pas prendre des sources d'un autre utilisateur, d'une autre tâche ou d'un ancien essai. La version de contrat et les données de présentation doivent être persistées pour que la reprise applique les mêmes règles. Les missions v1 conservent leur sémantique historique.

## Vérifications requises avant toute construction

- Rejouer le candidat capturé : rejet sous v1 inchangé ; compatibilité sous v2 uniquement avec les observations natives exactes. Ce replay est une preuve hors ligne, pas une nouvelle réussite de la mission passée.
- Refuser sous v2 : sources absentes ou vides, URL inventée, URL non déclarée dans result, observations d'une autre tâche, outil en erreur, ok=false/null, contradiction ou preuve requise manquante.
- Vérifier qu'une liste de sources valide ne transforme pas un texte vide en résultat accepté.
- Vérifier la préservation du candidat brut et des verdicts historiques.
- Vérifier le passage des sources recherche vers analyse et synthèse, puis le rendu déterministe après quatre verdicts VERIFIED dans la mission contrôlée.
- Vérifier l'identité du contenu SSE/Mongo, l'unicité de publication, les refus si le rendu est incomplet et le comportement de reprise v1/v2.
- Vérifier le transport SDK local sans fournisseur réel, types et lint ; une revue indépendante unique porte sur le lot complet.

Si l'intégration du rendu exige une nouvelle infrastructure ou la modification du SDK, arrêter et redélimiter le lot ; ne pas ajouter un orchestrateur, une boucle de correction ou des retries.

## Limites et autorisations

Cette proposition ne valide pas la vérité des faits, la recherche sur le web public, le fallback, les sous-agents imbriqués, l'installation ni la release stable. Elle n'autorise ni publication de source, ni build, ni mission réelle supplémentaires. La décision demandée porte uniquement sur l'évolution explicite du contrat et sa préparation/test hors ligne. Aucun code produit n'est modifié par ce document.
