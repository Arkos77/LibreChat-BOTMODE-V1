# PR77 — checkpoint du lot runtime compatible — 22 octobre 2026

## Décision et identité

**NO-GO stable. Aucune fusion, release, promotion latest ni publication GHCR effectuée.**

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

**PC-04 réel reste NON PROUVÉ** : aucune inférence OpenRouter réelle n'a été effectuée pendant ce lot. Le test 429 local ne garantit ni disponibilité externe ni quota gratuit. Les cinq tâches réelles et le nested child réel restent distincts et non validés. Tous les autres restes et arbitrages D-01/D-02/D-04 du dossier maître demeurent inchangés.

Le premier appel terminal Remote Desktop Commander sur penguin a expiré sans sortie exploitable. Aucun build, volume, installation, secret ou port de cette machine n'a été modifié par ce lot. Le travail a été réalisé dans un checkout isolé et sur runners jetables.

## Prochain geste soumis à décision D-03

La qualification source-built autorisée est terminée. La qualification de distribution finale nécessite une nouvelle image publique correspondant à la source corrigée ; f0e102f ne peut pas la remplacer.

**D-03 AUTORISÉE par réponse explicite « oui » du propriétaire le 22 octobre 2026 ; publication NON EXÉCUTÉE** :
- source exacte : ceb60eca989b8850ac10fab84f1eaac1eedd79ec ;
- branche figée : candidate/botmode-pr77-ceb60eca989b ;
- workflow existant : botmode-image.yml, workflow_dispatch, publish=true, verify_guard_only=false ;
- tag demandé : candidate-botmode-v1-ceb60eca989b ;
- publication candidate GHCR AMD64 + ARM64 avec garde d'immutabilité ;
- aucun tag stable/latest, aucune fusion, aucun remplacement d'installation.

Après accord D-03 seulement : publier, relever le digest réellement produit, qualifier son pull anonyme et les gates impactés, puis au plus un essai gratuit réel avec bindings autorisés et quota disponible. En cas de quota indisponible : BLOCKED_PROVIDER explicite, sans abaisser les exigences. D-04 reste requis séparément pour fusion/stable.

## Exécution D-03 — blocage de connexion

L'accord utilisateur couvre uniquement la candidate multiarch et la source figée ci-dessus. Il est acquis et ne doit pas être redemandé. D-04 demeure non autorisé.

Contrôles de cette reprise : la branche candidate pointe toujours sur ceb60eca989b8850ac10fab84f1eaac1eedd79ec ; aucun workflow_dispatch n'est présent pour ce SHA au contrôle. Le connecteur GitHub courant ne propose pas de création de workflow_dispatch. Desktop Commander signale penguin et le MacBook hors ligne. Aucun lancement distant, push GHCR, merge, tag stable ni modification d'installation n'a eu lieu. Reprendre le déclenchement du workflow botmode-image.yml sur la branche candidate avec les paramètres D-03 déjà préparés dès le rétablissement d'un moyen d'exécution autorisé. La garde d'immutabilité doit rester exécutée avant publication.
