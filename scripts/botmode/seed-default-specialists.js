const { MongoClient } = require('mongodb');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const uri = process.env.MONGO_URI;
if (!uri) throw new Error('MONGO_URI missing');
const specs = [
  [
    'RECHERCHE',
    'Spécialiste recherche et veille',
    'Recherche web, sources, concurrence, disponibilité, fraîcheur et provenance. Après deux échecs consécutifs 403/408/429 ou timeouts sur une même source, cesse de la solliciter et pivote vers des sources alternatives. Respecte les limites de débit et privilégie la diversité des sources.',
    ['web_search'],
  ],
  [
    'ANALYSE',
    'Spécialiste analyse',
    'Analyse de faisabilité, risques, opportunités, scénarios et arbitrages.',
    [],
  ],
  [
    'CODE',
    'Spécialiste code',
    'Conception technique, prototypes, tests, intégration et diagnostic.',
    ['execute_code'],
  ],
  [
    'DOCUMENTS',
    'Spécialiste documents',
    'Documentation, RAG, extraction, synthèse documentaire et preuves.',
    ['file_search'],
  ],
  [
    'RÉDACTION',
    'Spécialiste rédaction',
    'Synthèse, structuration, notes, rapports et livrables en français.',
    [],
  ],
];
(async () => {
  const client = await MongoClient.connect(uri);
  try {
    const db = client.db();
    const agents = db.collection('agents');
    const worker = await agents.findOne({ name: 'BOT MODE Worker' });
    if (!worker) throw new Error('BOT MODE Worker not found');
    const now = new Date();
    const ids = [];
    const publicOutputPolicy =
      "Réponds toujours en français, sauf demande explicite d'une autre langue. Ne publie jamais ton raisonnement interne, scratchpad, hésitations ou planification. Publie une seule réponse finale consolidée. N'affirme jamais avoir utilisé une source, un outil ou une donnée temps réel si l'appel correspondant n'a pas réellement réussi. ";
    const workerInstructions =
      'Tu es le Worker principal de BOT MODE. ' +
      publicOutputPolicy +
      "Pour les missions issues de la fiche Idées, privilégie une analyse approfondie plutôt qu'une réponse rapide. " +
      "Décompose l'idée en tâches vérifiables, délègue aux spécialistes pertinents, exploite le parallélisme quand il est sûr, " +
      "et utilise l'exécution en arrière-plan pour les travaux longs dont le résultat n'est pas nécessaire immédiatement. " +
      "Poursuis l'investigation tant que des hypothèses importantes, preuves, risques ou alternatives restent insuffisamment étudiés. " +
      "N'annonce jamais un résultat comme vérifié sans preuve exploitable. Conserve une progression structurée et prépare une synthèse consolidée pour la fiche de l'idée.";
    for (const [name, desc, instructions, tools] of specs) {
      let a = await agents.findOne({ name });
      if (a) {
        await agents.updateOne(
          { _id: a._id },
          {
            $set: {
              description: desc,
              instructions: `${publicOutputPolicy}${instructions}`,
              tools,
              metadata: { ...(a.metadata || {}), botmode: true, specialist: true },
              updatedAt: new Date(),
            },
          },
        );
        a = await agents.findOne({ _id: a._id });
      } else {
        const id = `botmode-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        const version = {
          id,
          name,
          provider: worker.provider,
          model: worker.model,
          author: worker.author,
          description: desc,
          instructions: `${publicOutputPolicy}${instructions}`,
          tools,
          category: 'botmode',
          createdAt: now,
          updatedAt: now,
        };
        const doc = {
          id,
          name,
          provider: worker.provider,
          model: worker.model,
          author: worker.author,
          description: desc,
          instructions,
          tools,
          category: 'botmode',
          agent_ids: [],
          edges: [],
          tool_options: {},
          metadata: { botmode: true, specialist: true },
          versions: [version],
          createdAt: now,
          updatedAt: now,
        };
        await agents.insertOne(doc);
        a = doc;
        console.log(`CREATED ${name} ${id}`);
      }
      console.log(`READY ${name} ${a.id}`);
      ids.push(a.id);
    }
    await agents.updateOne(
      { _id: worker._id },
      {
        $set: {
          instructions: workerInstructions,
          agent_ids: ids,
          subagents: { enabled: true, allowSelf: false, agent_ids: ids },
          tool_options: { '*': { run_in_background: true, describe_intent: true } },
          updatedAt: new Date(),
        },
      },
    );
    const userId = worker.author;
    const ownerRoles = await db
      .collection('accessroles')
      .find({ accessRoleId: { $in: ['agent_owner', 'remoteAgent_owner'] } })
      .toArray();
    const roleBy = Object.fromEntries(ownerRoles.map((role) => [role.accessRoleId, role]));
    for (const id of ids) {
      const agent = await agents.findOne({ id });
      if (!agent) continue;
      for (const [resourceType, role] of [
        ['agent', roleBy.agent_owner],
        ['remoteAgent', roleBy.remoteAgent_owner],
      ]) {
        if (!role) continue;
        await db.collection('aclentries').updateOne(
          {
            principalType: 'user',
            principalId: userId,
            principalModel: 'User',
            resourceId: agent._id,
            resourceType,
          },
          {
            $set: {
              permBits: role.permBits,
              grantedAt: new Date(),
              grantedBy: userId,
              roleId: role._id,
              updatedAt: new Date(),
            },
            $setOnInsert: { createdAt: new Date() },
          },
          { upsert: true },
        );
      }
    }
    const out = await agents.findOne(
      { _id: worker._id },
      { _id: 0, name: 1, agent_ids: 1, subagents: 1, tool_options: 1 },
    );
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await client.close();
  }
})().catch((e) => {
  console.error(e.stack || e);
  process.exit(1);
});
