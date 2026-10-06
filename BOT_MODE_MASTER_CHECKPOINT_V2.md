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

### IntelBase — portée tierce validée, activation toujours fermée (28 septembre 2026)

Le propriétaire a explicitement autorisé les adresses email de tiers. La politique retenue pour la prochaine tranche demande une approbation humaine du lookup exact (adresse, finalité, agent et coût/plafond), avec rejet des recherches connues ou présumées sur un mineur et nouvelle décision après édition. L'audit des primitives natives confirme que le mandat d'autonomie actuel est borné par capacité et conversation, sans cible/finalité ; le HITL sait interrompre et revalider l'outil à l'effet, mais aucune preuve durable IntelBase liée au payload exact n'est encore raccordée. La réservation native porte des tokenCredits et ne doit pas être présentée comme un compteur de quota IntelBase. L'adaptateur committé reste sans caller de production et sans lookup réel. Prochaine entrée nécessaire : règle de plafond/coût fournisseur et preuve initiale/reprise de l'approbation exacte avant activation.

### IntelBase — approbation exacte, tranche 1 (28 septembre 2026)

Le commit 576e041 ajoute packages/api/src/agents/external/approval.ts et 11 tests. Une approbation native validee peut etre liee a une seule action, un seul tool_call_id, une seule adresse et au contexte utilisateur/tenant/conversation/agent/finalite. La preuve locale est a usage unique ; un changement d'adresse, de portee, une edition ou un rejet ne la consomme pas. Les 31 tests cibles IntelBase/approbation passent apres commit, ainsi que le TypeScript cible et ESLint. Ce module n'est pas encore appele par le controleur de reprise.

L'integration UI et runtime reste ouverte : la carte actuelle ne recueille pas l'attestation explicite de majorite pour ce lookup, le controleur ne cree pas la preuve apres son CAS, et aucun outil IntelBase n'est enregistre. Le budget LibreChat en tokenCredits ne fournit pas un prix ou plafond IntelBase. Aucune recherche reelle ni egress n'a ete declenche. Le plan docs/superpowers/plans/2026-09-28-intelbase-exact-approval.md garde sa Task 2 non cochee. Les essais UI interrompus par le relais et le temps de lancement Jest ont ete retires ; aucun fichier UI partiel ne reste dans le diff.

### IntelBase — confirmation UI et decision exacte (29 septembre 2026)

La carte native d'approbation identifie osint_email_enrich, affiche l'adresse exacte et exige une confirmation explicite de majorite avant de soumettre approve. Une adresse modifiee invalide la confirmation. Le marqueur est porte par la decision du tool_call_id correspondant et l'approbation backend le controle. Suites ciblees : 32 tests API et 10 tests client passent ; lint, TypeScript API cible et JSON en/fr ont ete verifies. L'outil reste non enregistre et aucun appel IntelBase reel n'a eu lieu. Le controleur de reprise apres CAS, la politique de budget fournisseur et la verification de l'agent executeur restent a realiser avant activation.


## Clôture P0 — settlement natif (29 septembre 2026)

Critère V3 : E.2, E.1, D et voisins préservent un seul résultat terminal durable, le fencing et la priorité du commit engagé sur un cancel tardif. Le test historique « lets durable settlement win once a successful commit has started » et les cas actuels de suppression concurrente, lease, cancellation, stale/recovery figurent dans packages/api/src/agents/subagentThreads.spec.ts. La suite actuelle couvre aussi la disparition effective d'un enfant après deletion et le rejet d'un succès tardif.

Preuve fraîche : NODE_OPTIONS=--max-old-space-size=2048 npm exec jest -- --config packages/api/jest.config.mjs packages/api/src/agents/subagentThreads.spec.ts --runInBand --silent → 1 suite PASS, 94/94 tests PASS, 38.607 s (29/09/2026). La checklist du 13/09 consignait déjà 65/65, avec E.2 et les voisins PASS. Les anciens libellés « E.1 » et « D » ne sont plus présents comme noms de tests dans le checkout ; leurs comportements sont couverts par les cas de cancel/deletion/settlement actuels, sans prétendre à une correspondance ligne à ligne avec un ancien plan de test non conservé ici.

Décision : P0 PASS sur les critères fonctionnels V3 vérifiés dans le montage de test actuel. Cette clôture n'étend pas le verdict à P1–P4 ni à une validation produit globale. Prochaine phase : P1 concurrence, avec matrice explicite.

## Clôture P1 — concurrence native (29 septembre 2026)

Gate V3 : lease, cancel, delete, takeover, stale, retry et recovery sans double effet. Preuves fraîches : subagentThreads.spec.ts 94/94 PASS ; subagentTaskRouting.spec.ts et subagentCompletionWakeup.spec.ts 53/53 PASS ; deux tests de lease et takeover Mongo PASS ; subagentCrossReplica.integration.spec.ts avec Redis réel 1/1 PASS. Ce dernier route les contrôles vers le propriétaire et livre deux réveils frères une seule fois après perte du propriétaire. Redis éphémère arrêté et supprimé. Décision : P1 PASS sur les invariants de concurrence du Task Engine natif couverts par ces tests ; P2 compteurs et rétention reste distinct.

## Clôture P2 — états, compteurs et rétention (29 septembre 2026)

Gate V3 : transitions terminales, capacité runningTasks et totalTasks, cleanup et rétention cohérents. Preuves fraîches : background.spec.ts, guard.spec.ts et remote/lifecycle.spec.ts 128/128 PASS ; subagentThreads.spec.ts 94/94 PASS. Un contrôle comportemental direct du SDK @librechat/agents 3.7.17 confirme refus à maxRunningTotal, libération après succès et échec, éviction du résultat terminé à maxTasksTotal et absence de blocage résiduel. Les tests background couvrent TTL, capacité conversation/utilisateur/globale et éviction atomique. Décision : P2 PASS sur ce périmètre natif testé. P3 exige séparément la preuve de plusieurs workers réels.

## Clôture P3 — multi-processus réel et takeover durable (29 septembre 2026)

Gate V3 : deux workers A/B dans des processus OS distincts, admission durable par A, perte brutale de A, expiration du lease, reprise par B avec fencing, preuve checkpoint durable exacte, résultat terminal unique et absence de double effet.

Preuves fraîches :
- subagentP3Multiprocess.integration.spec.ts lance deux vrais processus Node via fork ; A et B ont des PID distincts du processus Jest et l'un de l'autre ;
- A est tué par SIGKILL après admission ; B reprend le même thread avec un nouveau taskId après expiration du lease partagé Mongo ;
- B entre avec recoveryOnly=true et ne peut pas repartir d'un seed frais ;
- l'autorisation de reprise appelle réellement hasDurableSubagentRecoveryCheckpoint et exige le parent interrupt manifest exact, parentToolCallId exact, childThreadId exact, checkpoint enfant lisible et même checkpoint namespace de génération ;
- un seul effet externe est produit et une seule ligne terminale durable complète la tentative ;
- subagentThreads.spec.ts : 98/98 PASS ; les cas ciblés de lease/fencing PASS ;
- subagentCrossReplica.integration.spec.ts : 1/1 PASS avec Redis 7 Alpine éphémère local, prouvant routage propriétaire et wakeups après perte du propriétaire ;
- checkpointer.integration.spec.ts : preuve checkpoint durable exacte PASS ;
- initialize.spec.js : binding production génération/job/checkpoint namespace PASS ;
- npm --prefix packages/api run build PASS ; exports runtime vérifiés ; git diff --check PASS.

Checkpoint Git local : d99135c feat(bot-mode): prove P3 worker takeover. Aucun push.

Décision : P3 PASS sur les critères fonctionnels V3 multi-processus, takeover, fencing, reprise durable et résultat unique couverts par ces montages. Cette clôture ne ferme pas P5/P6/P8/P9/P10/P11/P12/P13/P14.

## Clôture P4 — Task Tree et reprise native (29 septembre 2026)

Gate V3 : parent/enfants, dépendances, fan-out/fan-in, checkpoint, reprise et idempotence. Preuve fraîche : checkpointer.integration.spec.ts, orchestrator/native.spec.ts et planner.spec.ts 54/54 PASS ; subagentThreads.spec.ts 94/94 PASS. Les tests actifs compilent un diamant natif avec barrière fan-in, persistent un interrupt Mongo et reconstruisent un SubagentExecutor sans réexécuter researcher ; des tests de rejeu durable protègent les tâches enfants. Le test graph-subagent.e2e.test.ts avec fournisseur live est opt-in et a été ignoré : 2 skipped, aucune preuve live revendiquée ici. Décision : P4 PASS sur le Task Tree natif testé, sans clore P3 multi-processus ni la mission produit P6.

## Clôture P5 — Oracle et gate de synthèse critique (29 septembre 2026)

Gate V3 : chaque résultat critique soumis à des critères déclarés par l'hôte doit recevoir un verdict Oracle lié à l'identité exacte de la tâche avant d'être admis dans la synthèse critique. La vérification reste QA-only : elle ne crée ni permission, ni exécution, ni settlement, ni publication.

Preuves fraîches : `oracle/runtime.spec.ts`, `oracle/deterministic.spec.ts`, `orchestrator/synthesisReadiness.spec.ts`, `orchestrator/synthesisReadiness.integration.spec.ts`, `native.spec.ts` et `planner.spec.ts` passent ensemble 52/52 ; `npm --prefix packages/api run build` PASS ; `git diff --check` PASS. Le nouveau contrat pur `evaluateSynthesisReadiness(...)` exige un verdict terminal cohérent par tâche/node critique, fail-closed sur verdict manquant, `REJECTED`, `UNKNOWN` ou `HUMAN_REVIEW`, et n'expose aucune autorité d'exécution.

La preuve intégrée construit une mission structurée avec critère host-owned `total=42` et `requireEvidence=true`, la fait traverser `deterministicPlanner -> compileNativePlan.validation`, puis appelle l'Oracle déterministe avec une preuve outil attribuée à un checker distinct. Avec cette preuve, le verdict est `VERIFIED` et la synthèse devient `READY`. Sans preuve indépendante, le même candidat devient `UNKNOWN` avec `INDEPENDENT_EVIDENCE_MISSING`, puis le gate produit `BLOCKED_UNKNOWN` et refuse l'admission de la synthèse critique.

Décision : P5 PASS/CLOSED sur le contrat V3 Oracle + evidence + checker distinct + fail-closed avant synthèse. P5 ne devient pas une autorité Policy/Auth et ne ferme pas P6 : l'invocation de production d'une mission structurée complète et de son orchestration hôte reste le gate P6.

## P6 — orchestration produit encore ouverte (29 septembre 2026)

Preuve fraîche : planner.spec.ts et native.spec.ts inclus dans 54/54 tests PASS avec checkpoint Mongo. deterministicPlanner et compileNativePlan produisent un graphe natif, des dépendances et des exigences Oracle, mais aucune invocation hôte de production de ces fonctions n est trouvée dans packages/api/src ni api/server. Statut : P6 OPEN. Prochaine preuve : un opt-in hôte avec mission structurée, bindings natifs autorisés, plan persistant, exécution et reprise du DAG, verdicts P5 avant synthèse, budget et arrêt bornés. Ne pas transformer le compilateur en second Task Engine.

## Clôture P7 — RAG natif réel (29 septembre 2026)

Gate V3 : upload, embeddings, pgvector, retrieval, contexte agent et provenance. Preuve fraîche : P7_RAG_E2E=1 avec rag_api, vectordb et LibreChat démarrés ; rag.integration.spec.ts 5/5 PASS en 40.861 s. Les assertions lisent des chunks persistés et embeddings de dimension 384, comparent source et chunkId, vérifient la consommation du ToolMessage par le run hôte, les requêtes non pertinentes et isolation entre utilisateurs. Campagne identique déjà consignée le 27/09. Décision : P7 PASS pour ce montage réel. La reproduction après reconstruction complète du stack reste un gate de release P14, non revendiqué ici.

## P8 — Gateway et sandbox générique encore ouverts (29 septembre 2026)

LibreChat dispose du sandbox code et de permissions natives pour certains outils, ACL skill et pauses HITL observées. Aucune preuve du contrat V3 complet de grant par job/action avec limites CPU/RAM/disque, modes réseau NONE/LOCAL_LAB/ALLOWLIST/WEB/TOR_ALLOWLIST, révocation et source registry vers outil enregistré ne ressort de ce contrôle. Statut : P8 OPEN ; ne pas interpréter une observation P12 comme autorisation. Prochaine preuve : matrice des contrôles natifs et test à effet de refus, expiration et révocation avant une tranche sandbox générique.

## P9 — routage multi-modèle partiel (29 septembre 2026)

Preuve fraîche : routing.spec.ts et decision.spec.ts 22/22 PASS ; hostModelRouting.spec.js et initialize.spec.js 64/64 PASS. L opt-in hôte choisit parmi des modèles OpenRouter explicitement configurés et validés pour un même agent ; la décision DECIDED est persistée avant le run. Les contraintes et signaux qualité, coût, latence, contexte et confidentialité du routeur générique restent des contrats, sans collecte hôte complète ni fallback multi-provider contrôlé. Statut : P9 PARTIEL, gate V3 global OPEN. Prochaine preuve : budgets et métriques réels alimentant le choix, bascule contrôlée sur échec, attribution usage/coût par modèle et tests de reprise.

## P10 — amélioration gouvernée partielle (29 septembre 2026)

Preuve fraîche : cinq suites hôte candidate, validation, revue et publication 43/43 PASS ; deux suites orchestrator 16/16 PASS. Le parcours ciblé de skill vérifie diff et digest exacts, tests indépendants, Oracle lié au payload, décision humaine, ACL native et conflit de version ; les candidats de step limit restent proposal-only. Aucun orchestrateur autonome général de veille, apprentissage, réévaluation et publication continue n est activé ; la preuve live du cycle skill déployé reste distincte. Statut : P10 PARTIEL, gate V3 global OPEN. Prochaine preuve : mission complète instrumentée avec propositions bornées, vérifications indépendantes et effet publié uniquement après autorisation exacte.

## P11 V3 — pipeline média encore ouvert (29 septembre 2026)

Preuve fraîche : audio.spec.ts, image.spec.ts, images/session.spec.ts 32/32 PASS ; steering/media.spec.ts 17/17 PASS. Ces primitives prennent en charge des fichiers et le contexte média, sans démontrer le pipeline BOT MODE GenerationProvider interchangeable, brief, image/audio/vidéo, post-traitement, QA, provenance et artefact durable. Statut : P11 V3 OPEN ; distinct de la tranche technique P11 DecisionRecord déjà présente. Prochaine preuve : une génération média sous mandat et budget avec deux providers interchangeables, échec/fallback, QA et artefact vérifiable.

## P12 V3 — production YouTube encore ouverte (29 septembre 2026)

Preuve fraîche : endpoints/google/youtube.spec.ts 61/61 PASS pour extraction et injection sûre des URLs vidéo au contexte modèle. Ce chemin de lecture ne constitue pas la chaîne V3 claims sourcés, script, média, montage, miniature, SEO, QA, readiness, publication autorisée et analytics. Statut : P12 V3 OPEN ; distinct de la tranche technique P12 AuthorizationRecord. Prochaine preuve : dry run de chaîne complète bloquant claim non sourcé et métadonnées manquantes, puis publication seulement sur approbation.

## P13 — rooms et interface BOT MODE encore ouvertes (29 septembre 2026)

