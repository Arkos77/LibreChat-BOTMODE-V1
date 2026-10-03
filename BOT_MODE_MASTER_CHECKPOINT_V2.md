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
