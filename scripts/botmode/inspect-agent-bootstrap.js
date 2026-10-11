#!/usr/bin/env node
'use strict';
/** Read-only BOT MODE provisioning preflight. No database writes. */
const { MongoClient, ObjectId } = require('mongodb');

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI not configured');
  const userIdIndex = process.argv.indexOf('--user-id');
  const ownerId = userIdIndex >= 0 ? process.argv[userIdIndex + 1] : null;
  if (ownerId && !ObjectId.isValid(ownerId)) throw new Error('Invalid --user-id');
  if (userIdIndex >= 0 && !ownerId) throw new Error('Missing --user-id value');
  const client = await MongoClient.connect(uri);
  try {
    const db = client.db();
    const expected = ['BOT MODE Worker', 'RECHERCHE', 'ANALYSE', 'CODE', 'DOCUMENTS', 'RÉDACTION'];
    const existing = await db.collection('agents').find(
      { name: { $in: expected }, ...(ownerId ? { author: new ObjectId(ownerId) } : {}) },
      { projection: { _id: 1, id: 1, name: 1, author: 1, subagents: 1 } },
    ).toArray();
    const roles = await db.collection('accessroles').find(
      { accessRoleId: { $in: ['agent_owner', 'remoteAgent_owner'] } },
      { projection: { accessRoleId: 1, _id: 1 } },
    ).toArray();
    const details = [];
    const duplicateNames = expected.filter((name) => existing.filter((agent) => agent.name === name).length > 1);
    for (const agent of existing) {
      const aclCount = await db.collection('aclentries').countDocuments({
        resourceId: agent._id, resourceType: 'agent',
        principalType: 'user', principalId: agent.author,
      });
      details.push({ name: agent.name, id: agent.id, ownerAclPresent: aclCount > 0, authorPresent: Boolean(agent.author) });
    }
    console.log(JSON.stringify({
      readOnly: true,
      expectedAgents: expected,
      scopedToUser: Boolean(ownerId),
      missingAgents: expected.filter((name) => !existing.some((agent) => agent.name === name)),
      duplicateNames,
      agentProvisioningComplete: Boolean(ownerId) && duplicateNames.length === 0 && expected.every((name) =>
        details.some((agent) => agent.name === name && agent.ownerAclPresent && agent.authorPresent),
      ) && roles.some((role) => role.accessRoleId === 'agent_owner'),
      roleIds: roles.map((role) => role.accessRoleId),
      agents: details,
    }, null, 2));
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
