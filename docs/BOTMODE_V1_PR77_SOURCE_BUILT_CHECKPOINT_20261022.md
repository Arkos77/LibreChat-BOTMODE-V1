# PR77 — checkpoint du lot runtime compatible — 22 octobre 2026

## Receipts natives — qualification locale complétée le 23 octobre 2026

La vérification SDK→graphe→ModelEndHandler a reproduit un second écart : le graphe émet l'identifiant canonique de la tâche, alors que la receipt attend l'identifiant de l'agent enregistré. Correction liée au plan validé, sans changement des identités du graphe; nœuds étrangers/forgés/ambigus exclus. Source complète **b2213e9717b879a91181c6ac9d7607124c30258b**, branche fix/host-usage-runtime-alias-20261023. **270 tests locaux réussis dans sept suites**, revue indépendante sans constat.

[Checkpoint et limites](https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/d3ae434787b4a9d63e59eb5695962b6c05ffbfcf/docs/BOTMODE_V1_NATIVE_ACTOR_RECEIPTS_20261023.md). Une proposition inactive impose la présence et la validité de la receipt dans MongoDB pour réussir. Nouvelle image nécessaire car trois fichiers applicatifs ont changé depuis a6; une seule compilation et une seule mission gratuite proposées, en attente d'accord précis. Aucun nouveau build ni appel réel engagé. Le succès cinq verdicts/P6 a6 reste acquis; persistance réelle des nouvelles receipts, D01–D04 et NO-GO stable restent ouverts.


## Receipts — correctif local qualifié le 23 octobre 2026

Un défaut de correspondance entre fournisseur configuré et fournisseur SDK est reproduit par initialisation native + appels SDK HTTP locaux (429→200) : OpenRouterFreeCompatCI est exécuté sous openAI et la projection rejetait son usage. Correction enregistrée dans la source **0f4691410fe614207001c8ff091a026325db2418**, branche fix/host-usage-runtime-alias-20261023. Le lien runtimeProvider vient uniquement de l'admission hôte; les modèles/fournisseurs inconnus et les alias ambigus restent exclus. Les identités configurée et SDK sont conservées séparément.

**264 tests locaux réussis dans sept suites**, revue indépendante sans constat restant. Aucun build ni mission réelle supplémentaire. [Preuves et limites](https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/fd0121331403654898b73ea8dfd7671b6e78a2c3/docs/BOTMODE_V1_HOST_USAGE_RUNTIME_ALIAS_20261023.md).

Ce résultat ne clôt pas la persistance réelle des receipts, ne prouve pas l'unique cause de leur absence dans l'ancien run, et ne transfère pas les preuves a6 à la nouvelle source. Le parcours cinq tâches/Oracle/P6 du run 39877163780 reste acquis sur a6; D01–D04 et NO-GO stable restent inchangés.


## État prioritaire vérifié — 23 octobre 2026 : cinq tâches + Oracle + P6 acquis

**Cette mise à jour remplace les anciens blocages du parcours à cinq tâches; les rapports précédents restent historiques.** Publication documentaire autorisée explicitement par l'utilisateur.

Run [39877163780](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39877163780), job 120165439617 : **SUCCESS**, source applicative a6f6fee3c7dcfb5877fe798f759966774a046a58. Image exacte réutilisée sans recompilation. Worker + quatre spécialistes : cinq verdicts VERIFIED. P6 durable de la même mission : un seul message assistant canonique MongoDB, publication engagée et terminal complete. Dix requêtes observées : cinq 429 contrôlés puis cinq réponses réelles de fallback acceptées; JSON objet et require_parameters transmis. Nettoyage réussi. Aucun nouveau build ni image publiée.

