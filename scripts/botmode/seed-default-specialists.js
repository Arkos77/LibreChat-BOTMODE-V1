const { MongoClient } = require('mongodb');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const uri = process.env.MONGO_URI;
if (!uri) throw new Error('MONGO_URI missing');
const serusEnabled = Boolean(process.env.SERUS_API_KEY?.trim());
const serusInstructions = serusEnabled
  ? ' Pour les investigations de sécurité, exposition de données, fuite ou dark web, utilise `serus_intelligence` seulement quand le besoin est légitime et pertinent. Les résultats Serus restent masqués ; ne tente jamais de révéler automatiquement des valeurs sensibles. Un `start_scan` peut consommer des crédits Serus.'
  : '';
const specs = [
  [
    'RECHERCHE',
    'Spécialiste recherche et veille',
    `Recherche web, sources, concurrence, disponibilité, fraîcheur et provenance. Pour toute donnée externe susceptible d'avoir changé, classe explicitement la valeur avant synthèse : observation/mesure actuelle, état courant déclaré, prévision, estimation, agrégat, valeur historique ou information sans horodatage exploitable. Conserve la source réellement consultée, son horodatage ou sa date de mise à jour quand elle existe, et le moment de consultation. N'élève jamais une prévision, estimation, agrégat ou valeur historique au rang de donnée actuelle. Si la fraîcheur, la source ou le type de donnée est ambigu, signale l'ambiguïté ou effectue une vérification supplémentaire avant publication. Pour une question factuelle simple demandant une seule donnée actuelle, effectue au maximum UN appel \`web_search\` ciblé dans ce run. Une recherche peut retourner plusieurs sources : sélectionne la meilleure preuve exploitable et réponds immédiatement. Ne lance pas un deuxième \`web_search\` uniquement pour confirmer. Si la recherche unique reste ambiguë, trop ancienne ou ne permet pas d'établir la donnée demandée, indique clairement la limite ou l'incertitude ; réserve une investigation supplémentaire aux demandes sensibles, complexes ou explicitement approfondies. Ne transforme pas une vérification simple en enquête multi-source.${serusInstructions} Après deux échecs consécutifs 403/408/429 ou timeouts sur une même source, cesse de la solliciter et pivote vers des sources alternatives. Respecte les limites de débit et privilégie la diversité des sources quand la mission exige réellement plusieurs preuves.`,
    serusEnabled ? ['web_search', 'serus_intelligence'] : ['web_search'],
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
      "Pour l'heure locale actuelle et la météo actuelle d'un lieu nommé, utilise d'abord `current_state`; utilise `web_search` seulement en fallback. Pour les autres données externes susceptibles d'avoir changé, utilise `web_search`. Si la demande porte sur UN seul fait actuel simple, effectue au maximum UN appel `web_search` dans ce run : une recherche peut retourner plusieurs sources, choisis la meilleure preuve et réponds immédiatement. Ne lance pas un deuxième `web_search` uniquement pour confirmer ; si la recherche unique est insuffisante ou ambiguë, indique explicitement la limite au lieu d'allonger le run. Réserve les recherches supplémentaires aux demandes sensibles, complexes ou explicitement approfondies. Avant publication, classe chaque valeur volatile comme observation/mesure actuelle, état courant déclaré, prévision, estimation, agrégat, valeur historique ou information sans horodatage exploitable. Conserve la source réellement consultée, son horodatage/date de mise à jour quand disponible et le moment de consultation. Ne transforme jamais une prévision, estimation, agrégat ou valeur historique en donnée actuelle. Si la fraîcheur, la source ou la catégorie de la valeur est ambiguë, délègue à RECHERCHE ou indique explicitement l'incertitude. Si la recherche directe échoue ou si une investigation plus poussée est nécessaire, délègue à RECHERCHE. Ne réponds jamais par défaut que tu n'as pas accès au temps réel tant que `web_search` est disponible. " +
      "Pour les missions issues de la fiche Idées, privilégie une analyse approfondie plutôt qu'une réponse rapide. " +
      "Décompose l'idée en tâches vérifiables, délègue aux spécialistes pertinents, exploite le parallélisme quand il est sûr, " +
      "et utilise l'exécution en arrière-plan pour les travaux longs dont le résultat n'est pas nécessaire immédiatement. " +
      "Poursuis l'investigation tant que des hypothèses importantes, preuves, risques ou alternatives restent insuffisamment étudiés. " +
      "N'annonce jamais un résultat comme vérifié sans preuve exploitable. Conserve une progression structurée et prépare une synthèse consolidée pour la fiche de l'idée.";
    for (const [name, desc, instructions, tools] of specs) {
      let a = await agents.findOne({ name });
      if (a) {
        if (String(a.author) !== String(worker.author)) {
          throw new Error(`Specialist name collision with another owner: ${name}`);
        }
        // Preserve any existing instructions, tool grants, model and metadata.
        // Never overwrite an agent merely because its name matches a default.
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
    // Existing Worker configuration is user-owned: changing tools or routing
    // requires the normal authenticated agent update/authorization path.
    if (worker.subagents?.enabled || (worker.tools?.length ?? 0) > 0) {
      throw new Error('Worker already configured; refusing destructive reseed');
    }
    await agents.updateOne(
      { _id: worker._id },
      {
        $set: {
          instructions: workerInstructions,
          // BOT MODE uses isolated subagents as the only specialist delegation path.
          // Keeping these ids in legacy agent_ids would also promote every specialist
          // into the top-level graph; with no edges they all start in parallel and
          // duplicate work that the subagent router already owns.
          agent_ids: [],
          edges: [],
          subagents: { enabled: true, allowSelf: false, agent_ids: ids },
          tools: ['web_search', 'current_state'],
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
      { _id: 0, name: 1, agent_ids: 1, subagents: 1, tools: 1, tool_options: 1 },
    );
    if (!Array.isArray(out?.agent_ids) || out.agent_ids.length !== 0) {
      throw new Error('BOT MODE Worker legacy agent_ids must remain empty');
    }
    const routedIds = out?.subagents?.agent_ids ?? [];
    if (JSON.stringify(routedIds) !== JSON.stringify(ids)) {
      throw new Error('BOT MODE Worker subagent routing verification failed');
    }
    if (JSON.stringify(out?.tools ?? []) !== JSON.stringify(['web_search', 'current_state'])) {
      throw new Error('BOT MODE Worker built-in tools verification failed');
    }
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await client.close();
  }
})().catch((e) => {
  console.error(e.stack || e);
  process.exit(1);
});
