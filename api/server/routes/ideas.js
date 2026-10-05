const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { listIdeas, createIdea, updateIdea, deleteIdea } = require('~/models');
const router = express.Router();
router.use(requireJwtAuth);
router.get('/', async (req, res, next) => {
  try {
    res.json({ ideas: await listIdeas(req.user.id) });
  } catch (e) {
    next(e);
  }
});
router.post('/', express.json({ limit: '100kb' }), async (req, res, next) => {
  try {
    const { title, content, status, priority, tags } = req.body || {};
    if (typeof title !== 'string' || !title.trim())
      return res.status(400).json({ error: 'Title is required' });
    res
      .status(201)
      .json(
        await createIdea(
          req.user.id,
          { title: title.trim(), content, status, priority, tags },
          req.user.tenantId,
        ),
      );
  } catch (e) {
    next(e);
  }
});
router.patch('/:ideaId', express.json({ limit: '100kb' }), async (req, res, next) => {
  try {
    const idea = await updateIdea(req.user.id, req.params.ideaId, req.body || {});
    if (!idea) return res.status(404).json({ error: 'Idea not found' });
    res.json(idea);
  } catch (e) {
    next(e);
  }
});
router.delete('/:ideaId', async (req, res, next) => {
  try {
    const removed = await deleteIdea(req.user.id, req.params.ideaId);
    if (!removed) return res.status(404).json({ error: 'Idea not found' });
    res.json({ removed: true });
  } catch (e) {
    next(e);
  }
});
module.exports = router;