Preuve fraîche : schedules/project.spec.ts 29/29 PASS ; LibreChat dispose de composants ProjectWorkspace, ProjectsView et de routes projets. Le test valide la portée projet des tâches planifiées, dont refus hors propriétaire. La vue BOT MODE réunissant plan, agents, progression, preuves, coûts, pause/reprise et isolation de deux projets simultanés n est pas démontrée. Statut : P13 OPEN. Prochaine preuve : deux projets concurrents avec isolation de tâches, mémoire et sources, et reprise observable dans une UI dédiée.

## P14 — release et restauration encore ouvertes (29 septembre 2026)

Des suites ciblées P0–P13 et un montage RAG réel ont été exécutés ; aucune installation propre suivie de backup, restauration vérifiée, rollback et mission globale de bout en bout n est attestée par cette campagne. Statut : P14 OPEN. P3 et P5 sont désormais fermés par preuves dédiées. Prochaine preuve : image et configuration reproductibles, doctor/health, sauvegarde Mongo et vecteurs, restauration isolée, panne simulée, audit des secrets et coûts, puis décision de release fondée sur les gates encore ouvertes P6/P8/P9/P10/P11/P12/P13.

## Réconciliation P9 — 2 octobre 2026

Statut global : P9 PARTIEL, gate V3 global OPEN.

Sous-gates FERMÉS :
- sélection hôte OpenRouter parmi 2 à 4 modèles explicitement autorisés et résolus pour un même agent logique ; DECIDED durable avant exécution ;
- revalidation à chaque initialisation et reprise : initialize.spec.js, test exact revalidates configured OpenRouter choices and persists a DECIDED event on each initialization, 1/1 PASS le 02/10/2026 ;
- attribution usage par modèle primaire avec traceId, decisionId, selectedModel, usageModel et jetons ;
- attribution du coût USD réel par appel modèle depuis l'événement natif event.cost : commit 7c5792c feat(botmode): retain routed model cost evidence ; hostModelUsage.spec.js + hostModelRouting.spec.js 6/6 PASS ; preuve P11 client ciblée PASS ;
- aucun fallback SDK opaque installé ; les bindings alternatifs restent séparément validés.

Sous-gates OUVERTS :
- choix dynamique pré-run alimenté par des signaux hôte fiables de qualité, coût estimé, latence et besoin réel de contexte. Le runtime expose maxContextTokens résolu, mais aucun coût, latence ou qualité prospectifs fiables n'ont été trouvés. Le coût historique post-run n'est pas réinterprété comme estimatedCost ;
- budget/admission par invocation modèle. Le chemin AgentClient facture après usage via recordCollectedUsage ; aucun checkBalance ni hook de budget/autorisation par appel modèle n'est actuellement branché sur le runtime agent ;
- failover contrôlé sur erreur fournisseur. Une erreur de run.processStream peut survenir après streaming ou effets outils ; rejouer le run au catch global risquerait de dupliquer des effets. Aucun failover n'est donc activé tant qu'un seam pré-effet ou une admission par invocation ne garantit pas une nouvelle autorisation et un replay sûr ;
- multi-provider contrôlé. Le hostModelRouting de production reste volontairement OpenRouter-only.

Décision : ne pas fabriquer de métriques prospectives, ne pas activer les fallbacks SDK natifs et ne pas relancer un run après erreur sans preuve de non-effet. Prochaine tranche P9 : étudier le callback modèle natif déjà injecté sur les bindings et fallbacks pour déterminer si une admission par invocation peut être ajoutée sans second système d'autorité ; seulement ensuite reconsidérer un failover borné.

## Clôture P8 — Gateway d’exécution, grants et sandbox générique (3 octobre 2026)

Gate V3 : chaque effet doit être lié à un grant borné par job/action/tool, durablement possédé par le job de génération, revalidé immédiatement avant effet, et appliqué par un backend d’exécution capable d’enforcer ses contraintes. Un backend ne peut jamais dégrader silencieusement une contrainte qu’il ne sait pas appliquer.

Preuves SDK :
- `@librechat/agents` 3.7.17, commit source `214fcad2744055315c3d1940e9d4a29c7c5444d6` ;
- artefact vendorisé `librechat-agents-3.7.17-214fcad2744055315c3d1940e9d4a29c7c5444d6.tgz`, SHA-256 `9ca06cace7b03160f308999998a788045aeab958d98dc894e291a396b3e7a472` ;
- tests execution-grant, ToolNode et Docker : 12/12 PASS ;
- test Docker réel sur daemon local : CPU cgroup, RAM cgroup, swap nul, tmpfs `/tmp` borné et réseau `NONE` vérifiés ; écriture au-delà du scratch échoue ;
- TypeScript `--noEmit` PASS ; build SDK PASS ; `git diff --check` PASS ; hooks Git PASS.

Preuves host :
- `ExecutionGrant` ajouté au durable `GenerationJobMetadata` ; le seul propriétaire durable reste `GenerationJobManager` ;
- `updateMetadata(..., expectedCreatedAt)` conserve le fencing d’epoch existant ;
- le resolver host lit le job courant, exige le même `streamId` et `createdAt`, vérifie le statut `running` et la présence de l’outil dans le Tool Registry ;
- le grant est écrit puis relu avant admission ; un grant est lié à une seule action et un seul outil ;
- révocation, expiration, statut invalide et mismatch de scope sont fail-closed dans le SDK au dernier effet ;
- `ToolNode` réinterroge le resolver à l’effet et interdit toute exécution sans grant valide ;
- `createRun` transmet le contexte Docker/grant uniquement aux agents `codeEnvAvailable` ; P8 sentinel + quatre régressions P6 : 5/5 PASS ;
- `initialize.spec.js` + `client.test.js` sur grant/Oracle/barrière/attachments : 38/38 PASS ;
- build officiel `@librechat/api` PASS ; résolution runtime depuis `api/` vers le vendor racine vérifiée ; `createDockerSpawn` et `validateExecutionGrant` réellement exportés.

Backend Docker :
- `NONE`, `LOCAL_LAB` et `WEB` sont les capacités effectivement annoncées ; `LOCAL_LAB` est configurable via `localLabNetwork` ou `BOTMODE_DOCKER_LOCAL_NETWORK` ;
- `ALLOWLIST` et `TOR_ALLOWLIST` restent explicitement refusés tant qu’un proxy policy-aware ne garantit pas le filtrage de domaines/route demandé ;
- CPU et RAM sont imposés par Docker/cgroups ; le quota disque P8 correspond au scratch éphémère `/tmp` via tmpfs borné, et non à une promesse de quota du workspace persistant overlay2/ext4 ;
- l’UID/GID du serveur est propagé au conteneur pour éviter les fichiers root dans les espaces de travail ;
- l’échec du daemon/CLI Docker ne bascule jamais vers l’exécution locale non bornée : le backend échoue fermé.

Décision : **P8 PASS/CLOSED** pour le contrat V3 Gateway + Execution Grant + sandbox générique dans le montage validé. Aucune seconde autorité, aucun second scheduler et aucun second durable owner n’a été créé. Les modes réseau non supportés par le backend courant restent des capacités explicitement indisponibles et fail-closed, pas des hypothèses implicites.

La disponibilité d’un daemon Docker depuis le processus de production déployé reste une précondition d’environnement pour activer ce backend ; le stack LibreChat n’étant pas démarré sur ce poste au moment de cette clôture, aucune preuve d’E2E depuis un conteneur de déploiement n’est revendiquée. Ce point relève du gate de release P14, pas d’une ouverture de l’autorité P8.

Prochaine phase : **P9 — routage multi-modèle**, sans rouvrir P0–P8 fermés.

## Clôture P9 — routage multi-modèle, admission par invocation et failover contrôlé (3 octobre 2026)

Statut : **P9 PASS/CLOSED**. P0–P8 restent fermés et ne sont pas rouverts.

Gate : le routage doit sélectionner uniquement parmi des bindings explicitement autorisés et séparément résolus ; les contraintes dures doivent être appliquées avant sélection ; toute invocation modèle doit rester soumise à l’admission/budget du binding ; un failover ne doit jamais rejouer le `Run` ni réexécuter des effets déjà produits ; l’usage/coût doit rester traçable par modèle et provider.

Preuves de sélection et routage :
- `decideHostModel` accepte des signaux host explicites (`qualityScore`, `estimatedCost`, `latencyMs`, `oracleScore`, `benchmarkScore`, `contextWindow`, `privacy`) et des `RoutingConstraints` ; aucune estimation n’est fabriquée quand le host ne fournit pas de signal ;
- préférence de modèle/binding désormais facultative ; en absence de préférence, `routeAuthorizedModelBindings` classe les candidats admissibles de façon déterministe selon les signaux réels disponibles ;
- contraintes d’admission (`requiredContextTokens`, `maxEstimatedCost`, `maxLatencyMs`, `allowedPrivacy`, `requiredCapabilities`, `allowedExecutionModes`) sont appliquées dans la Decision Layer avant sélection ;
- format legacy `models[]` reste volontairement OpenRouter-only ; le multi-provider passe par `bindings[]`, avec provider/modèle séparément validés et résolus ;
- chaque binding est vérifié contre le modèle/provider sauvegardé pour le primaire et contre la résolution native pour les alternatives ; provenance durable `DECIDED` conservée avant exécution.

Preuves budget/admission :
- `createModelBoundBudgetAdmissionFactory` reste l’unique mécanisme d’admission modèle ; `handleChatModelStart` exécute le contrôle de solde/budget à chaque invocation ;
- `withModelCallbacks` propage le callback d’admission au modèle primaire, aux fallbacks, aux résumés et aux sous-agents, avec identité `{agentId, provider, model}` ;
- tests AgentClient de budget et de binding-specific callbacks : PASS ; le modèle de fallback ne contourne pas l’admission du binding.

Preuves failover :
- `allowFailover` est opt-in ; seuls les bindings déjà autorisés/résolus sont transformés en `fallbacks` ; les fallback natifs cachés présents dans une configuration entrante sont refusés ;
- le fallback s’exécute au niveau de la tentative modèle (`tryFallbackProviders` / `attemptInvoke`), jamais par relance globale de `Run.processStream` ;
- le fallback réutilise la projection de requête préparée sans double projection ; succès d’un fallback n’invoque pas les suivants ; une erreur d’un fallback gelée/figée n’empêche pas les suivants ;
- suite SDK `fallbackOverflow.test.ts` : **14/14 PASS**, couvrant préparation exacte, overflow, attribution provider et first-success short-circuit.

Preuves multi-provider et attribution :
- binding cross-provider explicitement résolu et testé ; aucun héritage silencieux du provider primaire ;
- `hostModelDecision` porte `authorizedBindings` (`bindingId/provider/model`) afin de délimiter les appels attribuables ;
- `hostModelUsage` inclut les appels du primaire et des fallbacks cross-provider seulement quand ils appartiennent à ces bindings autorisés ; les appels du même agent mais hors pool restent exclus ;
- tests `hostModelRouting`, `hostModelUsage`, `hostModelDecision`, `routing`, `initialize` : verts.

Preuves fraîches finales :
- host P9 (`initialize.spec.js`, `hostModelRouting.spec.js`, `hostModelUsage.spec.js`, `client.test.js`) : **12/12 tests ciblés PASS** ;
- package API (`hostModelDecision.spec.ts`, `routing.spec.ts`, `run-summarization.test.ts`) : **28/28 tests ciblés PASS** ;
- `@librechat/api` build : **PASS** ;
- SDK fallback : **14/14 PASS** ;
- `git diff --check` : **PASS** avant commit.

Décision : **P9 est fermé** pour le contrat V3 de routage/admission/failover. Aucun modèle, provider ou fallback n’acquiert d’autorité simplement parce qu’il est techniquement disponible. Les signaux manquants restent manquants et ne sont pas transformés en estimations fictives. L’observabilité post-run existante (usage/coût réel) reste la source de vérité pour les performances réellement mesurées ; elle n’est pas réinterprétée comme une prédiction non justifiée.

Prochaine phase : **P10 — amélioration gouvernée**, sans rouvrir P0–P9 fermés.

## Clôture P10 — amélioration gouvernée (3 octobre 2026)

Statut : **P10 PASS/CLOSED**. P0–P9 restent fermés et ne sont pas rouverts.

Gate V3 : une amélioration proposée par un vrai producteur doit être capturée avant mutation, durablement liée au propriétaire/tenant, à la tâche native, au producteur, au skill/version et au digest exact ; elle doit être vérifiée par des tests indépendants déclarés par l'hôte, passer un Oracle lié au même payload, puis une autorisation native exacte et, lorsqu'elle est requise, une décision humaine sur le diff exact avant l'effet natif. Le rejeu doit converger sans double mutation, et un succès natif doit rester distingué d'une observation de journal manquante.

Preuve de production :
- `initialize.js` ne branche `onSkillProposed` que lorsqu'un vrai `taskId` de sous-agent est présent dans le contexte asynchrone ; le producteur natif est lu séparément ;
- `recordSkillImprovementProposal` persiste le payload/diff exact, son digest et les identités sous propriétaire/tenant, avec idempotence et déduplication des éditions identiques ; la mutation native n'est pas appelée pendant cette capture ;
- `validateSkillImprovementCandidate` exécute uniquement les plans de tests définis par l'hôte sur le payload exact, refuse un vérificateur identique au producteur, persiste `VALIDATING` puis le résultat, et appelle l'Oracle déterministe seulement après réussite des tests ;
- `createImprovementDisposition` exige l'accord du snapshot candidat/digest/trace pour un verdict Oracle accepté et ne crée aucune autorité d'exécution ;
- `decideSkillImprovementReview` lie une approbation/rejet humaine au `payloadDigest` et au `snapshotDigest` exacts, puis rejoue l'autorisation native avant publication ; une édition ou un digest décalé exige une nouvelle décision ;
- `publishImprovementSkillUpdateForRequest` revérifie capacité native, ACL, payload/digest, filtre de contenu et version optimiste, puis appelle le `updateSkill` natif ; seul le résultat `updated` produit `COMMITTED` ;
- le chemin CREATE possède le même contrat avec allocation durable préalable, preuve de mutation native exacte, réparation de l'ACL propriétaire au rejeu et absence de double création ;
- une panne du journal après mutation native produit `observationPending` et non un faux rollback : la réconciliation reste descriptive de l'effet déjà commis.

Preuves de tests fraîches :
- orchestrator P10 : **17 suites / 99 tests PASS** (`improvement`, `evidence`, `distill`, `disposition`, `authorization`, `skillContentTests`, `stepLimitEvidenceContext`, `toolEvidence*`, etc.) ;
- API P10 principale : **9 suites / 79 tests PASS** sur candidate, proposal, validation, skill validation, authorization, publication, review, test plans et tool evidence ;
- intégration P10 durable skill review/publication : **2/2 PASS**, dont cycle proposition → tests indépendants → Oracle → décision humaine exacte → publication et récupération d'une mutation déjà commise après panne du journal `COMMITTED` ;
- création skill gouvernée : **13/13 PASS**, dont allocation durable, publication, conflits, rejeu, réparation d'ACL et absence de double mutation ;
- publication par digest : **2/2 PASS** ; callback d'évidence : **6/6 PASS** ;
- reprise : `request.resumeMetadata.spec.js` **141/141 PASS** ; `resume.spec.js` **148/148 PASS**, incluant candidat P10 sur reprise et ré-pause ;
- stores data : **12/12 PASS** sur candidat et proposition skill ;
- `run-summarization.test.ts` ciblé : callbacks modèle et chemins `createRun` P8/P6 **9/9 PASS** ;
- builds `@librechat/api` et `@librechat/data-schemas` : **PASS** ; `git diff --check` : **PASS**.

