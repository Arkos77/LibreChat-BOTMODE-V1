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

## P10 — preuve Oracle indépendante pour l’enfant

Audit du chemin natif : le candidat enfant possède `taskId` et, pour un agent simple dont le démarrage correspond, `producerAgentId` dans MTO. Aucun appel de production ne fournit encore une déclaration hôte de critère `target` liée à un outil vérificateur distinct pour cet enfant. L’adaptateur de preuve et l’Oracle déterministe refusent désormais de qualifier un appel outil sans `source.agentId` connu de preuve indépendante. Le test de composition candidat → Distill → Oracle retourne UNKNOWN sans vérificateur et VERIFIED avec une identité de vérificateur distincte explicitement fournie ; il ne constitue pas un appel hôte de production ni une autorisation. P10 reste `proposal-only` jusqu’à une provenance de vérification réelle et une activation contrôlée séparée.

## P10 — isolation des observations outil en mémoire

Le buffer transitoire d’une requête peut recevoir plusieurs tâches enfants. Son rejeu est désormais dédupliqué par (`taskId`, `toolCallId`) ; deux tâches qui réutilisent le même identifiant d’appel outil conservent chacune leur observation et l’éviction retire la bonne clé. Sans `taskId`, le comportement local antérieur reste conservé. Cette correction ne fournit pas une preuve Oracle : le callback de production ne reçoit toujours ni déclaration hôte configurée ni identité `taskId` de l’appel outil enfant.

## P10 — projection native des fins d’outil enfant

Le SDK transmet `run_step_completed` depuis le graphe enfant ; il ne transmet pas directement `TOOL_END` au callback hôte. Le store projette facultativement l’événement vers `taskId` natif, `toolCallId`, nom d’outil et agent exécutant, sans copier arguments, sortie ni artefact. Le sujet synthétique d’un sous-graphe ne sert pas d’identité d’agent membre. Le singleton de production transmet désormais cette observation au sink MTO si une trace native existe ; ce sink filtre strictement `toolCallId` et `toolName`. Les erreurs d’observation ne modifient pas le settlement. Aucun critère/valeur de preuve indépendante n’est déduit de cette projection : Distill et publication restent fermés.

## P10 — observation MTO native de l’outil enfant

Le singleton du store relie la projection de fin d’outil à MTO avec `traceId`, `taskId`, `toolCallId` et identité d’agent exécutant connue. Le sink n’accepte en payload que `toolCallId` et `toolName` bornés ; sans trace, il n’émet rien. Il ne lit pas la sortie, ne crée pas de critère de preuve, ne sollicite pas Oracle et ne modifie ni tâche ni publication. Le buffer transitoire par requête demeure séparé du singleton partagé.

## P10 — validation native du candidat workflow enfant

Après persistance du message d’échec typé et du candidat immuable, le callback de la tâche enfant utilise son vrai `taskId`, son producteur confirmé et le `responseMessageId` correspondant pour construire une preuve hôte bornée du signal de limite. Distill puis Oracle déterministe vérifient la conformité du candidat `workflow` ; le registre durable reçoit `VALIDATING`, le verdict, puis `PROPOSAL_ONLY` sous identifiants de rejeu stables. Les observations Oracle MTO restent descriptives. Une identité manquante, un message non correspondant ou une panne du registre ferme la progression sans modifier le résultat terminal. Cette validation porte sur les métadonnées de la proposition et n’autorise aucune mutation. Le chemin de publication d’un skill reste non activé faute de payload et de preuve de contenu indépendamment vérifiés.

## P10 — liaison stricte de l’autorisation à la mutation skill

La frontière de publication refuse une autorisation dont le candidat, la trace, l’acteur, l’opération, le skill, sa version ou la voie de publication diffèrent de la demande. Le digest du contenu reste revérifié avant `updateSkill`. Huit variantes décalées échouaient avant le correctif et n’atteignent plus la mutation. Aucun appel hôte de production ne crée encore une proposition skill avec contenu et vérification indépendante ; ce verrouillage ne vaut pas activation du chemin skill.

