"""Disposable hosted-runner HTTP/SSE research qualification; never an installer."""
import argparse
import copy
import ipaddress
import importlib.util
import json
import math
import os
import re
import secrets
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[2]
SOURCE_URL = 'https://ci-source.invalid/report'
FIXED_FREE_MODEL = 'nvidia/nemotron-3.5-super-vl:free'
MISSION_OBJECTIVE = ('Rechercher les faits publiés dans le rapport CI contrôlé : identifiant, date et contrôles enregistrés. '
                     'Analyser puis synthétiser ces observations dans le seul périmètre du jeu de test.')
FIXTURE_WEB_ENV = {'BOTMODE_CI_WEB_URL': 'http://fixture:8088', 'BOTMODE_CI_WEB_KEY': 'ci-fixture'}
HARNESS_ONLY_PATHS = {
    '.github/workflows/botmode-v1-live-provider-preflight.yml',
    'scripts/botmode/ci-fixed-free-preflight.py',
    'scripts/botmode/tests/test_fixed_free_preflight.py',
    '.github/workflows/botmode-v1-pr77-source-built.yml',
    'scripts/botmode/ci-host-research.py',
    'scripts/botmode/tests/test_host_research_guard.py',
    'scripts/botmode/tests/test_publication_evidence.py',
    'scripts/botmode/ci-openai-subagent-fixture.py',
    'scripts/botmode/tests/test_source_fixture.py',
}


def validate_target(env, actual_sha):
    sha = env.get('CANDIDATE_SHA', '')
    harness_sha = env.get('HARNESS_SHA', sha)
    project = env.get('HOST_RESEARCH_PROJECT', '')
    if env.get('GITHUB_ACTIONS') != 'true' or env.get('RUNNER_ENVIRONMENT') != 'github-hosted':
        raise RuntimeError('HOST_RESEARCH_HOSTED_RUNNER_REQUIRED')
    if not re.fullmatch(r'[0-9a-f]{40}', sha) or not re.fullmatch(r'[0-9a-f]{40}', harness_sha) or harness_sha != actual_sha:
        raise RuntimeError('HOST_RESEARCH_EXACT_SOURCE_REQUIRED')
    if env.get('CANDIDATE_IMAGE') != 'botmode-native-research:' + sha:
        raise RuntimeError('HOST_RESEARCH_LOCAL_IMAGE_REQUIRED')
    if not re.fullmatch(r'botmode-research-[0-9]+-[0-9]+', project):
        raise RuntimeError('HOST_RESEARCH_ISOLATED_PROJECT_REQUIRED')
    return sha, env['CANDIDATE_IMAGE'], project


def validate_reused_files(paths):
    if not set(paths).issubset(HARNESS_ONLY_PATHS):
        raise RuntimeError('HOST_RESEARCH_REUSED_PRODUCT_SOURCE_DRIFT')


def real_provider_mode(env):
    requested = env.get('CI_REAL_FREE_PROVIDER', 'false')
    if requested not in ('false', 'true'):
        raise RuntimeError('HOST_RESEARCH_REAL_PROVIDER_FLAG_INVALID')
    if requested == 'true' and len(env.get('CI_REAL_OPENROUTER_KEY', '')) <= 16:
        raise RuntimeError('HOST_RESEARCH_REAL_PROVIDER_KEY_REQUIRED')
    return requested == 'true'


def setup_binding(real=False):
    return {'provider': 'OpenRouter', 'model': FIXED_FREE_MODEL if real else 'openrouter/free'}


def validate_agent_bindings(agents, real=False):
    expected = setup_binding(real)
    if any(any(agent.get(k) != v for k, v in expected.items()) for agent in agents):
        raise RuntimeError('HOST_RESEARCH_SAVED_BINDING_MISMATCH')


