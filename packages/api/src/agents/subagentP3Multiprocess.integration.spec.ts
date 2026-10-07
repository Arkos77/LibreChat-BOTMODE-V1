import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { fork, type ChildProcess } from 'node:child_process';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import { emptyCheckpoint, INTERRUPT } from '@langchain/langgraph-checkpoint';
import { createMethods, createModels, tenantStorage } from '@librechat/data-schemas';
import { getAgentCheckpointer, LIBRECHAT_CHECKPOINT_NAMESPACE_KEY } from './checkpointer';

const WORKER = path.resolve(__dirname, 'fixtures/subagentP3Worker.cjs');
let mongod: MongoMemoryServer;
let methods: ReturnType<typeof createMethods>;
const children = new Set<ChildProcess>();

type Msg = {
  pid: number;
  type: string;
  role?: string;
  taskId?: string;
  threadId?: string;
  recoveryOnly?: boolean;
  verified?: boolean;
  candidate?: {
    parentConversationId: string;
    parentRunId: string;
    parentToolCallId: string;
    childThreadId: string;
  };
  task?: { status: string; taskId: string; threadId?: string };
  message?: string;
};

function spawnWorker(env: Record<string, string>) {
  const child = fork(WORKER, [], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  const messages: Msg[] = [];
  child.on('message', (value: unknown) => messages.push(value as Msg));
  return {
    child,
    async waitFor(predicate: (message: Msg) => boolean, timeoutMs = 10_000): Promise<Msg> {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const failure = messages.find((m) => m.type === 'error');
        if (failure) throw new Error(failure.message ?? 'P3 worker failed');
        const match = messages.find(predicate);
        if (match) return match;
        if (child.exitCode != null || child.signalCode != null) {
          throw new Error(`P3 worker exited early: ${child.exitCode}/${child.signalCode}`);
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }
      throw new Error('Timed out waiting for P3 worker message');
    },
  };
}

async function waitExit(child: ChildProcess): Promise<void> {
  if (child.exitCode != null || child.signalCode != null) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for worker exit')), 5_000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  createModels(mongoose);
  methods = createMethods(mongoose);
  await mongoose.connect(mongod.getUri(), { autoIndex: false });
}, 60_000);

