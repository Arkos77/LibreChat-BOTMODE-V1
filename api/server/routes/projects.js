const express = require('express');
const { createProjectHandlers } = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const db = require('~/models');
const {
  createBotModeProjectProjection,
} = require('~/server/services/Projects/botModeProjectProjection');
const { readModelBudgetState } = require('~/server/services/Endpoints/agents/modelBudget');

const router = express.Router();
const handlers = createProjectHandlers({
  listChatProjects: db.listChatProjects,
  createChatProject: db.createChatProject,
  getChatProject: db.getChatProject,
  updateChatProject: db.updateChatProject,
  deleteChatProject: db.deleteChatProject,
  assignConversationToProject: db.assignConversationToProject,
});

router.use(requireJwtAuth);

router.get('/', handlers.listProjects);
router.post('/', handlers.createProject);
router.put('/conversations/:conversationId', handlers.assignConversationToProject);
router.get('/bot-mode/budget', async (req, res) => {
  try {
    const state = await readModelBudgetState({
      userId: req.user.id,
      config: req.config?.endpoints?.agents?.modelBudget,
    });
    return res.status(200).json(state);
  } catch (error) {
    console.error('[projects] Error reading BOT MODE model budget', error);
    return res.status(500).json({ error: 'Error reading BOT MODE model budget' });
  }
});

router.get('/:projectId/bot-mode', async (req, res) => {
  try {
    const projection = await createBotModeProjectProjection({
      userId: req.user.id,
      tenantId: req.user.tenantId,
      projectId: req.params.projectId,
      deps: {
        getChatProject: db.getChatProject,
        getConvosByCursor: db.getConvosByCursor,
        getMessages: db.getMessages,
        getConvoFiles: db.getConvoFiles,
        getFiles: db.getFiles,
        getUserMemories: db.getUserMemories,
        listMtoObservations: db.listMtoObservations,
      },
    });
    if (!projection) {
      return res.status(404).json({ error: 'Project not found' });
    }
    return res.status(200).json(projection);
  } catch (error) {
    console.error('[projects] Error reading BOT MODE project projection', error);
    return res.status(500).json({ error: 'Error reading project projection' });
  }
});

router.get('/:projectId', handlers.getProject);
router.patch('/:projectId', handlers.updateProject);
router.delete('/:projectId', handlers.deleteProject);

module.exports = router;
