const { execFileSync } = require('node:child_process');
const { createServer } = require('node:http');
const { initializeAgent } = require('@librechat/api');
const { initializeModel, attemptInvoke } = require('@librechat/agents');
const { HumanMessage } = require('@librechat/agents/langchain/messages');
const path = require('node:path');

// Execute the real config block. Only the public catalog lookup is replaced;
// the test below captures real SDK HTTP requests on loopback, without inference.
function preflightEndpoints(fiveTasks = true) {
  const script = path.resolve(
    __dirname,
    '../../../../../scripts/botmode/ci-live-free-child-preflight.sh',
  );
  const python = `
import io,json,os,tempfile,urllib.request
from pathlib import Path
source=Path(os.environ['PREFLIGHT_SCRIPT']).read_text().split("python3 - <<'PY'\\n",1)[1].split("\\nPY\\n",1)[0]
catalog={'data':[{'id':'google/gemma-4-31b-it:free','pricing':{'prompt':'0','completion':'0'},'supported_parameters':['response_format']}]}
urllib.request.urlopen=lambda *args,**kwargs: io.BytesIO(json.dumps(catalog).encode())
with tempfile.TemporaryDirectory() as tmp:
    os.chdir(tmp)
    Path('librechat.yaml').write_text(json.dumps({'endpoints':{'agents':{},'custom':[{'name':'OpenRouter','apiKey':'fixture-only','baseURL':'https://openrouter.ai/api/v1','addParams':{'temperature':0.1}}]}}))
    Path('.env').write_text('OPENROUTER_KEY=fixture-only\\n')
    source=source.replace('/tmp/botmode-ci-',tmp+'/botmode-ci-')
    Path(tmp+'/botmode-ci-worker-id').write_text('json-fixture-worker')
    Path(tmp+'/botmode-ci-child-id').write_text('json-fixture-specialist')
    Path(tmp+'/botmode-ci-named-free-model').touch()
    exec(compile(source,'real-preflight-config','exec'))
    print('ENDPOINTS='+json.dumps(json.loads(Path('librechat.yaml').read_text())['endpoints']['custom']))
`;
  const output = execFileSync('python3', ['-c', python], {
    env: {
      ...process.env,
      PREFLIGHT_SCRIPT: script,
      OPENROUTER_API_KEY: 'fixture-only-no-network-key',
      CI_LIVE_FREE_FIVE_TASKS: String(fiveTasks),
      CI_LIVE_FREE_COMPAT_FALLBACK_DIAG: 'true',
    },
    encoding: 'utf8',
  });
  return JSON.parse(
    output
      .split('\n')
      .find((line) => line.startsWith('ENDPOINTS='))
      .slice(10),
  );
}

describe('free mission JSON format from preflight to SDK HTTP', () => {
  it('configures JSON mode on primary and cloned fallback without losing other params', () => {
    const endpoints = preflightEndpoints();
    expect(endpoints.map((endpoint) => endpoint.name)).toEqual([
      'OpenRouter',
      'OpenRouterFreeCompatCI',
    ]);
    for (const endpoint of endpoints) {
      expect(endpoint.addParams).toEqual({
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });
    }
  });

  it('leaves the original non-five-task probe parameters unchanged', () => {
    const endpoints = preflightEndpoints(false);
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].addParams).toEqual({ temperature: 0.1 });
  });

  it.each(['OpenRouter', 'OpenRouterFreeCompatCI'])(
    'transmits response_format through native initialization and actual %s SDK HTTP',
    async (name) => {
      const requests = [];
      const server = createServer(async (req, res) => {
        let body = '';
        for await (const chunk of req) body += chunk;
        requests.push(JSON.parse(body));
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            id: 'fixture-json',
            object: 'chat.completion',
            created: 1,
            model: requests[0].model,
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: '{"ok":true}' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        );
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const endpoints = preflightEndpoints();
        for (const endpoint of endpoints)
          endpoint.baseURL = `http://127.0.0.1:${server.address().port}/openrouter/v1`;
        const endpoint = endpoints.find((item) => item.name === name);
        const model = endpoint.models.default[0];
        const initialized = await initializeAgent(
          {
            runtime: {
              user: { id: 'fixture-user' },
              requestBody: {},
              turnStartedAt: 1,
              appConfig: { endpoints: { custom: endpoints } },
            },
            agent: {
              id: 'fixture-agent',
              provider: name,
              model,
              tools: [],
              model_parameters: {
                model,
              },
            },
            allowedProviders: new Set(endpoints.map((item) => item.name)),
            endpointOption: { endpoint: 'agents' },
            loadTools: async () => ({ tools: [], toolDefinitions: [] }),
          },
          {
            getFiles: async () => [],
            getConvoFiles: async () => [],
            updateFilesUsage: async () => [],
          },
        );
        await attemptInvoke({
          model: initializeModel({
            provider: initialized.provider,
            clientOptions: { ...initialized.model_parameters, streaming: false, maxRetries: 0 },
          }),
          provider: initialized.provider,
          messages: [new HumanMessage('Return JSON: {"ok":true}')],
          onChunk: async () => {},
        });
        expect(requests).toHaveLength(1);
        expect(requests[0].model).toBe(model);
        expect(requests[0].response_format).toEqual({ type: 'json_object' });
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    },
  );
});
