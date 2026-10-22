# BOT MODE V1 — PR #76 — checkpoint de qualification du 22 octobre 2026

## Périmètre immuable

- PR : https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/76
- Branche applicative : `fix/botmode-worker-agent-selection-20261021`
- **Source applicative qualifiée** : `f0e102ffdfe4e562252c0e401781bccedcedbbbc`.
- Candidate OCI multiarchitecture GHCR : `ghcr.io/arkos77/librechat-botmode-v1:sha-f0e102ffdfe4` (alias candidat : `candidate-botmode-v1-f0e102ffdfe4`).
- Workflow de qualification exact sur branche de tests séparée `ci/qualify-f0e102ffdfe4` : https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39707168135. La branche de tests épingle la source applicative `f0e102f` ; les changements sur cette branche sont propres au harnais de qualification.
- Construction et publication GHCR : https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39705834398.

## Preuves acquises

1. **Construction et image** : tous les huit jobs de la construction candidate réussis, dont préflights amd64/arm64, garde de tag immuable, constructions amd64/arm64, manifeste multiarchitecture, pull GHCR public et smoke Lite.
2. **Installation reproductible** : job `Clean Lite install and API restart, exact candidate OCI` réussi dans le run 39707168135 ; provisioning de six agents et contrôle authentifié réussis.
3. **Mission navigateur réelle** : `CI_BROWSER_REAL_MISSION_POST_AUTHORIZED=PASS`, `CI_BROWSER_REAL_MISSION_ADMITTED=PASS`, `CI_BROWSER_ORIGIN_STREAM_TERMINAL=complete`.
4. **Sélection** : `CI_BROWSER_AUTO_AUTHORIZED_IDS_ROUTED=PASS`, `CI_BROWSER_MANUAL_AUTHORIZED_IDS_ROUTED=PASS`, `CI_BROWSER_REAL_OCI_PROJECT_AGENT_MODES=PASS`.
5. **Activité simulée du graphe cinq tâches** : deltas `completion_calls=5`, `child_responses=5`, `parent_tool_requests=0`, `parent_final=0`, `missing_tool=0`. Ces compteurs prouvent cinq appels/réponses du simulateur et non une délégation native parent/outils ni la qualité sémantique des résultats.
6. **Oracle pour la mission issue du navigateur** : `CI_BROWSER_MISSION_SAME_STREAM_ORACLE_VERIFIED=PASS`. C'est le flux navigateur lui-même, pas seulement un run autonome.
7. **Scénarios autonomes Oracle et P6** : `CI_ORACLE_ACCEPT_PERSISTED_STATUS=VERIFIED`, `CI_ORACLE_ACCEPT_PUBLICATION=PASS`, `CI_ORACLE_REVIEW_CANDIDATE_SUPPRESSED=PASS`, `BOTMODE_PLANNED_SPECIALIST_ORACLE_E2E=PASS`.
8. **Durabilité des descendants** : `BOTMODE_DURABLE_CHILD_LINEAGE_RESTART=PASS`.
9. **Checks généraux de la source applicative** : tests unitaires frontend, TypeScript client, Vite, statiques, E2E Playwright et Docker smoke réussis dans les runs PR du commit `f0e102f` (voir onglet Checks de PR #76).

## Correction qualifiée

La mission émise par `client/src/hooks/Chat/useChatFunctions.ts` contient désormais un contrat Oracle `validation.criteria` (`ok === true`) hérité par chaque tâche. Les instructions demandent un objet JSON strict avec `ok` et `result`. Ce critère vérifie une forme minimale et non la véracité des assertions externes ; aucune autorité de publication supplémentaire n'est confiée au modèle.

## Réserves explicites

- La qualification intégrée repose sur un **fournisseur de modèle simulé**. La qualité des contenus et un chemin réel de production avec un fournisseur configuré n'ont pas été qualifiés par ce run.
- La présence d'un verdict `VERIFIED` dans le même flux navigateur est vérifiée ; une assertion dédiée prouvant les **cinq verdicts, leur identité exacte, leurs preuves durables et la barrière P6 de publication de ce même flux** demeure à renforcer. Les assertions P6 réussies concernent des scénarios autonomes.
- `CI_SUBAGENT_UPDATE_COUNT=0` sur le stream rejoué : observation non bloquante de ce protocole ; les compteurs et le plan ne doivent pas être présentés comme une preuve SSE de sous-agent natif.
- L'ancien workflow de PR `botmode-v1-exact-candidate-oci-probe.yml` demeure épinglé à `087c9693...` et refuse volontairement la dérive de source ; son échec sur `f0e102f` n'est pas un échec de la nouvelle image. Le run exact recalé `39707168135` est vert. Aligner le check requis de PR sur la qualification immuable avant fusion pour ne pas masquer un rouge.
- Un commit ultérieur de documentation change le HEAD Git, **pas** la source applicative qualifiée. Tout changement de code postérieur à `f0e102f` exigerait une nouvelle image/qualification.

## Décision et interdictions

**Verdict : candidate technique qualifiée sur simulateur ; release stable non autorisée.**

Ne pas fusionner PR #76, supprimer le statut draft, taguer une nouvelle version stable, déployer chez l'utilisateur ou remplacer des installations sans approbation humaine explicite. Avant demande de promotion, vérifier les statuts requis sur le HEAD de PR et traiter les réserves de preuve intégrée ci-dessus.


## Addendum — fournisseur réel OpenRouter (22 octobre 2026)

Run: https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39712205594 — **SUCCESS** (jobs `current-candidate-runtime` et Lite).

Le modèle gratuit OpenRouter a exécuté une mission réelle structurée en **deux nœuds** : Worker puis spécialiste. Preuves journalisées : `CI_LIVE_FREE_EVENT_WORKER_NODE_EVENT=5`, `CI_LIVE_FREE_EVENT_SPECIALIST_NODE_EVENT=14`, `CI_LIVE_FREE_STRUCTURED_SPECIALIST_PLAN=PASS`, `CI_LIVE_FREE_STRUCTURED_SPECIALIST_ORACLE=PASS`, `CI_LIVE_FREE_ORACLE_VERIFIED_AND_PUBLISHED=PASS` et `BOTMODE_LIVE_FREE_STRUCTURED_SPECIALIST_ORACLE=PASS`. Le flux SSE a émis une réponse terminale, sans erreur.

**Portée exacte :** deux agents du graphe natif ; aucune conversation sous-agent imbriquée n'a été observée (`CI_LIVE_FREE_NESTED_CHILD_THREAD=NOT_OBSERVED`). Il serait inexact de transformer ce constat en réussite du scénario nested-child. Le test navigateur à cinq spécialistes repose toujours sur le modèle synthétique ; la preuve MongoDB de publication finale du *même flux navigateur* reste à acquérir.

Les échecs intermittents précédents sont conservés dans l'historique et ne doivent pas être effacés du rapport. Aucun changement applicatif postérieur à `f0e102f` n'est inclus dans cette qualification.


## Addendum — publication MongoDB du flux navigateur (22 octobre 2026)

Run https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39713209780 — **SUCCESS** pour les jobs runtime et installation Lite. Le flux **réellement admis depuis le navigateur**, avec cinq tâches et un fournisseur synthétique, conserve cinq verdicts Oracle vérifiés sous son propre stream ID (`CI_BROWSER_FIVE_TASK_VERDICTS_VERIFIED=PASS`, `CI_BROWSER_MISSION_SAME_STREAM_ORACLE_VERIFIED=PASS`). La lecture indépendante de MongoDB sur ce même identifiant prouve conversation parente présente, réponse assistant finale non vide et complète (`CI_BROWSER_P6_PARENT_HISTORY=TRUE`, `CI_BROWSER_P6_FINAL_MESSAGE=TRUE`, `CI_BROWSER_P6_MONGO_COMMITTED=TRUE`, `CI_BROWSER_P6_SAME_STREAM_PUBLISHED_MONGO=PASS`).

Cette preuve complète celle du run OpenRouter gratuit réel #39712205594 (deux tâches séquentielles, Oracle et publication). Elle ne démontre pas une mission navigateur cinq tâches avec un fournisseur réel, ni l'existence d'une conversation enfant imbriquée. Le code applicatif qualifié demeure `f0e102ffdfe4e562252c0e401781bccedcedbbbc`; seuls les contrôles CI et la documentation ont changé. PR #76 maintenue non fusionnée.


## Addendum — diagnostic cinq tâches réelles et barrière Oracle (22 octobre 2026)

- [Run cinq tâches réelles #39716464906](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39716464906) : **FAIL** après exécution du Worker et du premier spécialiste. Le graphe `SEQUENTIAL` compte cinq tâches ; deux verdicts seulement sont persistés ; la réponse SSE terminale inclut un élément de type `error`. Ne pas assimiler un `final` SSE sans événement `error` à une publication Oracle vérifiée.
- [Run de qualification renforcée #39717176805](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39717176805) : **FAIL attendu au contrôle Oracle**. Diagnostic sans fuite de contenu : `CI_LIVE_FREE_FINAL_ERROR_CLASS=MISSION_ORACLE`, `CI_LIVE_FREE_TERMINAL_ERROR_PLAN_TASKS=5`, `CI_LIVE_FREE_TERMINAL_ERROR_VERDICT_TASKS=2`, `CI_LIVE_FREE_FAIL=TERMINAL_CONTAINS_ERROR_PART`. La barrière Oracle refuse correctement de valider une mission incomplète. Ce code d'erreur ne prouve **pas** à lui seul que la cause initiale est le fournisseur plutôt que l'arrêt du graphe.
- [Contrôle automatique PR #39717145159](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39717145159) : **SUCCESS**, y compris OCI/Lite/browser P6 synthétique. La source applicative immuable `f0e102f` reste inchangée ; le seul correctif de ce lot est le contrôle CI qui classe et refuse une réponse finale contenant un élément `error`.

**Blocage avant release** : expliquer pourquoi un graphe natif de cinq tâches ne parcourt pas ses cinq nœuds sur le modèle gratuit ; vérifier les arrêts de run, la politique de budget/limites, les outils effectivement proposés au modèle et la réutilisation de l'identité du même spécialiste. Ne pas présenter le parcours à cinq tâches OpenRouter comme validé ni assouplir Oracle pour le faire passer.


## Addendum — cinq tâches séquentielles, même spécialiste, fournisseur synthétique (22 octobre 2026)

[Run CI #39719895095](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39719895095) : **SUCCESS** sur `current-candidate-runtime` et `Clean Lite install and API restart`. Validation supplémentaire introduite sur la candidate applicative inchangée `f0e102f` :

- `CI_FIVE_NATIVE_ADMISSION_HTTP=200`
- `CI_FIVE_NATIVE_SEQUENTIAL_GRAPH=PASS`
- `CI_FIVE_NATIVE_FIVE_ORACLE_VERDICTS=PASS`
- `CI_BROWSER_FIVE_TASK_VERDICTS_VERIFIED=PASS`
- `CI_BROWSER_P6_SAME_STREAM_PUBLISHED_MONGO=PASS`

Le scénario **cinq tâches dépendantes, une tâche Worker + quatre nœuds spécialiste utilisant la même identité d'agent autorisée** est exécuté et ses cinq verdicts Oracle sont persistés lorsque le fournisseur simulé renvoie la structure JSON attendue. Cela démontre le fonctionnement du graphe natif dans cette configuration contrôlée, mais ne prouve pas la réussite d'une mission de cinq tâches sur un modèle OpenRouter réel. Les runs réels #39714676111, #39716464906 et #39717176805 restent des échecs ; ils ne doivent pas être effacés ni attribués sans preuve à une cause unique (sortie du modèle, disponibilité du fournisseur, limite d'exécution ou autre intégration).

La barrière Oracle et le contrôle CI refuseront toujours une publication à cinq tâches quand seuls un ou deux verdicts sont durables. **Aucune modification du code applicatif ni de l'image OCI ; pas de promotion stable.**


## Addendum — diagnostic OpenRouter gratuit et quota (22 octobre 2026, lot de clôture)

- [Run OpenRouter réel à cinq tâches #39728962748](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39728962748) : **FAIL**, `CI_LIVE_FREE_FINAL_ERROR_CLASS=RATE_LIMIT`, `CI_LIVE_FREE_FINAL_CONTENT_TYPES=error`, `CI_LIVE_FREE_SSE_EVENTS_SEEN=3`, `CI_LIVE_FREE_FAIL=TERMINAL_CONTAINS_ERROR_PART`. Le modèle gratuit refuse l'exécution avant vérification Oracle ; ne pas attribuer cet essai à une régression du graphe.
- [Contrôle automatique PR #39728924273](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39728924273) : **SUCCESS** (OCI synthétique et Lite).
- [Run metadata/quota #39729381847](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39729381847) : **SUCCESS**, mais job d'inférence volontairement **SKIPPED** : aucune preuve de cinq tâches réelles. Un quota journalier positif ne garantit pas la disponibilité instantanée du fournisseur ni l'absence de limite par minute.

**Règle de clôture :** le rate limit est une indisponibilité du fournisseur à traiter par les mécanismes existants de retry/fallback gratuit, pas une raison de publier une mission Oracle incomplète. Ne pas affirmer qu'un fallback a été exercé sans trace de changement effectif de modèle et de reprise de la même mission ; ne pas démarrer de rafales de générations uniquement pour consommer le quota gratuit. La candidate applicative reste `f0e102f` jusqu'à correction démontrée et nouveau build qualifié. PR #76 maintenue DRAFT.