**Limites :** les cinq contenus identiques empêchent une attribution HTTP→tâche unique; les traces prouvent les correspondances au niveau du lot. Receipts hostModelUsage/fallbackUsed absentes du message canonique; leur persistance reste à établir, sans nier la bascule HTTP réellement observée. Child externe imbriqué/dynamique non observé. D01 et les autres obligations de l'inventaire restent ouverts; D02 non renouvelé; D03 nouvelle image et D04 fusion/stable/latest/installation non autorisés. **NO-GO stable maintenu.** L'autorisation de mission est consommée; ne pas rejouer ce parcours acquis sans nouvelle raison.

[Compte rendu complet, preuves et limites](https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/07b462f07aee835f1c43cc0e77b2d15ac9bd0fc6/docs/BOTMODE_V1_FIVE_TASK_P6_SUCCESS_20261023.md). Cinq tests locaux de projection des receipts réussis; ils ne prouvent pas leur présence dans cette mission réelle. Suite technique : identifier la condition manquante dans les événements d'usage avant tout correctif; poursuivre les obligations restantes de l'inventaire sans rouvrir ce parcours validé.


> **Priorité du 22/10 : a6f6fee3c7dc, 109 tests de routage acquis. Mission réelle #39857859228 : worker REJECTED / INVALID_JSON ; spécialistes et P6 non qualifiés. Image AMD64 locale contrôlée, audit zéro, aucune publication. NO-GO stable.**

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

### Second essai réel autorisé : cause immédiate établie

