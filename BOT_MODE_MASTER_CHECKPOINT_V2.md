# BOT MODE MASTER CHECKPOINT V2

Version:
2.0

Date:
2026-09-27

==================================================
SOURCE DE VERITE
==================================================

Projet:
BOT MODE intégré nativement dans LibreChat.

Repository:
~/agent-workspace/LibreChat

Règle absolue:

BOT MODE ne crée pas un runtime parallèle.

BOT MODE utilise:
- LibreChat native runtime
- Subagent runtime existant
- Task Engine existant
- Memory existante
- RAG existant

BOT MODE ajoute:
- orchestration
- décision
- politique
- gouvernance
- contrôle
- routage
- validation
- provenance
- récupération


==================================================
METHODE OBLIGATOIRE
==================================================

Lire
Comprendre
Reproduire
Prouver
Instrumenter
Patch minimal
Test ciblé
Tests voisins
Build
Documenter


==================================================
ETAT GIT
==================================================

Branche:
bot-mode-p4-closed

Dernier commit validé:

a76f854 docs(bot-mode): add persistent project checkpoints


Commits P10:

0168e4c feat(bot-mode): expose transient evidence buffer per agent request

589747c feat(bot-mode): add transient tool evidence buffer

a63a615 feat(bot-mode): normalize step-limit candidate context

cf1e548 feat(bot-mode): bind host evidence to bounded context


==================================================
PHASE ACTIVE
==================================================

P10 Evidence / Oracle bridge

Sous-phase:

P10.2 Tool-end controlled bridge


Objectif:

connecter:

createToolEndCallback

vers:

ToolEvidenceIntentDeclaration

vers:

transientEvidenceBuffer


Contraintes:

FAIL CLOSED

Aucune collecte automatique.

Interdit:

- raw input
- raw output
- artifact
- reasoning
- interprétation modèle


Données autorisées:

toolCallId
toolName
producerAgentId
taskId
traceId
runId
threadId
criterionId
value


==================================================
ARCHITECTURE BOT MODE
==================================================

USER
↓
ROOM / PROJECT
↓
DIRECTOR
↓
ORCHESTRATOR
↓
INTENT
↓
DECISION LAYER
↓
POLICY AUTH BUDGET RISK
↓
TASK ENGINE
↓
DAG
↓
AGENT FACTORY
↓
SPECIALISTS
↓
CAPABILITY ROUTER
↓
MODEL ROUTER
↓
LIBRECHAT SUBAGENT RUNTIME
↓
TOOLS / WEB / RAG / CODE / MCP / MEDIA
↓
MEMORY
↓
EVIDENCE
↓
ORACLE QA
↓
SYNTHESIS


==================================================
JARVIS TEMPORAIRE
==================================================

Flux:

ChatGPT
↓
Chromium relay
↓
relay.sh
↓
JARVIS
↓
execution locale
↓
[JARVIS_RESULT]


JARVIS exécute.
ChatGPT prépare le mandat.
Git garde la preuve.


==================================================
PROCHAINE ACTION
==================================================

Terminer P10.2:

1. corriger callback chirurgicalement
2. ajouter tests
3. build API
4. documenter
5. commit


==================================================
REGLE REPRISE
==================================================

Ne jamais recommencer l'historique.

Toujours lire ce checkpoint avant action.

==================================================
MISE A JOUR OPERATIONNELLE — 2026-09-27, APRES P11
==================================================

Les sections historiques P10.2 ci-dessus decrivent l'etat au moment de leur
redaction. Pour la reprise, cette section plus recente fait autorite.

Branche: bot-mode-p4-closed
P10: termine par e0b3ec3 (tool evidence bridge).
P11: contrat DecisionRecord et observation MTO DECIDED bornes, termines par
8efd012 feat(bot-mode): add bounded P11 decision record.

Validation P11: 26 tests sur decision/routing/mto, build packages/api et
verification du diff; commit local effectue. Le hook de commit a valide les
controles affectes. Aucun push n'a ete effectue.

P11 reste une frontiere de contrat: aucune execution automatique de provider
ni integration implicite dans createRun. Le DecisionProvider existant dans
routing.ts ne classe que les candidats autorises et admissibles.