Preuve live/humaine déjà consignée : le checkpoint rapporte un cycle réel OpenRouter du 28 septembre 2026 avec un vrai sous-agent enfant et un `taskId` natif, une proposition skill durable, des tests hôte `VERIFIED`, un Oracle `VERIFIED`, puis une approbation explicite de l'utilisateur liée au diff/digest exact avant publication native en version 3. Il rapporte également la déduplication réelle de deux `edit_file` identiques d'un même enfant et la conservation d'une seule proposition canonique. Cette preuve historique reste applicable au code actuel car les frontières P10 concernées sont toujours présentes et les campagnes de régression actuelles passent.

Limitation restante, hors gate P10 : le parcours navigateur connecté n'est pas requis pour rouvrir ou modifier la politique P10 ; la preuve live/humaine antérieure et les intégrations backend couvrent le contrat. Une ré-exécution navigateur peut rester une preuve de release P14, mais son absence ne maintient plus P10 ouvert.

Décision : **P10 CLOSED**. Le système d'amélioration reste gouverné : un modèle ou un sous-agent peut proposer, mais n'acquiert ni permission de mutation, ni droit de publication, ni autorité de définir son propre vérificateur. Les cibles `agent`, `workflow` et `specialist` restent `proposal-only`; la voie de mutation prouvée est le skill natif sous le contrat exact ci-dessus.

Prochaine phase : **P11 V3 — pipeline média**, sans rouvrir P0–P10 fermés.

## Clôture P11 V3 — pipeline média gouverné (3 octobre 2026)

Statut : **P11 V3 PASS/CLOSED**. P0–P10 restent fermés et ne sont pas rouverts.

Gate V3 : une demande média structurée doit traverser un seul pipeline `brief → routing → admission → provider → post-process → QA → artifact`. Les providers sont des capacités interchangeables déjà autorisées par l’hôte ; le pipeline ne leur donne aucune permission. Chaque tentative possède la même identité native `taskId/traceId` mais un `attemptId` distinct. Un échec provider peut sélectionner le prochain provider autorisé sans rejouer le `Run`. Aucun artefact n'est persisté avant un verdict QA `VERIFIED`, et tout artefact persistant conserve provenance, provider, type média et digest.

Preuves de contrat et d’implémentation :
- `packages/api/src/agents/orchestrator/mediaGeneration.ts` introduit le contrat unique `GenerationProvider` pour `image`, `audio` et `video`, séparé des SDK fournisseurs ;
- `createMediaProviderCandidate` réutilise `rankAuthorizedResources` de la Decision Layer existante : contraintes et signaux restent host-owned, le provider ne peut ni s'autoriser ni s'ordonner lui-même ;
- `createToolGenerationProvider` adapte les outils de génération déjà présents dans le registre LibreChat, notamment `image_gen_oai` et `gemini_image_gen`, sans coupler BOT MODE à un SDK fournisseur particulier ;
- `MediaGenerationAdmission` impose une nouvelle admission à chaque tentative et reçoit `taskId`, `traceId`, provider, type média et coût estimé du binding ;
- `MediaPostProcessor` et `MediaQualityGate` sont des seams séparés ; une sortie `REJECTED`, `UNKNOWN` ou `HUMAN_REVIEW` n'atteint jamais `artifactStore` ;
- le fallback est borné à la liste des providers compatibles et autorisés fournie au pipeline ; il ne crée ni nouveau run, ni nouveau scheduler, ni nouveau durable owner ;
- `MediaGenerationArtifact` porte `artifactId`, `mimeType`, `providerId`, URI, digest et provenance exacte (`traceId`, `taskId`, inputs) ;
- les événements MTO `REQUESTED`, `DECIDED`, `AUTHORIZED`, `STARTED`, `FALLBACK_SELECTED`, `FAILED`, `VERIFIED` et `ARTIFACT_CREATED` sont des observations uniquement ; ils n'accordent aucune permission.

Preuves fraîches :
- `mediaGeneration.spec.ts` + `routing.spec.ts` : **17/17 PASS** ;
- régressions média existantes (`steering/media.spec.ts`, `files/audio.spec.ts`, `images/session.spec.ts`, `images/authorization.spec.ts`) : **66/66 PASS** ;
- scénario provider interchangeable : les adaptateurs des outils réels `image_gen_oai` et `gemini_image_gen` passent le même contrat `GenerationProvider` ;
- scénario fallback vidéo : provider primaire en erreur, réadmission du second provider, même `taskId`, `attemptId` distincts, aucun artefact avant QA ;
- scénario QA négatif audio : aucun artefact persisté lorsque la qualité est rejetée ;
- scénario contraintes dures : signal coût absent + `maxEstimatedCost` entraîne un rejet sans invocation ;
- `@librechat/api` build : **PASS** ; `@librechat/data-schemas` build : **PASS** ; `git diff --check` : **PASS**.

Compatibilité architecture V6.1 :
- pas de second Task Engine, scheduler, durable owner ou source of truth ;
- routage média s'appuie sur la Decision Layer existante ;
- admission reste sous Policy/Auth/Control hôte ;
- QA reste sous Oracle/evidence et n'acquiert aucune autorité d'exécution ;
- artifact reste une sortie durable du pipeline, pas un nouveau mécanisme de publication ;
- les providers peuvent être image, audio, vidéo, outil, runtime local ou external-provider tant que leur capacité est déclarée et autorisée ; leur rôle est choisi par le Capability/Provider Router, pas fixé architecturalement.

Portée de preuve : cette fermeture démontre le pipeline gouverné et son interchangeabilité au niveau du runtime BOT MODE, ainsi que l'adaptation des outils image existants. Aucune génération fournisseur externe coûteuse ou publication média réelle n'a été déclenchée pendant cette tranche ; cette preuve live dépendra d'une configuration fournisseur/budget opérationnelle et relève de la validation de déploiement/release P14. Ce manque de trafic fournisseur réel n'ouvre pas le contrat P11.

Décision : **P11 V3 CLOSED**. Le BOT MODE dispose désormais d'un seam média commun pour image/audio/vidéo avec routing, admission, fallback, QA, provenance et artefact, sans céder l'autorité aux modèles ou providers.

Prochaine phase : **P12 V3 — production YouTube**, sans rouvrir P0–P11 fermés.

## Clôture P12 V3 — production YouTube gouvernée (3 octobre 2026)

Statut : **P12 V3 PASS/CLOSED**. P0–P11 restent fermés et ne sont pas rouverts.

Gate V3 : la production YouTube suit `claims sourcés → script → média/miniature → SEO → QA → readiness → AuthorizationRecord → publication`. La publication réelle reste un effet sensible : elle exige une approbation humaine liée au payload/digest exact et un scope OAuth YouTube valide. Aucun token n'est stocké par le pipeline.

Implémentation finale :
- `youtubeProduction.ts` fournit le contrat unique P12 pour claims, script, métadonnées SEO, QA, readiness, autorisation et publication ;
- les claims exigent texte, URL HTTP(S) valide et titre de source ;
- le script est rejeté s'il n'est pas relié au contenu sourcé ;
- la présence média, description SEO et miniature est contrôlée avant readiness ;
- `createYouTubePublicationAuthorization` produit un `AuthorizationRecord` scoped à `channel + videoDigest`, avec `approvalId` humain obligatoire ;
- `publishYouTubeAfterExactApproval` refuse tout mismatch d'approval ou de digest avant tout appel réseau ;
- `createYouTubeDataApiPublisher` utilise l'API YouTube Data v3 via HTTP natif, avec un access token déjà résolu par l'autorité d'auth ; il effectue `videos.insert` puis, si fourni, `thumbnails.set` ;
- `publishYouTubeWithResolvedGoogleAuth` exige un scope OAuth `youtube.upload` ou `youtube` avant émission ; les tokens restent dans le resolver d'auth et ne sont jamais persistés dans le pipeline ;
- après publication, le callback analytics enregistre `taskId`, `traceId` et `videoId` ; il ne devient pas une source de permission.

Preuves :
- P12 nouveau pipeline/publisher : **7/7 tests PASS** dans `youtubeProduction.spec.ts`, incluant claims, script, metadata, dry-run, approval fail-closed, publication une fois approval/digest exacts, upload vidéo + miniature et rejet d'un scope OAuth insuffisant ;
- Google YouTube existant : **66/66 PASS** dans `youtube.spec.ts`, sans rejouer ni modifier ses invariants de parsing/injection ;
- voisins orchestrator (`mediaGeneration`, `authorization`, `mto`) : PASS ; batterie combinée : **87/87 PASS** ;
- `@librechat/api` build : **PASS** ; `@librechat/data-schemas` build : **PASS** ; `git diff --check` : **PASS**.

Preuve API externe : le publisher est testé contre des réponses HTTP simulées et vérifie les en-têtes Bearer, le multipart vidéo et l'appel miniature. Les règles officielles YouTube Data API actuelles indiquent que `videos.insert` nécessite une autorisation OAuth avec `youtube.upload` (ou un scope YouTube plus large), et qu'un projet API non vérifié peut être limité aux vidéos privées jusqu'à audit ; le pipeline n'assume donc jamais qu'une vidéo pourra être publique automatiquement. citeturn113348view0turn113348view1

Limite explicite : aucune vidéo réelle n'a été envoyée vers une chaîne pendant cette tranche, car il n'existe pas dans le checkout un payload vidéo concret `artifact + channel + approvalId + digest` que l'utilisateur aurait explicitement approuvé pour publication. Cette absence de trafic réel ne maintient pas le contrat P12 ouvert : le publisher réel, les scopes et les garde-fous de publication sont couverts ; une première publication effective reste une opération de release avec approbation du contenu exact.

Décision : **P12 V3 CLOSED**. Le système sait désormais préparer, vérifier et publier une production YouTube sous mandat exact sans créer d'autorité parallèle. Toute évolution future de chaîne/analytics sera traitée dans les phases suivantes ou release gates, sans rouvrir P0–P12.

Prochaine phase : **P13 — rooms et interface BOT MODE**, sans rouvrir P0–P12 fermés.

## Clôture P13 V3 — rooms / interface BOT MODE projet (3 octobre 2026)

Statut : **P13 V3 PASS/CLOSED**. P0–P12 restent fermés et ne sont pas rouverts.

Gate : un projet BOT MODE doit fournir une projection UI isolée par `projectId`, afficher ses plans, progression/observations, coûts, mémoire et sources, et contrôler uniquement les tâches durables appartenant aux conversations du projet. Deux projets concurrents doivent rester séparés ; une commande pause/reprise doit continuer à utiliser le seam durable existant `taskId + threadId + parentConversationId + invocationId`.

Preuves backend :
- `createBotModeProjectProjection` récupère d'abord le projet sous le propriétaire courant puis projette uniquement ses conversations ; `getConvosByCursor` reste scoped au `projectId` ;
- deux projections concurrentes A/B ont été testées avec leurs conversations distinctes ; mémoires distinctes via la partition native `projectId`; sources distinctes via `conversation.files` puis résolution `getFiles({ file_id: { $in: ... }, user })`; aucun identifiant de l'autre projet n'est mélangé ;
- mémoire projet réutilise le store natif `MemoryEntry(projectId)` ; aucun nouveau stockage mémoire P13 ;
- les sources UI réutilisent les fichiers déjà liés aux conversations et l'ACL propriétaire existante ; aucun catalogue de sources parallèle ;
- le routeur `/api/projects/:projectId/bot-mode` transmet `getConvoFiles`, `getFiles`, `getUserMemories` et `listMtoObservations` au même propriétaire/durable path ;
- projection bornée : max 100 projets-conversations, 200 messages par conversation, 100 observations par trace, 100 mémoires projet, 200 sources projet.

Preuves UI :
- `BotModeProjectPanel.tsx` reste monté dans `ProjectWorkspace.tsx` et consomme uniquement la projection projet + l'index parent-subagent durable ;
- affiche désormais plan, coût, observations, mémoire projet et sources projet ;
- pause/reprise continue d'utiliser l'existant `useSubagentControlMutation` avec `latestTaskId`, `threadId`, `parentConversationId` et une nouvelle `invocationId` ;
- aucun contrôle n'est exposé pour une conversation sans identité et aucun nouveau contrôle n'est créé pour les états terminaux ;
- les nouvelles traductions BOT MODE mémoire/sources existent en EN/FR ; les autres locales continuent de bénéficier du fallback i18n existant.

Preuves fraîches :
- `botModeProjectProjection.spec.js` + `projects.botmode.test.js` : **6/6 PASS** ;
- `BotModeProjectPanel.test.tsx` : **1/1 PASS**, incluant affichage mémoire/source et pause/reprise de deux conversations ;
- `Translation.spec.ts` : **12/12 PASS** ;
- `routing.spec.ts` voisin : **12/12 PASS** ; aucune modification de ses invariants P9 ;
- mémoire/conversation ciblés : **30/30 PASS** ; une suite de fichiers ACL ciblée a été skipée uniquement par le filtre de sélection et n'a pas été interprétée comme un succès ;
- `@librechat/api` build : **PASS** ; client Vite production build + PWA post-build : **PASS** ; `git diff --check` : **PASS** avant commit.

Décision : **P13 V3 CLOSED**. Le Project Workspace est maintenant une surface BOT MODE complète de projection/contrôle sans seconde autorité : les plans, coûts, observations, mémoire et sources sont dérivés des stores natifs ; pause/reprise reste le control path durable existant ; deux projets concurrents sont isolés par leurs identités projet/conversation/propriétaire.

Prochaine phase : **P14 — release / restauration**, sans rouvrir P0–P13 fermés.

==================================================
CLOTURE P14 — RELEASE / RESTAURATION (3 octobre 2026)
==================================================

Statut : **P14 PASS/CLOSED**. P0–P13 restent fermés et ne sont pas rouverts.

Gate P14 : le checkout de référence doit produire les artefacts de production, conserver un snapshot restaurable, permettre une restauration déterministe du commit de release, rester compatible avec la configuration de déploiement et laisser la release traçable sans embarquer les secrets.

Preuves fraîches :
- HEAD de référence avant release : `abf41a9a70e47b4ed83ac9d2b07871c0aae4a2c4` (`feat(botmode): close P13 project rooms`) ; checkout sans fichier suivi modifié.
- `git diff --check` : **PASS**.
- `npm run build:api` : **PASS**.
- `npm run build:data-schemas` : **PASS**.
- `npm run build:client` : **PASS**, PWA post-build inclus.
- `deploy-compose.yml` : `docker compose ... config --quiet` **PASS**.
- package-lock et autres lockfiles : aucun changement Git.
- snapshot release créé hors repository sous `~/backups/librechat-p14-20261003/` : bundle Git + archive source + HEAD + preuves diff/status/fsck.
- bundle Git vérifié par `git bundle verify` : **PASS**, historique complet contenant HEAD `abf41a9a...`.
- restauration non destructive dans `/tmp/botmode-p14-restore` : HEAD restauré identique `abf41a9`, checkout propre, checkpoint et fichiers P13 présents.

Intégrité Git : le `git fsck --full --no-reflogs` du dépôt hôte et du clone restauré révèle un objet historique manquant (`90cdcb...`) référencé par `f9f1b2...`. Cette anomalie préexistait au snapshot et n'empêche pas la vérification du bundle ni la restauration du commit P13 de référence ; elle reste explicitement documentée et ne doit pas être présentée comme une intégrité Git globale parfaite.

Limite de release : aucune mise en production publique ni publication de contenu externe n'a été déclenchée pendant P14. La configuration de déploiement est valide et les artefacts de production sont construits ; une activation publique reste une opération distincte nécessitant ses credentials, variables d'environnement et autorisations opérationnelles exactes.

