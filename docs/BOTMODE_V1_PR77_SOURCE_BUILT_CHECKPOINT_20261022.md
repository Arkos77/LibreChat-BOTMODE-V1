# PR77 — checkpoint du lot runtime compatible — 22 octobre 2026

## Décision et identité

**NO-GO stable. Aucune fusion, release ni promotion latest. La candidate D-03 a été publiée et qualifiée dans le périmètre décrit ci-dessous.**

Source qualifiée : `ceb60eca989b8850ac10fab84f1eaac1eedd79ec`.
Branche de source figée : `candidate/botmode-pr77-ceb60eca989b`.
PR77 reste empilée sur PR76, toutes deux Draft / Open / Unmerged.
Le commit documentaire de ce fichier est distinct de la source qualifiée ; il ne constitue pas une nouvelle image testée.

Le seul patch applicatif depuis la candidate publiée f0e102f reste celui de PR77 dans `packages/api/src/endpoints/openai/config.ts`. Ce lot ajoute trois fichiers de test/CI ; il ne modifie ni ce patch, ni le lockfile, ni la garde du workflow OCI f0e102f.

## Hypothèse et résultat discriminant

Attendu : un endpoint custom explicitement OpenAI-compatible conserve son runtime openAI, son URL OpenRouter et ses credentials propres jusqu'à l'admission du binding host.
Défaut reproduit : sans opt-in, l'initialisation réécrit le provider en openrouter et le host refuse le binding attendu openAI.
Cause : autodétection URL dans getOpenAIConfig, après le mapping logique effectué par getProviderConfig.
Correction existante : suppression de cette autodétection uniquement avec defaultParamsEndpoint=openAI.

Nouvelle régression intégrée : vrais getProviderConfig, initializeCustom/getOpenAIConfig, initializeAgent, resolveHostModelRouting et decideHostModel ; ressources/outils vides, DB substituée par des fonctions sans effet, aucune inférence externe. Sans opt-in : refus attendu et aucune provenance enregistrée. Avec opt-in : provider, modèle, URL et clé conservés ; provenance en mémoire sans clé.
Un véritable serveur HTTP local renvoie 429 au primaire : le SDK appelle ensuite uniquement le fallback gratuit autorisé.
Contrôle rouge/vert dans le checkout isolé : retirer temporairement la condition du patch fait échouer les deux tests positifs sur le mismatch ; rétablir le patch rétablit PASS.

## Preuves terminées

| Périmètre | Preuve | Verdict et limites |
|---|---|---|
| Régressions host/SDK et politiques | [39822890526](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39822890526), job binding-regression | **SUCCESS : 12 + 118 = 130 tests**, fixture HTTP locale ; aucun fournisseur réel |
| Image source-built exacte | Même run, job source-built-runtime | **SUCCESS**, image locale AMD64 non publiée ; BUILD_COMMIT exact vérifié |
| Initialiseur dans cette image | CI_SOURCE_BUILT_NATIVE_COMPAT_INITIALIZER=PASS | Opt-in openAI et comportement original openrouter vérifiés, modèle/clé/URL exacts ; aucune inférence |
| Graphe synthétique | CI_FIVE_NATIVE_FIVE_ORACLE_VERDICTS=PASS | Cinq tâches natives, cinq verdicts Oracle ; fournisseur simulé |
| UI et publication durable | CI_BROWSER_FIVE_TASK_VERDICTS_VERIFIED=PASS ; CI_BROWSER_P6_SAME_STREAM_PUBLISHED_MONGO=PASS | Même flux navigateur, Oracle VERIFIED, historique parent/message final Mongo relus ; fournisseur simulé |
| Backend général | [39822890511](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39822890511) | **SUCCESS**, 13 jobs dont typage |
| Playwright général | [39822890362](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39822890362) | **SUCCESS**, mémoire/Redis/MCP ; modèles simulés |
| Static | [39822890373](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39822890373) | **SUCCESS** |
| Pre-push AMD64/ARM64 | [39822890384](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39822890384) | **SUCCESS**, sans publication ; workflow PR utilisant sa projection de merge, distinct de l'image source-built HEAD exacte |
| Docker / safety / Bombadil / Codegraph | 39822890545 / 39822890377 / 39822890476 / 39822890417 | **SUCCESS** |
| Ancienne OCI f0e102f | [39822890445](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39822890445) | **FAIL attendu** à Fail closed on source drift relative to immutable candidate. Sa whitelist n'a pas été élargie ; aucun PASS global de toutes les CI n'est revendiqué |
| Qualification PR28 | 39822890570 | **SKIPPED**, aucune preuve nouvelle |