def validate_provider_evidence(evidence):
    records = evidence.get('records')
    if not isinstance(records, list) or len(records) != 4:
        raise RuntimeError('HOST_RESEARCH_PROVIDER_RECORDS_REQUIRED')
    for record in records:
        usage = record.get('usage', {})
        cost = usage.get('cost')
        completion = usage.get('completion_tokens')
        params = record.get('request_parameters', {})
        if (record.get('http_status') != 200 or record.get('models') != [FIXED_FREE_MODEL]
                or params.get('model') != FIXED_FREE_MODEL or params.get('reasoning_enabled') is not False
                or type(cost) not in (int, float) or not math.isfinite(cost) or cost != 0
                or type(completion) is not int or not 0 <= completion <= 2048):
            raise RuntimeError('HOST_RESEARCH_PROVIDER_PROFILE_MISMATCH')


def validate_publication(final, mongo, conversation_id, response_id, expected_text):
    response = final.get('responseMessage', {})
    content = response.get('content')
    text_parts = [p.get('text') for p in content if isinstance(p, dict) and p.get('type') == 'text'] if isinstance(content, list) else []
    if (final.get('final') is not True or not conversation_id or not response_id
            or response.get('conversationId') != conversation_id or response.get('messageId') != response_id
            or not mongo.get('conversation') or mongo.get('count') != 1 or mongo.get('complete') is not True
            or content != mongo.get('content') or text_parts != [expected_text]
            or not isinstance(expected_text, str) or not expected_text.strip()
            or len(json.dumps(content, ensure_ascii=False).encode()) > 65536):
        raise RuntimeError('HOST_RESEARCH_PUBLICATION_EVIDENCE_MISMATCH')
    return {'conversation_id': conversation_id, 'response_message_id': response_id,
            'sse_mongo_content_equal': True, 'rendered_sources_checked': True, 'content': content}


def capture_job_state(read_field, sensitive_values):
    snapshot = {}
    for name in ('status', 'error', 'orchestratorPlan', 'missionOracleState',
                 'responseMessageId', 'terminalPersistencePending'):
        try:
            raw = read_field(name)
            if len(raw) > 65536:
                snapshot[name] = {'omitted': 'size_limit', 'characters': len(raw)}
            elif name in ('orchestratorPlan', 'missionOracleState'):
                try: snapshot[name] = json.loads(raw) if raw else None
                except ValueError: snapshot[name] = {'invalid_json': True}
            else:
                snapshot[name] = raw[:2000]
        except Exception as error:
            snapshot[name] = {'read_error': type(error).__name__}
    text = json.dumps(snapshot, ensure_ascii=False)
    for secret in sensitive_values:
        if secret and len(secret) >= 8: text = text.replace(secret, '[redacted]')
    return json.loads(text)


def preserve_job_state(path, read_field, sensitive_values):
    # Diagnostic failure must not prevent the existing mandatory stack cleanup.
    try:
        state = capture_job_state(read_field, sensitive_values)
        path.write_text(json.dumps(state, indent=2))
    except Exception as error:
        return type(error).__name__
    return None


def check_free_catalog():
    spec = importlib.util.spec_from_file_location('fixed_profile_catalog', ROOT / 'scripts/botmode/ci-fixed-free-preflight.py')
    probe = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(probe)
    sha = run(['git', '-C', str(ROOT), 'rev-parse', 'HEAD']).strip()
    report = probe.new_report(sha)
    try:
        if probe.MODEL != FIXED_FREE_MODEL:
            raise RuntimeError('HOST_RESEARCH_CATALOG_PROFILE_MISMATCH')
        probe.validate_catalog(probe.Transport(''), report)
        report['passed'] = True
    except Exception as error:
        report['error'] = str(error) if isinstance(error, (probe.ProbeError, RuntimeError)) else type(error).__name__
        raise
    finally:
        probe.write_report(ROOT / 'candidate-evidence/fixed-profile-catalog.json', report, '')
    print('HOST_RESEARCH_FREE_CATALOG=PASS', flush=True)