Etat local hors P11 a preserver: .devcontainer/docker-compose.yml modifie,
.devcontainer/devcontainer-lock.json non suivi, deux sauvegardes .bak-p10.2
non suivies sous api/server. Ne pas les inclure dans un commit BOT MODE.

Prochaine etape: examiner une integration hote explicite du contrat de decision
avec le routage autorise, la politique et la provenance, en prouvant d'abord
un appel de production concret. Ne pas inventer un second runtime ni brancher
sur agentInputs comme s'il s'agissait de candidats modeles concurrents.

==================================================
MISE A JOUR OPERATIONNELLE — APRES P12
==================================================

Commit: 18c1d82 feat(bot-mode): add bounded authorization observation.
P12 fournit un enregistrement de resultat d'autorisation fourni par l'hote et
son observation MTO bornee (AUTHORIZED / DENIED / HUMAN_APPROVAL_REQUIRED).
Ce contrat ne delivre aucun droit et n'est pas branche sur les ACL natives.
Validation: 36 tests voisins, build packages/api, hook ESLint et controles Git.

Audit d'integration P9/P11: aucun appel de production de rankAuthorizedResources,
routeAuthorizedModelBindings, createDecisionRecord ou fromDecisionRecord.
agentInputs dans createRun est une topologie de graphe, pas une liste de modeles
concurrents. Attendre un ensemble reel d'alternatives resolues et autorisees.

Audit P10 taskId: le tour principal n'expose pas ici de taskId Task Engine
prouve. Les child event deliveries disposent de eventTaskId, transmis au
candidat MTO lorsque present. Le signal OBSERVED local sert au resume; le
CANDIDATE publie porte deja l'identite native optionnelle. Ne pas activer
Distill en inventant taskId depuis traceId, responseMessageId ou runId.

Prochaine preuve: identifier une entree hote qui fournit effectivement des
alternatives autorisees pour un meme binding, ou un vrai taskId Task Engine pour
un candidat P10, avant toute activation de decision/autorisation/Distill.

==================================================
MISE A JOUR OPERATIONNELLE — MTO DURABLE
==================================================

Le contrat owner/tenant-scoped `MtoObservation` est commité en 9bc5058.
Il conserve quatre observations hôte bornées, rejette les champs inconnus,
préserve les identités causales distinctes, assure rejeu exact/conflit explicite,
append-only et lecture paginée. Validation: 24 tests de persistance voisins,
build data-schemas et API, puis hook Git.

Le sink de production reste un logger stateless. `mtoTraceId` est stocké dans
le job; le propriétaire vient de `req.user.id`. `GenerationJobManager.createJob`
prend le locataire dans le contexte de requête et la façade `job.metadata`
restitue `userId` et `tenantId`. Cependant le sink MTO est fourni comme fonction
globale, sans liaison explicite de ce périmètre à chaque émission initiale,
reprise ou enfant. Vérifier ce lien pour chaque chemin avant d'activer les
écritures durables. Aucun événement MTO
n'accorde permission, ne règle Task Engine ou ne déclenche publication.

==================================================
MISE A JOUR OPERATIONNELLE — REJEU CANDIDAT P10
==================================================

Le candidat workflow emis apres la limite native d'appels outil utilise
maintenant la date de creation durable de la generation, sur la requete initiale
et la reprise. Cette date stable fait partie du snapshot immuable et de son
empreinte; un rejeu du meme candidat ne varie plus avec l'horloge du processus.
Le mock de la requete initiale expose le vrai createStepLimitEvidenceContext,
ce qui verifie effectivement le chemin de persistance du candidat. Aucun droit
ni publication autonome n'est ajoute.

==================================================
MISE A JOUR OPERATIONNELLE — P12 ACL SKILL EDIT
==================================================

Le contrôle natif `canEditSkill` fourni au gestionnaire d'outils est observé
après sa décision, sans second contrôle ACL. Pour les générations traçables,
l'hôte crée un AuthorizationRecord et écrit AUTHORIZED/DENIED dans
MtoObservation sous l'utilisateur authentifié et le locataire résolu par
`resolveRequestTenantId`; un test Mongo couvre le refus, l'accord et
l'isolement propriétaire/locataire. L'observation ne modifie jamais la décision
native, y compris lors d'une panne du store ou du sink. Le `policyVersion`
identifie le profil de contrôle hôte, pas la version des ACL variables.

