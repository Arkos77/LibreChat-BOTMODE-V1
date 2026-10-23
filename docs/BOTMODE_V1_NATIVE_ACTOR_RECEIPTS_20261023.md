# Receipts des acteurs natifs — checkpoint du 23 octobre 2026

## État prioritaire — receipts persistées dans l'image b221, fournisseur local déterministe

[Run 39883796226](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39883796226), job 120187128591 : **SUCCESS** sur image exacte de b2213e9717b879a91181c6ac9d7607124c30258b, réutilisée sans compilation. API + vrai SDK + MongoDB/Redis jetables : cinq verdicts VERIFIED, P6, un message canonique, receipt hostModelUsage présente, fallbackUsed=true, free_only, acteur/binding/identité SDK/modèle/jetons vérifiés. Usages agrégés présents; receipt primaire limitée au Worker. **Cette preuve utilise un fournisseur local déterministe, aucune inférence externe ni clé réelle.** Nettoyage réussi.

L'unique mission externe autorisée du [run 39880864060](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39880864060) s'est arrêtée au Worker : objet JSON HTTP intact mais critère ok absent, Oracle REJECTED/CRITERION_FAILED; lecture P6/receipts SKIPPED. Une seule compilation exécutée; pas de replay externe. Image b221 conservée un jour, audit installé zéro critical/high/moderate. Deux échecs du dispositif local (route bootstrap supplémentaire, identifiant de réponse constant) reproduits/corrigés et consignés, sans changement applicatif ni nouvelle compilation.

[Compte rendu complet et limites](https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/779944db70591b4226b0fe653fb47abc776c54c8/docs/BOTMODE_V1_RECEIPT_RUNTIME_QUALIFICATION_20261023.md). La persistance des receipts b221 sous fournisseur externe reste non prouvée. Le succès externe cinq tâches/Oracle/P6 a6 reste acquis sur sa source. D01–D04 et **NO-GO stable** restent inchangés; aucune publication GHCR/fusion/installation.


## Cause supplémentaire reproduite avant tout build
Le correctif précédent des alias SDK est nécessaire mais ne suffit pas au graphe natif : compileNativePlan utilise task.nodeId comme agentId SDK, alors que la receipt filtre par l'identifiant de l'agent enregistré.
Le test complet utilise le vrai SDK, HTTP local primaire 429/fallback 200, le graphe à cinq tâches, Oracle et le vrai ModelEndHandler. Les événements portent bien le fournisseur et le modèle fallback avec les jetons, mais leur agentId est le nœud de tâche.
Avant correction : cinq cas sur cinq échouent à produire une receipt. Aucun fournisseur distant, clé réelle, build ou génération payante.

## Correction et frontière d'autorisation
projectHostModelUsage accepte le plan existant. Il recalcule l'identité canonique des nœuds via nodeIdentity(missionId,key), limite la projection à 256 tâches et ne retient que les nœuds ayant pour unique propriétaire l'agent de la décision hôte.
Les acteurs étrangers, nœuds forgés, propriétaires contradictoires et plans sans identité de mission sont exclus. Les usages non primaires restent exclus. Les identités du graphe ne sont pas modifiées; aucune permission d'exécution n'est ajoutée.
AgentClient transmet le plan à la projection. La receipt conserve actorId séparément de l'agent enregistré, ainsi que fournisseur configuré et fournisseur SDK séparés.

## Vérification
Source complète avec tests : b2213e9717b879a91181c6ac9d7607124c30258b, branche fix/host-usage-runtime-alias-20261023.
Sept suites locales : 270 tests réussis en 14,819 s, dont suite complète AgentClient, graphe natif avec vrai collecteur, routage, compatibilité SDK HTTP, receipts, santé des modèles et projection de projet.
Les cinq variantes graphe/Oracle réussissent après correction (streaming/nonstreaming, JSON valide/invalide, support strict). La receipt ne compte que le Worker et exclut les autres agents.
Les métadonnées produites par AgentClient et leur aller-retour JSON gardent la receipt. Ce n'est pas encore une preuve de persistance dans MongoDB réelle.
Revue indépendante des cinq fichiers modifiés : aucun constat. Cinq fichiers distants relus et identiques au contenu attendu. Aucun nouveau build, mission réelle, publication d'image ou fusion.

## Prochain essai concret, encore inactif
[Proposition de qualification](qualification/BOTMODE_V1_DURABLE_RECEIPTS_b2213e9717b8_PROPOSAL.yml), hors .github/workflows, revue sans constat. YAML, Bash, Python et prédicat de receipt (cas positif + six cas négatifs) vérifiés.
Une seule image AMD64 de cette source, contrôles rapides avant compilation, vérification des hashes applicatifs dans l'image, conservation de l'image non configurée un jour, sans GHCR.
Une seule mission réelle sur les deux routes gratuites déjà utilisées, avec clé existante, JSON strict et 429 primaire contrôlé.
Le readback P6 lit le nœud Worker attendu dans le plan Redis puis vérifie la receipt du message MongoDB canonique : fallbackUsed=true, free_only, route configurée, runtimeProvider, modèle, acteur exact, un appel et présence des jetons, binding admis. Sans receipt valide, le run échoue.
Observateur borné séparé, pas de contenu des réponses/prompts/raisonnement/clé dans les traces; nettoyage systématique. Une mission par run, nouvelle activation soumise à accord précis; aucun accord précédent n'est réutilisé.

## Limites
Les cinq verdicts et P6 déjà acquis dans le run 39877163780 restent attachés à a6 et ne sont pas rejoués comme analyse de panne. La nouvelle exécution vise la persistance des receipts après des modifications applicatives pertinentes.
Les deux défauts reproduits ne sont pas présentés comme l'unique explication du run historique, dont les événements d'usage détaillés n'étaient pas disponibles.
Receipts en conditions réelles encore à qualifier; D01/D02/D03/D04 et NO-GO stable restent inchangés. Aucune publication, fusion ou installation n'est autorisée par ce checkpoint.