## P10 — identités MTO distinctes pour les phases Oracle

La validation native de l’enfant donne désormais un `traceEventId` stable distinct à `VALIDATING` et au verdict terminal, dérivé du candidat et de la phase. Le rejeu garde les mêmes identités par phase ; deux événements différents ne partagent plus le même identifiant MTO.

## P10 — filtre de contenu partagé avec le skill natif

La publication contrôlée d’un update skill appelle désormais le même inspecteur de contenu que `PATCH /skills` avant la mutation. Une règle bloquante ou une traversée non inspectable arrête `updateSkill`. Les tests de route natifs et de publication, le build et le typecheck couvrent ce partage. Aucun contenu de skill n’est proposé automatiquement par une tâche enfant à ce stade.

## P10 — champs autorisés de la mutation skill

Le point de publication P10 refuse désormais un update vide et les champs absents de la liste de `PATCH /skills` avant même l’autorisation. Les champs internes comme `source`, `sourceMetadata` et `allowedTools` ne peuvent plus être transmis directement à la méthode Mongo par cette frontière. Quatre cas rouges avant patch passent après verrouillage.

## P10 — matrice de validation de fin de phase (état du checkout)

| Frontière | Preuve du checkout | Statut |
| --- | --- | --- |
| Observation bornée et candidat durable | Échec typé `GRAPH_RECURSION_LIMIT` après message enfant persistant, vrai `taskId`, trace, producteur natif si connu ; outil enfant borné dans MTO. | PROUVÉ pour ce chemin enfant. |
| Distill / Oracle / disposition du candidat workflow | La tâche enfant ayant un producteur connu enregistre `VALIDATING`, le verdict déterministe sur les métadonnées du signal, puis `PROPOSAL_ONLY`; absence d’identité ou panne durable ferme la progression. | PROUVÉ pour la proposition workflow, sans mutation. |
| Autorisation et publication skill | Contrats purs et adaptateurs requête : ACL `EDIT`, capacité native, digest exact, identité candidat/trace/acteur/skill/version, filtrage partagé, liste de champs PATCH, version optimiste. | PROUVÉ par tests isolés ; aucun appel de production P10. |
| Production d’un candidat skill avec payload | `edit_file` construit un update avant d’appeler directement `updateSkill` ; aucun point P10 ne capture alors contenu, digest et vrai `taskId` de l’enfant dans un candidat durable. | À FAIRE. |
| Vérification indépendante du contenu skill | Les fins d’outil enfant donnent `toolCallId`, outil et agent connu, sans déclaration hôte de critère/valeur ni résultat vérificateur distinct. Le contrôle workflow ne vérifie que ses propres métadonnées. | À FAIRE ; aucune preuve de qualité à inventer. |
| Progression autorisée et effet durable | Aucun caller de production ne lie candidat skill vérifié, politique/humain si requis, `publishImprovementSkillUpdateForRequest`, résultat natif et événements `COMMITTED`/`PUBLISHED`. | À FAIRE. |

Validation ciblée de cette passe : huit suites API P10, 65 tests ; 25 suites orchestrator/Oracle, 176 tests ; routes skill et publication, 65 tests ; typecheck complet `packages/api` et build réussis sur la modification du filtre partagé. La suite de la tâche enfant a passé 94 tests avant les derniers correctifs de publication indépendants. La validation P10 complète n’est **pas** revendiquée : il faut raccorder une proposition de contenu avant mutation, une vérification indépendante réellement liée à son digest et la transition contrôlée vers l’effet natif, avec rejeu et tests de bout en bout.

Chemin d’implémentation minimal identifié : transmettre l’identité native de la tâche enfant dans son contexte d’exécution isolé ; intercepter l’update construit par `edit_file` avant `updateSkill` sans changer l’autorité de la méthode native ; conserver la proposition exacte et son digest sous le propriétaire/tenant ; faire produire au vérificateur hôte distinct une preuve correspondant au contenu et au critère déclaré ; seulement après verdict et politique, autoriser le payload immuable et appeler la mutation native sous version optimiste. Une vérification de format ou de métadonnées ne doit pas être présentée comme vérification sémantique de l’amélioration.

