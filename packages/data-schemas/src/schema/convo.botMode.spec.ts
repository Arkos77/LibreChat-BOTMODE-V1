import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import convoSchema from './convo';

describe('Mongo conversation mission settings', () => {
  it('retains settings in the stored document projection', () => {
    const Conversation = mongoose.model('BotModeConversationSchemaTest', convoSchema);
    const botMode = {
      version: 1,
      mode: 'analyze',
      selectionMode: 'auto',
      workerAgentId: 'worker',
      agents: [{ id: 'research', name: 'RECHERCHE' }],
    };
    const document = new Conversation({ conversationId: 'saved', endpoint: 'agents', botMode });
    expect(document.toObject()).toHaveProperty('botMode', botMode);
  });
});

describe('durable mission settings in MongoDB', () => {
  let mongod: MongoMemoryServer;
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongod?.stop();
  });
  it('reads the same settings after a fresh query and an unrelated update', async () => {
    const Conversation = mongoose.model('DurableBotModeConversation', convoSchema);
    const botMode = {
      version: 1,
      mode: 'analyze',
      selectionMode: 'manual',
      workerAgentId: 'worker',
      agents: [{ id: 'research', name: 'RECHERCHE' }],
    };
    await Conversation.create({
      user: 'owner',
      conversationId: 'persisted',
      endpoint: 'agents',
      botMode,
    });
    await Conversation.updateOne(
      { user: 'owner', conversationId: 'persisted' },
      { $set: { title: 'Updated' } },
    );
    const restored = await Conversation.findOne({
      user: 'owner',
      conversationId: 'persisted',
    }).lean();
    expect(restored).toHaveProperty('botMode', botMode);
  });
});
