const { createHash } = require('node:crypto');
const { appendFileSync } = require('node:fs');

function describeContent(content) {
  const result = {
    length: content.length,
    sha256: createHash('sha256').update(content).digest('hex'),
    json: 'invalid',
  };
  try {
    const parsed = JSON.parse(content);
    result.json =
      parsed !== null && !Array.isArray(parsed) && typeof parsed === 'object' ? 'object' : 'other';
    result.okExactlyTrue = result.json === 'object' && parsed.ok === true;
  } catch (error) {
    const match = /position (\d+)/.exec(error.message);
    if (match) result.parseErrorOffset = Number(match[1]);
  }
  return result;
}

function responseSummary(text, streaming, allowedModels = new Set()) {
  const payloads = streaming
    ? text
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .filter((line) => line && line !== '[DONE]')
    : [text];
  let content = '';
  let model;
  let finishReason;
  let protocolError = false;
  for (const payload of payloads) {
    try {
      const parsed = JSON.parse(payload);
      if (typeof parsed.model === 'string' && allowedModels.has(parsed.model)) model = parsed.model;
      const choice = parsed.choices?.find((item) => item.index === 0);
      const delta = streaming ? choice?.delta?.content : choice?.message?.content;
      if (typeof delta === 'string') content += delta;
      if (
        ['stop', 'length', 'tool_calls', 'content_filter', 'error'].includes(choice?.finish_reason)
      ) {
        finishReason = choice.finish_reason;
      }
    } catch {
      protocolError = true;
    }
  }
  return { model, finishReason, protocolError, content: describeContent(content) };
}

function installJsonObserver({
  urls,
  models,
  responseModels = models,
  onRecord,
  maxBytes = 256 * 1024,
}) {
  const allowedUrls = new Set(urls);
  const allowedModels = new Set(models);
  const allowedResponseModels = new Set(responseModels);
  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== 'function') throw new Error('JSON_TRACE_FETCH_UNAVAILABLE');
  const pending = new Set();
  let sequence = 0;
  const wrapped = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!allowedUrls.has(url) || (init?.method ?? input?.method ?? 'GET') !== 'POST') {
      return originalFetch(input, init);
    }
    const record = { kind: 'CI_JSON_WIRE_TRACE', sequence: ++sequence };
    try {
      if (typeof init?.body !== 'string' || Buffer.byteLength(init.body, 'utf8') > maxBytes)
        throw new Error('UNOBSERVED_REQUEST');
      const body = JSON.parse(init.body);
      record.request = {
        model: allowedModels.has(body?.model) ? body.model : 'OTHER_OR_UNOBSERVED',
        jsonObjectRequested: body?.response_format?.type === 'json_object',
        requireParameters: body?.provider?.require_parameters === true,
        streaming: body?.stream === true,
      };
    } catch {
      record.requestUnobserved = true;
    }
    let response;
    try {
      response = await originalFetch(input, init);
    } catch (error) {
      try {
        onRecord({ ...record, transportError: true });
      } catch {}
      throw error;
    }
    record.status = response.status;
    let clone;
    try {
      clone = response.clone();
    } catch {
      try {
        onRecord({ ...record, observationError: true });
      } catch {}
      return response;
    }
    const observation = (async () => {
      const reader = clone.body?.getReader();
      let bytes = 0;
      const chunks = [];
      try {
        if (reader) {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            bytes += next.value.byteLength;
            if (bytes > maxBytes) {
              record.truncated = true;
              void reader.cancel().catch(() => {});
              break;
            }
            chunks.push(Buffer.from(next.value));
          }
        }
        if (!record.truncated) {
          record.response = responseSummary(
            Buffer.concat(chunks).toString('utf8'),
            clone.headers.get('content-type')?.includes('text/event-stream') === true,
            allowedResponseModels,
          );
        }
      } catch {
        record.observationError = true;
      }
      try {
        onRecord(record);
      } catch {
        /* Observation cannot change model execution. */
      }
    })();
    pending.add(observation);
    void observation.finally(() => pending.delete(observation));
    return response;
  };
  globalThis.fetch = wrapped;
  return {
    flush: () => Promise.all([...pending]),
    restore: () => {
      if (globalThis.fetch === wrapped) globalThis.fetch = originalFetch;
    },
  };
}

module.exports = { installJsonObserver, describeContent, responseSummary };

if (process.env.CI_JSON_WIRE_TRACE_FILE) {
  installJsonObserver({
    urls: JSON.parse(process.env.CI_JSON_WIRE_TRACE_URLS ?? '[]'),
    models: JSON.parse(process.env.CI_JSON_WIRE_TRACE_MODELS ?? '[]'),
    responseModels: JSON.parse(
      process.env.CI_JSON_WIRE_TRACE_RESPONSE_MODELS ??
        process.env.CI_JSON_WIRE_TRACE_MODELS ??
        '[]',
    ),
    onRecord: (record) =>
      appendFileSync(process.env.CI_JSON_WIRE_TRACE_FILE, JSON.stringify(record) + '\n', {
        mode: 0o600,
      }),
  });
}
