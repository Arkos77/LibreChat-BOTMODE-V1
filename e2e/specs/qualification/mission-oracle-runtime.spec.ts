import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import Redis from 'ioredis';
import { MongoClient } from 'mongodb';
import type { Page } from '@playwright/test';
import { cleanupAgent } from '../mock/agents.helpers';
import { getAccessToken, MOCK_ENDPOINTS, requestJson } from '../mock/helpers';

/**
 * Exact-source CI qualification (no real provider).
 * This deliberately uses the authenticated HTTP host, actual saved agents,
 * native mission planning/SDK graph, Redis job state, and persisted messages.
 * Never infer publication from SSE alone or fabricate an Oracle verdict.
 *
 * Scope limit: reload+readback is NOT an API-process kill/restart test.
 */
type SavedAgent = { id: string };
type MissionRun = {
  generationProtocolVersion?: number;
  status?: string;
  streamId?: string;
  conversationId?: string;
};
type OracleState = {
  results?: Record<string, { verdicts?: Array<{ status?: string }> }>;
};
type JobSnapshot = {
  status: string | null;
  plan: {
    mission?: { missionId?: string };
    tasks?: Array<{ key: string; agentId: string; dependsOn?: string[]; taskId: string }>;
  } | null;
  state: OracleState | null;
};

const responseText = (message: unknown): string => {
  if (!message || typeof message !== 'object') return '';
  const value = message as { text?: unknown; content?: unknown };
  if (typeof value.text === 'string' && value.text.trim()) return value.text;
  if (typeof value.content === 'string') return value.content;
  return Array.isArray(value.content)
    ? value.content
        .filter((p): p is { text: string } => !!p && typeof p.text === 'string')
        .map((p) => p.text)
        .join(' ')
    : '';
};

async function createSavedAgent(
  page: Page,
  token: string,
  role: 'Worker' | 'Specialist',
  subagentId?: string,
): Promise<SavedAgent> {
  return requestJson<SavedAgent>(page, {
    path: '/api/agents',
    token,
    method: 'POST',
    body: {
      name: `PR28 Oracle ${role} ${randomUUID().slice(0, 8)}`,
      description: 'Disposable, provider-free Oracle runtime qualification agent',
      instructions: 'Reply with the exact strict JSON requested; no Markdown.',
      provider: MOCK_ENDPOINTS[0].label,
      model: MOCK_ENDPOINTS[0].model,
      ...(subagentId
        ? { subagents: { enabled: true, allowSelf: false, agent_ids: [subagentId] } }
        : {}),
    },
  });
}

function makeMission(workerId: string, specialistId: string | undefined, review: boolean) {
  const missionId = randomUUID();
  const taskId = `oracle-qualification-${missionId}`;
  const validation = {
    criteria: [{ id: 'ci-json-ok', field: 'ok', expected: true }],
    ...(review ? { review: { required: true, reason: 'human policy hold' } } : {}),
  };
  const worker = {
    id: 'qualified-worker',
    agentId: workerId,
    role: 'worker',
    capabilities: ['research'],
    constraints: [],
  };
  const specialists = specialistId
    ? [
        {
          id: 'qualified-specialist',
          agentId: specialistId,
          role: 'specialist',
          capabilities: ['publication'],
          constraints: [],
        },
      ]
    : [];
  return {
    missionId,
    taskId,
    mission: {
      missionId,
      taskId,
      objective: 'Validate the authorized Worker-to-specialist mission with Oracle.',
      constraints: ['Strict JSON response only'],
      requiredCapabilities: specialistId ? ['research', 'publication'] : ['research'],
      objectives: specialistId
        ? [
            {
              key: 'worker',
              objective: 'Complete the worker task',
              requiredCapabilities: ['research'],
              dependsOn: [],
            },
            {
              key: 'specialist',
              objective: 'Complete the specialist task using the worker output',
              requiredCapabilities: ['publication'],
              dependsOn: ['worker'],
            },
          ]
        : undefined,
      validation,
    },
    plannerContext: { worker, specialists },
  };
}

