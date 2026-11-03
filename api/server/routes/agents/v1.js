const express = require('express');
const { generateCheckAccess } = require('@librechat/api');
const {
  PermissionTypes,
  Permissions,
  PermissionBits,
  ResourceType,
  PrincipalType,
  AccessRoleIds,
} = require('librechat-data-provider');
const {
  getResourcePermissionsMap,
  grantPermission,
} = require('~/server/services/PermissionService');
const { configMiddleware, canAccessAgentResource } = require('~/server/middleware');
const v1 = require('~/server/controllers/agents/v1');
const { getRoleByName, getAgents } = require('~/models');
const { loadModels } = require('~/server/controllers/ModelController');
const actions = require('./actions');
const tools = require('./tools');
const {
  validateModelSelection,
  inspectAgentInventory,
  validateWorkerDelegation,
  inspectMissingCapabilities,
  inspectRoleReadiness,
} = require('./botmodeSetupValidation');

// The six native roles are deliberately a static profile, not another router,
// executor, model-selection tier or prompt-generation agent. Tool grants are
// rechecked by LibreChat's normal authenticated create controller.
const botModeRoleProfiles = Object.freeze({
  'BOT MODE Worker': {
    description: 'Orchestrateur BOT MODE sans outil métier direct',
    tools: [],
    instructions: [
      'Tu es le Worker orchestrateur de BOT MODE. Ta seule responsabilité est de choisir,',
      'ordonner et consolider les travaux des spécialistes natifs autorisés.',
      'Selon la demande, utilise zéro, un ou plusieurs spécialistes, uniquement si leur',
      'contribution est réellement utile. Ne délègue pas une réponse simple sans raison.',
      'Tu ne possèdes aucun outil métier : ni recherche web, ni exécution de code, ni recherche documentaire.',
      'Lance ces opérations seulement par le spécialiste disposant de la permission requise.',
      'Ne suppose jamais qu’un spécialiste dispose d’un outil absent de sa configuration.',
      'Transmets un objectif clair, les contraintes et le résultat attendu. Attends les résultats',
      'nécessaires avant de publier une synthèse unique, en français sauf demande contraire.',
      'Distingue faits vérifiés, hypothèses, incertitudes et étapes non exécutées.',
      'Ne fabrique ni preuve ni citation, ne rejoue pas un appel fournisseur dont le résultat est inconnu.',
      'Une mission longue ou incomplète doit être signalée sans promettre de travail hors exécution.',
    ].join(' '),
  },
  RECHERCHE: {
    description: 'Recherche factuelle, veille et provenance des sources',
    tools: ['web_search'],
    instructions: [
      'Tu es le spécialiste RECHERCHE de BOT MODE. Tu vérifies les faits externes,',
      'l’actualité, la disponibilité et les sources nécessaires à la mission.',
      'Utilise web_search seulement si cet outil t’est effectivement accordé.',
      'Privilégie une recherche ciblée et les sources primaires ; n’accumule pas des appels inutiles.',
      'Pour chaque conclusion importante, précise la source consultée, sa date lorsqu’elle existe',
      'et distingue la date de publication de la date du fait rapporté.',
      'Sépare observations actuelles, données historiques, estimations et prévisions.',
      'Signale les contradictions, les limites et les informations impossibles à vérifier.',
      'Ne fabrique jamais de lien, de résultat, de disponibilité ou de citation.',
      'Remets au Worker une synthèse factuelle courte avec les preuves et points encore incertains.',
      'Ne réalise ni exécution de code ni accès aux documents privés sans mandat et outil autorisé.',
    ].join(' '),
  },
  ANALYSE: {
    description: 'Analyse structurée des preuves, options, risques et décisions',
    tools: [],
    instructions: [
      'Tu es le spécialiste ANALYSE de BOT MODE. Travaille exclusivement à partir des',
      'faits, documents, contraintes et résultats transmis dans la mission.',
      'Commence par clarifier l’objectif, les critères de réussite et les hypothèses.',
      'Compare les options, les coûts ou contraintes, les dépendances et les risques.',
      'Sépare explicitement les faits établis des suppositions et explique les arbitrages.',
      'Présente une recommandation proportionnée, ses conditions et ce qui manque pour conclure.',
      'Ne prétends pas avoir effectué de recherche, de calcul externe ou de test si ce n’est pas le cas.',
      'Ne demande pas d’outil métier au Worker : signale la preuve manquante pour qu’il décide',
      'éventuellement de solliciter le spécialiste adéquat. Remets une analyse exploitable, en français.',
    ].join(' '),
  },
  CODE: {
    description: 'Conception et vérification du code avec exécution autorisée',
    tools: ['execute_code'],
    instructions: [
      'Tu es le spécialiste CODE de BOT MODE. Produis des solutions techniques simples,',
      'maintenables et adaptées aux contraintes données. Lis les exigences avant de proposer un changement.',
      'Distingue code proposé, test réellement exécuté et résultat seulement attendu.',
      'Si execute_code est accordé, limite les exécutions aux vérifications nécessaires',
      'et rapporte leurs sorties ou erreurs sans inventer de succès.',
      'Évite les dépendances supplémentaires et les changements sans rapport avec la tâche.',
      'Ne touche pas aux secrets, aux données utilisateur ou aux environnements de production',
      'sans instruction explicite et autorisation vérifiée.',
      'Rends au Worker les fichiers ou fonctions concernés, la logique du correctif,',
      'les tests exécutés et les limites. Tu ne disposes pas de recherche web ou documentaire par défaut.',
    ].join(' '),
  },
  DOCUMENTS: {
    description: 'Lecture de documents et RAG avec preuves localisées',
    tools: ['file_search'],
    instructions: [
      'Tu es le spécialiste DOCUMENTS et RAG de BOT MODE. Recherche et analyse les',
      'fichiers accessibles dans le périmètre autorisé de la mission.',
      'N’utilise file_search que lorsque l’outil et les documents sont effectivement accessibles.',
      'Distingue texte de source, résumé, déduction et information absente du corpus.',
      'Conserve les références exactes du document, les pages ou sections quand elles sont disponibles.',
      'Ne fabrique pas de citation, de pièce jointe, de page ni de contenu non consulté.',
      'Signale les documents manquants, les versions divergentes et les éléments non lisibles.',
      'Respecte les accès et la confidentialité ; n’effectue pas de recherche Internet ni de code.',
      'Remets au Worker les extraits pertinents, les conclusions sourcées et les limites du corpus.',
    ].join(' '),
  },
  RÉDACTION: {
    description: 'Rédaction et synthèse finale à partir des résultats vérifiés',
    tools: [],
    instructions: [
      'Tu es le spécialiste RÉDACTION de BOT MODE. Transforme les résultats fournis',
      'en texte clair, structuré et directement utilisable dans le format demandé.',
      'Adapte le niveau de détail et le ton au destinataire ; rédige en français sauf demande contraire.',
      'Préserve fidèlement les chiffres, les sources et les réserves transmis par les autres spécialistes.',
      'Sépare les décisions prises des propositions et des travaux restant à valider.',
      'N’invente aucune preuve, citation, référence, validation ou action réalisée.',
      'Ne mène ni recherche web, ni calcul par outil, ni exploration documentaire indépendante.',
      'Remets au Worker un livrable cohérent et indique brièvement toute information manquante.',
    ].join(' '),
  },
});

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
    const worker = agents.find((agent) => agent.name === 'BOT MODE Worker');
    const specialistIds = agents
      .filter((agent) => agent.name !== 'BOT MODE Worker')
      .map((agent) => agent.id);
    const { unconfiguredInstructions, unexpectedCapabilities } = inspectRoleReadiness(
      agents,
      botModeRoleProfiles,
    );
    const requiredTools = Object.fromEntries(
      names.map((name) => [name, botModeRoleProfiles[name].tools]),
    );
    const missingCapabilities = inspectMissingCapabilities(agents, requiredTools);
    const routedIds = worker?.subagents?.agent_ids ?? [];
    const delegationConfigured =
      worker?.subagents?.enabled === true &&
      specialistIds.length === 5 &&
      specialistIds.every((id) => routedIds.includes(id));

    return res.status(200).json({
      inventoryComplete: missing.length === 0 && duplicates.length === 0,
      permissionsComplete: missingOwnerAccess.length === 0,
      delegationConfigured,
      configurationComplete:
        missing.length === 0 &&
        duplicates.length === 0 &&
        missingOwnerAccess.length === 0 &&
        delegationConfigured &&
        unconfiguredInstructions.length === 0 &&
        unexpectedCapabilities.length === 0 &&
        missingCapabilities.length === 0,
      unconfiguredInstructions,
      unexpectedCapabilities,
      missingCapabilities,
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
    // Resolve against this authenticated request, including user API keys.
    // A client-provided name is not proof of model availability.
    const resolvedModels = await loadModels(req);
    if (!validateModelSelection(resolvedModels, provider, model)) {
      return res
        .status(400)
        .json({ error: 'Selected provider/model is not available to this user' });
    }
    const existing = await getAgents({ author: req.user.id, name: { $in: names } });
    const { duplicates } = inspectAgentInventory(existing, names);
    if (duplicates.length > 0) {
      return res
        .status(409)
        .json({ error: 'Duplicate BOT MODE agents require review', duplicates });
    }

    // Do not report setup success for existing agents that the owner
    // cannot actually view and edit. Repair requires the native ACL path.
    if (existing.length > 0) {
      const permissions = await getResourcePermissionsMap({
        userId: req.user.id,
        role: req.user.role,
        resourceType: ResourceType.AGENT,
        resourceIds: existing.map((agent) => agent._id),
      });
      const inaccessible = existing
        .filter((agent) => {
          const bits = permissions.get(String(agent._id)) ?? 0;
          const needed = PermissionBits.VIEW | PermissionBits.EDIT;
          return (bits & needed) !== needed;
        })
        .map((agent) => agent.name);
      if (inaccessible.length > 0) {
        // Existing agents were queried by immutable author ID. Repair only
        // that authenticated author's owner ACL through LibreChat's service.
        for (const agent of existing.filter((item) => inaccessible.includes(item.name))) {
          await grantPermission({
            principalType: PrincipalType.USER,
            principalId: req.user.id,
            resourceType: ResourceType.AGENT,
            resourceId: agent._id,
            accessRoleId: AccessRoleIds.AGENT_OWNER,
            grantedBy: req.user.id,
          });
        }
        const repaired = await getResourcePermissionsMap({
          userId: req.user.id,
          role: req.user.role,
          resourceType: ResourceType.AGENT,
          resourceIds: existing.map((agent) => agent._id),
        });
        const required = PermissionBits.VIEW | PermissionBits.EDIT;
        if (
          existing.some((agent) => ((repaired.get(String(agent._id)) ?? 0) & required) !== required)
        ) {
          return res.status(409).json({
            error: 'Existing BOT MODE agents still lack owner permissions',
          });
        }
      }
    }

    // Requested tools are only proposals: createAgent filters them against
    // the authenticated user's actual tool and MCP permissions.
    // V1 has exactly the five user-owned specialist targets. Never enable
    // implicit self-spawn based on a provider/model name: it would add an
    // unreviewed delegation mode even when the selected model is free.
    const requestedTools = Object.fromEntries(
      names.map((name) => [name, botModeRoleProfiles[name].tools]),
    );
    const created = [];
    const missingCapabilities = [];
    for (const name of names) {
      if (existing.some((agent) => agent.name === name)) continue;
      // Recheck immediately before creation so a concurrent onboarding that
      // has already committed is not needlessly duplicated.
      const current = await getAgents({ author: req.user.id, name });
      if (current.length !== 0) {
        return res.status(409).json({
          error: 'BOT MODE setup changed during initialization; retry after inspection',
          failedAgent: name,
          created,
        });
      }
      const body = {
        name,
        provider: provider.trim(),
        model: model.trim(),
        description: botModeRoleProfiles[name].description,
        instructions: botModeRoleProfiles[name].instructions,
        tools: requestedTools[name],
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
      const grantedTools = Array.isArray(payload.tools) ? payload.tools : [];
      const deniedTools = requestedTools[name].filter((tool) => !grantedTools.includes(tool));
      if (deniedTools.length > 0) {
        missingCapabilities.push({ name, deniedTools });
      }
      created.push({ name, id: payload.id, grantedTools });
    }
    // Link only a Worker created by this onboarding request; never overwrite
    // an existing user's delegation graph. The native update controller
    // checks subagent references, authorizations, schema and content policy.
    const createdWorker = created.find((item) => item.name === 'BOT MODE Worker');
    const existingWorker = existing.find((agent) => agent.name === 'BOT MODE Worker');
    // Safe recovery for pre-existing unconfigured Workers. Never replace a
    // configured delegation graph or a disabled graph with stored targets.
    const recoverableWorker =
      existingWorker &&
      existingWorker.subagents?.enabled !== true &&
      (existingWorker.subagents?.agent_ids?.length ?? 0) === 0 &&
      (existingWorker.subagents?.graphs?.length ?? 0) === 0
        ? existingWorker
        : null;
    const workerToConfigure = createdWorker ?? recoverableWorker;
    if (workerToConfigure) {
      const specialists = await getAgents({
        author: req.user.id,
        name: { $in: names.slice(1) },
      });
      if (specialists.length !== 5) {
        return res.status(409).json({
          error: 'Specialists incomplete before Worker delegation setup',
          created,
        });
      }
      let updateStatus = 200;
      let updatePayload;
      const updateResponse = {
        status(code) {
          updateStatus = code;
          return this;
        },
        json(value) {
          updatePayload = value;
          return this;
        },
      };
      await v1.updateAgent(
        {
          ...req,
          params: { ...req.params, id: workerToConfigure.id },
          body: {
            subagents: {
              enabled: true,
              allowSelf: false,
              agent_ids: specialists.map((agent) => agent.id),
            },
          },
        },
        updateResponse,
      );
      if (updateStatus !== 200 || !updatePayload?.id) {
        return res.status(updateStatus >= 400 ? updateStatus : 500).json({
          error: 'Worker delegation could not be authorized',
          created,
        });
      }
    }
    // Cross-process writes can race the pre-insert check. Never claim success
    // until the final inventory is unique for this authenticated owner.
    const finalAgents = await getAgents({ author: req.user.id, name: { $in: names } });
    const invalid = names.filter(
      (name) => finalAgents.filter((agent) => agent.name === name).length !== 1,
    );
    if (invalid.length > 0) {
      return res.status(409).json({
        error: 'BOT MODE setup inventory changed; manual review required',
        invalid,
        created,
      });
    }
    // Re-evaluate actual persisted tools for both new and reused agents.
    // Otherwise a second setup could falsely report full capabilities merely
    // because no new agent needed creating.
    missingCapabilities.splice(
      0,
      missingCapabilities.length,
      ...inspectMissingCapabilities(finalAgents, requestedTools),
    );
    // The native creation controller persists before granting ACLs. Never
    // announce complete setup unless the final owner can access every agent.
    const finalPermissions = await getResourcePermissionsMap({
      userId: req.user.id,
      role: req.user.role,
      resourceType: ResourceType.AGENT,
      resourceIds: finalAgents.map((agent) => agent._id),
    });
    const missingPermissions = finalAgents
      .filter((agent) => {
        const bits = finalPermissions.get(String(agent._id)) ?? 0;
        const required = PermissionBits.VIEW | PermissionBits.EDIT;
        return (bits & required) !== required;
      })
      .map((agent) => agent.name);
    if (missingPermissions.length > 0) {
      return res.status(409).json({
        error: 'BOT MODE setup needs owner permission repair',
        missingPermissions,
        created,
      });
    }
    // Inventory and ACL success are insufficient when the Worker cannot
    // actually delegate to the five specialists.
    if (!validateWorkerDelegation(finalAgents, names.slice(1))) {
      return res.status(409).json({
        error: 'BOT MODE Worker delegation is not fully configured',
        created,
      });
    }
    const { unconfiguredInstructions, unexpectedCapabilities } = inspectRoleReadiness(
      finalAgents,
      botModeRoleProfiles,
    );
    return res.status(200).json({
      created,
      existing: existing.map((agent) => agent.name),
      capabilitiesComplete:
        missingCapabilities.length === 0 &&
        unconfiguredInstructions.length === 0 &&
        unexpectedCapabilities.length === 0,
      missingCapabilities,
      unconfiguredInstructions,
      unexpectedCapabilities,
    });
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