Portée: ce résultat décrit uniquement le bit EDIT d'un skill. Il ne prouve
ni une publication P10, ni un succès de mutation, ni une validation humaine.
Les chemins sans `mtoTraceId` et les autres types d'événement restent sans
écriture durable P12; aucune identité Task Engine n'est inventée.

Extension P12 : `canCreateSkill` est également observé sur l’opération de
fichier skill. Une pause native `tool_approval` confirmée après la barrière
d’historique émet HUMAN_APPROVAL_REQUIRED en requête initiale et en reprise.
L’identité d’événement est stable pour le rejeu, distincte de l’`actionId`
natif et de l’`authorizationId`; la portée reste propriétaire/locataire/trace.
Une question utilisateur et un échec de persistance de pause ne sont pas
qualifiés d’autorisation humaine. Aucun de ces événements ne valide une
publication P10 ni ne remplace le contrôle d’approbation natif.

==================================================
VALIDATION TRANSVERSALE P0–P12 — 2026-09-27
==================================================

La validation porte sur les frontières réellement présentes dans ce checkout.
Les numéros P0–P8 n'ont pas de matrice de correspondance exhaustive dans les
checkpoints du dépôt; leur complétude globale reste À REVALIDER et ne se déduit
pas des tests P9–P12.

- P4 / Task Engine natif : subagentThreadTaskStore est appelé par le serveur et
 possède des tests dédiés; une campagne ciblée de reprise/settlement reste à
 relancer avant une affirmation globale sur P4.
- P5 / Oracle : contrats et tests dédiés dans packages/api/src/agents/oracle;
 l'invocation automatique par membre du graphe n'est pas branchée par le
 compilateur BOT MODE. Vérifier cette frontière séparément.
- P9 / P11 : routage autorisé et DecisionRecord passent leurs tests de contrat,
 mais aucune source hôte de plusieurs alternatives autorisées pour un même
 binding n'est prouvée. Aucun appel de production du routeur/DecisionRecord.
- P10 : le chemin de production prouvé crée seulement le candidat workflow
 borné sur tool_call_limit après persistance de la réponse. Son locataire
 provient désormais de resolveRequestTenantId(req), comme l'observation P12;
 un rejet asynchrone du sink MTO reste contenu après persistance. Les autres
 étapes Distill, Oracle, autorisation et publication restent sans appel de
 production et requièrent une identité Task Engine native et une preuve
 indépendante; aucun identifiant n'est fabriqué.
- P12 : observations natives skill EDIT/CREATE et pause tool_approval sous
 propriétaire/locataire/trace, validées sur requête et reprise. Elles ne
 constituent ni approbation humaine obtenue ni permission de publication P10.

Preuves de cette passe : 24 suites orchestrator, 156 tests; quatre suites API
voisines, 347 tests; build packages/api réussi; node --check et diff --check.
Le typecheck complet packages/api a échoué par épuisement mémoire à 2 Go puis
3 Go de heap sur cette machine; aucun succès de typecheck n'est revendiqué.
Prochaines preuves : suites Oracle et Task Engine natif, puis matrice des phases
P0–P8 établie sur leurs vrais appels hôtes et tests. Ne pas marquer la chaîne
P0–P12 de bout en bout VALIDÉE sur cette base partielle.

==================================================
MATRICE DE PREUVES ACTUALISÉE — 2026-09-27
==================================================

Cette section remplace les « prochaines preuves » de la section précédente
pour les suites effectivement exécutées depuis. Une suite verte valide son
contrat et son montage testé, pas automatiquement toute l'architecture cible.

