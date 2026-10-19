'use strict';
// CI-only disposable OpenAI-compatible embeddings service. Never used by production.
const http = require('node:http');
if (process.env.CI !== 'true' || process.env.CI_EMBEDDINGS_MOCK_ONLY !== 'true') {
  throw new Error('CI_ONLY_EMBEDDINGS_REFUSED');
}
const PORT = 8118;
http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }
  if (req.method !== 'POST' || req.url !== '/v1/embeddings') {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk.toString('utf8');
      if (raw.length > 2 * 1024 * 1024) throw Error('payload too large');
    }
    const body = JSON.parse(raw);
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    if (inputs.length < 1 || inputs.length > 64) throw Error('bad input');
    const data = inputs.map((input, index) => {
      if (typeof input !== 'string') throw Error('CI_EMBEDDINGS_RAW_TEXT_REQUIRED');
      const text = input;
      const floats = new Float32Array(1536);
      floats[/ORANGE-17/i.test(text) ? 0 : 1] = 1;
      const encoding = body.encoding_format === 'base64'
        ? Buffer.from(floats.buffer).toString('base64')
        : Array.from(floats);
      return { object: 'embedding', index, embedding: encoding };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      object: 'list', data, model: String(body.model || 'ci-embedding'),
      usage: { prompt_tokens: inputs.length, total_tokens: inputs.length }
    }));
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end('{"error":{"message":"CI embedding input rejected","type":"invalid_request_error"}}');
  }
}).listen(PORT, '0.0.0.0', () => console.log('CI_LOCAL_EMBEDDINGS_READY=PASS'));