## P10 — identité de tâche enfant dans le contexte asynchrone

Le store transmet désormais le vrai `runtime.taskId` au contexte `AsyncLocalStorage` de chaque exécution détachée. Le getter ne retourne rien hors de ce contexte ; deux enfants concurrents conservent chacun leur propre ID, et le collecteur d’usage garde son comportement. Preuves : 207 tests dans trois suites natives, typecheck complet et build réussis. Cette identité n’est pas encore un candidat skill ni une preuve indépendante de son contenu.

## P10 — décision du propriétaire : tests indépendants puis revue du diff exact

Le propriétaire a choisi l’option 1 : un skill amélioré doit passer des tests indépendants liés au contenu proposé, puis une revue humaine du diff exact avant sa publication. Cette décision remplace toute hypothèse antérieure selon laquelle un contrôle de format ou le seul `tool_approval` suffirait.

Audit du chemin natif : `writeSkillMd` normalise et filtre le contenu, calcule un diff, puis appelle directement `options.updateSkill`. Le `PreToolUse` HITL existant intervient avant cette préparation ; ses `action_requests` portent l’appel d’outil et ses arguments, pas le diff final calculé. Il ne peut donc pas, à lui seul, attester l’approbation du payload exact. Le `taskId` natif est désormais disponible dans le contexte asynchrone de l’enfant, sans être injecté dans le tour principal.

Ordre requis pour l’activation :
1. Capturer la mise à jour skill avant `options.updateSkill`, avec skill/version, propriétaire/tenant, vrai `taskId`, producteur, trace et digest du payload ; ne pas muter à cette étape.
2. Stocker le contenu proposé dans un emplacement durable scoped et distinct du candidat borné, avec rejeu/idempotence ; le candidat/MTO ne contiennent que le digest et des identités bornées.
3. Exécuter des tests définis par l’hôte, distincts du producteur, sur ce contenu exact ; attacher résultats, critère et provenance au même digest. Les simples validateurs de schéma/PII ne sont pas une preuve de gain sémantique.
4. Présenter le diff exact au propriétaire et persister sa décision liée à ce digest, au skill et à la version ; une édition de l’approbation exige une nouvelle vérification.
5. Rejouer l’autorisation native et les contrôles de contenu, puis invoquer `updateSkill` sous version optimiste ; enregistrer l’effet réel et les conflits sans les convertir en succès.

Aucune route P10 de création/approbation de ce payload n’est encore câblée et aucun jeu de tests hôte par skill n’est défini dans le checkout. Garder la publication autonome désactivée tant que ces deux sources ne sont pas réelles. Ne pas faire passer l’approbation générique de `edit_file` pour la revue du diff exact.

## P10 — capture durable du contenu skill enfant

`edit_file` propose désormais le payload et le diff construits avant `updateSkill`. Le collecteur hôte s’active seulement lorsqu’un vrai `taskId` d’exécution enfant est présent. Il persiste le contenu exact et le diff dans `ImprovementSkillProposal` sous propriétaire/tenant avec idempotence et limite de taille, puis un candidat distinct borné avec digest, identités et `requiresHumanReview`. Le tour principal poursuit l’édition native. Les échecs de stockage bloquent la mutation enfant. Les tests du package données, du handler et de l’initialisation sont verts ; typechecks et builds des packages données/API passent.

Ce raccordement ne vérifie pas encore la qualité du contenu avec des tests indépendants et n’expose aucune revue humaine du diff exact. Le candidat reste non publiable en production ; la publication P10 demeure inactive jusqu’à la preuve et la décision humaine liées au même digest.

## P10 — identité native du producteur skill

Le candidat skill enfant porte aussi le producteur observé lors du démarrage natif correspondant à la tâche. Sans producteur, la capture échoue avant l’écriture. Cette identité permet de refuser un vérificateur qui serait le même agent que le producteur ; aucun test indépendant de contenu n’est encore enregistré.