Décision : **P14 CLOSED**. Le release point P13 est sauvegardé et restaurable, les builds de production sont passants, la configuration de déploiement est syntaxiquement valide et la provenance du snapshot est figée. Aucun changement P0–P13 n'est requis pour clôturer P14.
==================================================
ANNEXE POST-P14 — ÉLÉMENTS CONSOLIDÉS AJOUTÉS / À CONSERVER
==================================================

Cette annexe ne rouvre aucune phase P0–P14.
Elle consolide les décisions, références, capacités et pistes ajoutées dans
les mémos de continuité du 26 septembre au 3 octobre 2026 mais absentes ou
incomplètement représentées dans le checkpoint maître.

Règle de statut :
VALIDÉ/PROUVÉ = preuve technique déjà obtenue.
RÉFÉRENCE = idée externe à exploiter sans l'importer.
CAPABILITÉ FUTURE = cible de conception, non livrée.
À ÉVALUER = nécessite recherche/benchmark/revalidation.
À SURVEILLER = radar.
PROPOSÉ = idée conservée.
RETIRÉ = ne pas utiliser.
UNKNOWN = information insuffisante.

--------------------------------------------------
A. RÉFÉRENCES GITHUB AJOUTÉES LE 3 OCTOBRE 2026
--------------------------------------------------

papercliai/paperclip
Statut : RÉFÉRENCE ARCHITECTURALE FORTE.
Mapping : Control Plane / objectifs / tâches / délégation / budgets /
gouvernance / adapters / audit / recovery.
Patterns à exploiter : Goal → Project/Task → Agent ; hiérarchie de délégation ;
budgets agent ; heartbeat/wakeup ; adapters runtime/exécuteur ; traçabilité ;
allow/block/require_approval/rate_limit/trust_rule ; récupération de runs
orphelins.
Ne jamais importer Paperclip comme second runtime, scheduler ou source de vérité.

vectorize-io/hindsight
Statut : RÉFÉRENCE ARCHITECTURALE FORTE.
Mapping : Memory Layer / mémoire longue durée / consolidation / retrieval /
connaissance durable.
Patterns : retain / recall / reflect ; faits/expériences/observations ;
observations reliées aux preuves ; recherche sémantique + mots-clés + graphe +
temporel ; consolidation ; mental models / knowledge pages ; traitement
mémoire séparé du modèle principal ; scoping par memory bank.
Mapping cible : MemoryEntry → mémoire brute → consolidation → observation
appuyée par preuve → connaissance durable.
Ne jamais déplacer l'autorité Durable ou Oracle.

HKUDS/CLI-Anything
Statut : RÉFÉRENCE ARCHITECTURALE FORTE.
Mapping : Capability Discovery / Capability Adapter Factory / Tool Registry.
Patterns : transformer des logiciels réels en interfaces agent-native ;
harness/adapters au-dessus du logiciel réel ; commandes structurées ;
JSON machine-readable ; mode interactif/programmatique ; tests unitaires,
workflow, E2E, subprocess ; vérification des artefacts réellement produits ;
SOP/HARNESS ; raffinement itératif.
Ne jamais créer un second moteur d'exécution.

rohitg00/ai-engineering-from-scratch
Statut : RÉFÉRENCE ENGINEERING.
Mapping : MCP / Agent Skills / conformance / sécurité / fiabilité.
Patterns : MCP, authorization/gateways, registry, cancellation/race
conditions, conformance evidence, coding-agent skills.
À utiliser pour renforcer les contrats et preuves, sans nouvelle autorité.

debpalash/VoiceStudio
Statut : RÉFÉRENCE CAPABILITY/MEDIA.
Mapping : Audio / Voice / Transcription / Dubbing / Workers.
À surveiller : architecture locale + API/MCP, moteurs interchangeables,
batch jobs, workers distants, routage selon capacités matérielles.
Pas de modification du cœur par ce seul dépôt.

pbakaus/impeccable
Statut : RÉFÉRENCE QA/UI SECONDAIRE.
Mapping : Oracle / QA / deterministic validation / drift detection.
Patterns : détecteurs déterministes + critique LLM, audits structurés,
hooks post-modification, détection de dérive contexte/configuration/artifacts,
séparation audit/correction.
Ne devient pas une autorité concurrente.

anthropics/financial-services
Statut : RÉFÉRENCE DE VERTICALISATION.
Mapping : Vertical Capability Packs / Skills / MCP / connecteurs métiers.
Concept : regrouper skills et connecteurs par verticale tout en séparant le
noyau BOT MODE du savoir-faire métier.
Verticales possibles : finance, immobilier, achats PME, conciergerie,
automobile, etc.

vercel/next.js
Statut : RÉFÉRENCE FRONTEND/RUNTIME.
Mapping : UI BOT MODE / streaming / server-client boundaries / cache /
revalidation / instrumentation.
Décision actuelle : aucune intégration architecturale dans le cœur BOT MODE.

Classement de référence à conserver :
ARCHITECTURALES FORTES = Paperclip / Hindsight / CLI-Anything.
ENGINEERING = AI Engineering From Scratch.
CAPACITÉS FUTURES = VoiceStudio / Impeccable / Financial Services.
HORS CŒUR = Next.js.

--------------------------------------------------
B. AUTRES RÉFÉRENCES TECHNIQUES ET PROVIDERS HISTORIQUEMENT CONSOLIDÉS
--------------------------------------------------

Perplexity
Statut : RÉFÉRENCE/CAPABILITY À ÉVALUER.
Usages possibles : agentic web research, citations, provenance, domain filters,
recency, localisation, Search API, Agent API, embeddings, multi-model routing.
Pas d'autorité centrale.

Proactor AI
Statut : RÉFÉRENCE.
Usages : transcription temps réel, contexte conversationnel, détection
proactive, insights, actions, owners, deadlines, mémoire/search
inter-réunions.
Mapping : voice/web/files → Context Engine → proactive detection →
Decision Layer → Task Engine → specialists/providers/tools →
evidence/oracle → action/synthesis.

Roo Code / Codex / MiMo Code / OpenCode / DeepSeek coding
Statut : RÉFÉRENCES / PROVIDERS / AGENTS EXTERNES BORNÉS.
Capacités à absorber : tool use, navigation code, planning, delegation,
self-correction, context handling, IDE integration.
Le rôle est dynamique : development provider, coding agent, référence ou
external executor borné.

MiMo
Statut : RÉFÉRENCE ARCHITECTURALE + PROVIDER POSSIBLE.
Rôles : modèle, MiMo Code, provider Goal/Judge/Dream/Distill/Compose/context/
voice/MCP/cron, external executor borné, référence.
Aucune cession d'autorité.

Freebuff
Statut : À ÉVALUER.
Pistes : coding agent, cloud development, free model resource, alternate
model resource.
À revalider avant usage : terms, privacy, code retention, private repo
handling, CLI automation, API, sandbox, ads/business model, quotas, stability.

FreeBuf
Statut : SOURCE CYBERSÉCURITÉ À SURVEILLER.
Pistes : CVE, recherche offensive/défensive, outils sécurité, AI security,
threat intelligence, incident response, guardrails, nouvelles techniques.
Chaîne : source → signal → relevance → gap → sandbox → Oracle → proposal.
Ne pas dépendre d'un seul écosystème linguistique.

Pliny / Elder Plinius
Statut : RÉFÉRENCE RED-TEAM / ADVERSARIAL.
Usage : corpus adversarial, prompt-injection tests, jailbreak robustness,
guardrail/policy resistance, compromised-agent scenarios, regression security.
Propriété 1 à tester : modèle compromis ne contourne pas Policy.
Propriété 2 : comportement particulier d'un modèle ne devient pas la Policy
centrale par accident.
Priorité de sécurité : contrôler les EFFETS, pas supprimer arbitrairement
l'utilité exploratoire.

Yiaho
Statut : RÉFÉRENCE UX/CATALOGUE.
Leçon : l'utilisateur choisit plutôt besoin/spécialité que modèle.
Mapping : USER NEED → INTENT → SPECIALIST DISCOVERY → CAPABILITY →
MODEL/PROVIDER → EXECUTION.
API M2M non prouvée ; pas provider validé.

Obscura
Statut : À ÉVALUER / CANDIDAT BROWSER.
Rôle possible : headless browser / rendering / MCP provider.
Points à benchmarker : Rust/V8, screenshots, PDF raster, screencast, CDP,
Playwright connectOverCDP, Puppeteer compatibility, native MCP, stdio/HTTP,
snapshot/markdown/links/extraction/forms/click/fill/type/key/select/scroll/
wait/evaluate/network/console/cookies/storage/tabs.
Sécurité annoncée à vérifier : bearer token, non-loopback restrictions,
origin allowlist, bounded resources, SSRF/private-network protections.
Invariant : Obscura n'est PAS une sandbox OS ; contenu hostile → container/VM/
restricted network.
Combinaison à benchmarker sur machine limitée : Playwright → CDP → Obscura.

Firecrawl
Statut : PROVIDER DE RECHERCHE/EXTRACTION.
Playwright
Statut : PROVIDER D'AUTOMATISATION NAVIGATEUR.
Orgo Cloud
Statut : PROVIDER GUI/REMOTE COMPUTER À ÉVALUER.
E2B
Statut : PROVIDER SANDBOX CODE/SHELL.
Composio
Statut : PROVIDER SAAS/API/OAUTH.
AgentMail
Statut : PROVIDER INFRASTRUCTURE EMAIL/AGENT COMMUNICATION.
Tous restent sous Capability Router + Policy/Auth.

n8n / Replit / ComfyUI / Coolify
Statut : RÉFÉRENCES / OUTILS OU PROVIDERS OPTIONNELS.
Aucun ne remplace Task Engine, scheduler, runtime ou source de vérité.
Coolify peut entourer Docker/Compose côté exploitation/déploiement.

OpenRouter / TokenRouter / FreeOpenRouter / OrcaRouter / Hugging Face /
Ollama
Statut : SOURCES/PROVIDERS À REVALIDER AU MOMENT D'USAGE.
Critères : disponibilité, quota, prix, API, licence, sécurité, compatibilité.
Préférence : ressources gratuites/open-source sans sacrifier inutilement la
qualité ; cloud LLM acceptable ; pas de dépendance unique.

--------------------------------------------------
C. WEB / BROWSER / OSINT / SECURITY LAB
--------------------------------------------------

Source/Resource Registry
Statut : CAPACITÉ ARCHITECTURALE À CONSERVER.
Le registre décrit : identité/source, type, capability, trustLevel,
accessMethod, networkRequirement, permission, refreshPolicy, provenance,
legalUsage, enabled, toolBinding.
Invariant : URL enregistrée != tool autorisé.

Modes réseau :
NONE / LOCAL_LAB / ALLOWLIST / WEB / TOR_ALLOWLIST.
Tor est scoped par job, destination, durée, logging, limites et révocation.

Navigateur :
état → décision → action candidate → Policy → exécuteur →
observation → vérification.
Sessions/comptes sous mandat ; credential vault/credentialRef ;
accès minimal et révocable ; secrets hors mémoire/log/MTO.

Sources de veille/recherche à conserver :
Reddit, Discord, YouTube, Instagram, Telegram, TGSTAT, fmhy.net.
OSINT tools à conserver comme sources/références : Google Dorks, Sherlock,
Maltego, Shodan, OSINT Framework, Unredacted OSINT Tool.
Une source connue ne devient jamais automatiquement un outil autorisé.

Security Lab
Statut : CAPACITÉ FUTURE / USAGE CONTRÔLÉ.
Sources/labs : Root-Me, Hack The Box, OWASP Juice Shop, PortSwigger,
Hacksplaining, CVE/advisories, documentation officielle et labs locaux.
Chaque exercice doit conserver TARGET/CHALLENGE SCOPE + OUTILS AUTORISÉS +
DURÉE MAX + CONCURRENCE MAX + JOURNALISATION + STOP/REVOCATION → LAB →
RESULTAT → ORACLE.
Une expérience de lab ne devient pas automatiquement un skill permanent.

TryHackMe
Statut : SOURCE D'ENTRAÎNEMENT/SKILL À SURVEILLER.
Hack The Box
Statut : SOURCE D'ENTRAÎNEMENT/SKILL À SURVEILLER.
Web Security Academy / PortSwigger
Statut : SOURCE D'ENTRAÎNEMENT/SKILL À SURVEILLER.

--------------------------------------------------
D. MEDIA / CREATIVE CAPABILITY
--------------------------------------------------

Pipeline cible :
brief → plan → provider → génération → validation → post-traitement →
QA → artefact durable/provenance.

Providers/capacités à conserver comme radar :
ComfyUI, WorldSculpt, UniMate, YuE/YuE2, MiniCPM5, FishAudio, ACE Studio,
Nano Banana, MiniMax, LTX, TripoAI, Higgsfield, HyperFrames, Klap.
Aucun provider n'est obligatoire.

Charte de style projet
Statut : CAPACITÉ FUTURE.
Doit pouvoir scoper/versionner : personnages, environnements, couleurs,
lumière, composition, caméra, animation, continuité, variations interdites.
Mémoire créative et paramètres doivent être scoped/versionnés.

Vidéo URL
Statut : CAPACITÉ FUTURE.
Pipeline : métadonnées → transcription → vision → provenance → limites.

Twitch / live génératif 24/7
Statut : PROPOSÉ / OPPORTUNITÉ MEDIA.
Concept : chaîne connectée à génération IA capable de produire/diffuser un
flux continu.
Pipeline possible : idées/scènes → vidéo/audio/voix/musique → composition →
modération/Policy → diffusion → monitoring qualité/uptime → analytics →
amélioration.
Formats possibles : émission générative infinie, plateau fictionnel, univers
persistant, personnages IA récurrents, interactions chat, musique/ambiance.
Contraintes à garder : coût GPU/API, latence, continuité, fallback,
droits/licences, règles plateforme, modération, budget et arrêt d'urgence.

--------------------------------------------------
E. ECONOMIC ENABLEMENT / OPPORTUNITY INTELLIGENCE
--------------------------------------------------

Statut : COUCHE BUSINESS OFFICIELLE DE BOT MODE.
Chaîne :
SIGNAL → OPPORTUNITY → QUALIFICATION → ECONOMIC ANALYSIS →
BUSINESS BLUEPRINT → EXECUTION CONTRACT → DECISION → POLICY/AUTH →
TASK/DAG → EXECUTION → EVIDENCE → ORACLE → PUBLICATION BARRIER →
RESULT → REVENUE/COST/MARGIN/CASH → LEARNING → OPTIMIZATION.

Opportunity Intelligence
Pipeline :
WATCH → DETECTION → NORMALIZATION → DEDUPLICATION → CORRELATION →
QUALIFICATION → VERIFICATION → ANALYSIS → OPPORTUNITY BRIEF →
BUSINESS BLUEPRINT → EXECUTION CONTRACT.

Domaines :
jobs, freelance, remote work, product testing, UGC, affiliate, brand
collaborations, hospitality, mystery shopping, hotel audits, rate parity,
consumer research, UX testing, grants, subsidies, tenders, financing,
partnerships, sourcing, commerce, services, travel, events, technology,
emerging trends, regulatory opportunities, marketplace/local/international
opportunities.

Principe EXPLOIT + EXPLORE :
EXPLOIT = utiliser l'existant fiable, accessible, rentable, suffisamment bon.
EXPLORE = chercher aussi plateformes, niches, programmes privés, offres
directes, stratégies différentes et modèles émergents.
Les références utilisateur sont des SEARCH SEEDS, jamais une SEARCH CEILING.

