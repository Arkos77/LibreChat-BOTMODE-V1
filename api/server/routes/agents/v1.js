const express = require('express');
const { generateCheckAccess } = require('@librechat/api');
const {
  PermissionTypes,
  Permissions,
  PermissionBits,
  ResourceType,
} = require('librechat-data-provider');
const { getResourcePermissionsMap } = require('~/server/services/PermissionService');
const { configMiddleware, canAccessAgentResource } = require('~/server/middleware');
const v1 = require('~/server/controllers/agents/v1');
const { getRoleByName, getAgents } = require('~/models');
const actions = require('./actions');
const tools = require('./tools');

const router = express.Router();
const avatar = express.Router();

const checkAgentAccess = generateCheckAccess({
  permissionType: PermissionTypes.AGENTS,
  permissions: [Permissions.USE],
  getRoleByName,
});
const checkAgentCreate = generateCheckAccess({
  permissionType: PermissionTypes.AGENTS,
  permissions: [Permissions.USE, Permissions.CREATE],
  getRoleByName,
});

/**
 * Agent actions route.
 * @route GET|POST /agents/actions
 */
router.use('/actions', configMiddleware, actions);

/**
 * Get a list of available tools for agents.
 * @route GET /agents/tools
 */
router.use('/tools', configMiddleware, tools);

/**
 * Get all agent categories with counts
 * @route GET /agents/categories
 */
router.get('/categories', v1.getAgentCategories);
/**
 * Creates an agent.
 * @route POST /agents
 * @param {AgentCreateParams} req.body - The agent creation parameters.
 * @returns {Agent} 201 - Success response - application/json
 */
router.post('/', checkAgentCreate, configMiddleware, v1.createAgent);

/**
 * Authenticated, read-only BOT MODE onboarding preflight.
 * Scoped to the current owner; does not infer ownership from agent names.
 * Creation must still pass through POST /agents and its native ACL checks.
 */