## P10 — tests de contenu, Oracle et revue humaine du diff exact

Une proposition d'édition SKILL.md issue d'une vraie tâche enfant est enregistrée avant la mutation native. Le diff, le payload, la version attendue et les identités sont immuables dans `ImprovementSkillProposal`, sous propriétaire et tenant. Un diff vide échoue avant l'écriture. L'outil retourne le chemin `/skills/improvements/<candidateId>` pour la revue.

Les assertions indépendantes sont déclarées **par l'hôte**, et jamais par l'agent producteur, dans `BOT_MODE_SKILL_TEST_PLANS`, un JSON borné à 64 Kio. Exemple pour l'identifiant réel du skill :

```json
{"<skillId>":[{"id":"evidence-section","field":"body","operator":"includes","expected":"Evidence"}]}
```

Chaque plan contient de 1 à 32 tests. Les champs autorisés sont `body` et `description`, avec `includes`, `excludes` ou `equals`. La validation recalcule le digest du payload exact, refuse un vérificateur identique au producteur et consigne les résultats bornés. Si les tests passent, Distill et l'Oracle déterministe vérifient les identités et le digest du candidat avec la preuve fournie par ce vérificateur distinct. L'Oracle ne prétend pas mesurer la qualité sémantique générale : cette propriété dépend de la pertinence des assertions configurées.

La page authentifiée `/skills/improvements/<candidateId>` affiche le diff exact, le digest, la version et les tests. La lecture exige le propriétaire/tenant et l'ACL EDIT native. Sans plan, sans tests réussis ou sans verdict Oracle accepté, le bouton de publication reste désactivé et le serveur refuse aussi toute approbation. Une approbation ou un rejet humain est un événement durable unique lié au digest et au snapshot. Après approbation, la publication appelle le service natif qui revérifie capacité, ACL, filtre de contenu, payload et version optimiste ; seul un résultat `updated` produit l'événement `COMMITTED`.

**État de preuve :** suites unitaires et intégration P10 avec les vrais magasins Mongo en mémoire (capture, assertions, Oracle, revue, publication simulée, isolation propriétaire/tenant et rejeu bloqué), types API/données/client et builds API/data-provider passés. L’interface est testée avec un diff exact et les deux digests, ainsi qu’un état non vérifié où l’approbation est désactivée. Le parcours navigateur connecté et un cycle réel de publication avec une configuration de tests propre à un skill déployé restent à exercer sur une instance LibreChat ; sans cette configuration, aucune proposition n'est publiable. En cas d'échec de persistance du journal `COMMITTED` après la mise à jour native, la réponse conserve `updated`, signale `observationPending` dans l'interface et une réconciliation opérationnelle du journal reste nécessaire.

### Validation locale P10 (28 septembre 2026)

L’API LibreChat démarrée sur la pile devcontainer répond HTTP 200 ; Mongo et Meilisearch sont joignables. Un compte USER et un skill de test isolés ont été créés via les chemins natifs. Une proposition de fixture (identités de tâche et producteur simulées, donc pas une exécution réelle de sous-agent) a été enregistrée dans les vrais magasins Mongo avec un plan de test hôte ; GET authentifié renvoie le diff exact, `VERIFIED`, version 1 et un test réussi. Un POST avec digest périmé renvoie 409, sans événement humain ni COMMITTED. Après approbation explicite du diff par l’utilisateur, POST authentifié a renvoyé `updated` version 2 ; GET du skill confirme le nouveau corps exact, la revue indique `reviewed: true`, Mongo contient un `APPROVED` humain et un `COMMITTED` hôte. Un second POST a reçu 409, avec toujours un seul événement de chaque type. Le navigateur connecté et une proposition issue d’un vrai sous-agent restent à exercer. Cette validation a découvert puis corrigé `tenantKey` requis dans le schéma des propositions en mono tenant ; le test de régression sans `tenantId` passe.

### Tentative de sous-agent natif P10 (28 septembre 2026)