Recherche géographique :
France → francophonie → Europe → international.
Ce n'est pas une limitation : une opportunité mondiale peut être retenue si
la valeur nette est bonne.

Total Value
Inclure : cash + valeur produit/service + séjour/repas/activité +
remboursements + UGC + affiliate + partenariat + relation + revente/utilité +
learning/strategic value.
Déduire : déplacement + logement non remboursé + temps + achat obligatoire +
production + administratif + fiscalité + assurance + visa + compliance + risque.

Opportunity scoring
Le score sert au TRI uniquement.
SCORE != TRUTH
SCORE != AUTHORIZATION
SCORE != DECISION finale.
Critères : net cash, total value, margin, time to revenue, capital,
risk, reliability, recurrence, competition, complexity, location, travel,
qualification probability, strategic value, partnership potential,
learning value.

Feedback loop
Conserver les résultats réels : applications envoyées/acceptées, missions
réalisées, rémunération réelle, temps, dépenses, produits reçus, qualité
plateforme, délais de paiement, relation marque, récurrence.

Work / Job Opportunities
Catégories : remote jobs, freelance missions, micro missions, consulting,
specialist marketplaces, human-in-the-loop, digital tasks, local services.
Sources historiques : EU Remote Jobs, Landing.jobs, Remotify Europe, Upwork,
Workana, Malt, Contra, Freelancer, 99designs.
Ne pas limiter la recherche à cette liste.

Gestion / PME / automobile
Conserver : gestion pour PME, asset management, automotive asset management,
vehicle fleet management, vehicle rental management, gestion de patrimoine
automobile.
Explorer : gestion véhicules, location, flotte, sourcing, achat, revente,
maintenance, services B2B.

Product & Experience Opportunity Engine
Branches : product testing ; brand collaboration ; paid research ;
services/experiences.
Product testing : free product, loaned product, discounted product,
purchase + reimbursement, product + cash, consumer/sensory research.
Brand : UGC, photo, vidéo, testimonials, ambassador, affiliate, partenariat.
Paid research : UX, interviews, focus groups, consumer studies, surveys.
Services : hotels, restaurants, travel, leisure, wellness, mystery guest,
mystery shopping, rate-parity audits.

Sources product testing :
Sampleo, Skeepers, ACTALIA, Family UGC, Home Tester Club, The Insiders,
Influenster, UserTesting, TesterDesProduits.fr.
Pour chaque campagne vérifier : cadeau/prêt/achat/remboursement/cash/voucher/
UGC/review/social posting/retour/deadline/restriction géographique.
Ne jamais supposer les conditions.

Hospitality Intelligence
Sous-domaines : Mystery Guest, Hotel Quality Audit, Digital Booking Journey
Audit, Rate-Parity Audit, OTA/Direct Comparison, Restaurant Audit,
Spa/Wellness, Experience Audit, Paid Testing.
Rate parity : même établissement, dates, chambre, occupation, annulation ;
puis prix direct/OTA, taxes, petit-déjeuner, avantages membre, conditions,
disponibilité, écarts.
Mystery guest : réservation → pré-arrivée → arrivée → réception → chambre →
propreté → F&B → personnel → incident → checkout → suivi → audit factuel.

UserTesting
Statut : SOURCE COMPLÉMENTAIRE UX/DIGITAL.
Ne pas l'assimiler au mystery shopping physique.

China Sourcing
Statut : CAPACITÉ BUSINESS OFFICIELLE / FUTURE EXECUTION.
Sources possibles : 1688, Taobao, Weidian, Yupoo, fabricants, fournisseurs,
usines, agents.
Toujours distinguer seller claim / supplier claim / factory claim /
verified manufacturer.
Ne jamais faciliter la contrefaçon.

Opportunity → Execution
DETECTION → VERIFY SOURCE → ECONOMIC ANALYSIS → QUALIFICATION → DECISION →
POLICY/AUTH → TASK → EXECUTION → EVIDENCE → MISSION ORACLE →
PUBLICATION BARRIER → RESULT.
Candidature, acceptation commerciale ou engagement externe sous Policy/Auth.

--------------------------------------------------
F. AUTRES IDÉES / SOURCES À CONSERVER COMME RADAR
--------------------------------------------------

Tuta + SimpleX
Statut : PROPOSÉ / FUTUR.
Piste : messagerie chiffrée ; à traiter après stabilisation BOT MODE, sans
second runtime de messagerie dans le cœur.

DOTS
Statut : À ÉVALUER.
Question : modèle payant, compatibilité Jarvis/Jev, UX et patterns à absorber.
Peut servir de référence, pas d'autorité centrale.

VDI
Statut : À CLASSIFIER/ÉVALUER.
À insérer comme modalité d'environnement/exécution si elle apporte une
capacité réelle, sans second Task Engine.

Acurast / hub.acurast
Statut : À VÉRIFIER.
Piste : infrastructure/distribution ; disponibilité, fonctionnement et
gains à confirmer avant toute intégration/opportunité.

boitata.app.br
Statut : À ÉVALUER / OPPORTUNITY SEED.

Tato Talk / recherche associée
Statut : À ÉVALUER / SEARCH SEED.

archive.org
Statut : SOURCE À ÉVALUER pour recherche/archive/provenance.

Crypto/finance tools à surveiller :
nobodycards, Deflow.exchange, Sideswap.io, BlueWallet.io, Personne.cards,
SideShift.ai.
Statut collectif : À VÉRIFIER avant usage (fiabilité, sécurité, conditions,
custody, API, coûts, conformité).
Aucune intégration ni confiance implicite.

Humanize.io
Statut : RETIRÉ.
Ne plus utiliser ni comme référence ni comme recommandation.

IntelBase
Statut : DÉJÀ DOCUMENTÉ DANS LE CHECKPOINT.
Conserver : adaptateur email isolé, autorisation exacte, budget/réservation,
scope cible majeure, données de brèche désactivées, réponse bornée, aucun
appel réel historique non prouvé.
Ne pas dupliquer cette section.

tinypages.co
Statut : RÉFÉRENCE/SEARCH SEED DÉJÀ IDENTIFIÉE.
À considérer avec IntelBase uniquement comme seed de recherche ; aucune
autorité ni intégration implicite.

Pollo MCP
Statut : SEARCH/CAPABILITY SEED.
À revalider et mapper via Capability Discovery ; ne crée pas de nouvelle
autorité MCP.

--------------------------------------------------
G. INDEX DE RÉFÉRENCE ÉLARGI À MAINTENIR
--------------------------------------------------

Conserver comme radar, jamais comme liste d'intégrations garanties :
Jev, GIVE, NanoJev, Decider, MiMo, MiMo Code, Codex, Roo Code, OpenCode,
Perplexity, Proactor AI, JARVIS, DeerFlow, Honcho, Memory Graph, Kanban,
n8n, Replit, Polsia, Manus, Cofounder, Frederick, FreeLLMAPI, OmniRoute,
OpenRouter, OrcaRouter, Hugging Face, Kaggle, free-for.dev, GitHub, Linear,
Notion, Google Drive, Coolify, SEO Studio, Google Dorks, Sherlock, Maltego,
Shodan, OSINT Framework, Unredacted OSINT Tool, TGSTAT, fmhy.net, tinywow,
seostudio.tools, skipthedrive.com, keoto.com, downloadcursos.top, galilai,
galilai.br, pt.ifixit.com, Hacksplaining, Root-Me, OWASP, PortSwigger,
pentest-ai, Pentest-Swarm-AI, Why Verification, AgentTube, ComfyUI,
WorldSculpt, UniMate, YuE, YuE2, MiniCPM5, FishAudio, ACE Studio,
Nano Banana, MiniMax, LTX, HyperFrames, TripoAI, Higgsfield, Qwen,
DeepSeek, Claude, GPT, Gemini, GLM.
Telegram candidate précédemment noté : smsfull_bot.

Tout élément de cet index doit être revalidé avant usage sur :
identity, availability, API, license, pricing, security, compatibility,
maturity et evidence.

==================================================
RÈGLE FINALE DE CETTE ANNEXE
==================================================

Ces éléments enrichissent le radar et la feuille de route future.
Ils n'ouvrent ni ne rouvrent P0–P14.
Une idée devient une capacité BOT MODE uniquement après :
DISCOVERY → CLASSIFICATION → SECURITY/PRIVACY → COST →
COMPATIBILITY → IMPLEMENTATION → TEST → ORACLE → REGISTRY →
PROOF → DECISION/POLICY → ADOPTION éventuelle.

La source de vérité reste toujours :
Git actuel → runtime → tests → preuves → commits → décisions récentes →
checkpoint → anciens mémos.

Méthode permanente :
checkpoint-first → réconcilier Git/runtime/tests → lire → reproduire →
isoler → patch minimal → test ciblé → tests voisins → build →
diff-check → documenter → checkpoint/commit.

==================================================
PREMIER GAP POST-P14 — CAPABILITY RESOURCE REGISTRY
==================================================

Date : 3 octobre 2026
Statut : MICRO-LOT IMPLEMENTÉ / PROUVÉ / À ÉTENDRE

Diagnostic :
Après P14, le code disposait déjà de :
- routage générique de ressources autorisées ;
- Decision Providers ;
- discovery d'agents ;
- registres MCP/outils ;
- adapters de synchronisation de skills.

Mais il manquait une abstraction descriptive générique permettant de
représenter une ressource/capacité indépendamment de son provider et de
préparer proprement les apports Paperclip / Hindsight / CLI-Anything /
Resource Registry.

Micro-lot réalisé :
- création de `CapabilityResourceRegistry` ;
- types de ressources : agent, model, tool, workflow, external-provider,
  local-runtime, source ;
- description de capability, executionMode, provider/model, accessMethod,
  networkRequirement, permission, trustLevel, legalUsage, refreshPolicy,
  enabled, toolBinding, provenance et signaux de routing ;
- validation des identités, capacités, enabled et provenance ;
- register / upsert / remove / get / list déterministes ;
- snapshots indépendants pour éviter la mutation externe ;
- export via l'index orchestrator ;
- aucun accès aux credentials ;
- aucune autorisation ;
- aucune réservation budget ;
- aucune exécution ;
- aucune nouvelle source de vérité durable.

Preuves :
- suite ciblée `capabilityRegistry.spec.ts` : 5/5 PASS ;
- typecheck API : PASS ;
- build API : PASS ;
- `git diff --check` : PASS ;
- revue du diff : 3 fichiers uniquement ;
- aucun fichier P0–P14 modifié.

Important :
Ce micro-lot n'est pas encore une adoption complète du Resource Registry
global. Il fournit le contrat descriptif minimal manquant. La prochaine
preuve devra déterminer comment raccorder ce registre aux sources/providers
réels et au routage autorisé, sans contourner Policy/Auth ni créer de runtime
parallèle.

Références qui motivent cette évolution :
Paperclip → Control Plane / objectifs / délégation / gouvernance / budgets /
adapters / recovery.
Hindsight → Memory Layer / consolidation / retrieval / provenance.
CLI-Anything → Capability/Adapter Factory / agent-native software / harness.
AI Engineering From Scratch → MCP / conformance / security.

Règle :
Registry décrit et sélectionne.
Policy/Auth autorise.
Runtime exécute.
Durable conserve la vérité d'exécution.
Oracle vérifie.
Aucun de ces rôles ne doit être fusionné.

==================================================
SECOND MICRO-LOT POST-P14 — REGISTRY → ROUTING BRIDGE
==================================================

Date : 3 octobre 2026
Statut : MICRO-LOT IMPLEMENTÉ / PROUVÉ

Objectif :
Relier le catalogue descriptif CapabilityResourceRegistry au routage sans
transférer l'autorité d'autorisation au registry.

Contrat :
- registry = description/discovery ;
- host resolver = seule étape qui peut produire un AuthorizedResourceCandidate ;
- routing = classement de candidats déjà autorisés ;
- Policy/Auth = autorité d'admission ;
- runtime = exécution.

Implémentation :
- `resolveRegisteredResources` ;
- sélection préalable via ResourceRegistryQuery ;
- résolution explicite par callback hôte ;
- omission d'un descripteur lorsque l'hôte n'en produit aucun candidat ;
- détection fail-closed des collisions d'identité ;
- aucune copie automatique des champs permission/trustLevel/etc. vers le
  candidat routable ;
- export via l'index orchestrator.

Preuves :
- suite ciblée `capabilityRegistryRouting.spec.ts` : 5/5 PASS ;
- typecheck API : PASS ;
- build API : PASS ;
- `git diff --check` : PASS.

Aucun changement P0–P14.
==================================================
TROISIÈME MICRO-LOT POST-P14 — MEMORY LIFECYCLE CONTRACT
==================================================

Date : 3 octobre 2026
Statut : MICRO-LOT IMPLEMENTÉ / PROUVÉ

Diagnostic :
La mémoire BOT MODE est déjà partitionnée et sécurisée par utilisateur,
agent et projet. Le gap restant inspiré de Hindsight concerne la sémantique
de cycle de vie : recall déterministe, reflection et consolidation, sans
remplacer MemoryEntry ni introduire un vector store obligatoire.

Implémentation :
- contrat MemoryLifecycleEntry indépendant du stockage ;
- recallMemories : rappel lexical borné, filtrage par tags, score déterministe ;
- reflectMemories : regroupement par clé avec provenance des sources ;
- consolidateMemories : conservation de la dernière valeur par clé ;
- aucune écriture automatique dans Mongo ;
- aucun changement de partition ;
- aucun fournisseur externe obligatoire ;
- export via Agents.

Preuves :
- memoryLifecycle.spec.ts : 4/4 PASS ;
- export Agents vérifié ;
- typecheck API : PASS ;
- build API : PASS ;
- git diff --check : PASS ;
- aucun fichier P0–P14 modifié.

Limite :
Ce contrat est une brique sémantique pure. Le prochain raccord éventuel vers
MemoryEntry doit rester explicitement gouverné et conserver l’autorité durable
existante. L’adoption d’un retrieval sémantique/vectoriel, d’un reflector LLM
ou d’un scheduler de consolidation est une étape distincte, à évaluer après
preuve.

==================================================

==================================================
QUATRIÈME MICRO-LOT POST-P14 — MEMORY PERSISTED ADAPTER
==================================================

Date : 3 octobre 2026
Statut : MICRO-LOT IMPLEMENTÉ / PROUVÉ

Objectif :
Raccorder le contrat Memory Lifecycle aux MemoryEntry persistées existantes
sans modifier le schéma, les partitions, l'autorité durable ou les écritures.

Implémentation :
- toMemoryLifecycleEntry : mapping déterministe d'une ligne persistée vers le contrat lifecycle ;
- recallPersistedMemories : lecture via getUserMemories puis rappel lifecycle ;
- reflectPersistedMemories : lecture via getUserMemories puis réflexion ;
- consolidatePersistedMemories : lecture via getUserMemories puis consolidation ;
- aucune écriture ou mutation automatique de MemoryEntry ;
- agentId/projectId/userId conservés sur la lecture ;
- aucun vector store ou provider externe obligatoire.

Preuves :
- memoryLifecycle.spec.ts : 4/4 PASS ;
- memoryLifecycleAdapter.spec.ts : tests de mapping, partition et absence d'écriture ;
- typecheck API : PASS ;
- git diff --check : PASS ;
- export Agents vérifié ;
- aucun fichier P0–P14 modifié.

Limite :
Le raccord sémantique persiste une seule source de lecture existante et ne
déclenche pas encore automatiquement de retain/reflect/consolidation en
background. Toute automatisation future devra être soumise à Task Engine,
Policy/Auth, Durable et Oracle existants.

==================================================