def compose_override(real=False):
    fixture = {'image': 'python:3.12-alpine', 'command': ['python3', '/fixture.py'],
               'environment': {'CI_MISSION_SOURCE_MODE': '1'}, 'volumes': ['./fixture.py:/fixture.py:ro']}
    networks = {'default': {'internal': True}}
    if real:
        fixture['environment'].update(CI_REAL_FREE_PROVIDER='1',
            CI_OPENROUTER_KEY='${CI_REAL_OPENROUTER_KEY:?Missing explicitly authorized provider key}')
        fixture['networks'] = ['default', 'provider_egress']
        networks['provider_egress'] = {'internal': False}
    return {'services': {
        'api': {'environment': {'USE_REDIS': 'true', 'USE_REDIS_STREAMS': 'true',
            'REDIS_URI': 'redis://redis:6379', 'STREAM_KEEP_COMPLETED_JOBS': 'true'}},
        'redis': {'image': 'redis:7-alpine', 'command': ['redis-server', '--save', '', '--appendonly', 'no']},
        'fixture': fixture}, 'networks': networks}


def run(args, *, env=None, data=None, timeout=180):
    return subprocess.check_output(args, input=data, text=True, env=env, timeout=timeout)


def build_config(source, real=False):
    config = copy.deepcopy(source)
    config['endpoints']['agents'].pop('hostModelRouting', None)
    endpoints = [e for e in config['endpoints']['custom'] if e.get('name') == 'OpenRouter']
    if not endpoints:
        raise RuntimeError('HOST_RESEARCH_SAVED_PROVIDER_MISSING')
    if len(endpoints) != 1:
        raise RuntimeError('HOST_RESEARCH_SAVED_PROVIDER_AMBIGUOUS')
    endpoint = endpoints[0]
    endpoint.update(apiKey='ci-local-fixture-no-real-key', baseURL='http://fixture:8088/v1')
    endpoint['models'] = {'fetch': False, 'default': [setup_binding(real)['model']]}
    if real:
        endpoint['addParams'] = {**endpoint.get('addParams', {}),
                                 'maxRetries': 0, 'timeout': 90000, 'maxTokens': 2048, 'reasoning': {'enabled': False}}
    config['endpoints']['custom'] = endpoints
    config['webSearch'] = {
        'searchProvider': 'searxng', 'scraperProvider': 'firecrawl', 'rerankerType': 'none',
        'searxngInstanceUrl': '${BOTMODE_CI_WEB_URL}', 'searxngApiKey': '${BOTMODE_CI_WEB_KEY}',
        'firecrawlApiUrl': '${BOTMODE_CI_WEB_URL}', 'firecrawlApiKey': '${BOTMODE_CI_WEB_KEY}',
        'allowedAddresses': ['fixture:8088'],
    }
    return config


def check_config(config):
    print(run(['node', str(ROOT / 'scripts/botmode/validate-host-research-config.cjs')],
              data=json.dumps(config), timeout=30).strip(), flush=True)


def api_base_from_networks(networks, project):
    network = project + '_default'
    if set(networks) != {network}:
        raise RuntimeError('HOST_RESEARCH_ISOLATED_API_NETWORK_REQUIRED')
    try:
        address = ipaddress.IPv4Address(networks[network].get('IPAddress', ''))
    except ipaddress.AddressValueError:
        raise RuntimeError('HOST_RESEARCH_PRIVATE_API_ADDRESS_REQUIRED') from None
    if not address.is_private or address.is_loopback or address.is_link_local or address.is_unspecified or address.is_multicast:
        raise RuntimeError('HOST_RESEARCH_PRIVATE_API_ADDRESS_REQUIRED')
    return f'http://{address}:3080'


def wait_for_api(request, observations):
    deadline = time.monotonic() + 180
    observations.update(attempts=0, recent=[])
    while True:
        try:
            status, _body = request('/readyz', authenticated=False, timeout=3)
            sample = {'status': status}
        except (URLError, TimeoutError) as error:
            reason = error.reason if isinstance(error, URLError) else error
            sample = {'error_type': type(reason).__name__, 'errno': getattr(reason, 'errno', None)}
        observations['attempts'] += 1
        observations['recent'] = (observations['recent'] + [sample])[-8:]
        if sample.get('status') == 200:
            return
        if time.monotonic() >= deadline:
            raise RuntimeError('HOST_RESEARCH_API_NOT_READY')
        time.sleep(1)


