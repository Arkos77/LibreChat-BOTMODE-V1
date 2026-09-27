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
