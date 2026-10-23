# Receipts — correspondance des fournisseurs SDK, 23 octobre 2026

## Problème reproduit et correction
Une route personnalisée autorisée nommée OpenRouterFreeCompatCI est exécutée par le SDK sous openAI. La décision hôte conservait seulement le nom configuré; le filtre des événements d'usage rejetait donc ce fournisseur SDK, malgré un appel admis.
Le test utilise l'initialisation native, un vrai appel SDK au primaire HTTP local 429 puis au fallback HTTP local 200, et les compteurs renvoyés dans la réponse. Avant correction : une receipt undefined, 1 échec / 3 tests réussis. Aucune clé réelle, fournisseur distant ou génération payante.

La décision ajoute maintenant runtimeProvider uniquement lorsque le nom SDK diffère du fournisseur configuré. La projection utilise exclusivement ce lien explicite admis par l'hôte et le modèle autorisé. Si plusieurs fournisseurs configurés partagent le même fournisseur SDK et modèle, l'événement reste exclu faute d'identité univoque.
La receipt garde le fournisseur configuré et le fournisseur SDK séparément. Les événements d'autres agents, les usages non primaires et les couples non autorisés restent exclus.

## Validation acquise
- Source complète avec tests : 0f4691410fe614207001c8ff091a026325db2418, branche fix/host-usage-runtime-alias-20261023.
- Sept suites locales : 264 tests réussis en 11,418 s, dont la suite complète AgentClient, routage hôte, compatibilité SDK réelle, graphe natif/Oracle, projection d'usage, santé des modèles et projection de projet.
- Test de construction des métadonnées : fallbackUsed=true et les deux identités conservées.
- Cas négatifs : fournisseur SDK inconnu, modèle inconnu, alias ambigu; tests antérieurs conservés.
- Syntaxe Node, formatage et diff vérifiés. Revue indépendante des deux fichiers applicatifs et des tests de routage/projection : aucun constat restant.
- Aucun build, CI supplémentaire, appel fournisseur réel, publication GHCR ou fusion pendant ce lot.

## Limites et état de release
Le run réel 39877163780 reste la preuve acquise des cinq verdicts et P6 sur la source a6. Les événements d'usage détaillés de ce run n'ont pas été capturés : le défaut reproduit ici n'est pas présenté comme l'unique cause de l'absence de ses receipts.
La nouvelle correction est vérifiée localement; sa présence dans une image et la persistance réelle des receipts dans MongoDB restent à qualifier. Ne pas réattribuer les preuves a6 à cette nouvelle source.
D01/D02/D03/D04 et les autres obligations ouvertes restent inchangés; NO-GO stable maintenu. Aucun nouveau test réel n'est autorisé par ce compte rendu.
