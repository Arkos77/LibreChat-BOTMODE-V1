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

function responseCollector(streaming, allowedModels, maxBytes = Infinity) {
  let content = '';
  let contentBytes = 0;
  let model;
  let finishReason;
  let protocolError = false;
  return {
    consume(payload) {
      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        protocolError = true;
        return;
      }
      if (typeof parsed?.model === 'string' && allowedModels.has(parsed.model))
        model = parsed.model;
      const choice = parsed?.choices?.find((item) => item.index === 0);
      const delta = streaming ? choice?.delta?.content : choice?.message?.content;
      if (typeof delta === 'string') {
        contentBytes += Buffer.byteLength(delta, 'utf8');
        // JSON deltas may split a surrogate pair: together it encodes as four bytes,
        // whereas counting each isolated surrogate accounts for six replacement bytes.
        const previous = content.charCodeAt(content.length - 1);
        const next = delta.charCodeAt(0);
        if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
          contentBytes -= 2;
        }
        if (contentBytes > maxBytes) throw new Error('OBSERVATION_BOUND');
        content += delta;
      }
      if (
        ['stop', 'length', 'tool_calls', 'content_filter', 'error'].includes(choice?.finish_reason)
      ) {
        finishReason = choice.finish_reason;
      }
    },
    result: () => ({ model, finishReason, protocolError, content: describeContent(content) }),
  };
}

function responseSummary(text, streaming, allowedModels = new Set()) {
  const collector = responseCollector(streaming, allowedModels);
  if (streaming) {
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload && payload !== '[DONE]') collector.consume(payload);
    }
  } else collector.consume(text);
  return collector.result();
}

// Keep only one bounded SSE line plus bounded visible output, never the full stream.
function sseCollector(allowedModels, maxBytes) {
  const decoder = new (require('node:string_decoder').StringDecoder)('utf8');
  const collector = responseCollector(true, allowedModels, maxBytes);
  let line = '';
  let lineBytes = 0;
  function consume(text) {
    let start = 0;
    for (let i = 0; i <= text.length; i++) {
      if (i !== text.length && text[i] !== '\n') continue;
      const part = text.slice(start, i);
      lineBytes += Buffer.byteLength(part, 'utf8');
      if (lineBytes > maxBytes) throw new Error('OBSERVATION_BOUND');
      line += part;
      if (i !== text.length) {
        if (line.startsWith('data:')) {
          const payload = line.slice(5).trim();
          if (payload && payload !== '[DONE]') collector.consume(payload);
        }
        line = '';
        lineBytes = 0;
      }
      start = i + 1;
    }
  }
  return {
    push: (chunk) => consume(decoder.write(chunk)),
    finish() {
      consume(decoder.end() + '\n');
      return collector.result();
    },
  };
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
      const streaming = clone.headers.get('content-type')?.includes('text/event-stream') === true;
      const stream = streaming ? sseCollector(allowedResponseModels, maxBytes) : undefined;
      try {
        if (reader) {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            if (stream) {
              stream.push(Buffer.from(next.value));
            } else {
              bytes += next.value.byteLength;
              if (bytes > maxBytes) throw new Error('OBSERVATION_BOUND');
              chunks.push(Buffer.from(next.value));
            }
          }
        }
        if (!record.truncated) {
          record.response = stream
            ? stream.finish()
            : responseSummary(Buffer.concat(chunks).toString('utf8'), false, allowedResponseModels);
        }
      } catch (error) {
        if (error.message === 'OBSERVATION_BOUND') record.truncated = true;
        else record.observationError = true;
        void reader?.cancel().catch(() => {});
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
