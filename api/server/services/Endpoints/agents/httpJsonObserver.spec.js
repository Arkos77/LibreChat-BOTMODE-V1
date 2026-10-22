const { createServer } = require('node:http');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { mkdtemp, readFile, stat, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { compareHttpOracle } = require(
  path.resolve(__dirname, '../../../../../scripts/botmode/ci-compare-http-oracle.cjs'),
);
const { installJsonObserver, responseSummary, describeContent } = require(
  path.resolve(__dirname, '../../../../../scripts/botmode/ci-http-json-observer.cjs'),
);

describe('bounded read-only HTTP JSON observation', () => {
  it.each(['same-invalid', 'changed', 'same-valid', 'ambiguous'])(
    'attributes only observed wire matches for %s without exposing candidate or task ids',
    (mode) => {
      const candidate = mode === 'same-valid' ? '{"ok":true}' : 'private-canary-invalid';
      const matched = {
        status: 200,
        request: { jsonObjectRequested: true, requireParameters: true },
        response: { content: describeContent(candidate) },
      };
      const records =
        mode === 'changed'
          ? [{ ...matched, response: { content: describeContent('different') } }]
          : mode === 'ambiguous'
            ? [matched, matched]
            : [matched];
      const result = compareHttpOracle({
        plan: { tasks: [{ key: 'worker', taskId: 'private-task-id' }] },
        state: {
          results: {
            'private-task-id': {
              verdicts: [
                { status: mode === 'same-valid' ? 'VERIFIED' : 'REJECTED', input: { candidate } },
              ],
            },
          },
        },
        records,
      });
      expect(result.stages[0].boundary).toBe(
        mode === 'changed'
          ? 'HTTP_TO_ORACLE_CHANGED_OR_UNOBSERVED'
          : mode === 'same-valid'
            ? 'VERIFIED_JSON_OBJECT'
            : 'HTTP_RESPONSE_NOT_JSON',
      );
      expect(result.stages[0].wireMatchCount).toBe(
        mode === 'changed' ? 0 : mode === 'ambiguous' ? 2 : 1,
      );
      expect(result.stages[0].uniqueWireMatch).toBe(
        mode === 'same-invalid' || mode === 'same-valid',
      );
      expect(JSON.stringify(result)).not.toContain('private-canary');
      expect(JSON.stringify(result)).not.toContain('private-task-id');
    },
  );
  it('bounds UTF-8 request bytes rather than JavaScript string length', async () => {
    const records = [];
    const server = createServer((_req, res) =>
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"choices":[]}'),
    );
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
    const body = JSON.stringify({ model: 'fixture', content: 'é'.repeat(50) });
    expect(body.length).toBeLessThan(120);
    expect(Buffer.byteLength(body, 'utf8')).toBeGreaterThan(120);
    const observer = installJsonObserver({
      urls: [url],
      models: ['fixture'],
      maxBytes: 120,
      onRecord: (record) => records.push(record),
    });
    try {
      const response = await fetch(url, { method: 'POST', body });
      expect(await response.text()).toBe('{"choices":[]}');
      await observer.flush();
      expect(records[0].requestUnobserved).toBe(true);
      expect(records[0].request).toBeUndefined();
    } finally {
      await observer.flush();
      observer.restore();
      await new Promise((resolve) => server.close(resolve));
    }
  });
  it('preloads in a separate Node process and writes only a private bounded trace', async () => {
    const temp = await mkdtemp(path.join(tmpdir(), 'botmode-wire-'));
    const file = path.join(temp, 'trace.jsonl');
    const server = createServer((_req, res) =>
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          model: 'fixture',
          choices: [{ index: 0, message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
        }),
      ),
    );
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
    try {
      const preload = path.resolve(
        __dirname,
        '../../../../../scripts/botmode/ci-http-json-observer.cjs',
      );
      await promisify(execFile)(
        process.execPath,
        [
          '--require',
          preload,
          '-e',
          `fetch(process.env.FIXTURE_URL,{method:'POST',headers:{Authorization:'Bearer private-canary'},body:JSON.stringify({model:'fixture',response_format:{type:'json_object'},provider:{require_parameters:true},messages:[{content:'private-canary'}]})}).then(r=>r.json()).then(()=>{}).catch(()=>process.exitCode=1)`,
        ],
        {
          env: {
            ...process.env,
            FIXTURE_URL: url,
            CI_JSON_WIRE_TRACE_FILE: file,
            CI_JSON_WIRE_TRACE_URLS: JSON.stringify([url]),
            CI_JSON_WIRE_TRACE_MODELS: JSON.stringify(['fixture']),
          },
          timeout: 10000,
        },
      );
      const raw = await readFile(file, 'utf8');
      expect(raw).not.toContain('private-canary');
      const record = JSON.parse(raw);
      expect(record.request).toMatchObject({ jsonObjectRequested: true, requireParameters: true });
      expect(record.response.content).toMatchObject({ json: 'object', okExactlyTrue: true });
      expect((await stat(file)).mode & 0o777).toBe(0o600);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await rm(temp, { recursive: true, force: true });
    }
  });
  it('does not retain prompts, keys, reasoning, raw content or unapproved model strings', () => {
    const canary = 'private-canary-do-not-retain';
    const result = responseSummary(
      JSON.stringify({
        model: canary,
        api_key: canary,
        reasoning: canary,
        choices: [
          {
            index: 0,
            message: { content: canary, reasoning_content: canary },
            finish_reason: 'stop',
          },
        ],
      }),
      false,
    );
    expect(JSON.stringify(result)).not.toContain(canary);
    expect(result.model).toBeUndefined();
    expect(result.content).toEqual(describeContent(canary));
    expect(result.finishReason).toBe('stop');
  });

  it('ignores reasoning SSE fields while hashing only the visible candidate', () => {
    const text = [
      'data: ' +
        JSON.stringify({
          model: 'free-model',
          choices: [
            {
              index: 0,
              delta: { reasoning_content: 'private-canary', content: '{"ok":true}' },
              finish_reason: 'stop',
            },
          ],
        }),
      'data: [DONE]',
    ].join('\n\n');
    const result = responseSummary(text, true, new Set(['free-model']));
    expect(result.content).toEqual(describeContent('{"ok":true}'));
    expect(result.model).toBe('free-model');
    expect(JSON.stringify(result)).not.toContain('private-canary');
  });

  it.each(['throwing-sink', 'truncated-response', 'unmatched-route'])(
    'preserves the original HTTP response for %s',
    async (mode) => {
      const records = [];
      const content = JSON.stringify({
        choices: [{ index: 0, message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
      });
      const server = createServer((_req, res) =>
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(content),
      );
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const url = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
      const observer = installJsonObserver({
        urls: mode === 'unmatched-route' ? [] : [url],
        models: ['fixture'],
        maxBytes: mode === 'truncated-response' ? 8 : 256 * 1024,
        onRecord: (record) => {
          if (mode === 'throwing-sink') throw new Error('sink failed');
          records.push(record);
        },
      });
      try {
        const response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify({ model: 'fixture', messages: [{ content: 'private-canary' }] }),
        });
        expect(await response.text()).toBe(content);
        await observer.flush();
        if (mode === 'unmatched-route') expect(records).toHaveLength(0);
        if (mode === 'truncated-response') {
          expect(records).toHaveLength(1);
          expect(records[0].truncated).toBe(true);
          expect(records[0].response).toBeUndefined();
          expect(records[0].requestUnobserved).toBe(true);
        }
        expect(JSON.stringify(records)).not.toContain('private-canary');
      } finally {
        await observer.flush();
        observer.restore();
        await new Promise((resolve) => server.close(resolve));
      }
    },
  );

  it('keeps the original transport error even when the observation sink fails', async () => {
    const original = globalThis.fetch;
    const error = new Error('transport-only-fixture');
    globalThis.fetch = async () => {
      throw error;
    };
    const observer = installJsonObserver({
      urls: ['http://fixture.invalid/v1/chat/completions'],
      models: ['fixture'],
      onRecord: () => {
        throw new Error('sink failed');
      },
    });
    try {
      await expect(
        fetch('http://fixture.invalid/v1/chat/completions', { method: 'POST', body: '{}' }),
      ).rejects.toBe(error);
    } finally {
      observer.restore();
      globalThis.fetch = original;
    }
  });
});
