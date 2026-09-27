# BOT MODE MASTER CHECKPOINT

Date:
2026-09-27

## SOURCE DE VERITE

Projet:
BOT MODE intégré nativement dans LibreChat.

Repository:
~/agent-workspace/LibreChat

Règle absolue:
BOT MODE ne crée pas un runtime parallèle.
Il utilise le runtime natif LibreChat.

---

# MÉTHODE DE TRAVAIL

Obligatoire:

1. Lire
2. Comprendre
3. Reproduire
4. Prouver
5. Instrumenter
6. Patch minimal
7. Test ciblé
8. Tests voisins
9. Build
10. Documenter

---

# ETAT TECHNIQUE ACTUEL

Branche:

bot-mode-p4-closed

Dernier commit validé:

0168e4c feat(bot-mode): expose transient evidence buffer per agent request

Commits P10 précédents:

589747c feat(bot-mode): add transient tool evidence buffer

a63a615 feat(bot-mode): normalize step-limit candidate context

12b242c feat(bot-mode): add bounded step-limit evidence context

cf1e548 feat(bot-mode): bind host evidence to bounded context

---

# TRAVAIL EN COURS

Phase:

P10 Evidence / Oracle bridge

Sous-phase:

P10.2 Tool-end controlled bridge


Objectif:

Tool execution
|
createToolEndCallback
|
ToolEvidenceIntentDeclaration
|
transientEvidenceBuffer
|
Evidence pipeline


Contraintes:

- fail closed
- aucune collecte automatique
- aucune interprétation du résultat outil
- aucun raw input
- aucun raw output
- aucun artifact
- aucun reasoning


Données autorisées uniquement:

toolCallId
toolName
producerAgentId
taskId
traceId
runId
threadId
criterionId
value


---

# JARVIS TEMPORAIRE

Statut:

ACTIF

Flux:

ChatGPT
 ↓
Chromium relay
 ↓
relay.sh
 ↓
JARVIS
 ↓
exécution locale
 ↓
[JARVIS_RESULT]


---

# FICHIERS P10 ACTIFS

api/server/controllers/agents/callbacks.js

api/server/controllers/agents/callbacks.improvementEvidence.spec.js

api/server/services/Endpoints/agents/initialize.js

api/server/services/Endpoints/agents/initialize.spec.js

packages/api/src/agents/orchestrator/toolEvidenceIntent.ts

packages/api/src/agents/orchestrator/transientEvidenceBuffer.ts


---

# PROCHAINE ACTION

Corriger chirurgicalement:

createToolEndCallback

pour connecter:

transientEvidenceBuffer

avec:

ToolEvidenceIntentDeclaration


Ne jamais inventer les déclarations dans initialize.js.


---

# INTERDIT

Ne pas:

- toucher .devcontainer
- créer un second orchestrateur
- créer un nouveau Task Engine
- contourner LibreChat native runtime
- faire un gros refactor


---

# VALIDATION P10

P10 terminé uniquement après:

- tests OK
- build API OK
- documentation OK
- commit Git
