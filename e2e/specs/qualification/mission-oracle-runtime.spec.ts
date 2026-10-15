import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import Redis from 'ioredis';
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

async function waitForOracle(
  redis: Redis,
  streamId: string,
  expectedTaskIds: string[],
  expectedStatus: 'VERIFIED' | 'HUMAN_REVIEW',
): Promise<JobSnapshot> {
  let latest: JobSnapshot | null = null;
  await expect.poll(
    async () => {
      latest = await loadDurableJob(redis, streamId);
      return expectedTaskIds.every((taskId) => {
        const verdicts = latest?.state?.results?.[taskId]?.verdicts;
        return verdicts?.length === 1 && verdicts[0].status === expectedStatus;
      });
    },
    { timeout: 45_000, intervals: [300, 500, 1000, 2000] },
  ).toBe(true);
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
      const errors = run.events.filter((event) => event.event === 'error' || event.type === 'error');
      expect(errors, 'accepted mission must have no SSE error').toHaveLength(0);
      expect(finals.length, 'accepted mission must reach publication').toBeGreaterThan(0);
      expect(
        finals.some((event) => responseText(event.responseMessage).includes('{"ok":true}')),
        'published content must match the Oracle-checked candidate',
      ).toBe(true);

      // Mongo readback through the authenticated public API, not merely SSE.
      await expect.poll(async () => {
        const messages = await requestJson<Array<{ isCreatedByUser?: boolean; text?: string; content?: unknown }>>(page, {
          path: `/api/messages/${encodeURIComponent(run.conversationId)}`,
          token,
        });
        return messages.some(
          (message) => message.isCreatedByUser === false && responseText(message).includes('{"ok":true}'),
        );
      }, { timeout: 30_000 }).toBe(true);
      await page.reload();
      const saved = await requestJson<Array<{ isCreatedByUser?: boolean; text?: string; content?: unknown }>>(page, {
        path: `/api/messages/${encodeURIComponent(run.conversationId)}`,
        token,
      });
      expect(saved.some((message) => message.isCreatedByUser === false && responseText(message).includes('{"ok":true}'))).toBe(true);

      // The restart lane uses an external CI-only controller that SIGKILLs just
      // the API process. Mongo and Redis are separate surviving processes.
      if (process.env.E2E_RESTART_CONTROL_PORT) {
        const beforeMessages = await requestJson<Array<{ messageId?: string; isCreatedByUser?: boolean; text?: string; content?: unknown }>>(page, {
          path: `/api/messages/${encodeURIComponent(run.conversationId)}`,
          token,
        });
        const before = await loadDurableJob(redis, run.streamId);
        const restart = await page.request.post(
          `http://127.0.0.1:${process.env.E2E_RESTART_CONTROL_PORT}/restart`,
          { headers: { 'x-e2e-restart-intent': 'oracle-runtime' }, timeout: 150_000 },
        );
        expect(restart.status(), 'CI-only SIGKILL + API restart must succeed').toBe(200);
        const ids = (await restart.json()) as { oldPid: number; newPid: number; recovered: boolean };
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
          messages.map((message) => ({ id: message.messageId, author: message.isCreatedByUser, response: responseText(message) }));
        expect(normalize(afterMessages)).toEqual(normalize(beforeMessages));
        expect(after.state).toEqual(before.state);
        expect(after.plan).toEqual(before.plan);
        expect(afterMessages.filter((message) =>
          message.isCreatedByUser === false && responseText(message).includes('{"ok":true}'),
        )).toHaveLength(1);
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


  test('in-flight SIGKILL retains plan and never publishes an unverified candidate', async ({ page }) => {
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
      await expect.poll(async () => {
        const snapshot = await loadDurableJob(redis, streamId!);
        return snapshot.status === 'running' && snapshot.plan?.mission?.missionId === mission.missionId;
      }, { timeout: 15_000, intervals: [100, 250, 500] }).toBe(true);

      const before = await loadDurableJob(redis, streamId!);
      expect(before.state?.results == null || Object.keys(before.state.results).length === 0).toBe(true);
      const restart = await page.request.post(
        `http://127.0.0.1:${process.env.E2E_RESTART_CONTROL_PORT}/restart`,
        { headers: { 'x-e2e-restart-intent': 'oracle-runtime' }, timeout: 150_000 },
      );
      expect(restart.status()).toBe(200);
      const after = await loadDurableJob(redis, streamId!);
      expect(after.plan).toEqual(before.plan);
      const messages = await requestJson<Array<{ messageId?: string; isCreatedByUser?: boolean; text?: string; content?: unknown }>>(page, {
        path: `/api/messages/${encodeURIComponent(conversationId)}`,
        token,
      });
      expect(messages.filter((m) => m.isCreatedByUser === false && responseText(m).includes('{"ok":true}'))).toHaveLength(0);
      expect(new Set(messages.map((m) => m.messageId)).size).toBe(messages.length);
      console.log('PR28_ORACLE_INFLIGHT_CRASH_UNVERIFIED_NOT_PUBLISHED=PASS');
      console.log('PR28_ORACLE_INFLIGHT_RECOVERY_AUTO_RESUME=NOT_PROVEN');
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
