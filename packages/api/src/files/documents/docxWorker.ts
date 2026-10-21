import { Worker } from 'node:worker_threads';

/**
 * Execute Mammoth outside the API event loop. Queue is process-local and
 * intentionally fail-closed: do not retain arbitrarily many uploaded buffers.
 */
const MAX_ACTIVE = 2;
const MAX_PENDING = 8;
const TIMEOUT_MS = 20_000;
let active = 0;
const pending: Array<() => void> = [];

export class DocxBusyError extends Error {
  readonly code = 'DOCX_BUSY';
  constructor() {
    super('DOCX conversion capacity exceeded');
    this.name = 'DocxBusyError';
  }
}

export class DocxTimeoutError extends Error {
  readonly code = 'DOCX_TIMEOUT';
  constructor() {
    super('DOCX conversion exceeded its execution deadline');
    this.name = 'DocxTimeoutError';
  }
}

async function acquire(): Promise<void> {
  if (active < MAX_ACTIVE) {
    active++;
    return;
  }
  if (pending.length >= MAX_PENDING) {
    throw new DocxBusyError();
  }
  await new Promise<void>((resolve) => pending.push(resolve));
}

function release(): void {
  const next = pending.shift();
  if (next) {
    next();
  } else {
    active--;
  }
}

/** Do not export the underlying worker; the caller receives only text. */
export async function convertDocxWithWorker(
  buffer: Buffer,
  mode: 'text' | 'html',
  styleMap?: string[],
): Promise<string> {
  await acquire();
  try {
    // require.resolve resolves from the API package, not from the eval worker.
    const mammothPath = require.resolve('mammoth');
    const code = `
      const { parentPort, workerData } = require('node:worker_threads');
      (async () => {
        const mammoth = require(workerData.mammothPath);
        const source = Buffer.from(workerData.bytes);
        const result = workerData.mode === 'html'
          ? await mammoth.convertToHtml({ buffer: source }, { styleMap: workerData.styleMap })
          : await mammoth.extractRawText({ buffer: source });
        parentPort.postMessage({ ok: true, value: result.value });
      })().catch(error => {
        parentPort.postMessage({ ok: false, error: String(error && error.message || error) });
      });
    `;
    return await new Promise<string>((resolve, reject) => {
      const worker = new Worker(code, {
        eval: true,
        workerData: { mammothPath, bytes: buffer, mode, styleMap },
        resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 64 },
      });
      let settled = false;
      const finish = (error?: Error, value?: string, alreadyExited = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Keep the concurrency slot occupied until termination completes.
        const stopped = alreadyExited
          ? Promise.resolve()
          : worker.terminate().then(() => undefined);
        void stopped.then(
          () => (error ? reject(error) : resolve(value ?? '')),
          (terminationError: Error) => reject(terminationError),
        );
      };
      const timer = setTimeout(() => finish(new DocxTimeoutError()), TIMEOUT_MS);
      worker.once('message', (message: { ok: boolean; value?: string; error?: string }) => {
        if (message.ok && typeof message.value === 'string') finish(undefined, message.value);
        else finish(new Error(message.error || 'DOCX conversion failed'));
      });
      worker.once('error', (error) => finish(error));
      worker.once('exit', (code) => {
        if (!settled) {
          finish(new Error(`DOCX worker exited unexpectedly: ${code}`), undefined, true);
        }
      });
    });
  } finally {
    release();
  }
}
