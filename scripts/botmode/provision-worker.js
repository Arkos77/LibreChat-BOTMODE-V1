#!/usr/bin/env node
'use strict';
// Explicit one-time Worker provisioning. Existing agents are never overwritten.
const { MongoClient, ObjectId } = require('mongodb');
async function main() {
  const args = process.argv.slice(2);
  const get = (key) => args[args.indexOf(key) + 1];
  if (!args.includes('--apply') || !args.includes('--user-id') || !args.includes('--provider') || !args.includes('--model')) {
    throw new Error('Usage: --apply --user-id OBJECT_ID --provider PROVIDER --model MODEL');
  }
  const ownerId = get('--user-id');
  if (!ObjectId.isValid(ownerId)) throw new Error('Invalid user ID');
  const provider = get('--provider');
  const model = get('--model');
  if (!provider || !model || provider.startsWith('--') || model.startsWith('--')) {
    throw new Error('Invalid provider/model');
  }
  if (!process.env.MONGO_URI) throw new Error('Missing MONGO_URI');
  const client = await MongoClient.connect(process.env.MONGO_URI);
  try {
    const db = client.db();
    const author = new ObjectId(ownerId);
    const user = await db.collection('users').findOne({ _id: author });
    if (!user) throw new Error('User not found');
    if (user.tenantId != null) throw new Error('Tenant-scoped setup requires separate review');
    const agents = db.collection('agents');
    const existing = await agents.findOne({ $or: [{ name: 'BOT MODE Worker' }, { id: 'botmode-worker' }] });
    if (existing) {
      if (String(existing.author) !== String(author)) throw new Error('Worker belongs to another user');
      console.log('BOTMODE_WORKER=EXISTS');
      return;
    }
    const role = await db.collection('accessroles').findOne({ accessRoleId: 'agent_owner' });
    if (!role || typeof role.permBits !== 'number') throw new Error('Missing owner ACL role');
    const now = new Date();
    const doc = {
      id: 'botmode-worker', name: 'BOT MODE Worker', author, provider, model,
      category: 'botmode', description: 'Worker principal BOT MODE',
      instructions: 'Tu es le Worker principal BOT MODE. Réponds en français.',
      tools: [], agent_ids: [], edges: [], versions: [],
      createdAt: now, updatedAt: now,
    };
    const result = await agents.insertOne(doc);
    await db.collection('aclentries').updateOne(
      { principalType: 'user', principalId: author, principalModel: 'User', resourceId: result.insertedId, resourceType: 'agent' },
      { $setOnInsert: { principalType: 'user', principalId: author, principalModel: 'User',
        resourceId: result.insertedId, resourceType: 'agent', roleId: role._id,
        permBits: role.permBits, grantedBy: author, grantedAt: now, createdAt: now, updatedAt: now } },
      { upsert: true },
    );
    console.log('BOTMODE_WORKER=CREATED');
  } finally {
    await client.close();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