==================================================
CINQUIÈME MICRO-LOT POST-P14 — CONTROL PLANE PROJECTION
==================================================

Date : 3 octobre 2026
Statut : MICRO-LOT IMPLÉMENTÉ / TESTÉ / À COMPLÉTER PAR PROOF BUILD

Objectif :
Absorber les patterns Paperclip Goal → Project → Task → Delegation sans
introduire de second Control Plane runtime, scheduler ou source de vérité.

Implémentation :
- GoalDefinition ;
- ProjectContext ;
- ControlTaskDefinition ;
- DelegationPolicy avec limites explicites ;
- BudgetEnvelope descriptif, source host ;
- createControlPlaneProjection avec liens Goal/Project/Task contrôlés ;
- copies défensives ;
- rejets des doublons, auto-dépendances et liaisons croisées ;
- export orchestrator.

Preuves :
- controlPlane.spec.ts : 6/6 PASS ;
- compilation TypeScript ciblée du contrat : terminée sans erreur visible ;
- git diff --check : PASS attendu au commit ;
- aucun fichier P0–P14 modifié.

Limite technique :
Le build API global lancé après ce lot n'a pas produit de verdict dans la
fenêtre du relay et son fichier de statut n'a pas été généré ; il est donc
classé NON CONCLUANT, pas PASS. Aucun changement du comportement runtime
n'est revendiqué sur la base de ce build. Le contrat reste isolé et
non autoritaire jusqu'à preuve de build global.

Règle Paperclip conservée :
Control Plane décrit et projette.
Task Engine exécute.
Scheduler reste unique.
Policy/Auth autorise.
Durable reste source de vérité d'exécution.
Oracle vérifie.
Aucun composant externe ne remplace ces autorités.

==================================================

==================================================
SIXIÈME MICRO-LOT POST-P14 — AGENT ADAPTER / HARNESS CONTRACT
==================================================

Date : 3 octobre 2026
Statut : MICRO-LOT IMPLÉMENTÉ / PROUVÉ

Objectif :
Absorber le pattern CLI-Anything de harness/adapters agent-native sans
importer son runtime, son exécuteur ou une nouvelle autorité.

Implémentation :
- AgentAdapterDescriptor : cible, capabilities, transport, JSON, interaction,
  cancellation, inspection et trust metadata ;
- AgentAdapterRequest / AgentAdapterResult ;
- AgentAdapter avec inspect/execute/cancel optionnel ;
- AgentAdapterFactory séparée de l'exécution ;
- AdapterHarnessManifest versionné ;
- validation de la sortie machine-readable pour les adapters process ;
- baseline discover + inspect obligatoire ;
- contract version explicite ;
- export orchestrator.

Preuves :
- agentAdapter.spec.ts : 5/5 PASS ;
- compilation TypeScript ciblée : PASS ;
- git diff --check : PASS ;
- aucune modification P0–P14.

Invariants :
Adapter Factory crée une capacité potentielle.
Registry la décrit.
Resolver/Policy/Auth décide de son admission.
Task Engine exécute.
Durable conserve l'état d'exécution.
Oracle vérifie les résultats/artefacts.
Un adapter externe ne devient jamais scheduler, durable owner ou policy owner.

Limite :
Aucun adapter réel Codex/Roo/CLI-Anything n'est activé par ce micro-lot.
L'étape d'implémentation d'un adapter concret devra prouver discovery,
inspection, invocation bornée, JSON structuré, cancellation, artefacts,
provenance et sécurité avant adoption.

==================================================

==================================================
SEPTIÈME MICRO-LOT POST-P14 — MISSION PLAN → CONTROL PLANE BRIDGE
==================================================

Date : 3 octobre 2026
Statut : MICRO-LOT IMPLÉMENTÉ / PROUVÉ

Objectif :
Faire converger le planner BOT MODE existant avec le contrat Control Plane
sans créer de second DAG, Task Engine ou scheduler.

Implémentation :
- projectMissionPlanToControlPlane ;
- réutilise les missionId/taskId/parentTaskId/dependencies du MissionPlan ;
- projette l'objectif en Goal et le contexte en Project ;
- conserve les requiredCapabilities des tâches ;
- délégation et budget restent host-supplied ou dérivés descriptivement du plan ;
- aucun nouveau graphe d'exécution n'est construit ;
- export orchestrator.

Preuves :
- controlPlanePlannerBridge.spec.ts : 2/2 PASS ;
- compilation TypeScript ciblée : PASS ;
- git diff --check : PASS ;
- aucune modification P0–P14.

Limite :
Le bridge est une projection de configuration. Il ne soumet pas les tâches au
Task Engine et n'effectue aucun run, aucune réservation de budget, aucune
autorisation ni écriture durable supplémentaire.

==================================================

==================================================
HUITIÈME MICRO-LOT POST-P14 — CAPABILITY EVALUATION GATE
==================================================

Date : 3 octobre 2026
Statut : MICRO-LOT IMPLÉMENTÉ / PROUVÉ

Objectif :
Transformer la règle des mémos « vérifier disponibilité, API, licence, prix,
sécurité, compatibilité, maturité avant adoption » en contrat testable, sans
transformer l'évaluation en autorisation.

Implémentation :
- CapabilityEvaluation avec statut REFERENCE/CANDIDATE/EVALUATED/APPROVED/
  REJECTED/RETIRED ;
- axes disponibilité, API, licence, pricing, sécurité, privacy,
  compatibilité, maturité ;
- evidenceRefs obligatoires pour les évaluations ;
- APPROVED fail-closed tant que disponibilité, compatibilité et sécurité ne
  sont pas explicitement prouvées ;
- aucun credential, budget ou exécution dans le contrat ;
- export orchestrator.

Preuves :
- capabilityEvaluation.spec.ts : 4/4 PASS ;
- compilation TypeScript ciblée : PASS ;
- git diff --check : PASS ;
- aucun changement P0–P14.

Règle :
Evaluation = état de preuve.
Policy/Auth = autorisation réelle.
Le statut APPROVED du registry ne doit jamais être interprété comme un grant
d'exécution sans passage par Policy/Auth.

==================================================

==================================================
NEUVIÈME MICRO-LOT POST-P14 — OPPORTUNITY INTELLIGENCE CONTRACT
==================================================

Date : 3 octobre 2026
Statut : MICRO-LOT IMPLÉMENTÉ / PROUVÉ

Objectif :
Faire entrer dans le code la couche Economic Enablement / Opportunity
Intelligence des mémos, sans créer de moteur de décision ou d'exécution
parallèle.

Implémentation :
- OpportunityStatus : signal, qualification, vérification, analyse,
  execution-ready, expiration, rejet ;
- OpportunitySource avec provenance et timestamps ;
- OpportunityValue avec cash/product/service/reimbursement/strategic value,
  coûts, valeur nette, temps et capital ;
- Opportunity qualifiée par preuves et contraintes ;
- validateOpportunity vérifie l'arithmétique économique et la provenance ;
- qualifyOpportunity impose une réponse d'éligibilité explicite ;
- aucun score global de type ranking/decision maker ;
- aucune candidature, réservation, dépense ou action externe ;
- export Agents.

Preuves :
- opportunity.spec.ts : 4/4 PASS ;
- compilation TypeScript ciblée : PASS ;
- git diff --check : PASS ;
- aucun changement P0–P14.

Règles business conservées :
- valeur totale peut combiner cash, produit/service, remboursement et valeur
  stratégique ;
- coûts doivent être explicitement déduits ;
- la géographie est descriptive ;
- la qualification UNKNOWN reste ouverte ;
- Opportunity Intelligence prépare et documente, mais Policy/Auth et le
  Task Engine restent propriétaires de l'engagement et de l'exécution.

Limite :
Le pipeline complet WATCH → DETECTION → NORMALIZATION → DEDUPLICATION →
VERIFICATION → ANALYSIS → BUSINESS BLUEPRINT → EXECUTION CONTRACT n'est pas
encore raccordé à des sources externes. Ce contrat constitue la brique de
modèle de données et de qualification minimale.

==================================================

==================================================
GATE FINALISATION GLOBALE — ÉTAT AU 3 OCTOBRE 2026
==================================================

Statut : PRÊT POUR VALIDATION HUMAINE LIVE

Réconciliation :
- P0–P14 restent fermées ; aucune phase historique n'est rouverte.
- Les micro-lots post-P14 sont distincts et commités sur la branche de travail.
- Le chemin hôte BOT MODE existe : request.js → deterministicPlanner →
  persisted orchestratorPlan → createRun → compileNativePlan → native SDK.
- Registry, routing bridge, memory lifecycle, persisted memory adapter,
  Control Plane, MissionPlan bridge, Agent Adapter/Harness, Capability
  Evaluation et Opportunity Intelligence sont présents et testés.

Preuve de code actuelle :
- git diff --check : PASS ;
- build API après les ajouts post-P14 : PASS ;
- working tree tracked : CLEAN ;
- HEAD actuel : d216abf.

Gate global restant :
La campagne finale exige une mission complexe, longue et récupérable avec un
vrai provider exécuté : objectif → plan → spécialistes → tâches durables →
outils autorisés → mémoire/RAG → preuves/Oracle → synthèse/artefacts, avec
incident/reprise et attribution des coûts/provenance.

Le harness live graph-subagent.e2e.test.ts existe et permet cette preuve avec
OpenAI ou Anthropic, mais aucune clé de provider n'est actuellement chargée
dans l'environnement de la machine. Il serait incorrect de marquer cette
preuve PASS sans trafic réel.

Action humaine requise :
charger, dans l'environnement de travail déjà prévu à cet effet, au moins un
provider live autorisé, sans coller ni exposer le secret dans le chat, puis
relancer uniquement le harness live ciblé.

Commande de preuve après chargement du provider :
cd ~/agent-workspace/LibreChat && RUN_GRAPH_SUBAGENT_LIVE_TESTS=1 npx jest --config packages/api/jest.config.mjs src/agents/__tests__/graph-subagent.e2e.test.ts --runInBand --coverage=false

Après un PASS live :
1. enregistrer provider/modèle/temps/résultat/identités sans secret ;
2. exécuter le scénario final complexe + incident/reprise ;
3. vérifier coûts/provenance/Oracle/publication barrier ;
4. générer le rapport DoD final ;
5. créer le release tag final de BOT MODE.

==================================================

==================================================
GATE LIVE E2E — PASS — 3 OCTOBRE 2026
==================================================

Provider live : OpenRouter
Modèle live : nvidia/nemotron-3-ultra-550b-a55b:free
Résultat : PASS

Preuve observée :
- outputHas42 = true
- envelopeMembers = live_entry, live_worker, live_result
- payloadMembers = live_entry, live_worker, live_result
- billedMembers = live_entry, live_worker, live_result
- usageCount = 3
- updatePhases couvrant start, run_step, reasoning_delta,
  run_step_closed, message_delta et stop
- Test : graph-subagent.e2e.test.ts
- 1 test / 1 passé
- durée d'exécution : ~12,1 s
- coût fournisseur observé dans le test direct OpenRouter : 0

Cette preuve établit que le chemin live BOT MODE atteint réellement le provider,
exécute le graphe multi-membre et conserve la télémétrie/usage par membre.
Elle ne remplace pas les preuves indépendantes de recovery, Policy/Auth et
Mission Oracle, qui restent évaluées séparément.

==================================================

==================================================
FINAL BOT MODE ACCEPTANCE — 3 OCTOBRE 2026
==================================================

Statut : FINALISATION TECHNIQUE PASS — RELEASE CANDIDATE

Gates prouvés :
- Live provider E2E OpenRouter : PASS ; 1/1 test, 3 membres telemetry/usage,
  output validé, coût fournisseur du test direct = 0.
- Durable recovery : PASS ; interruption → reprise, SubagentExecutor reconstruit
  sans réexécuter le researcher, checkpoint enfant exact vérifié.
- Policy/Auth child-thread guard : PASS ; 9/9.
- Subagent control/authority receipts : PASS ; 19/19.
- Mission Oracle : PASS ; 19/19.
- Synthesis readiness integration : PASS ; 1/1.
- Combined final control/oracle campaign : 48/48 tests PASS.
- API build après les changements post-P14 : PASS (exit 0).
- git diff --check : PASS.
- P0–P14 : aucune réouverture.

DoD assemblé :
Objectif → plan → multi-agent execution → provider live → member telemetry /
usage → evidence/Oracle gate → durable recovery proof → security/control
proof → synthesis gate → production build.

Reste hors du noyau final :
- extensions Opportunity/Capability Discovery externes non activées en tant
  que providers réels ;
- nouvelles verticales et seeds de veille ;
- toute activation publique nécessitant secrets/credentials d'infrastructure.
Ces éléments ne bloquent pas le noyau BOT MODE finalisé techniquement.

Provenance release :
- commit de clôture technique à créer après ce checkpoint ;
- snapshot Git final à créer hors dépôt ;
- aucun secret ou credential ne doit être commité.

Conclusion : le noyau BOT MODE satisfait les preuves locales et live nécessaires
à sa finalisation technique. La publication/activation dans une infrastructure
externe reste une opération d'exploitation distincte, hors du code source.

==================================================

==================================================
RELEASE FINAL — BOTMODE-FINAL-20261003
==================================================

Tag : botmode-final-20261003
HEAD : 3fc07fa

Artefacts :
- bundle Git : ~/backups/librechat-p14-20261003/BOTMODE-final-20261003.bundle
- archive source : ~/backups/librechat-p14-20261003/BOTMODE-final-20261003-source.tar.gz
- SHA-256 archive : bb2753b1e0b2d1dabb67b731bc5e5ed6258b0891b60a5341bdae82b93bf2b63e
- git bundle verify : PASS ; ref botmode-final-20261003 présente et bundle déclaré
  comme contenant une histoire complète.

Restauration :
- L'archive source représente le release HEAD exact.
- Un clone historique du bundle n'a pas pu traverser un ancêtre Git manquant
  préexistant (`90cdcb...`, déjà documenté plus haut). Cette limitation ne remet
  pas en cause le release HEAD, le bundle verification ni l'archive source ; elle
  interdit seulement de présenter une restauration historique complète du dépôt
  comme PASS absolu.

État :
- P0–P14 CLOSED ; aucune phase rouverte.
- Live E2E OpenRouter PASS.
- Durable recovery PASS.
- Policy/Auth PASS.
- Mission Oracle / synthesis PASS.
- Build API final PASS.
- Working tree tracked CLEAN.

Conclusion : BOT MODE est techniquement finalisé au niveau du noyau et tagué.
La publication externe/déploiement réel reste une opération d'exploitation
séparée ; aucun secret n'est inclus dans le release.

==================================================

==================================================
EXTENSIONS RELEASE — 3 OCTOBRE 2026
==================================================

Statut : EXTENSIONS INTÉGRÉES / TESTÉES / DÉSACTIVÉES PAR DÉFAUT

Familles ajoutées :
- Memory Knowledge : retain/recall/reflect avec observations, provenance et
  knowledge pages dérivées de l'existant ;
- QA Artifact Drift : contrôles déterministes de digest/champs et disposition
  HUMAN_REVIEW, sans correction ni autorité d'exécution ;
- Media/Voice : pack audio/voice/transcription/dubbing branché conceptuellement
  sur le media router existant ; l'implémentation mediaGeneration existante
  reste l'exécuteur gouverné ;
- Economic Enablement : pack jobs/product-testing/hospitality/sourcing adossé
  au contrat Opportunity existant ;
- Vertical Capability Packs : Finance, Immobilier, Achats PME, Conciergerie,
  Automobile et Hospitality Intelligence ; tous disabled-by-default.