afterEach(async () => {
  for (const child of children) {
    if (child.exitCode == null && child.signalCode == null) child.kill('SIGKILL');
  }
  await Promise.all([...children].map((child) => waitExit(child).catch(() => undefined)));
  children.clear();
  await mongoose.connection.db?.dropDatabase();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 60_000);

describe('subagent P3 genuine multi-process recovery', () => {
  it('takes over an abandoned attempt on a distinct OS worker without duplicate effect', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const tenantId = 'tenant-p3-multiprocess';
    const parentConversationId = randomUUID();
    const idempotencyKey = randomUUID();
    const checkpointNamespace = `generation-${randomUUID()}`;
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'botmode-p3-'));
    const effectFile = path.join(tempDir, 'effects.log');

    try {
      await tenantStorage.run({ tenantId, userId }, async () => {
        await methods.saveConvo(
          { userId },
          {
            conversationId: parentConversationId,
            tenantId,
            endpoint: EModelEndpoint.agents,
            title: 'P3 multi-process parent',
            agent_id: 'agent_parent',
          },
        );
        await methods.saveMessage(
          { userId },
          {
            messageId: 'parent-run',
            conversationId: parentConversationId,
            parentMessageId: String(Constants.NO_PARENT),
            sender: 'Director',
            text: 'Dispatch P3 recovery proof.',
            endpoint: EModelEndpoint.agents,
            isCreatedByUser: false,
          },
        );
      });

      const env = {
        P3_MONGO_URI: mongod.getUri(),
        P3_USER_ID: userId,
        P3_TENANT_ID: tenantId,
        P3_PARENT_CONVERSATION_ID: parentConversationId,
        P3_IDEMPOTENCY_KEY: idempotencyKey,
        P3_EFFECT_FILE: effectFile,
        P3_CHECKPOINT_NAMESPACE: checkpointNamespace,
      };

      const a = spawnWorker({ ...env, P3_ROLE: 'A' });
      const acceptedA = await a.waitFor((m) => m.type === 'accepted');
      const enteredA = await a.waitFor((m) => m.type === 'entered' && m.role === 'A');
      expect(acceptedA.pid).not.toBe(process.pid);
      expect(enteredA.recoveryOnly).toBe(false);

      const saver = await getAgentCheckpointer({ type: 'mongo', ttl: 3600 });
      expect(saver).toBeDefined();
      const childCheckpoint = emptyCheckpoint();
      await saver!.putWrites(
        {
          configurable: {
            thread_id: acceptedA.threadId,
            checkpoint_ns: 'child-ns',
            checkpoint_id: childCheckpoint.id,
            [LIBRECHAT_CHECKPOINT_NAMESPACE_KEY]: checkpointNamespace,
          },
        },
        [[INTERRUPT, { id: 'child-interrupt', value: 'resume child' }]],
        'child-task',
      );
      await saver!.put(
        {
          configurable: {
            thread_id: acceptedA.threadId,
            checkpoint_ns: 'child-ns',
            [LIBRECHAT_CHECKPOINT_NAMESPACE_KEY]: checkpointNamespace,
          },
        },
        childCheckpoint,
        { source: 'input', step: -1, writes: null, parents: {} },
      );

      const parentCheckpoint = emptyCheckpoint();
      await saver!.putWrites(
        {
          configurable: {
            thread_id: parentConversationId,
            checkpoint_ns: '',
            checkpoint_id: parentCheckpoint.id,
            [LIBRECHAT_CHECKPOINT_NAMESPACE_KEY]: checkpointNamespace,
          },
        },
        [
          [
            INTERRUPT,
            {
              id: 'parent-interrupt',
              value: {
                __librechat_run_step_resume_payload: {
                  __librechat_subagent_resume_manifest: {
                    version: 1,
                    executions: [
                      {
                        parentToolCallId: 'parent-tool',
                        checkpoints: [
                          {
                            threadId: acceptedA.threadId,
                            checkpointNs: 'child-ns',
                            checkpointId: childCheckpoint.id,
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            },
          ],
        ],
        'parent-task',
      );
      await saver!.put(
        {
          configurable: {
            thread_id: parentConversationId,
            checkpoint_ns: '',
            [LIBRECHAT_CHECKPOINT_NAMESPACE_KEY]: checkpointNamespace,
          },
        },
        parentCheckpoint,
        { source: 'input', step: -1, writes: null, parents: {} },
      );

      a.child.kill('SIGKILL');
      await waitExit(a.child);
      await new Promise<void>((resolve) => setTimeout(resolve, 650));

      const b = spawnWorker({ ...env, P3_ROLE: 'B' });
      const verification = await b.waitFor((m) => m.type === 'verification');
      expect(verification.pid).not.toBe(process.pid);
      expect(verification.pid).not.toBe(acceptedA.pid);
      expect(verification.verified).toBe(true);
      expect(verification.candidate).toEqual({
        parentConversationId,
        parentRunId: 'parent-run',
        parentToolCallId: 'parent-tool',
        childThreadId: acceptedA.threadId,
      });

      const acceptedB = await b.waitFor((m) => m.type === 'accepted');
      /** Durable takeover resumes the canonical idempotent task identity on a
       * distinct OS worker; recovery must not mint a second logical task. */
      expect(acceptedB.taskId).toBe(acceptedA.taskId);
      expect(acceptedB.threadId).toBe(acceptedA.threadId);

      const enteredB = await b.waitFor((m) => m.type === 'entered' && m.role === 'B');
      expect(enteredB.recoveryOnly).toBe(true);

      const settledB = await b.waitFor((m) => m.type === 'settled');
      expect(settledB.task).toEqual(
        expect.objectContaining({
          status: 'completed',
          taskId: acceptedB.taskId,
          threadId: acceptedA.threadId,
        }),
      );
      await waitExit(b.child);

      const effects = fs.existsSync(effectFile)
        ? (await fs.promises.readFile(effectFile, 'utf8'))
            .split('\n')
            .filter((line) => line.trim() !== '')
        : [];
      expect(effects).toHaveLength(1);
      expect(effects[0]).toContain(`:${acceptedB.taskId}`);

      const Message = mongoose.models.Message;
      const childMessages = await Message.find({
        user: userId,
        conversationId: acceptedA.threadId,
        'subagentTask.requestFingerprint': 'same-inputs',
      })
        .select({
          messageId: 1,
          conversationId: 1,
          user: 1,
          subagentTask: 1,
          text: 1,
          parentMessageId: 1,
          _id: 0,
        })
        .lean();
      const attemptRows = childMessages;
      const runningRows = attemptRows.filter(
        (message) => message.subagentTask?.status === 'running',
      );
      const terminalRows = attemptRows.filter(
        (message) => message.subagentTask?.status !== 'running',
      );

      expect(runningRows).toHaveLength(1);
      expect(terminalRows).toHaveLength(1);
      expect(terminalRows[0]).toMatchObject({
        parentMessageId: runningRows[0].messageId,
        text: 'Recovered exactly once.',
        subagentTask: {
          parentRunId: 'retry-run-must-not-authorize-recovery',
          requestFingerprint: 'same-inputs',
          status: 'completed',
        },
      });
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });
});