| Phase ou frontière | Preuve exécutée | Portée et état restant |
| --- | --- | --- |
| P0–P3, P6, P8 | Les checkpoints présents ne définissent pas leur correspondance exhaustive avec les fichiers du checkout. | À REVALIDER par une spécification de phase et des appels hôtes explicites; ne pas déduire leur achèvement des suites voisines. |
| P4, reprise native | checkpointer + intégration, mémoire, HITL : 119 tests dans 5 suites; Task Engine/Oracle : 110 tests dans 3 suites; API HITL et ask_user_question : 7 tests dans 2 suites. Le scénario de reprise d'un SubagentExecutor reconstruit sans réexécuter researcher est inclus dans checkpointer.integration.spec.ts. | Les invariants couverts passent. L'intégration interréplicas subagentCrossReplica.integration.spec.ts était ignorée faute de REDIS_URI : UNKNOWN dans cette passe. |
| P5, Oracle | oracle/runtime.spec.ts et deterministic.spec.ts dans les 110 tests ci-dessus; montage natif opt-in createRun({ oracle }) prouvé. | Pas de QA automatique de chaque enfant d'un graphe ni de verdict transformé en permission. |
| P7, RAG | fileSearch.test.js : 13 tests. | rag.integration.spec.ts : 5 tests ignorés sans P7_RAG_E2E; le conteneur librechat_devcontainer-app-1 requis n'était pas présent. L'isolation et la lecture réelle pgvector de bout en bout ne sont pas revalidées ici. |
| Fondations transversales sans numéro certain | Contexte, run, runtime, autorisation, mandats et réservation : 147 tests passés, 1 suite interréplicas ignorée; réservation atomique data-schemas : 28 tests. | Contrats validés dans ces montages; ne pas les attribuer à P0–P3/P6/P8 sans source de phase. |
| P9 | Contrats orchestrator : 156 tests dans 24 suites, incluant planner, native et routing. | Le routeur n'a pas de pool hôte de bindings concurrents déjà autorisés en production. agentInputs est la topologie du graphe. |
| P10 | Candidat durable sur tool_call_limit, contrat et registres : 347 tests dans 4 suites API voisines, 24 tests dans 3 suites data-schemas; builds API et data-schemas réussis. Correctif 1094aab. | Distill → Oracle → autorisation → publication sans appel hôte de production prouvé; le tour principal ne fournit pas de taskId Task Engine natif. Le workflow reste proposal-only. |
| P11 | DecisionRecord et projection DECIDED parmi les 156 tests orchestrator. | Aucun appel de production du Decision Provider ou du record avec alternatives admissibles réelles. |
| P12 | 361 tests dans 7 suites API avant le correctif P10, puis 346 tests dans 5 suites après commit 9a4d655; observations EDIT/CREATE et pause tool_approval. | L'observation n'accorde ni permission, ni approbation, ni publication P10. |

Le typecheck complet packages/api est toujours NON OBTENU : Node a épuisé
son heap à 2 puis 3 Go. Les builds tsdown ne remplacent pas ce contrôle.
Prochaine décision technique : fournir une source hôte de plusieurs bindings
réellement autorisés pour P9/P11, ou une identité Task Engine native liée à un
candidat et une preuve Oracle indépendante pour P10. Sans ces entrées, conserver
les frontières fail-closed et ne pas déclarer P0–P12 validé de bout en bout.

==================================================
PREUVE P7 RAG RÉELLE — 2026-09-27
==================================================

Le conteneur existant librechat_devcontainer-app-1 a été redémarré sans rebuild.
La première exécution P7_RAG_E2E=1 échouait avant l'ingestion : le test forçait
UID 1000, alors que l'utilisateur du conteneur vscode (UID 1001) possède
/workspaces/.env.temp et /workspaces/logs. Le test utilise désormais
l'utilisateur déclaré du conteneur via docker exec sans --user figé.

Preuve : packages/api/src/files/rag.integration.spec.ts, 5 tests passés avec
RAG et pgvector réels. Le test hôte fileSearch.test.js avait passé 13 tests.
L'exécution vérifie ingestion, readback pgvector, consommation dans createRun,
provenance et isolation sous le périmètre authentifié configuré. Elle ne prouve
pas la véracité générale des documents ni la qualité d'un fournisseur LLM réel.
P7 passe de « non exécuté dans cette passe » à « intégration prouvée dans ce
montage ». Les autres frontières ouvertes de la matrice demeurent inchangées.

==================================================
PREUVE P4 INTERRÉPLICAS — 2026-09-27
==================================================

Un conteneur Redis 7 Alpine éphémère a été lié uniquement à
127.0.0.1:16379. Avec REDIS_URI=redis://127.0.0.1:16379,
subagentCrossReplica.integration.spec.ts a passé son test d'intégration
(1/1) : routage vers le propriétaire de l'exécution et livraison des deux
wakeup frères après perte du propriétaire. Le conteneur de test a ensuite été
arrêté et supprimé par --rm. Aucun service durable ni volume n'a été modifié.

