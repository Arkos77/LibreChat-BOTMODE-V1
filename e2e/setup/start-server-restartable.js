// CI-only process-control harness: the MongoDB and Redis stores outlive the
// LibreChat API process. Never enable this endpoint outside isolated E2E jobs.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { MongoMemoryServer } = require('mongodb-memory-server');

const root = path.resolve(__dirname, '../..');
const serverPath = path.resolve(__dirname, 'start-server.js');
const baseURL = new URL(process.env.E2E_BASE_URL || 'http://localhost:3080');
const appPort = Number(process.env.E2E_PORT || baseURL.port || 3080);
const controlPort = Number(process.env.E2E_RESTART_CONTROL_PORT || 8979);
const runtimeEnvPath =
  process.env.E2E_RUNTIME_ENV_PATH ||
  path.resolve(__dirname, '../specs/.test-results/runtime-env.json');
if (
  baseURL.protocol !== 'http:' ||
  !Number.isInteger(appPort) ||
  !Number.isInteger(controlPort) ||
  appPort < 1024 ||
  controlPort < 1024 ||
  appPort === controlPort
) {
  throw new Error('Invalid isolated E2E process-control topology');
}

let mongoServer;
let child;
let controller;
let shuttingDown = false;
let restarting = false;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ready() {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${appPort}/readyz`, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.setTimeout(500, () => request.destroy());
    request.once('error', () => resolve(false));
  });
}

async function waitUntilReady(expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await ready()) === expected) return;
    await wait(150);
  }
  throw new Error(`API readiness never became ${expected}`);
}

function startChild(mongoUri) {
  const started = spawn(process.execPath, [serverPath], {
    cwd: root,
    env: {
      ...process.env,
      MONGO_URI: mongoUri,
      E2E_USE_MEMORY_MONGO: 'false',
      HOST: '127.0.0.1',
      PORT: String(appPort),
    },
    stdio: 'inherit',
  });
  started.once('exit', (code, signal) => {
    if (!shuttingDown && !restarting) {
      console.error(`[e2e-restart] Unexpected API exit: ${signal || code}`);
      void shutdown(1);
    }
  });
  child = started;
  return started;
}

async function stopChildAbruptly() {
  const active = child;
  if (!active || active.exitCode != null || active.signalCode != null) {
    throw new Error('No live API process to crash');
  }
  await new Promise((resolve, reject) => {
    active.once('exit', resolve);
    if (!active.kill('SIGKILL')) reject(new Error('Failed to signal live API process'));
  });
  await waitUntilReady(false, 15000);
  child = undefined;
  return active.pid;
}

async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (controller) controller.close();
  if (child && child.exitCode == null && child.signalCode == null) {
    child.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), wait(10000)]);
    if (child.exitCode == null && child.signalCode == null) child.kill('SIGKILL');
  }
  if (mongoServer) await mongoServer.stop();
  process.exit(code);
}

async function main() {
  mongoServer = await MongoMemoryServer.create({
    instance: { dbName: 'LibreChat-e2e', ip: '127.0.0.1' },
  });
  const mongoUri = new URL('LibreChat-e2e', mongoServer.getUri()).toString();
  fs.mkdirSync(path.dirname(runtimeEnvPath), { recursive: true });
  fs.writeFileSync(runtimeEnvPath, JSON.stringify({ MONGO_URI: mongoUri }));
  console.log('[e2e-restart] Persistent isolated Mongo fixture initialized');

  startChild(mongoUri);
  await waitUntilReady(true, 120000);

  controller = http.createServer((request, response) => {
    const json = (status, payload) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(payload));
    };
    if (request.method === 'GET' && request.url === '/state') {
      json(200, { apiPid: child?.pid, ready: child?.exitCode == null });
      return;
    }
    if (request.method !== 'POST' || request.url !== '/restart' ||
        request.headers['x-e2e-restart-intent'] !== 'oracle-runtime') {
      json(404, { error: 'not found' });
      return;
    }
    if (restarting || shuttingDown) {
      json(409, { error: 'restart already active' });
      return;
    }
    restarting = true;
    void (async () => {
      try {
        const previousPid = await stopChildAbruptly();
        startChild(mongoUri);
        await waitUntilReady(true, 120000);
        if (child.pid === previousPid) throw new Error('API PID did not change');
        console.log(`[e2e-restart] SIGKILL API pid=${previousPid}; recovered pid=${child.pid}`);
        json(200, { oldPid: previousPid, newPid: child.pid, recovered: true });
      } catch (error) {
        console.error('[e2e-restart] Could not restore API process', error);
        json(500, { error: 'restart failed' });
      } finally {
        restarting = false;
      }
    })();
  });
  controller.listen(controlPort, '127.0.0.1', () => {
    console.log(`[e2e-restart] Test-only control on 127.0.0.1:${controlPort}`);
  });
}

process.once('SIGINT', () => void shutdown(130));
process.once('SIGTERM', () => void shutdown(143));
main().catch((error) => {
  console.error('[e2e-restart] Bootstrap failure', error);
  void shutdown(1);
});