Deux agents isolés ont été créés via `POST /api/agents` : parent `agent_XfGEmCwGzcJsBL37xGWmg`, enfant `agent_6DR8m_2YzHy2w8aPVukY6` avec le skill de test. Une configuration temporaire a activé `run_in_background`, et Chromium a soumis une conversation au parent (`2c818480-699f-553a-9dd5-b002d3fe4318`). La génération s’est arrêtée avant toute délégation avec `openAI API Key not provided`. Le compte de test ne possède aucune clé ; les variables de clés courantes et les services de modèles locaux vérifiés étaient absents. Aucun nouveau candidat de sous-agent natif ni aucune publication n’est donc prouvé. Le test avec un vrai enfant attend un fournisseur de modèle opérationnel ; ne pas confondre la fixture déjà publiée avec cette tentative.

### Preuve native P10 via OpenRouter (28 septembre 2026)

Après configuration locale OpenRouter (`openrouter/free`, sans clé dans Git), le parent `agent_XfGEmCwGzcJsBL37xGWmg` a lancé l’enfant `agent_6DR8m_2YzHy2w8aPVukY6` en arrière-plan depuis Chromium. La proposition Mongo lie `taskId=EKu9UrnE5ic6WDHYaVfH8`, cet agent producteur, le skill `6ab9b935a71ac1b304e63c3c` et `expectedVersion=2`. Le vrai enfant a émis deux propositions de même contenu sous deux toolCallIds ; chacune a une candidate et les événements `VALIDATING`, `VERIFIED` hôte, `VERIFIED` Oracle. La revue retenue est `/skills/improvements/skill%3AEKu9UrnE5ic6WDHYaVfH8%3Acall-58d79d58-30f6-4e41-bcf8-65b5fbda89c1` : elle montre un test réussi et le diff exact qui ajoute un frontmatter `name`/`description` et la ligne `Native child verified`. Après approbation explicite de ce diff par l’utilisateur, la publication native a porté le skill en version 3 avec le corps exact proposé. Mongo contient un `APPROVED` humain et un `COMMITTED` hôte pour le candidat retenu. GET authentifié confirme `reviewed: true` et `VERIFIED` ; un second POST authentifié renvoie 409 (« déjà décidé »). La seconde proposition identique reste non publiée et sa version attendue 2 est désormais périmée.

### Déduplication P10 des éditions identiques (28 septembre 2026)

La transcription durable du taskId EKu9UrnE5ic6WDHYaVfH8 confirme deux appels distincts edit_file, avec une nouvelle lecture entre eux. Les deux diff et payloadDigest étaient identiques ; l’ID de tool call faisait auparavant deux candidats. Le stockage calcule désormais une clé d’équivalence à partir du fil, de la trace, de la tâche, du producteur, du skill, de la version attendue et du contenu exact (diff et mise à jour). Un index unique partiel limite les nouveaux doublons même sous concurrence ; les propositions antérieures, sans cette clé, restent lisibles. Le service renvoie l’ID canonique du premier candidat à l’enfant. Les éditions différentes, tâches, propriétaires et tenants demeurent distincts. Preuve : 5 tests data-schemas et 7 tests API passent, avec le build data-schemas et le contrôle TypeScript. Le doublon historique non publié n’est pas effacé.

### Preuve live de déduplication P10 après correctif (28 septembre 2026)

La conversation parent 7abb6255-1e9c-53bc-b35f-621aad6bb6a0 a lancé le véritable enfant agent_6DR8m_2YzHy2w8aPVukY6 avec taskId h2EyqeMb6zaIazMFOd4vi. Sa transcription durable montre deux edit_file terminés, IDs call-5706717c-5373-4f8a-a00f-0e9cff14a5c5 et chatcmpl-tool-6c09d64759ca42048628a4432ee4f310. Chaque sortie renvoie le même lien de revue /skills/improvements/skill%3Ah2EyqeMb6zaIazMFOd4vi%3Acall-5706717c-5373-4f8a-a00f-0e9cff14a5c5. Mongo contient exactement une proposition pour cette tâche, avec le producteur natif et la version attendue 3 ; événements VALIDATING, VERIFIED hôte et VERIFIED Oracle. Le skill reste en version 3 sans la ligne de test proposée : aucune publication. La proposition de test attend une décision humaine si elle doit être clôturée.