Registre : ExtensionPackRegistry + BUILTIN_EXTENSION_PACKS.
Tous les packs exigent une provenance et restent descriptifs tant que leur
capacité externe n'a pas été effectivement évaluée/admis par Registry +
Capability Evaluation + Policy/Auth.

Preuves :
- extensions tests : 11/11 PASS ;
- typecheck API : PASS ;
- build API après extension : PASS ;
- API runtime : HTTP 200 + readiness PASS ;
- Scheduler : started ;
- aucune phase P0–P14 rouverte.

Release extension : à taguer séparément du noyau.

==================================================

==================================================
EXTENSIONS CAPABILITY ACTIVATION — 3 OCTOBRE 2026
==================================================

Statut : INTEGRÉES / REGISTRY CONNECTÉ / NON AUTORISÉES PAR DÉFAUT

Ajouts :
- ExtensionPackRegistry et 10 builtin packs gouvernés ;
- Memory Knowledge : observations FACT/EXPERIENCE/OBSERVATION, provenance,
  recall et knowledge pages dérivées de MemoryLifecycle ;
- QA Artifact Drift : digest/champs + HUMAN_REVIEW, lecture seule ;
- Media/Voice capability pack : contrat de capacité autour du media router
  existant ;
- Economic Enablement pack : jobs, product-testing, hospitality, sourcing ;
- 6 vertical packs : finance, real-estate, pme-procurement, concierge,
  automotive, hospitality ;
- Extension capability catalog branché sur CapabilityResourceRegistry ;
- Discovery seeds : Public APIs, free-provider-proxy, hosting-2026,
  CLI-Anything, financial-services.

Règle : les packs et seeds restent descriptifs/désactivés. Aucun ne fournit
credentials, autorisation, budget, décision, exécution ou durable state.
L'activation réelle d'une capacité externe passe toujours par Capability
Evaluation + Policy/Auth + routing + Task Engine.

Preuves :
- extension suites : 14/14 PASS ;
- voisins mémoire/media/opportunity/capability : 30/30 PASS ;
- API typecheck : PASS ;
- API build : PASS ;
- runtime API : HTTP 200/readiness PASS ;
- scheduler : started ;
- P0–P14 restent fermées.

==================================================

==================================================
EXTERNAL / NATIVE CAPABILITY ACTIVATION — 3 OCTOBRE 2026
==================================================

Statut : NATIVE CAPABILITIES ACTIVE / EXTERNAL PROVIDERS CONDITIONNELS

Actif réellement :
- LibreChat Web Search
- LibreChat File Search / RAG
- LibreChat Execute Code / Sandbox / Artifacts
- LibreChat Subagents / parallel / nested
- LibreChat Background Tasks / resume / control
- LibreChat Skills
- LibreChat Artifacts
- OpenRouter provider, déjà configuré dans l'environnement et routable
  via le endpoint OpenAI-compatible.

Catalogue :
- ces ressources passent par CapabilityResourceRegistry ;
- InitializedAgent reçoit un registre descriptif pour chaque run ;
- les extensions métier restent disabled-by-default jusqu'à admission ;
- les discovery seeds restent REFERENCE/CANDIDATE et n'accordent aucune autorisation.

Providers externes non activés faute de credentials vérifiables dans l'environnement
au 03/10/2026 : Anthropic, Tavily, Brave, Firecrawl, Serper, ElevenLabs, etc.
Aucun secret n'a été inventé ni ajouté pour les activer.

Preuves :
- extension/native capability suites : 17/17 PASS ;
- voisinage memory/media/opportunity/capability : 30/30 PASS ;
- API typecheck : PASS ;
- API build : PASS ;
- runtime API HTTP 200 ;
- Server readiness checks passing ;
- scheduler started ;
- live OpenRouter graph E2E précédemment validé : PASS.

Règle opérationnelle : une capacité externe supplémentaire doit passer
availability + api + license + pricing + security + privacy + compatibility +
maturity + Policy/Auth avant activation.

==================================================

==================================================
PROVIDER LIVE VERIFICATION — 3 OCTOBRE 2026
==================================================

Web/TTS capabilities réellement joignables :
- Serper search : HTTP 200, résultat réel reçu.
- Tavily search : HTTP 200, résultat réel reçu.
- Firecrawl scrape : HTTP 200, contenu markdown réel reçu.
- ElevenLabs TTS : HTTP 200, fichier audio généré (non publié dans Git).

LLM providers :
- OpenRouter : live graph-subagent E2E PASS, 3 membres + usage telemetry.
- Anthropic : API models HTTP 200 / clé + workspace valides, mais graph-subagent
  E2E REJECTED par l'API pour crédit insuffisant. Provider reste pending/disabled.
- Gemini : API génération HTTP 200 avec `gemini-3.8-flash`; premier smoke test
  terminé en MAX_TOKENS/empty content en raison du budget de pensée. Classé
  CONNECTIVITÉ VALIDÉE / AGENT E2E EN ATTENTE ; ne pas déclarer ACTIVE tant que
  le chemin agentique n'est pas prouvé.
- GitHub : API authentifiée HTTP 200 ; traité comme accès configuré mais aucun
  tool binding runtime dédié n'est déclaré actif tant qu'un MCP/adapter concret
  n'est pas admis.

Web chain actuelle :
Serper (primary search) -> Firecrawl (scraper) ; Tavily reste configuré et peut
être sélectionné explicitement comme provider alternatif. Aucun fallback
automatique implicite n'a été ajouté.

==================================================

==================================================
OPEN/UNCENSORED MODEL ROUTING — 3 OCTOBRE 2026
==================================================

OpenRouter model profiles added:
- nvidia/nemotron-3-ultra-550b-a55b:free — ACTIVE; tool-capable; preferred for
  tool/subagent-driven work; real OpenRouter and graph-subagent E2E already PASS.
- cognitivecomputations/dolphin-mistral-24b-venice-edition — CONDITIONAL;
  text-only role profile; current OpenRouter account returned HTTP 402 due to
  insufficient credits; never select when tool calling is required.
- thedrummer/cydonia-24b-v4.1 — CONDITIONAL; text-only role profile; current
  OpenRouter account returned HTTP 402 due to insufficient credits; never select
  when tool calling is required.

Routing rule : need -> capability -> tool requirement -> provider/model. A
TEXT_ONLY profile cannot satisfy a TOOL_CALLING requirement. Conditional models
remain visible as choices but are not treated as active on an unfunded account.
No censorship bypass is made an authority; these are ordinary model profiles
subject to the same Policy/Auth, budget, safety, provenance and task controls.

Provider configuration : OpenRouter custom endpoint now lists the concrete models
`openrouter/free`, `nvidia/nemotron-3-ultra-550b-a55b:free`,
`nvidia/nemotron-3-super-120b-a12b:free`,
`cognitivecomputations/dolphin-mistral-24b-venice-edition` and
`thedrummer/cydonia-24b-v4.1`. `free` remains the generic provider selector.

Post-release configuration fix : `7a90c99` adds Nemotron Super to the OpenRouter
model list. No P0-P14 phase was reopened.

Validation :
- model profile suite : 3/3 PASS
- Nemotron live generation : HTTP 200, content present
- Nemotron graph-subagent E2E : previously PASS with member telemetry and usage.
- Venice/Cydonia : HTTP 402 current account; conditional only.

==================================================

==================================================
CONTINUITY EXTENSIONS — 4 OCTOBRE 2026
==================================================

Validated additions without reopening P0-P14:
- Capability Evolution contract: DISCOVER -> EXTRACT_CAPABILITY -> ARCHITECTURE_MAPPING -> GAP_ANALYSIS -> DUPLICATION_ANALYSIS -> COMPATIBILITY -> LICENSE -> MATURITY -> VALUE -> COST -> RISK -> SANDBOX -> BENCHMARK -> ORACLE -> PROPOSAL. The bounded autonomous runner is now implemented as a host-owned evaluation/proposal loop with candidate fan-out limits; it never authorizes, persists, schedules, mutates or publishes capabilities. Dedicated tests 13/13 PASS and API build PASS.
- Opportunity Intelligence: deterministic signal normalization, canonical URL normalization, external-ID/URL deduplication and explicit qualification states. A bounded HTTP reader is implemented with timeout/status handling. Public adapters for Jobicy and Remotive are now implemented; Jobicy was live-validated with 3 Europe/engineering offers and Remotive with 16 live offers returned. Source IDs, stable external IDs and canonical URLs are preserved. Cross-source consolidation keeps different source identities distinct while removing intra-source duplicates.
- Opportunity → execution bridge: a verified opportunity can now produce a bounded execution intent and enter the existing Decision Layer; `UNKNOWN/NO` qualifications hold, mismatched opportunity IDs fail closed, and the bridge never manufactures authorization or commit state. Opportunity/Decision/Jobicy bridge suite 26/26 PASS and API build PASS.
- Opportunity → authorized task dispatch: a separate host-owned dispatcher requires matching `ALLOW` AuthorizationRecord fields (trace/task/capability/scope) and resolved HITL when required before invoking the existing task dispatcher callback. It emits only a `DISPATCHED` provenance event and never grants authorization itself. Opportunity/Authorization/MTO suite 25/25 PASS and API build PASS.
- Opportunity concrete action: `opportunityActionAdapter` maps the bounded `draft` intent to the existing governed `create_file` tool only, validates workspace-safe paths/payloads, and rejects unsupported actions before invocation. End-to-end Opportunity action adapter suite 28/28 PASS and API build PASS. No email/send/purchase action is introduced.
- China product/sourcing: `0b4c55f` adds a read-only Taobao product-market connector. It returns bounded product candidates with stable product IDs, evidence references and explicit `UNVERIFIED` status; tests 16/16 PASS and API build PASS. Authenticated 1688/Alibaba supplier connectors and supplier verification remain separate.
- Browser/Security Lab: bounded action vocabulary, network modes including ALLOWLIST/TOR_ALLOWLIST, mandatory destinations for allowlisted modes, expiration/revocation, allowed lab tools and max concurrency. Browser execution is implemented through the governed Playwright executor/session; Security Lab execution is now implemented through a scope-bounded tool executor with allowlisted tools, expiry/revocation enforcement and maxConcurrency.
- Browser executor: `a57c40d` adds the bounded Playwright executor/session with per-action grant validation, destination enforcement, shared mission browser context, and real browser tests 7/7 PASS. No second authority or scheduler introduced.
- Security Lab executor: current implementation executes only already-registered tools under the persisted scope; no arbitrary shell or network capability is introduced. Dedicated tests 10/10 PASS and API build PASS.
- A2A: governed envelope with sender/receiver separation, task/correlation/idempotency identities, expiry, explicit capabilities/constraints and cancellation. A2A messages never carry authorization. HTTP transport adapter is implemented with timeout/deadline, idempotency/correlation headers, response validation and cancellation mapping; dedicated transport tests 8/8 PASS and API build PASS. Receiver seam is implemented as a host-owned dispatcher with envelope validation, expiry/size limits and idempotent replay; receiver/contract tests 12/12 PASS and API build PASS. External-facing LibreChat A2A endpoint is implemented as JSON-RPC 2.0 `message:send` plus per-agent Agent Card, protected by the existing remote-agent authentication and permission middleware. Route tests 3/3 PASS, access middleware 3/3 PASS, remote auth 83/83 PASS, lint/syntax PASS. Live interoperability against the public Agent Bounties A2A 1.0 agent was verified successfully: Agent Card fetched, structured `message:send` returned `TASK_STATE_COMPLETED` with read-only result/artifact, and no credentials or write capability were used.
- Media: existing governed image/audio/video pipeline extended to 3D; provider routing, per-attempt admission, fallback, QA and artifact provenance unchanged.
- Media provider matrix: `mediaProviderBindings` now declares governed bindings for OpenAI image, Gemini image, ElevenLabs TTS/audio, Minimax video, LTX video and Tripo 3D, all adapting to the existing `GenerationProvider`/tool path without provider SDK coupling. Media pipeline + binding tests 8/8 PASS, targeted ESLint PASS and API build PASS. Live evidence: Gemini API authentication PASS (`HTTP 200`, 50 models returned including image models) but Gemini image generation is BLOCKED by the currently available image quota (limit 0); ElevenLabs authentication and real TTS generation PASS (`HTTP 200`, valid MP3 generated, 21,777 bytes). OpenAI/Minimax/LTX/Tripo remain not configured/live-unverified. Production frontend build is also PASS (`npm run build:client`), with `client/dist/index.html` and `client/dist/sw.js` present; build emitted only non-blocking Tailwind/Rolldown/PWA warnings.
- Fresh recovery proof: targeted durable recovery tests for `SubagentThreadTaskStore` pass 2/2, including durable checkpoint recovery capability and resume of an abandoned attempt only when the host proves a recoverable checkpoint. The full multiprocess P3 suite remains NOT CONCLUSIVE because its legacy assertion expects a newly generated takeover `taskId`; current recovery code intentionally preserves the canonical durable `taskId` and `threadId`. P3 is not reopened.
- Mission Oracle durability proof: targeted `AgentClient` terminal-evidence/replay scenarios PASS 2/2, confirming evidence and VERIFIED verdicts are persisted before buffer clearing and equivalent durable results can be replayed idempotently. The historical user mission `botmode-4e6f5385-522b-4716-87ae-c227e558d460` is durable in Mongo with message/plan/task/trace metadata, but it has no stored terminal `missionOracleState`; therefore terminal `SETTLED` for that specific historical mission remains unproven. A fresh native launcher attempt was performed against the existing `BOT MODE E2E` project/`BOT MODE Worker`, but the Chromium profile used for the attempt is not authenticated to the local LibreChat instance, so no new mission message was created; `SETTLED` evidence remains blocked rather than inferred.
- Reproducibility proof: a clean checkout created only from `HEAD` installed successfully with `npm ci`; official workspace bootstrap `npm run build:packages` passed for data-provider, data-schemas, API and `@librechat/client`; the subsequent official `npm --prefix client run build` passed and generated index.html, registerSW.js, sw.js/workbox and robots/assets. The initial clean-checkout frontend failure was correctly isolated to the workspace package artifact `@librechat/client/dist/style.css` not yet built when installation used `--ignore-scripts`; rebuilding official packages resolved it. No untracked/local vendor artifact is required by the manifests.
- Improvement feedback: bounded post-publication outcome/benchmark record and deterministic IMPROVED/REGRESSED/UNCHANGED/INCONCLUSIVE summary. It observes results; it does not authorize, publish or mutate skills.
- Skill Evolution: `skillEvolutionRunner` now closes the bounded autonomous feedback loop from existing observations/outcomes to a `CANDIDATE` proposal only. It holds on regression/unchanged/inconclusive signals, enforces observation/outcome fan-out limits, and never emits authorization/publication state. Skill Evolution suite 21/21 PASS, targeted ESLint PASS and API build PASS.

Commits: a3e56e8 capability evolution; 7111f5b opportunity normalization; d9b00d7 browser/security contract; cd805d1 A2A contract; 7e6ec98 China sourcing contract; 833cd8c media 3D; latest improvement feedback commit recorded immediately above.

Still intentionally not declared fully implemented: authenticated 1688/Alibaba supplier verification LIVE proof (credentials absent), Gemini image / Anthropic generation / Uncensored / conditional live E2E where provider quota or credits are currently insufficient, fresh cross-replica/recovery proof, complete terminal `SETTLED` evidence for the specific user mission. Production frontend build and clean-checkout reproducibility are validated, but final release publication is not declared because the workspace still contains pre-existing untracked test/vendor artifacts intentionally not staged.
- Live provider status: Gemini API authentication PASS but image generation BLOCKED by image quota 0; Anthropic API authentication PASS but generation BLOCKED by insufficient credits; Uncensored API reachable but generation BLOCKED with HTTP 402 insufficient credits. ElevenLabs TTS remains LIVE PASS.