Identités de l'image locale du runner :
- Image/config ID : `sha256:28c8394d02e7db48e32b0834e3a8d77d8a8f62060a193e4eec34b2a86b367a09`.
- Digest de build indiqué par BuildKit : `sha256:18dd9e253b1f89d8ec988d673421d6c9da881a7bd42d7eec97e01b91afae75cf`.
- **Ce ne sont pas des références GHCR publiées.** Le runner et ses volumes ont été détruits en fin de job.

Vérification locale complémentaire, hors CI persistée : après un chunk SSE puis erreur, tryFallbackProviders refuse la reprise et aucun appel au fallback n'est observé (SDK_PARTIAL_OUTPUT_NO_FALLBACK=PASS). Limite : expérience ponctuelle, pas un test ajouté à la suite.
Deux assertions de config avaient initialement échoué dans le runtime local à cause de HTTP_PROXY/HTTPS_PROXY injectés (configOptions contenait un dispatcher). Relance du seul processus hors variables proxy : 118/118 PASS, confirmé par la CI propre ; aucun changement produit pour masquer ce résultat.

## Méthode et limites

Le nouveau workflow construit le HEAD exact, vérifie son identité, teste l'initialiseur dans le conteneur puis réutilise les corps d'assertions du harnais Oracle/navigateur du même checkout. Il n'exécute pas les étapes de provenance de l'ancienne OCI. Les changements de libellés du wrapper distinguent explicitement l'image locale d'une image publique. Aucun code applicatif, Oracle, permission, garde de source ou seuil de publication n'a été relâché.

**PC-04 réel reste NON PROUVÉ** : les preuves ci-dessus sont synthétiques ; voir l'essai réel autorisé et échoué ci-dessous. Le test 429 local ne garantit ni disponibilité externe ni quota gratuit. Les cinq tâches réelles et le nested child réel restent distincts et non validés. Tous les autres restes et arbitrages D-01/D-02/D-04 du dossier maître demeurent inchangés.

Le premier appel terminal Remote Desktop Commander sur penguin a expiré sans sortie exploitable. Aucun build, volume, installation, secret ou port de cette machine n'a été modifié par ce lot. Le travail a été réalisé dans un checkout isolé et sur runners jetables.

## D-03 autorisée, publication terminée et qualification du digest

Accord explicite du propriétaire : « oui », le 22 octobre 2026, pour la candidate multiarch uniquement. Cet accord est acquis ; D-04 reste NON AUTORISÉ.