### P11 — sélection hôte OpenRouter explicitement autorisée (28 septembre 2026)

Un opt-in administrateur endpoints.agents.hostModelRouting fournit, pour un agent sauvegardé, deux à quatre modèles du même endpoint OpenRouter. Le premier doit correspondre au modèle de l’agent. L’hôte revalide chaque alternative avec validateAgentModel et l’initialise séparément avec les paramètres, outils, contexte et tarification natifs, à chaque appel initializeClient (y compris la reprise). Le routeur P9 classe ces bindings validés selon un RuleDecisionProvider explicite ; P11 construit un DecisionRecord, puis persiste DECIDED sous le propriétaire avant de transmettre la configuration sélectionnée au run. Aucun fallback SDK automatique n’est installé. Sans opt-in, le parcours demeure inchangé.

Preuves locales : 170 tests config data-provider, 25 tests décision/routing P11 et 64 tests API hôte ; builds data-provider et API, ESLint et diff propres. Un test hôte rejoue l’initialisation avec le marqueur resumable et constate deux validations, deux DECIDED durables et la tarification du modèle choisi. Le typecheck complet packages/api reste bloqué par épuisement du heap Node à 2 Go ; le build des déclarations passe. Aucun pool n’est actuellement activé dans le serveur live, donc aucun DECIDED de production n’est revendiqué. Cette tranche ne décide ni coût/qualité dynamique ni routage multi-provider.

### P11 — preuve live isolée et retour à la configuration initiale (28 septembre 2026)

L'opt-in temporaire a été limité à l'agent de validation `agent_XfGEmCwGzcJsBL37xGWmg` et à deux modèles OpenRouter : `openrouter/free` et `nvidia/nemotron-3-super-120b-a12b:free` (préféré). La conversation `b95bfe42-af24-5a12-86d2-543bdffc492f` a rendu « La sélection du modèle fonctionne correctement. » ; la base a persisté sous le propriétaire un événement `DECIDED` de trace `a3f79c75-87d1-476e-95c2-eed8ba46e991` avec `selectedOption=nvidia/nemotron-3-super-120b-a12b:free` et `provider=RuleDecisionProvider`. Le message porte 1440 jetons d'entrée et 112 de sortie. Son champ `model` contient l'identifiant de l'agent et ses métadonnées d'usage ne donnent pas le nom du modèle fournisseur : la preuve live démontre la décision durable et la réponse, tandis que le test d'intégration vérifie la transmission de la configuration et de la tarification sélectionnées.

Le fichier `librechat.yaml` a ensuite été restauré octet pour octet depuis la sauvegarde temporaire : 805 octets, SHA-256 `27ee787a273e5744d21ab381de6acda1127cd6c38fcae05e798c611adc5e3802`, aucun `hostModelRouting`, seul `openrouter/free` dans la liste. Le serveur redémarré a passé ses contrôles de disponibilité et renvoie HTTP 200. L'opt-in live n'est plus actif. Les fichiers `.devcontainer` et les sauvegardes P10 présents avant cette tranche sont laissés en place.

### P11 — corrélation décision, modèle invoqué et usage (28 septembre 2026)

Le message de réponse `9c0473be-b3b4-41d5-b7e2-fb9e0fabaea4` de la conversation isolée `88200ddf-e329-5424-91f9-6173abb17a8c` contient `metadata.hostModelUsage`. Son `traceId=0be908bf-4417-434b-bcca-be10a4a78942` et son `decisionId=18929655-3591-4555-a336-4893e849237e` correspondent à l'événement durable `DECIDED`. `selectedModel` et le `usageModel` du modèle primaire valent `nvidia/nemotron-3-super-120b-a12b:free`, fournisseur `openrouter`, 1425 jetons d'entrée et 53 de sortie ; la réponse visible est « Le modèle répond correctement à cette requête. » La projection bornée exclut les appels secondaires et les secrets. Elle reflète l'identité du modèle déclarée par le contexte de fin d'appel natif, sans attestation indépendante du fournisseur.