def main():
    harness_sha = run(['git', '-C', str(ROOT), 'rev-parse', 'HEAD']).strip()
    sha, image, project = validate_target(os.environ, harness_sha)
    real = real_provider_mode(os.environ)
    if sha != harness_sha:
        changed = run(['git', '-C', str(ROOT), 'diff', '--name-only', sha, harness_sha]).splitlines()
        validate_reused_files(changed)
    config = build_config(json.loads((ROOT / 'librechat.yaml').read_text()), real=real)
    check_config(config)
    if real:
        check_free_catalog()
    image_env = run(['docker', 'image', 'inspect', image, '--format', '{{json .Config.Env}}'])
    if 'BUILD_COMMIT=' + sha not in json.loads(image_env):
        raise RuntimeError('HOST_RESEARCH_EMBEDDED_SOURCE_MISMATCH')
    evidence = ROOT / 'candidate-evidence'
    evidence.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='botmode-host-research-') as temporary:
        directory = Path(temporary)
        for name in ('docker-compose.botmode.yml', 'docker-compose.botmode-lite.yml'):
            (directory / name).write_bytes((ROOT / name).read_bytes())
        (directory / 'fixture.py').write_bytes((ROOT / 'scripts/botmode/ci-openai-subagent-fixture.py').read_bytes())
        (directory / 'librechat.yaml').write_text(json.dumps(config, ensure_ascii=False))
        values = {'JWT_SECRET': secrets.token_hex(48), 'JWT_REFRESH_SECRET': secrets.token_hex(48),
                  'CREDS_KEY': secrets.token_hex(32), 'CREDS_IV': secrets.token_hex(16),
                  'BOTMODE_MONGO_PASSWORD': secrets.token_hex(16), 'POSTGRES_PASSWORD': secrets.token_hex(16),
                  'ALLOW_REGISTRATION': 'false', 'REDIS_KEY_PREFIX': '', **FIXTURE_WEB_ENV}
        text = (ROOT / '.env.example').read_text()
        for key, value in values.items():
            pattern = r'^' + re.escape(key) + r'=.*$'
            if re.search(pattern, text, re.M):
                text = re.sub(pattern, lambda _match: key + '=' + value, text, flags=re.M)
            else:
                text += '\n' + key + '=' + value
        env_path = directory / '.env'
        env_path.write_text(text)
        env_path.chmod(0o640)
        run(['sudo', 'chown', f'1000:{os.getgid()}', str(env_path)])
        (directory / 'qualification.yml').write_text(json.dumps(compose_override(real)))
        env = {**os.environ, 'BOTMODE_IMAGE': image, 'BOTMODE_HOST_PORT': '127.0.0.1:3090', **values}
        for key in ('PROXY', 'HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'):
            env[key] = ''
        env['NO_PROXY'] = env['no_proxy'] = 'localhost,127.0.0.1,api,mongodb,redis,fixture'
        compose = ['docker', 'compose', '--project-name', project, '--project-directory', str(directory)]
        for name in ('docker-compose.botmode.yml', 'docker-compose.botmode-lite.yml', 'qualification.yml'):
            compose += ['-f', str(directory / name)]

        def dc(*args, data=None, timeout=180):
            return run(compose + list(args), env=env, data=data, timeout=timeout)

        def node(code):
            return json.loads(dc('exec', '-T', 'api', 'node', '-', data=code))

        token = None
        sid = None
        stage = 'startup'
        passed = False
        http_observations = {}
        admission_observation = {}
        api_base = None
        opener = build_opener(ProxyHandler({}))

        def request(path, body=None, authenticated=True, timeout=120):
            headers = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/131.0.0.0 Safari/537.36'}
            if authenticated and token:
                headers['Authorization'] = 'Bearer ' + token
            if body is not None:
                headers['Content-Type'] = 'application/json'
            if api_base is None:
                raise RuntimeError('HOST_RESEARCH_API_ADDRESS_NOT_SELECTED')
            req = Request(api_base + path,
                          data=None if body is None else json.dumps(body).encode(), headers=headers)
            try:
                with opener.open(req, timeout=timeout) as response:
                    return response.status, response.read().decode()
            except HTTPError as error:
                return error.code, error.read().decode()

        attempted = False
        try:
            attempted = True
            dc('up', '-d', 'mongodb', 'redis', 'fixture', 'api', timeout=240)
            api_container = dc('ps', '-q', 'api', timeout=5).strip()
            networks = json.loads(run(['docker', 'inspect', api_container,
                '--format', '{{json .NetworkSettings.Networks}}'], timeout=5))
            api_base = api_base_from_networks(networks, project)
            http_observations['transport'] = 'direct project bridge; no host port or proxy'
            wait_for_api(request, http_observations)
            assert request('/api/config', authenticated=False)[0] == 200
            assert request('/api/agents/botmode/setup', {}, authenticated=False)[0] == 401
            stage = 'principal'
            principal = node('''const fs=require('fs'),m=require('mongoose'),jwt=require('jsonwebtoken');
(async()=>{await m.connect(process.env.MONGO_URI);const id=new m.Types.ObjectId();
await m.connection.db.collection('users').insertOne({_id:id,name:'Research CI',username:'research-ci',email:'research-ci@example.invalid',role:'ADMIN',provider:'local',createdAt:new Date(),updatedAt:new Date()});
const secret=fs.readFileSync('/app/.env','utf8').match(/^JWT_SECRET=(.+)$/m)[1];
console.log(JSON.stringify({id:String(id),token:jwt.sign({id:String(id)},secret,{expiresIn:'15m'})}));await m.disconnect();
})().catch(()=>process.exit(1));''')
            token = principal['token']
            stage = 'native_setup'
            setup = setup_binding(real)
            for _ in range(2):
                status, body = request('/api/agents/botmode/setup', setup)
                assert status in (200, 201), 'HOST_RESEARCH_NATIVE_SETUP_DENIED'
            status, body = request('/api/agents/botmode/setup-status')
            inventory = json.loads(body)
            assert status == 200 and all(inventory.get(k) is True for k in
                ('inventoryComplete', 'permissionsComplete', 'delegationConfigured'))
            agents = node('''const m=require('mongoose');(async()=>{await m.connect(process.env.MONGO_URI);
console.log(JSON.stringify(await m.connection.db.collection('agents').find({name:{$in:['BOT MODE Worker','RECHERCHE','ANALYSE','CODE','DOCUMENTS','RÉDACTION']}},{projection:{id:1,name:1,author:1,provider:1,model:1}}).toArray()));await m.disconnect();})().catch(()=>process.exit(1));''')
            assert len(agents) == 6 and len({a['name'] for a in agents}) == 6
            assert all(str(a['author']) == principal['id'] for a in agents)
            validate_agent_bindings(agents, real)
            (evidence / 'saved-agent-bindings.json').write_text(json.dumps({
                'harness_sha': harness_sha, 'bindings': [{'name': a['name'], 'provider': a['provider'], 'model': a['model']} for a in agents],
                'endpoint_reasoning': config['endpoints']['custom'][0].get('addParams', {}).get('reasoning')}, indent=2))
            by_name = {a['name']: a for a in agents}
            sid = str(uuid.uuid4())
            payload = {'endpoint': 'agents', 'agent_id': by_name['BOT MODE Worker']['id'],
                'conversationId': sid, 'messageId': str(uuid.uuid4()),
                'parentMessageId': '00000000-0000-0000-0000-000000000000', 'isNewConvo': True,
                'text': MISSION_OBJECTIVE,
                'botMode': {'version': 1, 'mode': 'analyze', 'selectionMode': 'auto',
                    'workerAgentId': by_name['BOT MODE Worker']['id'],
                    'agents': [{'id': by_name[n]['id'], 'name': n} for n in ('RECHERCHE','ANALYSE','RÉDACTION')]},
                'orchestratorMission': {'mission': {'missionId': 'host-' + sid, 'taskId': sid,
                    'objective': MISSION_OBJECTIVE,
                    'constraints': [], 'requiredCapabilities': []}}}
            # Retry only a server's explicit pre-admission startup refusal. Never replay an ambiguous POST.
            stage = 'admission'
            for attempt in range(6):
                status, body = request('/api/agents/chat/agents', payload)
                envelope = json.loads(body)
                admission_observation = {'status': status,
                    'code': str(envelope.get('code', ''))[:160],
                    'response_status': str(envelope.get('status', ''))[:160],
                    'error': str(envelope.get('error', ''))[:500],
                    'message': str(envelope.get('message', ''))[:500], 'attempt': attempt + 1}
                for key in ('code', 'response_status', 'error', 'message'):
                    for secret in [*values.values(), token, os.environ.get('CI_REAL_OPENROUTER_KEY')]:
                        if secret and len(secret) >= 8:
                            admission_observation[key] = admission_observation[key].replace(secret, '[redacted]')
                if status != 503 or envelope.get('code') != 'SERVER_NOT_READY':
                    break
                time.sleep(1)
            assert status == 200 and envelope.get('status') == 'started' and envelope.get('streamId') == sid
            stage = 'stream'
            status, stream = request('/api/agents/chat/stream/' + sid + '?resume=true')
            frames = [line[5:].strip() for line in stream.splitlines() if line.startswith('data:')]
            events = [json.loads(frame) for frame in frames if frame and frame != '[DONE]']
            finals = [event for event in events if event.get('final') is True]
            assert status == 200 and len(finals) == 1, 'HOST_RESEARCH_SINGLE_FINAL_REQUIRED'
            assert not any(e.get('type') == 'error' or e.get('event') == 'error' for e in events)
            key = '::stream:{' + sid + '}:job'

            def field(name):
                return dc('exec', '-T', 'redis', 'redis-cli', '--raw', 'HGET', key, name).strip()

            deadline = time.monotonic() + 30
            while field('status') != 'complete' or field('terminalPersistencePending') not in ('0', 'false', 'False'):
                if time.monotonic() >= deadline:
                    raise RuntimeError('HOST_RESEARCH_TERMINAL_NOT_COMMITTED')
                time.sleep(0.5)
            plan = json.loads(field('orchestratorPlan'))
            state = json.loads(field('missionOracleState'))
            stage = 'oracle'
            tasks = {t['key']: t for t in plan['tasks']}
            assert set(tasks) == {'research', 'analysis', 'synthesis'}
            assert tasks['analysis']['dependsOn'] == ['research'] and tasks['synthesis']['dependsOn'] == ['analysis']
            assert set(state['results']) == {t['taskId'] for t in tasks.values()}
            for task in tasks.values():
                verdicts = state['results'][task['taskId']]['verdicts']
                assert len(verdicts) == len(task['validation']) and all(v['status'] == 'VERIFIED' for v in verdicts)
            sources = state.get('sources', {}).get(tasks['research']['taskId'], [])
            assert sources and any(SOURCE_URL in item['urls'] for item in sources)
            assert field('status') == 'complete' and field('terminalPersistencePending') in ('0', 'false', 'False')
            response_id = field('responseMessageId')
            stage = 'mongo_publication'
            mongo = node('''const m=require('mongoose');(async()=>{await m.connect(process.env.MONGO_URI);
const sid=''' + json.dumps(sid) + ''',mid=''' + json.dumps(response_id) + ''';
const db=m.connection.db,conversation=await db.collection('conversations').findOne({conversationId:sid});
const messages=await db.collection('messages').find({conversationId:sid,messageId:mid,isCreatedByUser:false}).toArray();
console.log(JSON.stringify({conversation:!!conversation,count:messages.length,complete:messages[0]?.unfinished===false,content:messages[0]?.content}));await m.disconnect();})().catch(()=>process.exit(1));''')
            assert mongo['conversation'] and mongo['count'] == 1 and mongo['complete']
            assert any(p.get('type') == 'text' and SOURCE_URL in p.get('text', '') for p in mongo['content'])
            synthesis_candidate = json.loads(state['results'][tasks['synthesis']['taskId']]['verdicts'][0]['input']['candidate'])
            expected_text = synthesis_candidate['result'] + '\n\nSources\n- <' + SOURCE_URL + '>'
            publication = validate_publication(finals[0], mongo, sid, response_id, expected_text)
            (evidence / 'host-publication.json').write_text(json.dumps(publication, ensure_ascii=False, indent=2))
            metrics = json.loads(dc('exec', '-T', 'fixture', 'python3', '-c',
                'import json,urllib.request;print(urllib.request.urlopen("http://127.0.0.1:8088/metrics").read().decode())'))
            assert metrics.get('source_search_calls', 0) >= 1 and metrics.get('source_scrape_calls', 0) >= 1
            if real:
                assert metrics.get('provider_requests') == 4 and metrics.get('provider_http_200') == 4
                assert metrics.get('source_search_calls') == 1
                provider_evidence = json.loads(dc('exec', '-T', 'fixture', 'python3', '-c',
                    'import urllib.request;print(urllib.request.urlopen("http://127.0.0.1:8088/provider-diagnostics").read().decode())'))
                validate_provider_evidence(provider_evidence)
                (evidence / 'provider-evidence.json').write_text(json.dumps(provider_evidence, indent=2))
            else:
                assert metrics.get('source_tool_requests') == 1
            component_images = {}
            for service in ('api', 'mongodb', 'redis', 'fixture'):
                container_id = dc('ps', '-q', service).strip()
                component_images[service] = run(['docker', 'inspect', container_id, '--format', '{{.Image}}']).strip()
            summary = {'source_sha': sha, 'harness_sha': harness_sha, 'scenario': 'native HTTP/SSE analyze',
                       'model_provider': FIXED_FREE_MODEL if real else 'synthetic',
                       'reasoning_enabled': False if real else None,
                       'web_sources': 'synthetic controlled source', 'task_keys': list(tasks),
                       'verdict_counts': {k: len(state['results'][t['taskId']]['verdicts']) for k,t in tasks.items()},
                       'source_observations': len(sources), 'mongo_final_count': mongo['count'],
                       'fixture_metrics': metrics, 'component_images': component_images}
            (evidence / 'host-research.json').write_text(json.dumps(summary, indent=2))
            passed = True
            stage = 'complete'
            print('HOST_RESEARCH_NATIVE_TOOL_ORACLE_MONGO=PASS', flush=True)
        finally:
            if attempted:
                diagnostics = {'source_sha': sha, 'harness_sha': harness_sha, 'passed': passed, 'last_stage': stage}
                diagnostics['host_http'] = http_observations
                diagnostics['admission'] = admission_observation
                diagnostics['real_free_provider'] = real
                if sid is not None:
                    capture_error = preserve_job_state(evidence / 'host-job-state.json',
                        lambda name: dc('exec', '-T', 'redis', 'redis-cli', '--raw',
                            'HGET', '::stream:{' + sid + '}:job', name, timeout=5).strip(),
                        [*values.values(), token, os.environ.get('CI_REAL_OPENROUTER_KEY')])
                    if capture_error is not None:
                        diagnostics['job_state_capture_error'] = capture_error
                if not passed:
                    if real:
                        try:
                            provider_evidence = json.loads(dc('exec', '-T', 'fixture', 'python3', '-c',
                                'import urllib.request;print(urllib.request.urlopen("http://127.0.0.1:8088/provider-diagnostics").read().decode())', timeout=10))
                            (evidence / 'provider-evidence.json').write_text(json.dumps(provider_evidence, indent=2))
                        except Exception:
                            diagnostics['provider_evidence_available'] = False
                    try:
                        diagnostics['internal_http'] = json.loads(dc('exec', '-T', 'fixture', 'python3', '-',
                            data='''import json, urllib.request, urllib.error
results = {}
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
for path in ('/health', '/readyz', '/api/config'):
    req = urllib.request.Request('http://api:3080' + path, headers={'User-Agent': 'Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36'})
    try:
        with opener.open(req, timeout=2) as response:
            results[path] = {'status': response.status}
    except urllib.error.HTTPError as error:
        results[path] = {'status': error.code}
    except (urllib.error.URLError, TimeoutError) as error:
        reason = error.reason if isinstance(error, urllib.error.URLError) else error
        results[path] = {'error_type': type(reason).__name__, 'errno': getattr(reason, 'errno', None)}
print(json.dumps(results))
''', timeout=15))
                    except Exception:
                        diagnostics['internal_http_available'] = False
                    try:
                        api_container = dc('ps', '-q', 'api', timeout=5).strip()
                        diagnostics['api_network'] = json.loads(run(['docker', 'inspect', api_container, '--format',
                            '{"ports":{{json .NetworkSettings.Ports}},"networks":{{json .NetworkSettings.Networks}},"state":{{json .State.Status}}}'], timeout=5))
                        diagnostics['network_internal'] = run(['docker', 'network', 'inspect', project + '_default',
                            '--format', '{{.Internal}}'], timeout=5).strip()
                    except Exception:
                        diagnostics['api_network_available'] = False
                    try:
                        metrics = json.loads(dc('exec', '-T', 'fixture', 'python3', '-c',
                            'import urllib.request;print(urllib.request.urlopen("http://127.0.0.1:8088/metrics").read().decode())', timeout=10))
                        diagnostics['fixture_metrics'] = {k: v for k, v in metrics.items() if isinstance(v, int)}
                    except Exception:
                        diagnostics['fixture_metrics_available'] = False
                    try:
                        logs = subprocess.run(compose + ['logs', '--no-color', '--tail', '120', 'api'],
                                              env=env, capture_output=True, text=True, timeout=15)
                        sanitized = logs.stdout + logs.stderr
                        for secret in [*values.values(), token, 'ci-local-fixture-no-real-key', 'ci-fixture', os.environ.get('CI_REAL_OPENROUTER_KEY')]:
                            if secret and len(secret) >= 8:
                                sanitized = sanitized.replace(secret, '[redacted]')
                        (evidence / 'host-research-failure.log').write_text(sanitized)
                    except Exception:
                        diagnostics['logs_available'] = False
                cleanup = subprocess.run(compose + ['down', '--volumes', '--remove-orphans'], env=env,
                                         capture_output=True, text=True, timeout=120)
                diagnostics['cleanup_passed'] = cleanup.returncode == 0
                (evidence / 'host-research-outcome.json').write_text(json.dumps(diagnostics, indent=2))
                print('HOST_RESEARCH_CLEANUP=' + ('PASS' if cleanup.returncode == 0 else 'FAIL'), flush=True)
                if cleanup.returncode:
                    raise RuntimeError('HOST_RESEARCH_CLEANUP_FAILED')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-config', action='store_true', help='Validate fixture config offline; no Docker or provider calls')
    parser.add_argument('--check-real-config', action='store_true', help='Validate bounded real-provider fixture config offline')
    parser.add_argument('--check-real-catalog', action='store_true', help='Public catalog only; zero inference and no key')
    args = parser.parse_args()
    if args.check_real_catalog:
        check_free_catalog()
    elif args.check_config or args.check_real_config:
        check_config(build_config(json.loads((ROOT / 'librechat.yaml').read_text()), real=args.check_real_config))
    else:
        main()