Les deux preuves précédemment non exécutées dans cette passe sont désormais
obtenues : P7 RAG/pgvector réel (5/5) et P4 interréplicas Redis (1/1).
Cette validation de leurs parcours ciblés ne change pas les frontières P9/P11
et P10 sans appel de production prouvé, ni les phases P0–P3/P6/P8 dont la
correspondance exhaustive demeure inconnue.

==================================================
TYPECHECK API RÉTABLI — 2026-09-27
==================================================

Un typecheck complet avec NODE_OPTIONS=--max-old-space-size=4608 a révélé
26 erreurs TypeScript dans les contrats orchestrator que tsdown et Jest ne
signalaient pas. Les adaptateurs Distill, disposition, MTO et routing conservent
leurs frontières : copie mutable des preuves, vérification terminale Oracle,
discrimination explicite des événements et clonage des options SDK. Les fixtures
ont été alignées sur les types Oracle et ImprovementCandidate courants; les
digests d'autorisation restent présents dans les requêtes.

Validation : npx tsc --noEmit dans packages/api passe sans erreur avec le heap
indiqué; 24 suites orchestrator et 156 tests passent; build packages/api passe.
La ligne précédente « typecheck NON OBTENU » est historique et est remplacée
par cette preuve. Elle ne rend pas actifs les appels hôtes P9/P11 ni le chemin
Distill → Oracle → publication P10, toujours non prouvés en production.

==================================================
AUDIT P9/P11 — 2026-09-27
==================================================

Rapport de reprise au nom unique : BOT_MODE_P9_P11_AUDIT_2026-09-27.md.
Le catalogue modelsConfig, une model spec sélectionnée et les membres du graphe
ne fournissent pas plusieurs bindings autorisés pour un même agent. P9 ferme
l'absence d'agentId; P11 exige un timestamp hôte valide. L'activation hôte
reste fermée jusqu'à une source de candidats autorisés à l'initialisation et
à la reprise. Aucun DECIDED de production n'a été fabriqué.

## Audit P10 des identités — 27 septembre 2026

L’identifiant de livraison d’un event actor (`clientRequestId`, restauré depuis `job.metadata.idempotencyClientRequestId` à la reprise HITL) est désormais tracé sous `eventActorTaskId` dans MTO. Il ne remplit plus le champ `taskId` du Task Engine dans les observations de sous-agent et les candidats de limite d’appels d’outils. Le vrai `taskId` natif est créé par `InMemorySubagentTaskStore.start` et transmis dans `SubagentTaskRuntime.taskId` au store hôte `SubagentThreadTaskStore`. Aucun producteur de candidat de tour principal ne dispose actuellement d’un lien prouvé vers cette identité ; Distill, Oracle et publication P10 restent donc non activés dans ce chemin.

## P10 — limite native des tâches enfants détachées

Le SDK `d4f3c6a6bbd38ac555d29b287d4f9e2ab5185932` transporte la trace fournie par l’hôte et conserve le code typé `GRAPH_RECURSION_LIMIT` jusqu’au store des tâches enfants. Après persistance confirmée du message d’échec, le store observe cette limite avec son vrai `runtime.taskId` et le timestamp du message. Le candidat durable reste `proposal-only` ; son `candidateId` distingue les tâches sœurs d’une même trace, et MTO porte le `taskId` natif. Les erreurs ordinaires, les traces absentes et les écritures échouées ne produisent pas de candidat. Distill, Oracle et publication ne sont pas activés par ce chemin.

## P10 — identité producteur de l’enfant natif

Pour une tâche enfant de type agent, le store capture `subagentAgentId` uniquement depuis l’événement natif `start` correspondant à son parent, son appel outil et son type. Il transmet le champ facultatif `producerAgentId` au candidat MTO après la persistance de l’échec typé. Un événement étranger ou absent et la racine synthétique d’un sous-graphe ne fournissent pas cette identité. Le candidat demeure `proposal-only` ; aucune preuve Oracle indépendante ni activation Distill ou publication ne résulte de cette corrélation.