Accord explicite « oui go » pour une seconde et unique mission identique, avec diagnostic de verdict uniquement. [Run #39832255634](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39832255634) : **FAILURE**, job 120011143839, nettoyage SUCCESS. Commit de pilotage `4b36ee850a746011a765cd8991de4ac62b5ad2c4`, branche `ops/live-free-ceb60eca989b-002`. Même source ceb60eca989b, même digest public, mêmes modèles gratuits et charge utile. Le harnais seul charge les deux fichiers de diagnostic au commit 5e4847b ; aucun changement d'image.

Identité OCI, initialiseur, configuration des bindings, catalogue à prix nul, SDK et démarrage réel : PASS. Le résumé Oracle durable établit :
- Worker : un verdict **REJECTED**, code **INVALID_CANDIDATE**.
- Candidat Worker : chaîne de **59 caractères**, **INVALID_JSON**, markdownFence=false.
- specialist_1 à specialist_4 : zéro verdict ; aucune réussite de ces tâches revendiquée.
- SSE HTTP 200, final contenant une partie error MISSION_ORACLE ; P6 réel non exécuté.

La cause immédiate est donc le rejet de la sortie Worker non conforme au JSON attendu. Ce résultat ne prouve ni quota, ni panne de provider, ni activation du fallback. La sortie brute n'est pas affichée et sa cause de non-conformité n'est pas déterminée par les seules métadonnées.

Lecture statique : le harnais vérifie dans le catalogue le support de response_format, mais ne configure pas ce paramètre dans son PATCH des agents (qui ne modifie que model). Cette distinction support/configuration est une piste de correction du harnais, **pas une preuve que l'absence de ce paramètre explique les 59 caractères**, ni un correctif appliqué. Le validateur transmet directement output.content à Oracle ; il n'a pas été modifié et aucun JSON réparé ou fabriqué n'est accepté.

Les deux autorisations de mission unique sont consommées ; aucune troisième inférence lancée. Les gates synthétiques acquis restent acquis. **NO-GO stable ; cinq tâches et P6 réels toujours non validés.**

### Mode JSON : défaut de transmission reproduit et correctif isolé

[Correctif a7ba1729](https://github.com/Arkos77/LibreChat-BOTMODE-V1/commit/a7ba172929168132d6b0fe44c56d0e3f17b40d80), branche `fix/pr77-json-mode-transmission-20261022` ; [checkpoint détaillé](https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/a7ba172929168132d6b0fe44c56d0e3f17b40d80/docs/BOTMODE_V1_JSON_MODE_CHECKPOINT_20261022.md).

Vérification sans appel fournisseur : le harnais n'activait pas JSON mode, et addParams.response_format seul était ensuite perdu car placé dans un champ constructeur que le SDK ignore. Captures HTTP locales initialement rouges sur les deux adaptateurs. Correction isolée : activation json_object uniquement pour le probe cinq tâches ; conversion de cet addParams explicite vers modelKwargs après sélection API et dropParams, hors Responses API.

Build paquet API PASS ; 16 tests API + 234 config/LLM/politiques = **250 tests ciblés PASS** ; syntaxe Bash, diff-check et formatage PASS. Catalogue substitué, vraies initialisations et requêtes SDK limitées au serveur loopback ; aucun secret ni appel modèle externe. Aucun critère Oracle modifié.

**Ce correctif applicatif est distinct de ceb60eca989b et du digest déjà publié.** Il reste sur sa branche isolée, sans fusion, nouvelle image, publication ou troisième mission. La CI OCI n'est pas exécutée pour ce lot local (commit skip-ci) ; aucun résultat antérieur d'image n'est attribué au nouveau source. Le lien causal complet avec la sortie réelle de 59 caractères et les cinq tâches réelles restent à valider sur une image de ce nouveau source. NO-GO stable conservé.

### Qualification conteneur du correctif JSON — acquise

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

## État prioritaire de clôture — 22 octobre 2026, après qualification sécurité

Source proposée isolée : **64248339750f9e0f86e01530eb7067027cec8f6b**, branche fix/security-release-20261022. Le HEAD documentaire de cette branche est distinct ; ni celui-ci ni le HEAD documentaire PR77 ne sont la source embarquée testée.

[Dossier sécurité et preuves complètes](https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/001a923f9f3a73cbe830cbddc4d8df705defbf23/docs/BOTMODE_V1_SECURITY_CLOSEOUT_20261022.md) ; [proposition réelle inactive à approuver](https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/001a923f9f3a73cbe830cbddc4d8df705defbf23/docs/qualification/BOTMODE_V1_FREE_FALLBACK_64248339750f_PROPOSAL.md).

| Domaine | État actuel borné |
|---|---|
| Sécurité du verrou historique | Réaudit : 2 constats critical, 1 high, 5 moderate ; les deux critical partagent la chaîne DOMPurify/Monaco. Les anciens PASS ne valent pas audit actuel. |
| Correctif sécurité | 4 paquets corrigés et 5 transitives requises, 9 entrées changées ; aucune rétrogradation Monaco/Mammoth. |
| Audit du nouveau source | Lock SHA256 **6e59734742daa69251821e2fed6a765febb4e58f9139743a98c91813dff234cf** ; 0 high/critical, 3 moderate résiduels mammoth/argparse/sprintf-js. Nouveau rattachement D-02 requis, pas de prolongation tacite. |
| Tests locaux de ce lot | npm ci propre, builds des 4 paquets, **634 tests ciblés PASS**, formatage/diff-check ; contrôle production prunée également PASS avec 0 high/critical. |
| Images du nouveau source | [Run #39846965864](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39846965864) **SUCCESS** : AMD64 + ARM64 natives, image exacte, 4 contrôles JSON par architecture, versions installées et SUL/notice vérifiées. Images locales supprimées ; aucun manifeste GHCR publié. |
| Oracle / UI / P6 | Sur AMD64 de ce même source : cinq verdicts VERIFIED, sélections UI et message canonique Mongo du même flux navigateur **PASS synthétique**. ARM64 ne couvre pas ces scénarios DB/navigateur. |
| Fournisseur réel / PC-04 | **NON PROUVÉ sur 6424833 / BLOQUÉ_APPROBATION**. Les accords précédents d'une mission chacun sont consommés ; contrôle automatique a rejeté la nouvelle préparation avant branche/secret/exécution. Aucun troisième appel effectué. |
| Suite prête | Une mission native à 5 tâches : 429 local contrôlé sur primaire, fallback OpenRouter/free réel à prix nul vérifié, clé GitHub existante, readback Oracle et P6. YAML conservé hors Actions, inactif ; aucune exécution indirecte. |
| Publication / intégration | La candidate publique ceb60eca989b et son digest 32b29308… restent inchangés ; ils ne contiennent pas les nouveaux correctifs. D-03 pour nouvelle source non accordée ; D-04 fusion/stable non accordée. |
| Portée D-01 | Aucune limitation nouvelle acceptée silencieusement. Nested child externe, création dynamique réelle, endurance/HITL, UX FR/TTS/clé/mobile et limites Full/migration restent à prouver ou arbitrer selon les exigences maintenues. |

La qualification sans clé est achevée malgré le refus de la partie externe ; elle ne contourne pas ce refus. Ni image publiée ni mission fournisseur réelle n'est déduite du succès des deux jobs. **NO-GO stable maintenu.** Les références précédentes ci-dessous/conservées sont historiques pour leur source précise.

## Mission réelle explicitement autorisée — résultat du 22 octobre 2026

L'utilisateur a explicitement autorisé une seule mission après lecture de la proposition. Activation inchangée du YAML proposé sur ops/closeout-64248339750f, commit pilote **297f8ae60cac0c72f364bfe63db624173dbf1890**. [Run #39850473486](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39850473486), job **120074940170** : **FAILURE**. Source construite/testée exacte **64248339750f9e0f86e01530eb7067027cec8f6b**, image locale non publiée, config ID sha256:a5c1a1d489f3124c783c9fe0efd24e8654b8a0631d810ea3b027e5cbfaa2ee7f.

- Source/empreintes, quatre tests SDK JSON, audit production et licences : PASS. Les preuves multiarchitecture synthétiques du run 39846965864 restent acquises.
- Catalogue public : les deux routes autorisées à prix nuls ont été revalidées ; primaire local contrôlé, fallback externe openrouter/free et JSON mode configurés.
- Une seule mission réelle admise, cinq tâches planifiées. Worker : **un verdict VERIFIED / CRITERION_MET**, candidat JSON_OBJECT de 11 caractères, un champ, okExactlyTrue=true. Aucun contenu brut ni secret conservé dans ce registre.
- Spécialistes 1 à 4 : **zéro verdict chacun**. Terminal SSE reçu avec une partie error ; classe expurgée **RATE_LIMIT**, résultat harnais **BLOCKED_PROVIDER**. La mission n'est pas qualifiée.
- Fixture primaire : **14 réponses HTTP 429 contrôlées, 0 requête inattendue**. Ce compteur est une injection locale, pas une mesure de quota OpenRouter. Le worker vérifié avec primaire exclusivement en échec atteste un passage génératif alternatif dans cette configuration ; les traces retenues ne permettent pas d'attribuer définitivement l'erreur terminale au quota externe plutôt qu'au traitement/retry du routage. Aucun reçu fallback final n'a été recueilli.
- Ancien défaut de registre SDK : 0 log Unsupported LLM provider: openrouter ; 0 exception child-thread enregistrée.
- Readback final P6/receipts : **SKIPPED** car la mission échoue ; cinq verdicts, publication canonique réussie et preuve complète PC-04 **NON ACQUIS**.
- Nettoyage stack/volumes/image : SUCCESS. Aucune publication GHCR, fusion, promotion stable/latest ni modification d'installation utilisateur.

Cette autorisation d'une mission est consommée. Aucun replay ni seconde inférence n'est lancé. Le format JSON du worker est désormais validé dans ce scénario, mais le blocage RATE_LIMIT exige une attribution fondée sur des traces ; aucun correctif produit conjectural ni assouplissement Oracle n'est appliqué. D-01 résiduel reste ouvert ; D-02 doit encore rattacher explicitement les trois modérés au nouveau verrou ; D-03 publication nouvelle source et D-04 stable/fusion restent non autorisés.

## Clôture ciblée du routage des spécialistes — 22 octobre 2026

Source courante figée **a6f6fee3c7dcfb5877fe798f759966774a046a58**, branche fix/specialist-host-fallback-20261022, basée sur 6424833. [Checkpoint détaillé](https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/4df7e393e58262d55ea6fd636bb0f1ec1227aac0/docs/BOTMODE_V1_SPECIALIST_ROUTING_CHECKPOINT_20261022.md).

**Cause reproduite :** la mission réelle 39850473486 avait un worker VERIFIED puis RATE_LIMIT sur le spécialiste ; seul le primaire recevait la décision hostModelRouting. Les spécialistes de mission/lazy et les agents découverts gardaient leur primaire sans le fallback pourtant déclaré. Les 14 réponses 429 étaient locales. L'ancien classement harnais BLOCKED_PROVIDER n'établit pas un quota OpenRouter.

**Correction :** réutilisation du même initialiseur avec décision de routage propre à chaque agent, validations natives, budget et provenance durable conservés. Le choix d'un model spec pour le primaire exempte uniquement ce primaire ; il ne désactive plus les politiques des spécialistes. Aucun second routeur ni changement Oracle/P6, aucune copie des credentials/fallbacks du worker vers ses spécialistes.

**Preuve finale :** [run 39855394250](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39855394250), job 120092164281, SUCCESS sur source exacte : installation/builds PASS ; trois cas mission/handoff/lazy échouent bien sur l'ancien initialiseur (fallback undefined), puis **quatre suites / 109 tests PASS** sur le correctif, dont mission-spec et provenance Mongo. Revue après correction : aucun autre constat concret. Vérification ciblée, sans clé ni inférence externe ; pas un PASS de toute la suite monorepo.

Le verrou sécurité reste **6e59734742daa69251821e2fed6a765febb4e58f9139743a98c91813dff234cf**. Aucun changement de dépendances dans ce lot. Les preuves d'image multiarchitecture 642 restent attachées à 642 ; **aucune image a6f6fee3c7dc construite/publiée et aucune mission réelle sur a6f6fee3c7dc**. Le digest public ceb reste inchangé.

[Proposition inactive du prochain essai](https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/4df7e393e58262d55ea6fd636bb0f1ec1227aac0/docs/qualification/BOTMODE_V1_FREE_FALLBACK_a6f6fee3c7dc_PROPOSAL.yml), hors Actions : une seule mission cinq tâches, primaire en 429 local sans attente artificielle de retry, fallback externe openrouter/free avec ses retries conservés, prix nuls revalidés, JSON strict, cinq VERIFIED et readback P6 de la même mission. Configuration exécutée à blanc sans réseau avec catalogue/clé fictifs ; syntaxe YAML/Bash/Python PASS. Autorisation distincte non encore reçue ; l'accord précédent est consommé.

**NO-GO stable.** D-01 résiduel ouvert, D-02 nouveau verrou à rattacher explicitement, D-03 nouvelle publication et D-04 stable/fusion non autorisés. L'initialisation froide/recovery reste inchangée et n'est pas qualifiée par ce correctif.

## Résultat réel définitif a6f6fee3c7dc — 22 octobre 2026

Source applicative figée **a6f6fee3c7dcfb5877fe798f759966774a046a58**. [Checkpoint complet](https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/02c69058b3c84855fdfb52bb5e52f2d683f8c253/docs/BOTMODE_V1_SPECIALIST_ROUTING_CHECKPOINT_20261022.md).

- Premier [run 39856719539](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39856719539) arrêté avant secret/mission : l'audit était vide alors que le harnais attendait exactement trois modérés. Correction du seul contrôle : accepter zéro ou les seuls modérés connus, refuser tout high/critical/alerte inconnue. Cas positifs et négatifs testés localement.
- [Run 39857859228](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39857859228), job **120100634900**, pilote **970353308d1dfb69ab56b41b70d01749822764aa** : **FAILURE** après l'unique mission autorisée. L'image AMD64 locale exacte, quatre tests JSON, dépendances et licence SUL passent. Audit installé : **0 critical / 0 high / 0 moderate à 23:38 Paris** ; pas de changement du verrou 6e59734742daa69251821e2fed6a765febb4e58f9139743a98c91813dff234cf.
- Prix gratuits des deux routes revalidés. **Un 429 local contrôlé, zéro requête inattendue**. Worker : **REJECTED / INVALID_CANDIDATE**, candidat **INVALID_JSON de 59 caractères**, sans clôture Markdown. Spécialistes 1–4 : **zéro verdict**, non atteints. Terminal MISSION_ORACLE ; pas de nouveau RATE_LIMIT établi.
- Readback final P6/receipts **SKIPPED** ; cinq VERIFIED et publication canonique non qualifiés. Nettoyage SUCCESS. Config ID image locale : sha256:7ecd1ba676038586378a63c7b0870949d84dab86a312790019ea6dc068435854 ; image non publiée/supprimée, pas une qualification ARM64.
- Diagnostic après run : **8 tests locaux PASS** sur le SDK réel et HTTP loopback ; response_format=json_object reste présent lors du fallback après429, streaming activé ou non. Extension de test seulement au commit b4eb797c669b502e722c0fc8b7304c2b80e5fbc3. Les 109 tests de routage restent acquis, mais les spécialistes ne sont pas confirmés par ce run réel.
- OpenRouter documente que provider.require_parameters=true rend le support des paramètres obligatoire ; absent du préflight courant, ce contrôle est une piste pour le prochain diagnostic. La cause précise de la sortie invalide n'est **pas prouvée**, et aucune nouvelle modification produit conjecturale n'est appliquée.

**Accord d'une mission consommé, aucun replay. NO-GO stable.** Le digest public ceb reste inchangé ; aucune nouvelle publication GHCR ni fusion/stable/latest. D-01 résiduel et les décisions D-02/D-03/D-04 restent ouverts selon leur périmètre. Le rapport audit zéro n'est pas une nouvelle acceptation de risque ni une preuve de retrait d'avis.


## Mise à jour — méthode de clôture enregistrée le 23 octobre 2026

Méthode et bilan revu : https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/9e8a2fdcf36e8f1329134f4e1296920e5852d05a/docs/BOTMODE_V1_CLOTURE_METHODIQUE_20261023.md . Diagnostic local : 25 tests ciblés réussis, sans nouveau build ni appel fournisseur. Workflow observé préparé mais inactif; nouvelle mission soumise à autorisation spécifique, la précédente étant consommée. Source applicative a6 inchangée. Le rejet JSON de la dernière mission réelle reste le blocage; aucun succès spécialistes/P6 supplémentaire, publication ou fusion ne doit être déduit de cette préparation. D01–D04 conservent leurs limites précédentes.


## Mission observée du 23 octobre 2026 — quatre verdicts, 429 final

Run 39870514640 / job 120143482290, source applicative a6 inchangée : Worker et spécialistes 1–3 VERIFIED; spécialiste 4 sans verdict après HTTP 429 réel de openrouter/free. Cinq 429 primaires artificiels, quatre 200 fallback puis un 429 fallback observés; JSON et require_parameters présents dans toutes les requêtes fallback. P6 non validé. Deux correspondances HTTP→Oracle exactes; deux captures tronquées par la borne, donc comparaison globale incomplète sans preuve d'altération. Nettoyage réussi; autorisation unique consommée, aucune relance. Audit installé zéro critical/high/moderate. Image réutilisable un jour, pas de publication GHCR. Résultat détaillé et limites : https://github.com/Arkos77/LibreChat-BOTMODE-V1/blob/b6cb0a62c0d897790e5f6253385470e581c3fabf/docs/BOTMODE_V1_OBSERVED_MISSION_RESULT_20261023.md . Blocage actuel : limite fournisseur avant le cinquième verdict; ne pas relancer à l'identique sans capacité/route nouvelle autorisée. D01–D04 inchangés, NO-GO stable maintenu.