async function startMission(
  page: Page,
  token: string,
  workerId: string,
  mission: ReturnType<typeof makeMission>,
): Promise<{ conversationId: string; streamId: string; events: Array<Record<string, unknown>> }> {
  const conversationId = randomUUID();
  const admitted = await page.request.post('/api/agents/chat/agents', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      endpoint: 'agents',
      agent_id: workerId,
      conversationId,
      messageId: randomUUID(),
      parentMessageId: '00000000-0000-0000-0000-000000000000',
      isNewConvo: true,
      text: `E2E_MISSION_ORACLE_JSON:${mission.missionId}`,
      orchestratorMission: { mission: mission.mission, plannerContext: mission.plannerContext },
    },
    timeout: 60_000,
  });
  expect(admitted.status(), 'authenticated native mission admission').toBe(200);
  const start = (await admitted.json()) as MissionRun;
  expect(start.status).toBe('started');
  expect(start.streamId).toBeTruthy();
  const streamId = start.streamId!;
  const stream = await page.request.get(
    `/api/agents/chat/stream/${encodeURIComponent(streamId)}?resume=true`,
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 150_000,
    },
  );
  expect(stream.status(), 'authorized mission SSE read').toBe(200);
  const raw = await stream.text();
  const events: Array<Record<string, unknown>> = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    try {
      const value: unknown = JSON.parse(line.slice(5).trim());
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        events.push(value as Record<string, unknown>);
      }
    } catch {
      // Ignore non-JSON heartbeat lines, never invent successful events.
    }
  }
  expect(events.length, 'native runtime SSE events').toBeGreaterThan(0);
  return { conversationId: start.conversationId || conversationId, streamId, events };
}

async function loadDurableJob(redis: Redis, streamId: string): Promise<JobSnapshot> {
  const keys = await redis.keys(`*stream:{${streamId}}:job`);
  expect(keys, 'one exact Redis job; never infer state from a model reply').toHaveLength(1);
  const fields = await redis.hmget(keys[0], 'status', 'orchestratorPlan', 'missionOracleState');
  return {
    status: fields[0],
    plan: fields[1] ? JSON.parse(fields[1]) : null,
    state: fields[2] ? JSON.parse(fields[2]) : null,
  };
}

/** CI-only, privacy-preserving recovery flags; never logs identities. */
async function getRecoveryGateFlags(redis: Redis, streamId: string) {
  const keys = await redis.keys(`*stream:{${streamId}}:job`);
  if (keys.length !== 1) return { jobFound: false };
  const fields = await redis.hmget(
    keys[0],
    'status',
    'orchestratorPlan',
    'checkpointNamespace',
    'providerDrained',
    'providerExecutionId',
    'providerExecutionStartedId',
    'lastActiveAt',
  );
  const [status, plan, namespace, drained, provider, started, activeAt] = fields;
  return {
    jobFound: true,
    running: status === 'running',
    planned: !!plan,
    namespaced: !!namespace,
    providerUndrained: drained === '0',
    startedProviderMatches: !!provider && provider === started,
    lastActiveAgeSeconds:
      activeAt && Number.isFinite(Number(activeAt))
        ? Math.max(0, Math.round((Date.now() - Number(activeAt)) / 1000))
        : null,
  };
}