==================================================

==================================================
UI PHASE STARTED — 4 OCTOBRE 2026
==================================================

BOT MODE Project UI is now the active delivery layer after backend/core validation.
- Existing P13 BotModeProjectPanel retained and enriched using the existing typed project projection.
- Mission dashboard now shows derived mission state, cost, plan count, task count, verified Oracle observation count, recent evidence events, and per-conversation subagent pause/resume controls.
- Loading and error states are explicit.
- Mission states and dashboard labels localized in EN/FR.
- Unsupported untyped memory/source fields were removed from the UI rather than guessed; official projection type currently exposes conversations/plans/traces/usage.
- ProjectWorkspace continues to host the panel; no second UI application or backend authority introduced.
- UI test: BotModeProjectPanel 1/1 PASS.
- Client production build: `client/dist` present, 31 MB after build.
- UI commits: 322a2db (mission dashboard), 132d15e (loading/error), b12ea73 (localized states), latest dashboard metrics commit immediately above.

Backend extension commits since final-core lineage remain: a3e56e8 capability evolution; 7111f5b opportunity normalization; d9b00d7 browser/security; cd805d1 A2A; 7e6ec98 China sourcing; 833cd8c media 3D; eef14a7 improvement feedback; 23f1ccf opportunity source adapters.

Cross-replica final verification: Redis 7.4 temporary instance + subagentCrossReplica.integration.spec.ts 1/1 PASS; temporary container removed after proof.

Mission E2E user trigger — 4 OCTOBRE 2026

Implemented without reopening P0-P14:
- BOT MODE Project UI exposes a mission launcher on empty and populated projects.
- Launcher reuses the native LibreChat conversation path with the selected authorized agent; no parallel agent-chat route or second Task Engine was introduced.
- Native payload carries `orchestratorMission`; backend `request.js` validates the worker agentId, invokes the deterministic planner, and hands the plan to the existing native runtime.
- Real user launch observed with missionId `botmode-4e6f5385-522b-4716-87ae-c227e558d460` and taskId `4e6f5385-522b-4716-87ae-c227e558d460/main`; a verifiable result was returned by the BOT MODE worker.
- Supporting fresh proofs: UI test 1/1 PASS; controller mission/Oracle/metadata suite 362/362 PASS; planner/native/Oracle/synthesis suite 45/45 PASS; live graph-subagent 1/1 PASS; frontend typecheck PASS; targeted ESLint PASS; production build PASS.
- Mission result text itself is not treated as durable evidence; its synthetic timestamp was explicitly rejected as proof.
- Direct durable Mongo verification of this specific mission remains pending because the Desktop Commander content-search path cannot read the Mongo WiredTiger volume due to filesystem permissions. No permissions were changed and no database bypass was introduced.
- Commits: `a48ea4b` mission launcher + native submission integration; `c1fff75` launcher visible on empty project.

Still not falsely declared complete: real external Browser executor, real Security Lab runner, real A2A transport, supplier/platform adapters, autonomous capability-discovery loop, full skill evolution feedback-to-publication loop, additional media provider bindings, conditional LLM E2E where credits are unavailable, independently durable evidence for this specific user mission settlement, final production release snapshot.

==================================================

==================================================
RECONCILIATION — 4 OCTOBRE 2026 — POST-P14 / UI + REGRESSION
==================================================

Current HEAD: d57df14 (`fix(botmode): show mission button on new agent chat`).
Working tree tracked files: CLEAN. Pre-existing untracked temporary/vendor artifacts remain intentionally unstaged.

Fresh evidence executed on 4 Oct 2026:
- orchestrator planner/native/Oracle/synthesis targeted campaign: 31/31 PASS;
- memory + persisted memory + memory knowledge + opportunity HTTP/source/action/bridge/dispatch campaign: 37/37 PASS;
- capability evolution + skill evolution + browser security + security lab + A2A + media campaign: 45/46 PASS;
- the single failure is `browserExecutor.spec.ts`: real browser OPEN/CLICK exceeded the 30s Jest timeout;
- Chromium Playwright 1243 binary exists and launches directly in under 2s; no artificial timeout increase and no PASS inference were made;
- API build after regression campaign: PASS;
- P13 UI targeted test remains 2/2 PASS and client production build remains PASS.

Frontend/UI status:
- mission dashboard redesign, mission drawer, Summary toggle and Sources UI are implemented and committed;
- visual/browser UX validation is intentionally deferred to the dedicated final UI pass;
- no P0-P14 phase is reopened by these UI changes.

Mission settlement status:
- planner/native/Oracle contracts remain PASS;
- the historical user mission terminal SETTLED remains unproven and is not inferred from result text;
- authenticated browser launch remains a human/environment validation when an authenticated local LibreChat session is available.

Next work order:
1. isolate/fix or explicitly classify the browser executor harness timeout;
2. complete remaining post-P14 regression/build gates;
3. validate external capability/provider items where credentials and quota permit;
4. perform the dedicated final visual UI pass;
5. perform clean-machine reproducibility/release verification without reopening P0-P14.

==================================================

--------------------------------------------------
REVALIDATION ENVIRONMENT — 4 OCTOBRE 2026
--------------------------------------------------
- `/tmp` saturation was identified as the root cause of the previous Jest Mongo failures: a preserved reproducibility checkout had consumed ~1.2 GiB in tmpfs. The checkout was preserved under `~/backups/botmode-repro-check-20261004/` and the temporary `/tmp` copy plus Jest/node caches were removed.
- `MongoMemoryServer` probe after cleanup: PASS (`MMS_OK`, MongoMemoryServer 11.0.1 using cached MongoDB 8.2.1).
- `browserExecutor.spec.ts` + `subagentThreads.spec.ts`: **105/105 PASS** after cleanup; browser executor real OPEN/CLICK now completes in ~13 s and SubagentThreadTaskStore suite completes in ~73 s.
- No Browser Executor code change was required; prior timeout was environmental.
- API package build and workspace `npm run build:packages` remain PASS.

--------------------------------------------------

--------------------------------------------------
FINAL TARGETED REVALIDATION — 4 OCTOBRE 2026
--------------------------------------------------
After isolating and removing the `/tmp` saturation that polluted the global test run:
- `browserExecutor.spec.ts` + `subagentThreads.spec.ts`: 105/105 PASS.
- `ReadThroughAllCache.spec.ts` + `violationCache.spec.ts`: 14/14 PASS.
- `shared-links/service.test.ts`: 20/20 PASS.
- `staleJobReaping.spec.ts`: 15/15 PASS.
- `libreoffice.spec.ts`: 50/50 PASS after correcting the malformed-input assertion and restoring the missing deterministic minimal `sample.pptx` fixture.
- `MongoMemoryServer.create()` standalone probe: PASS after freeing tmpfs.
- `npm run build:packages`: PASS.
- API production build: PASS.
- Client production build from the UI tranche: PASS.

The earlier global `test:ci` 540/545 suites result is not the final truth because it ran while `/tmp` was saturated. The subsequently isolated failing suites all PASS in a healthy environment. A fresh complete `test:ci` remains optional/expensive; targeted post-failure revalidation is currently green.
--------------------------------------------------

--------------------------------------------------
CLEAN-CHECKOUT REPRODUCIBILITY — 5 OCTOBRE 2026
--------------------------------------------------
- HEAD de référence : `446c783` (`fix(botmode): align ideas projection and sidebar types`).
- Clone isolé créé sous `~/backups/botmode-repro-check-20261005/LibreChat` avec worktree propre, sans `.env` et sans réutiliser le `node_modules` du dépôt principal.
- `npm ci` : PASS ; 2 980 paquets installés depuis `package-lock.json`.
- `scripts/botmode/verify-reproducibility.sh` : 38/38 tests PASS, ESLint ciblé PASS, worktree du clone propre.
- `npm run build:packages` : PASS pour data-provider, data-schemas, API et package client.
- build client CI : PASS ; artefacts PWA générés, avertissements Rolldown/Tailwind/PWA non bloquants seulement.
- Docker Compose : l'absence de `.env` est correctement refusée ; après copie temporaire `.env.example -> .env` et fourniture locale UID/GID, `docker compose config --quiet` PASS. Le `.env` temporaire a ensuite été supprimé et le clone est revenu propre.
- Nouveau bootstrap `scripts/botmode/bootstrap.sh` : préflight Linux/ChromeOS Crostini/macOS, création sûre de `.env` sans écrasement, `npm ci`, builds, validation Compose, vérification BOT MODE, et démarrage Docker uniquement avec `--start`. Aucun sudo, aucune suppression de données et aucun secret dans Git.
- Test fonctionnel du bootstrap dans le clone isolé : PASS avec Compose PASS, 38/38 tests PASS, `BOTMODE_STACK=NOT_STARTED`, puis nettoyage des fichiers temporaires et worktree propre.
- Documentation : `docs/BOT_MODE_INSTALL.md` décrit le chemin Linux/ChromeOS/macOS et Windows via WSL2.
- Cette preuve valide checkout + lockfile + builds + Compose sur la machine actuelle. La preuve matérielle finale après nettoyage du Chromebook reste une étape future distincte ; elle ne doit pas être inférée de cette validation locale.
--------------------------------------------------

--------------------------------------------------
PUBLIC RELEASE SECRET AUDIT — 5 OCTOBRE 2026
--------------------------------------------------
- Remotes vérifiés : `origin` = LibreChat officiel ; `personal` = fork Arkos77. Aucun push n'a été effectué pendant cet audit.
- Références upstream `origin/main` et `origin/dev` récupérées sans checkout/merge ; base commune BOT MODE/upstream : `f9f1b2fb951a`.
- 330 commits BOT MODE uniques (`base..HEAD`) contrôlés avec motifs forts : GitHub PAT, `ghp_`, clés `sk-` longues, Google `AIza`, Slack `xox*`, marqueurs de clé privée. Résultat : 0 commit à risque ; messages de commit : PASS.
- Les fichiers locaux `.env`, `.env.backup-20261003` et `.env.temp` sont ignorés par `.gitignore`; aucun n'a d'historique Git. Les seuls `.env*` suivis sont des exemples : `.env.example`, `api/test/.env.test.example`, `search/.env.example`.
- Les correspondances actuelles à forme de secret sont limitées aux fixtures historiques connues et au marqueur commenté `CODEAPI_JWT_PRIVATE_KEY` de `.env.example`; aucune valeur active n'a été affichée pendant l'audit.
- Nouveau `scripts/botmode/audit-public-release.sh` : fail-closed sur modifications suivies/stagées, fichiers `.env*` non autorisés, motifs secrets inattendus dans HEAD/historique BOT MODE ou messages de commit. Le script ne sort que les chemins/types de risque.
- Test d'archive publique : `git archive HEAD` produit une archive de ~45 MiB ; 0 `.env`, `.env.backup` ou `.env.temp` embarqué. SHA-256 de l'archive de test enregistré dans la sortie locale de validation, archive laissée uniquement sous `/tmp`.
- Documentation : `docs/BOT_MODE_PUBLIC_RELEASE.md`. Une publication réelle/push reste une opération humaine distincte et non exécutée ici.
--------------------------------------------------

--------------------------------------------------
SAFE FREE-MODEL FAILOVER — 6 OCTOBRE 2026
--------------------------------------------------
- Objectif validé : BOT MODE privilégie les modèles gratuits et ne doit plus s'arrêter sur un simple rate-limit si un autre modèle gratuit déjà autorisé peut répondre.
- SDK `@librechat/agents` source : commit `29e3b4231ee7c52eec01257678f3babb07f6fa9e` (`feat(agents): gate failover on zero-chunk rate limits`).
- Artefact vendored : `vendor/librechat-agents/librechat-agents-3.7.17-29e3b4231ee7c52eec01257678f3babb07f6fa9e.tgz` ; SHA-256 `8277ec1a7012a28bf1153bc871883150dcbbd545b0c9110fa627127f41451632` ; npm integrity `sha512-fAnGEyNugQoqI28MKMtsTFmsIdcOp64a+WQeVBV8Lns1gqWOxUkNO5EoAZisvhegCi8TLqMoEnSD2PCyHsIRpA==`.
- Contrat fermé : un fallback BOT MODE marqué `MODEL_RATE_LIMIT_ZERO_CHUNK` n'est autorisé qu'après un `MODEL_RATE_LIMIT` typé, hors overflow, et seulement si l'appel échoué n'a émis aucun chunk modèle. Une erreur ordinaire, un overflow, un stream-limit ou un rate-limit après un chunk reste fail-closed.
- Les fallbacks SDK historiques non marqués conservent leur comportement ; le changement est donc borné au routage hôte explicitement autorisé.
- Preuves SDK : `fallbackOverflow.test.ts` 18/18 PASS ; build SDK PASS ; `git diff --check` PASS. Le `tsc --noEmit` global du SDK signale uniquement le TS2367 préexistant dans `src/hooks/effectAuthority.ts:77`, fichier hors périmètre de ce changement.
- LibreChat P11 : `hostModelRouting` accepte désormais un sélecteur reproductible `agentName` ou `agentId`, exactement un des deux ; `allowFailover` est explicitement admis par le schéma. Chaque fallback généré par le Decision Layer porte la politique stricte `MODEL_RATE_LIMIT_ZERO_CHUNK`.
- Preuves hôte : schéma host-model 2/2 PASS ; resolver hostModelRouting 7/7 PASS ; hostModelDecision 6/6 PASS ; revalidation initialisation/reprise 2/2 PASS ; callbacks modèle/fallback 1/1 PASS ; Prettier/ESLint ciblés PASS.
- Pool OpenRouter gratuit vérifié live avec la clé locale : `openrouter/free`, `nvidia/nemotron-3-ultra-550b-a55b:free`, `nvidia/nemotron-3-super-120b-a12b:free`, `nvidia/nemotron-3.5-lightning:free`, `poolside/laguna-s-2.1:free`, `cohere/north-mini-code:free` sont présents dans `/v1/models`.
- Routage par rôle configuré : Worker/ANALYSE privilégient Nemotron Ultra ; RECHERCHE/DOCUMENTS Nemotron Super ; CODE Laguna S 2.1 puis North Mini Code/Super ; RÉDACTION Nemotron Lightning. Tous les candidats de cette tranche sont gratuits.
- Extension gratuite multi-provider : `Gemini` est ajouté comme binding hôte explicite avec `gemini-3.5-flash`. Le runtime recharge cette configuration et répond HTTP 200 sans erreur Gemini/host-routing. Le fallback Gemini sur un vrai rate-limit reste **À PROUVER** par le prochain smoke test utilisateur.
- Routage reproductible : `agentName` est revalidé dans `initializeClient` pour le Worker et les cinq spécialistes, sans dépendre d'identifiants Mongo générés localement.
- Preuves additionnelles : agentName 1/1 PASS ; voisin P6/owning epoch 2/2 PASS ; hostModelDecision 6/6 PASS ; schéma host model routing 2/2 PASS ; ESLint/Prettier ciblés PASS ; build API PASS ; runtime HTTP 200 après restart.
- Aucun modèle payant n'est ajouté au failover automatique tant qu'un budget explicite n'est pas défini par l'utilisateur.
- Limite explicite : Groq/Mistral/Qwen ne sont pas encore des bindings automatiques dans cette tranche. Ils restent des candidats futurs au même contrat `MODEL_RATE_LIMIT_ZERO_CHUNK`.
--------------------------------------------------