- Source exacte : `ceb60eca989b8850ac10fab84f1eaac1eedd79ec`.
- Branche source figée : `candidate/botmode-pr77-ceb60eca989b`, inchangée.
- Tag GHCR : `candidate-botmode-v1-ceb60eca989b` ; alias `sha-ceb60eca989b`.
- Référence immuable : `ghcr.io/arkos77/librechat-botmode-v1@sha256:32b29308e883e83aee5bdb3b702492c2abff46a0843bdc30936d0e981766555d`.
- [Publication D-03 #39826967183](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39826967183) : **SUCCESS**. Prépublication, builds natifs AMD64/ARM64, seconde garde d'immutabilité avant manifeste et pulls anonymes natifs : tous SUCCESS. Les deux pulls retrouvent ce même digest, BUILD_COMMIT exact et Chromium présent.

Le connecteur GitHub disponible ne permettait pas workflow_dispatch. Deux appels de lecture via Desktop Commander ont expiré ; lors de la seconde reprise, penguin était pourtant signalé Online. **La machine ciblée était le Chromebook penguin, pas le MacBook ; aucune commande n'a ciblé le MacBook.** Aucun build, remplacement d'installation, volume, port ou secret local n'a été modifié.

La publication autorisée a donc été exécutée via une branche d'opération isolée `ops/d03-ceb60eca989b`, commit de pilotage `990c2998c553fcd1908da01a4a205f2eb7744d28`. Son workflow reprend la procédure D-03 existante, avec source, tags et branche de déclenchement fixés. **Tous les checkouts de build portent sur ceb60eca989b**, pas sur le commit de pilotage. Les gardes d'immutabilité existantes n'ont pas été modifiées ; aucun tag stable/latest, merge ou déploiement local n'a été effectué.

### Qualification de l'image publique exacte, sans reconstruction

[Run #39828461454](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39828461454) : **SUCCESS**, sur runners jetables, source ceb60eca989b et digest public ci-dessus.

| Gate | Verdict | Preuve et limite |
|---|---|---|
| Installation Lite via véritable install.sh | PASS | CI_FRESH_LITE_INSTALL=PASS ; HTTP API PASS |
| Redémarrage/configuration | PASS | CI_FRESH_LITE_RESTART=PASS ; CI_FRESH_LITE_CONFIG_PRESERVED=PASS |
| Initialiseur compatible dans OCI publiée | PASS | CI_EXACT_OCI_NATIVE_COMPAT_INITIALIZER=PASS ; opt-in, modèle, URL et clé de fixture contrôlés, pas d'inférence externe |
| Cinq tâches natives | PASS synthétique | CI_FIVE_NATIVE_FIVE_ORACLE_VERDICTS=PASS |
| Navigateur/sélection/Oracle | PASS synthétique | CI_BROWSER_FIVE_TASK_VERDICTS_VERIFIED=PASS |
| P6 dans même flux, readback Mongo | PASS synthétique | CI_BROWSER_P6_SAME_STREAM_PUBLISHED_MONGO=PASS |
| Nettoyage des runners | PASS | Destroy runner-only stack SUCCESS dans les deux jobs |

Définition du harnais dans la branche isolée `ops/qualify-ceb60eca989b`, commit de pilotage `6b495b5067b62c172f7677b96c7f3f4c49100ebc`. Les jobs checkoutent toujours la source figée. Le workflow de qualification n'a ni droit de publication ni référence à une clé fournisseur.

L'essai initial de définition #39828128406 a été refusé avant tout job, car une chaîne Python littérale contenant le délimiteur d'expression Actions était interprétée par GitHub comme une expression non fermée. Correction limitée au harnais, sans reconstruction ni modification d'image ; le run suivant ci-dessus est terminé avec succès. Ne pas compter le premier run comme test produit ou succès.

### Essai fournisseur réel autorisé : échec Oracle non classifié

Après le refus initial d'approbation pour une étape réelle hors périmètre D-03, le propriétaire a explicitement répondu « j'autorise » à la demande distincte d'une seule mission réelle de cinq tâches. Cette autorisation a été utilisée une fois.

[Run réel #39830208377](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39830208377) : **FAILURE**, job 120004037780. Branche isolée `ops/live-free-ceb60eca989b-001`, commit de pilotage `4b7b5d40005ed5421c5614339188e2d409bd7e4d`. Source ceb60eca989b et digest publié inchangés ; aucune reconstruction. Garde run_attempt=1 et premier push uniquement.

- Catalogue public : prix nuls attestés pour `google/gemma-4-31b-it:free` et `openrouter/free` ; préflight JSON/allowlist PASS.
- Initialiseur, endpoint compatible, SDK CJS/ESM et démarrage de mission : PASS.
- SSE : HTTP 200, un final, aucun error frame ; le contenu final contient néanmoins une partie error, classe MISSION_ORACLE.
- Plan : cinq tâches. État Oracle : un résultat enregistré, **sans preuve que ce résultat est VERIFIED**. Impossible d'attribuer l'échec à un spécialiste, au quota ou à un candidat précis.
- Aucun signal de mismatch de binding ou SDK unsupported dans les traces disponibles. Fallback configuré mais activation réelle non démontrée.
- Gate terminale : FAIL=TERMINAL_CONTAINS_ERROR_PART. Lecture P6 durable du test réel non exécutée. Nettoyage du runner terminé.
- Les détails de verdict/candidat n'ont pas été conservés hors du runner détruit ; cause exacte non établie. Aucun critère Oracle n'est relâché.

Diagnostic sans inférence préparé sur [commit 5e4847b](https://github.com/Arkos77/LibreChat-BOTMODE-V1/commit/5e4847b16899d48f9be9d93de18e18a9a8486cd5), branche `test/pr77-oracle-verdict-diagnostic-20261022` : résumé limité aux étapes connues, statuts/codes sur liste autorisée et forme JSON du candidat. Aucun texte modèle, identifiant de tâche, clé ou champ arbitraire affiché. Six tests de forme et de non-divulgation PASS dans la disposition réelle des fichiers ; syntaxe du gate PASS. Aucun workflow de nouvel appel n'est ajouté à cette branche, aucun produit ni image modifié.

**État : D-03 et qualification synthétique exact-digest acquis ; essai externe effectué mais cinq tâches réelles / PC-04 / P6 réel NON PROUVÉS. NO-GO stable.** Une seconde mission réelle identique avec ce diagnostic requiert un nouvel accord, l'autorisation précédente portant sur une seule mission. D-04 demeure non autorisée ; aucun merge ni tag stable/latest.