/** CI-only Mongo counts: no checkpoint data or credentials in output. */
async function getPersistedCheckpointCounts(streamId: string, namespace: string) {
  const envFile =
    process.env.E2E_RUNTIME_ENV_PATH ||
    path.resolve(__dirname, '../.test-results/runtime-env.json');
  const runtime = JSON.parse(readFileSync(envFile, 'utf8')) as { MONGO_URI?: string };
  if (!runtime.MONGO_URI || !runtime.MONGO_URI.includes('127.0.0.1')) {
    throw new Error('Isolated CI Mongo fixture unavailable');
  }
  if (!/^[0-9]+$/.test(namespace)) throw new Error('Unexpected namespace');
  const mongo = new MongoClient(runtime.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  await mongo.connect();
  try {
    const collection = mongo.db('LibreChat-e2e').collection('agent_checkpoints');
    return {
      totalRows: await collection.countDocuments({}),
      allThreadRows: await collection.countDocuments({ thread_id: streamId }),
      generationRows: await collection.countDocuments({
        thread_id: streamId,
        checkpoint_ns: namespace,
      }),
    };
  } finally {
    await mongo.close();
  }
}

async function waitForOracle(
  redis: Redis,
  streamId: string,
  expectedTaskIds: string[],
  expectedStatus: 'VERIFIED' | 'HUMAN_REVIEW',
): Promise<JobSnapshot> {
  let latest: JobSnapshot | null = null;
  await expect
    .poll(
      async () => {
        latest = await loadDurableJob(redis, streamId);
        return expectedTaskIds.every((taskId) => {
          const verdicts = latest?.state?.results?.[taskId]?.verdicts;
          return verdicts?.length === 1 && verdicts[0].status === expectedStatus;
        });
      },
      { timeout: 45_000, intervals: [300, 500, 1000, 2000] },
    )
    .toBe(true);
  return latest!;
}

test.describe('PR28 native mission Oracle runtime with authenticated host', () => {
  test('worker -> specialist -> verified durable Oracle -> published saved response', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto('/c/new');
    const token = await getAccessToken(page);
    const redis = new Redis(process.env.REDIS_URI || 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: 1,
    });
    let workerId: string | undefined;
    let specialistId: string | undefined;
    try {
      const specialist = await createSavedAgent(page, token, 'Specialist');
      specialistId = specialist.id;
      const worker = await createSavedAgent(page, token, 'Worker', specialist.id);
      workerId = worker.id;
      const mission = makeMission(worker.id, specialist.id, false);
      const run = await startMission(page, token, worker.id, mission);

      const taskIds = [`${mission.taskId}/worker`, `${mission.taskId}/specialist`];
      const job = await waitForOracle(redis, run.streamId, taskIds, 'VERIFIED');
      expect(job.plan?.mission?.missionId).toBe(mission.missionId);
      expect(job.plan?.tasks?.map((task) => [task.key, task.agentId, task.dependsOn])).toEqual([
        ['worker', worker.id, []],
        ['specialist', specialist.id, ['worker']],
      ]);
      const finals = run.events.filter((event) => event.final === true);
      const errors = run.events.filter(
        (event) => event.event === 'error' || event.type === 'error',
      );
      expect(errors, 'accepted mission must have no SSE error').toHaveLength(0);
      expect(finals.length, 'accepted mission must reach publication').toBeGreaterThan(0);
      expect(
        finals.some((event) => responseText(event.responseMessage).includes('{"ok":true}')),
        'published content must match the Oracle-checked candidate',
      ).toBe(true);

      // Mongo readback through the authenticated public API, not merely SSE.
      await expect
        .poll(
          async () => {
            const messages = await requestJson<
              Array<{ isCreatedByUser?: boolean; text?: string; content?: unknown }>
            >(page, {
              path: `/api/messages/${encodeURIComponent(run.conversationId)}`,
              token,
            });
            return messages.some(
              (message) =>
                message.isCreatedByUser === false && responseText(message).includes('{"ok":true}'),
            );
          },
          { timeout: 30_000 },
        )
        .toBe(true);
      await page.reload();
      const saved = await requestJson<
        Array<{ isCreatedByUser?: boolean; text?: string; content?: unknown }>
      >(page, {
        path: `/api/messages/${encodeURIComponent(run.conversationId)}`,
        token,
      });
      expect(
        saved.some(
          (message) =>
            message.isCreatedByUser === false && responseText(message).includes('{"ok":true}'),
        ),
      ).toBe(true);

      // The restart lane uses an external CI-only controller that SIGKILLs just
      // the API process. Mongo and Redis are separate surviving processes.
      if (process.env.E2E_RESTART_CONTROL_PORT) {
        const beforeMessages = await requestJson<
          Array<{ messageId?: string; isCreatedByUser?: boolean; text?: string; content?: unknown }>
        >(page, {
          path: `/api/messages/${encodeURIComponent(run.conversationId)}`,
          token,
        });
        const before = await loadDurableJob(redis, run.streamId);
        const restart = await page.request.post(
          `http://127.0.0.1:${process.env.E2E_RESTART_CONTROL_PORT}/restart`,
          { headers: { 'x-e2e-restart-intent': 'oracle-runtime' }, timeout: 150_000 },
        );
        expect(restart.status(), 'CI-only SIGKILL + API restart must succeed').toBe(200);
        const ids = (await restart.json()) as {
          oldPid: number;
          newPid: number;
          recovered: boolean;
        };
        expect(ids.recovered).toBe(true);
        expect(ids.oldPid).not.toBe(ids.newPid);

        // The old access token must still authorize canonical history and the
        // Redis Oracle result must remain unchanged after a fresh API process.
        const afterMessages = await requestJson<typeof beforeMessages>(page, {
          path: `/api/messages/${encodeURIComponent(run.conversationId)}`,
          token,
        });
        const after = await loadDurableJob(redis, run.streamId);
        const normalize = (messages: typeof beforeMessages) =>
          messages.map((message) => ({
            id: message.messageId,
            author: message.isCreatedByUser,
            response: responseText(message),
          }));
        expect(normalize(afterMessages)).toEqual(normalize(beforeMessages));
        expect(after.state).toEqual(before.state);
        expect(after.plan).toEqual(before.plan);
        expect(
          afterMessages.filter(
            (message) =>
              message.isCreatedByUser === false && responseText(message).includes('{"ok":true}'),
          ),
        ).toHaveLength(1);
        console.log('PR28_ORACLE_RUNTIME_CRASH_RESTART_DURABLE_NO_DUPLICATES=PASS');
      }
      console.log('PR28_ORACLE_RUNTIME_ACCEPT_PERSISTED_PUBLISHED=PASS');
      console.log('PR28_ORACLE_RUNTIME_CHILD_PLAN_AND_VERDICTS=PASS');
      console.log('PR28_ORACLE_RUNTIME_RELOAD_READBACK=PASS');
    } finally {
      if (workerId) await cleanupAgent(page, workerId);
      if (specialistId) await cleanupAgent(page, specialistId);
      await redis.quit();
    }
  });

  test('in-flight SIGKILL retains plan and never publishes an unverified candidate', async ({
    page,
  }) => {
    test.setTimeout(220_000);
    if (!process.env.E2E_RESTART_CONTROL_PORT) {
      test.skip(true, 'Requires the isolated process-restart harness');
    }
    await page.goto('/c/new');
    const token = await getAccessToken(page);
    const redis = new Redis(process.env.REDIS_URI || 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: 1,
    });
    let workerId: string | undefined;
    let specialistId: string | undefined;
    try {
      const specialist = await createSavedAgent(page, token, 'Specialist');
      specialistId = specialist.id;
      const worker = await createSavedAgent(page, token, 'Worker', specialist.id);
      workerId = worker.id;
      const mission = makeMission(worker.id, specialist.id, false);
      const conversationId = randomUUID();

      // Use the existing intentionally slow streaming fixture. Admission
      // succeeds before the output becomes a valid JSON Oracle candidate.
      const admitted = await page.request.post('/api/agents/chat/agents', {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          endpoint: 'agents',
          agent_id: worker.id,
          conversationId,
          messageId: randomUUID(),
          parentMessageId: '00000000-0000-0000-0000-000000000000',
          isNewConvo: true,
          text: `E2E_SLOW_REPLY:oracle-crash-${mission.missionId}`,
          orchestratorMission: { mission: mission.mission, plannerContext: mission.plannerContext },
        },
        timeout: 60_000,
      });
      expect(admitted.status()).toBe(200);
      const started = (await admitted.json()) as MissionRun;
      expect(started.status).toBe('started');
      const streamId = started.streamId;
      expect(streamId).toBeTruthy();
      await expect
        .poll(
          async () => {
            const snapshot = await loadDurableJob(redis, streamId!);
            return (
              snapshot.status === 'running' &&
              snapshot.plan?.mission?.missionId === mission.missionId
            );
          },
          { timeout: 15_000, intervals: [100, 250, 500] },
        )
        .toBe(true);

      const before = await loadDurableJob(redis, streamId!);
      expect(before.state?.results == null || Object.keys(before.state.results).length === 0).toBe(
        true,
      );
      const restart = await page.request.post(
        `http://127.0.0.1:${process.env.E2E_RESTART_CONTROL_PORT}/restart`,
        { headers: { 'x-e2e-restart-intent': 'oracle-runtime' }, timeout: 150_000 },
      );
      expect(restart.status()).toBe(200);
      const after = await loadDurableJob(redis, streamId!);
      expect(after.plan).toEqual(before.plan);
      const messages = await requestJson<
        Array<{ messageId?: string; isCreatedByUser?: boolean; text?: string; content?: unknown }>
      >(page, {
        path: `/api/messages/${encodeURIComponent(conversationId)}`,
        token,
      });
      expect(
        messages.filter(
          (m) => m.isCreatedByUser === false && responseText(m).includes('{"ok":true}'),
        ),
      ).toHaveLength(0);
      expect(new Set(messages.map((m) => m.messageId)).size).toBe(messages.length);
      console.log('PR28_ORACLE_INFLIGHT_CRASH_UNVERIFIED_NOT_PUBLISHED=PASS');
      console.log('PR28_ORACLE_INFLIGHT_RECOVERY_AUTO_RESUME=NOT_PROVEN');
    } finally {
      if (workerId) await cleanupAgent(page, workerId);
      if (specialistId) await cleanupAgent(page, specialistId);
      await redis.quit();
    }
  });

  test('model-only in-flight crash resumes and publishes exactly once without tools', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    if (!process.env.E2E_RESTART_CONTROL_PORT) {
      test.skip(true, 'Requires real API SIGKILL/restart preserving Redis and Mongo');
    }
    await page.goto('/c/new');
    const token = await getAccessToken(page);
    const redis = new Redis(process.env.REDIS_URI || 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: 1,
    });
    let workerId: string | undefined;
    try {
      // Deliberately NO subagent tool, file, skill, or extra executable
      // capability. A dedicated proof checks the safe, original model-only
      // subset without lowering the strict Worker-specialist release gate.
      const worker = await createSavedAgent(page, token, 'Worker');
      workerId = worker.id;
      const mission = makeMission(worker.id, undefined, false);
      const conversationId = randomUUID();
      const admitted = await page.request.post('/api/agents/chat/agents', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-librechat-generation-protocol': '2',
        },
        data: {
          generationProtocolVersion: 2,
          endpoint: 'agents',
          agent_id: worker.id,
          conversationId,
          messageId: randomUUID(),
          parentMessageId: '00000000-0000-0000-0000-000000000000',
          isNewConvo: true,
          text: `E2E_MISSION_ORACLE_DELAYED_JSON:${mission.missionId}`,
          orchestratorMission: { mission: mission.mission, plannerContext: mission.plannerContext },
        },
        timeout: 60_000,
      });
      expect(admitted.status()).toBe(200);
      const started = (await admitted.json()) as MissionRun;
      expect(started.status).toBe('started');
      expect(started.generationProtocolVersion).toBe(2);
      const streamId = started.streamId!;
      expect(streamId).toBeTruthy();
      const keys = await redis.keys(`*stream:{${streamId}}:job`);
      expect(keys).toHaveLength(1);
      const namespace = await redis.hget(keys[0], 'checkpointNamespace');
      expect(namespace).toBeTruthy();
      await expect
        .poll(
          async () =>
            (await getPersistedCheckpointCounts(conversationId, namespace!)).generationRows,
          { timeout: 30_000, intervals: [250, 500, 1000] },
        )
        .toBeGreaterThan(0);
      const preKill = await loadDurableJob(redis, streamId);
      expect(preKill.status).toBe('running');
      expect(Object.keys(preKill.state?.results ?? {})).toHaveLength(0);
      const attestationText = await redis.hget(keys[0], 'nativeMissionCapabilityAttestation');
      const attestation = attestationText
        ? (JSON.parse(attestationText) as { mode?: string })
        : null;
      expect(
        attestation?.mode,
        'original model-only capability must be durable before SIGKILL',
      ).toBe('model_only');

      const restart = await page.request.post(
        `http://127.0.0.1:${process.env.E2E_RESTART_CONTROL_PORT}/restart`,
        { headers: { 'x-e2e-restart-intent': 'oracle-runtime' }, timeout: 150_000 },
      );
      expect(restart.status()).toBe(200);
      const restarted = (await restart.json()) as {
        oldPid: number;
        newPid: number;
        recovered: boolean;
      };
      expect(restarted.recovered).toBe(true);
      expect(restarted.newPid).not.toBe(restarted.oldPid);
      const expectedTask = `${mission.taskId}/main`;
      let observedStatus = 'missing';
      try {
        await expect
          .poll(
            async () => {
              const job = await loadDurableJob(redis, streamId);
              observedStatus = job.status ?? 'missing';
              return (
                job.state?.results?.[expectedTask]?.verdicts?.some(
                  (verdict) => verdict.status === 'VERIFIED',
                ) === true
              );
            },
            {
              timeout: 60_000,
              intervals: [300, 500, 1000, 2500],
              message: 'automatic, originally model-only cold Oracle recovery',
            },
          )
          .toBe(true);
      } catch (error) {
        console.log('PR28_MODEL_ONLY_AUTO_RESUME_STATUS=' + observedStatus);
        console.log(
          'PR28_MODEL_ONLY_POST_SIGKILL_GATES=' +
            JSON.stringify(await getRecoveryGateFlags(redis, streamId)),
        );
        throw error;
      }
      const messages = await requestJson<
        Array<{
          messageId?: string;
          isCreatedByUser?: boolean;
          text?: string;
          content?: unknown;
        }>
      >(page, {
        path: `/api/messages/${encodeURIComponent(conversationId)}`,
        token,
      });
      expect(
        messages.filter(
          (m) => m.isCreatedByUser === false && responseText(m).includes('{"ok":true}'),
        ),
      ).toHaveLength(1);
      expect(new Set(messages.map((m) => m.messageId)).size).toBe(messages.length);
      console.log('PR28_MODEL_ONLY_POST_SIGKILL_ORACLE_PUBLISHED_ONCE=PASS');
    } finally {
      if (workerId) await cleanupAgent(page, workerId);
      await redis.quit();
    }
  });

  test('in-flight crash resumes and publishes the same mission exactly once', async ({ page }) => {
    test.setTimeout(240_000);
    if (!process.env.E2E_RESTART_CONTROL_PORT) {
      test.skip(true, 'Requires API SIGKILL/restart with Redis and Mongo preserved');
    }
    await page.goto('/c/new');
    const token = await getAccessToken(page);
    const redis = new Redis(process.env.REDIS_URI || 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: 1,
    });
    let workerId: string | undefined;
    let specialistId: string | undefined;
    try {
      const specialist = await createSavedAgent(page, token, 'Specialist');
      specialistId = specialist.id;
      // A planned Worker -> specialist graph edge is not an SDK delegation
      // tool invocation. Keep this positive crash-recovery test genuinely
      // model-only, with BOTH saved agent identities and the explicit edge.
      // SDK tool delegation is separately rejected without durable child
      // effect receipts; do not silently strip a previously granted tool.
      const worker = await createSavedAgent(page, token, 'Worker');
      workerId = worker.id;
      const mission = makeMission(worker.id, specialist.id, false);
      const conversationId = randomUUID();
      const admitted = await page.request.post('/api/agents/chat/agents', {
        // Match the real current browser's generation negotiation. A v1 job
        // intentionally has no isolated checkpoint namespace and MUST NOT
        // be auto-replayed as if it were a v2 durable mission.
        headers: {
          Authorization: `Bearer ${token}`,
          'x-librechat-generation-protocol': '2',
        },
        data: {
          generationProtocolVersion: 2,
          endpoint: 'agents',
          agent_id: worker.id,
          conversationId,
          messageId: randomUUID(),
          parentMessageId: '00000000-0000-0000-0000-000000000000',
          isNewConvo: true,
          text: `E2E_MISSION_ORACLE_DELAYED_JSON:${mission.missionId}`,
          orchestratorMission: { mission: mission.mission, plannerContext: mission.plannerContext },
        },
        timeout: 60_000,
      });
      expect(admitted.status()).toBe(200);
      const start = (await admitted.json()) as MissionRun;
      expect(start.status).toBe('started');
      expect(start.generationProtocolVersion, 'native mission must negotiate protocol v2').toBe(2);
      expect(start.streamId).toBeTruthy();
      const streamId = start.streamId!;
      await expect
        .poll(
          async () => {
            const job = await loadDurableJob(redis, streamId);
            return (
              job.status === 'running' &&
              job.plan?.mission?.missionId === mission.missionId &&
              Object.keys(job.state?.results ?? {}).length === 0
            );
          },
          { timeout: 15_000, intervals: [100, 200, 300] },
        )
        .toBe(true);

      const beforeKill = await getRecoveryGateFlags(redis, streamId);
      console.log('PR28_PRE_SIGKILL_RECOVERY_GATES=' + JSON.stringify(beforeKill));
      expect(
        beforeKill.namespaced,
        'protocol v2 must create an isolated checkpoint namespace',
      ).toBe(true);
      const jobKeys = await redis.keys('*stream:{' + streamId + '}:job');
      const namespace = await redis.hget(jobKeys[0], 'checkpointNamespace');
      expect(namespace).toBeTruthy();
      // Distinguish an *early* SIGKILL (before LangGraph has committed any
      // state) from a mid-graph SIGKILL that ought to be checkpoint-resumable.
      // The other crash test continues to cover fail-closed early abortion.
      await expect
        .poll(
          async () =>
            (await getPersistedCheckpointCounts(conversationId, namespace!)).generationRows,
          {
            timeout: 30_000,
            intervals: [250, 500, 1000],
            message: 'first real generation-scoped graph checkpoint before mid-flight SIGKILL',
          },
        )
        .toBeGreaterThan(0);
      const durablePreKill = await loadDurableJob(redis, streamId);
      expect(durablePreKill.status).toBe('running');
      expect(Object.keys(durablePreKill.state?.results ?? {})).toHaveLength(0);
      expect(
        durablePreKill.plan?.tasks?.map((task) => [task.key, task.agentId, task.dependsOn]),
      ).toEqual([
        ['worker', worker.id, []],
        ['specialist', specialist.id, ['worker']],
      ]);
      const originalCapabilityText = await redis.hget(
        jobKeys[0],
        'nativeMissionCapabilityAttestation',
      );
      expect(
        originalCapabilityText,
        'durable original model-only capabilities before SIGKILL',
      ).toBeTruthy();
      expect(JSON.parse(originalCapabilityText!)?.mode).toBe('model_only');
      console.log(
        'PR28_PRE_SIGKILL_MONGO_CHECKPOINT_COUNTS=' +
          JSON.stringify(await getPersistedCheckpointCounts(conversationId, namespace!)),
      );

      const restart = await page.request.post(
        `http://127.0.0.1:${process.env.E2E_RESTART_CONTROL_PORT}/restart`,
        { headers: { 'x-e2e-restart-intent': 'oracle-runtime' }, timeout: 150_000 },
      );
      expect(restart.status(), 'the API process must genuinely restart').toBe(200);
      const restarted = (await restart.json()) as {
        oldPid: number;
        newPid: number;
        recovered: boolean;
      };
      expect(restarted.recovered).toBe(true);
      expect(restarted.newPid).not.toBe(restarted.oldPid);

      // RELEASE CONDITION: no new user request, no manual tool or replay action.
      // The replacement host must continue the previous authorized mission and
      // publish only AFTER both task-level Oracle verdicts become durable.
      const expectedTasks = [`${mission.taskId}/worker`, `${mission.taskId}/specialist`];
      let observedStatus = 'unknown';
      try {
        await expect
          .poll(
            async () => {
              const job = await loadDurableJob(redis, streamId);
              observedStatus = job.status ?? 'missing';
              return expectedTasks.every(
                (taskId) =>
                  job.state?.results?.[taskId]?.verdicts?.every(
                    (verdict) => verdict.status === 'VERIFIED',
                  ) === true && (job.state.results[taskId].verdicts?.length ?? 0) > 0,
              );
            },
            {
              timeout: 55_000,
              intervals: [500, 1000, 2500],
              message: 'post-SIGKILL automatic Oracle mission continuation',
            },
          )
          .toBe(true);
      } catch (error) {
        console.log(`PR28_AUTO_RESUME_UNPROVEN_JOB_STATUS=${observedStatus}`);
        console.log(
          'PR28_POST_SIGKILL_RECOVERY_GATES=' +
            JSON.stringify(await getRecoveryGateFlags(redis, streamId)),
        );
        console.log(
          'PR28_POST_SIGKILL_MONGO_CHECKPOINT_COUNTS=' +
            JSON.stringify(await getPersistedCheckpointCounts(conversationId, namespace!)),
        );
        throw error;
      }

      const messages = await requestJson<
        Array<{
          messageId?: string;
          isCreatedByUser?: boolean;
          text?: string;
          content?: unknown;
        }>
      >(page, {
        path: `/api/messages/${encodeURIComponent(conversationId)}`,
        token,
      });
      expect(
        messages.filter(
          (m) => m.isCreatedByUser === false && responseText(m).includes('{"ok":true}'),
        ),
      ).toHaveLength(1);
      expect(new Set(messages.map((m) => m.messageId)).size).toBe(messages.length);
      console.log('PR28_ORACLE_INFLIGHT_AUTO_RESUME_EXACTLY_ONCE=PASS');
    } finally {
      if (workerId) await cleanupAgent(page, workerId);
      if (specialistId) await cleanupAgent(page, specialistId);
      await redis.quit();
    }
  });

  test('human-review Oracle verdict blocks candidate publication', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/c/new');
    const token = await getAccessToken(page);
    const redis = new Redis(process.env.REDIS_URI || 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: 1,
    });
    let workerId: string | undefined;
    try {
      const worker = await createSavedAgent(page, token, 'Worker');
      workerId = worker.id;
      const mission = makeMission(worker.id, undefined, true);
      const run = await startMission(page, token, worker.id, mission);
      await waitForOracle(redis, run.streamId, [`${mission.taskId}/main`], 'HUMAN_REVIEW');
      const finals = run.events.filter((event) => event.final === true);
      expect(
        finals.some((event) => responseText(event.responseMessage).includes('{"ok":true}')),
        'review-required candidate must never be published',
      ).toBe(false);
      console.log('PR28_ORACLE_RUNTIME_HUMAN_REVIEW_BLOCK=PASS');
    } finally {
      if (workerId) await cleanupAgent(page, workerId);
      await redis.quit();
    }
  });
});