L'opt-in n'a été activé que pour cette conversation de validation. `librechat.yaml` a été restauré octet pour octet à son SHA-256 précédent `27ee787a273e5744d21ab381de6acda1127cd6c38fcae05e798c611adc5e3802` : aucun `hostModelRouting` actif. Tests ciblés P11 et tests voisins `initialize.spec.js`/`modelEndHandler.spec.js` passent. Les trois fixtures de reprise de `client.test.js` ont ensuite été complétées avec l’observateur MTO inerte correspondant à leur contexte sans trace. La suite combinée de cinq fichiers passe : 284 tests sur 284, dont le test P11 de `buildResponseMetadata`.

### P11 — attribution de l'usage à l'agent sélectionné (28 septembre 2026)

Le collecteur interne conserve désormais l'identité `agentId` du producteur sur chaque appel terminé, sans l'envoyer dans l'événement SSE. La projection P11 exige une correspondance exacte avec l'agent de la décision ; un agent connecté sur OpenRouter ne peut plus être attribué au principal au seul motif que son usage n'a pas de `usage_type`. En l'absence d'identité producteur, la projection ne fabrique pas de preuve. Le test de régression reproduit ce mélange et vérifie l'exclusion. Sept suites API passent, 333 tests sur 333 ; builds data-provider et API, ESLint et contrôle du diff passent.

Preuve live isolée : conversation `73a27afd-5a15-56f2-8436-221a8b7816c0`, message `3a3ffa01-1553-46a2-ac2d-9b7b13883851`. Le `hostModelUsage` persistant porte `traceId=a47d88c8-49c3-4771-92df-c785bba99bd4` et `decisionId=c9db177e-14e8-4cb5-b2b2-b6951088ebe6`, identiques à l'événement `DECIDED`. Modèle choisi et modèle rapporté : `nvidia/nemotron-3-super-120b-a12b:free` sur `openrouter`, 1424 jetons d'entrée et 185 de sortie. La réponse visible était « modèle actif ». Cette observation ne constitue pas une attestation indépendante du fournisseur. L'opt-in temporaire a été retiré ; `librechat.yaml` est revenu à 805 octets, SHA-256 `27ee787a273e5744d21ab381de6acda1127cd6c38fcae05e798c611adc5e3802`, sans `hostModelRouting`. Le serveur redémarré a passé les contrôles de disponibilité et renvoie HTTP 200.

### IntelBase — adaptateur de recherche email isolé (28 septembre 2026)

Le design `docs/superpowers/specs/2026-09-28-intelbase-email-enrichment-design.md` et le plan `docs/superpowers/plans/2026-09-28-intelbase-adapter.md` fixent une première tranche. L'adaptateur TypeScript `packages/api/src/agents/external/intelbase.ts` exige une décision d'autorisation fournie par l'hôte avec propriétaire, agent, finalité, identifiant d'autorisation, réservation de budget et confirmation que la cible est majeure avant de résoudre le secret ou d'appeler le transport. Il effectue un seul POST email documenté, désactive les données de brèche, borne délai et corps de réponse, puis ne renvoie que nombre borné, noms de modules filtrés et statut `unverified`. Les erreurs sont des codes constants sans corps fournisseur. Aucun appel réel IntelBase n'a été fait.

Le service n'est pas exporté par l'entrée API, enregistré dans le manifeste d'outils, ni appelé par le runtime de production. Aucun contrôle hôte existant n'a encore été identifié pour établir la finalité autorisée, la majorité de la cible et une réservation de budget au moment de l'exécution. La recherche reste donc désactivée ; un grant fabriqué par un modèle ne doit jamais servir de substitut. La suite ciblée et les suites voisines, le build API et un typecheck ciblé ont été exécutés ; le typecheck complet `packages/api` a expiré au bout de 240 secondes sous forte pression mémoire, sans verdict. Prochaine preuve : politique hôte explicite et tests initial/reprise avant tout outil visible.