router.get('/botmode/setup-status', checkAgentAccess, async (req, res) => {
  try {
    const names = ['BOT MODE Worker', 'RECHERCHE', 'ANALYSE', 'CODE', 'DOCUMENTS', 'RÉDACTION'];
    const agents = await getAgents({ author: req.user.id, name: { $in: names } });
    const permissions = await getResourcePermissionsMap({
      userId: req.user.id,
      role: req.user.role,
      resourceType: ResourceType.AGENT,
      resourceIds: agents.map((agent) => agent._id),
    });
    const missingOwnerAccess = agents
      .filter((agent) => {
        const bits = permissions.get(String(agent._id)) ?? 0;
        return (
          (bits & (PermissionBits.VIEW | PermissionBits.EDIT)) !==
          (PermissionBits.VIEW | PermissionBits.EDIT)
        );
      })
      .map((agent) => agent.name);
    const present = names.filter((name) => agents.some((agent) => agent.name === name));
    const missing = names.filter((name) => !present.includes(name));
    const duplicates = names.filter(
      (name) => agents.filter((agent) => agent.name === name).length > 1,
    );
    return res.status(200).json({
      inventoryComplete: missing.length === 0 && duplicates.length === 0,
      permissionsComplete: missingOwnerAccess.length === 0,
      missingOwnerAccess,
      present,
      missing,
      duplicates,
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Unable to inspect BOT MODE setup' });
  }
});

/**
 * Explicit authenticated first-run onboarding. Reuses the exact native create
 * controller (schema validation, content filters, tool authorization and ACL).
 * Does not mutate existing agents. The provider/model must be selected by the
 * authenticated user from the currently configured LibreChat catalog.
 */
router.post('/botmode/setup', checkAgentCreate, configMiddleware, async (req, res) => {
  const { provider, model } = req.body ?? {};
  if (
    typeof provider !== 'string' ||
    !provider.trim() ||
    typeof model !== 'string' ||
    !model.trim()
  ) {
    return res.status(400).json({ error: 'A configured provider and model are required' });
  }

  const names = ['BOT MODE Worker', 'RECHERCHE', 'ANALYSE', 'CODE', 'DOCUMENTS', 'RÉDACTION'];
  try {
    const existing = await getAgents({ author: req.user.id, name: { $in: names } });
    const duplicates = names.filter(
      (name) => existing.filter((agent) => agent.name === name).length > 1,
    );
    if (duplicates.length > 0) {
      return res
        .status(409)
        .json({ error: 'Duplicate BOT MODE agents require review', duplicates });
    }

    const created = [];
    for (const name of names) {
      if (existing.some((agent) => agent.name === name)) continue;
      const body = {
        name,
        provider: provider.trim(),
        model: model.trim(),
        description:
          name === 'BOT MODE Worker'
            ? 'Orchestrateur principal des missions BOT MODE'
            : `Spécialiste BOT MODE : ${name}`,
        instructions:
          name === 'BOT MODE Worker'
            ? 'Tu es le Worker principal BOT MODE. Délègue uniquement selon les autorisations.'
            : `Tu es le spécialiste ${name} de BOT MODE. Réponds en français.`,
        tools: [],
      };
      let statusCode = 200;
      let payload;
      const capture = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(value) {
          payload = value;
          return this;
        },
      };
      await v1.createAgent({ ...req, body }, capture);
      if (statusCode !== 201 || !payload?.id) {
        return res.status(statusCode >= 400 ? statusCode : 500).json({
          error: 'BOT MODE agent initialization interrupted',
          failedAgent: name,
          created,
        });
      }
      created.push({ name, id: payload.id });
    }
    return res.status(200).json({ created, existing: existing.map((agent) => agent.name) });
  } catch (_error) {
    return res.status(500).json({ error: 'BOT MODE agent initialization failed' });
  }
});

/**
 * Retrieves basic agent information (VIEW permission required).
 * Returns safe, non-sensitive agent data for viewing purposes.
 * @route GET /agents/:id
 * @param {string} req.params.id - Agent identifier.
 * @returns {Agent} 200 - Basic agent info - application/json
 */
router.get(
  '/:id',
  checkAgentAccess,
  canAccessAgentResource({
    requiredPermission: PermissionBits.VIEW,
    resourceIdParam: 'id',
  }),
  v1.getAgent,
);

/**
 * Retrieves full agent details including sensitive configuration (EDIT permission required).
 * Returns complete agent data for editing/configuration purposes.
 * @route GET /agents/:id/expanded
 * @param {string} req.params.id - Agent identifier.
 * @returns {Agent} 200 - Full agent details - application/json
 */
router.get(
  '/:id/expanded',
  checkAgentAccess,
  canAccessAgentResource({
    requiredPermission: PermissionBits.EDIT,
    resourceIdParam: 'id',
  }),
  (req, res) => v1.getAgent(req, res, true), // Expanded version
);

/**
 * Retrieves an agent's version history (EDIT permission required).
 * Loaded lazily so the editor doesn't transfer large histories up front.
 * @route GET /agents/:id/versions
 * @param {string} req.params.id - Agent identifier.
 * @returns {Agent[]} 200 - Agent version history - application/json
 */
router.get(
  '/:id/versions',
  checkAgentAccess,
  canAccessAgentResource({
    requiredPermission: PermissionBits.EDIT,
    resourceIdParam: 'id',
  }),
  v1.getAgentVersions,
);
/**
 * Updates an agent.
 * @route PATCH /agents/:id
 * @param {string} req.params.id - Agent identifier.
 * @param {AgentUpdateParams} req.body - The agent update parameters.
 * @returns {Agent} 200 - Success response - application/json
 */
router.patch(
  '/:id',
  checkAgentCreate,
  configMiddleware,
  canAccessAgentResource({
    requiredPermission: PermissionBits.EDIT,
    resourceIdParam: 'id',
  }),
  configMiddleware,
  v1.updateAgent,
);

/**
 * Duplicates an agent.
 * @route POST /agents/:id/duplicate
 * @param {string} req.params.id - Agent identifier.
 * @returns {Agent} 201 - Success response - application/json
 */
router.post(
  '/:id/duplicate',
  checkAgentCreate,
  configMiddleware,
  canAccessAgentResource({
    requiredPermission: PermissionBits.EDIT,
    resourceIdParam: 'id',
  }),
  configMiddleware,
  v1.duplicateAgent,
);

/**
 * Deletes an agent.
 * @route DELETE /agents/:id
 * @param {string} req.params.id - Agent identifier.
 * @returns {Agent} 200 - success response - application/json
 */
router.delete(
  '/:id',
  checkAgentCreate,
  canAccessAgentResource({
    requiredPermission: PermissionBits.DELETE,
    resourceIdParam: 'id',
  }),
  v1.deleteAgent,
);

/**
 * Reverts an agent to a previous version.
 * @route POST /agents/:id/revert
 * @param {string} req.params.id - Agent identifier.
 * @param {number} req.body.version_index - Index of the version to revert to.
 * @returns {Agent} 200 - success response - application/json
 */
router.post(
  '/:id/revert',
  checkAgentCreate,
  configMiddleware,
  canAccessAgentResource({
    requiredPermission: PermissionBits.EDIT,
    resourceIdParam: 'id',
  }),
  configMiddleware,
  v1.revertAgentVersion,
);

/**
 * Returns a list of agents.
 * @route GET /agents
 * @param {AgentListParams} req.query - The agent list parameters for pagination and sorting.
 * @returns {AgentListResponse} 200 - success response - application/json
 */
router.get('/', checkAgentAccess, v1.getListAgents);

/**
 * Uploads and updates an avatar for a specific agent.
 * @route POST /agents/:agent_id/avatar
 * @param {string} req.params.agent_id - The ID of the agent.
 * @param {Express.Multer.File} req.file - The avatar image file.
 * @param {string} [req.body.metadata] - Optional metadata for the agent's avatar.
 * @returns {Object} 200 - success response - application/json
 */
avatar.post(
  '/:agent_id/avatar/',
  checkAgentAccess,
  canAccessAgentResource({
    requiredPermission: PermissionBits.EDIT,
    resourceIdParam: 'agent_id',
  }),
  v1.uploadAgentAvatar,
);

module.exports = { v1: router, avatar };
