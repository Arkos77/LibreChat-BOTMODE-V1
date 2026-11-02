"""Derive the pinned SDK with the primary context pipeline preserved on fallback."""
import argparse
import gzip
import hashlib
import io
import json
import re
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = 'vendor/librechat-agents/librechat-agents-3.7.17-145865e.tgz'
BASE_SHA = '5937a2be89c761b7ccb9749e2ed9f15343dae887b5f1d84debc55307b691ac2b'
OUTPUT = 'vendor/librechat-agents/librechat-agents-3.7.17-botmode-fallback-context-cold-child-v2.tgz'


def replace_once(text, before, after):
    if text.count(before) != 1:
        raise RuntimeError('SDK_PATCH_ANCHOR_MISMATCH: ' + before[:80])
    return text.replace(before, after, 1)


def patch_sources(files):
    graph = 'package/src/graphs/Graph.ts'
    text = files[graph].decode()
    text = replace_once(text, 'tools: agentContext.tools,\n                messages: fallbackBaseMessages,',
                        'tools: agentContext.tools,\n'
                        '                prepareTools: (provider, clientOptions) => this.getPreparedToolsForBinding(agentContext, provider, clientOptions),\n'
                        '                prepareModel: (fallbackModel) => agentContext.systemRunnable\n'
                        '                  ? agentContext.systemRunnable.pipe(fallbackModel as Runnable).withConfig({ runName: AGENT_MODEL_CALL_RUN_NAME }) as t.ChatModel\n'
                        '                  : fallbackModel,\n'
                        '                messages: fallbackBaseMessages,')
    files[graph] = text.encode()
    invoke = 'package/src/llm/invoke.ts'
    text = files[invoke].decode()
    text = replace_once(text, '  prepareProviderRequest: prepareFallbackRequest,\n  prepareProviderMessages,',
                        '  prepareProviderRequest: prepareFallbackRequest,\n  prepareProviderMessages,\n  prepareModel,\n  prepareTools,')
    signature = ('  fallbacks: t.FallbackConfig[];\n  tools?: t.GraphTools;')
    declarations = ('  prepareModel?: (model: t.ChatModel) => t.ChatModel;\n'
                    '  prepareTools?: (provider: t.ProviderName, clientOptions?: t.ClientOptions) => t.GraphTools | undefined;\n')
    text = replace_once(text, signature, declarations + signature)
    text = replace_once(text, '      const fbModel = initializeModel({\n        provider: fb.provider,\n        clientOptions: fb.clientOptions,\n        tools,\n      });',
                        '      const rawModel = initializeModel({\n        provider: fb.provider,\n        clientOptions: fb.clientOptions,\n'
                        '        tools: prepareTools == null ? tools : prepareTools(fb.provider, fb.clientOptions),\n      });\n'
                        '      const fbModel = prepareModel == null ? rawModel : prepareModel(rawModel as t.ChatModel);')
    files[invoke] = text.encode()
    declaration_path = 'package/dist/types/llm/invoke.d.ts'
    text = files[declaration_path].decode()
    text = replace_once(text, 'prepareProviderMessages, }: {', 'prepareProviderMessages, prepareModel, prepareTools, }: {')
    text = replace_once(text, '    fallbacks: t.FallbackConfig[];\n    tools?: t.GraphTools;',
                        declarations.replace('  ', '    ') + '    fallbacks: t.FallbackConfig[];\n    tools?: t.GraphTools;')
    files[declaration_path] = text.encode()


def patch_runtime(files):
    for fmt, extension in (('cjs', '.cjs'), ('esm', '.mjs')):
        graph = 'package/dist/' + fmt + '/graphs/Graph' + extension
        text = files[graph].decode()
        constant = 'require_constants.AGENT_MODEL_CALL_RUN_NAME' if fmt == 'cjs' else 'AGENT_MODEL_CALL_RUN_NAME'
        anchor = '\t\t\t\t\t\ttools: agentContext.tools,\n\t\t\t\t\t\tmessages: fallbackBaseMessages,'
        replacement = ('\t\t\t\t\t\ttools: agentContext.tools,\n'
                       '\t\t\t\t\t\tprepareTools: (provider, clientOptions) => this.getPreparedToolsForBinding(agentContext, provider, clientOptions),\n'
                       '\t\t\t\t\t\tprepareModel: (model) => agentContext.systemRunnable ? agentContext.systemRunnable.pipe(model).withConfig({ runName: ' + constant + ' }) : model,\n'
                       '\t\t\t\t\t\tmessages: fallbackBaseMessages,')
        text = replace_once(text, anchor, replacement)
        files[graph] = re.sub(r'^//# sourceMappingURL=.*$', '', text, flags=re.MULTILINE).encode()
        files.pop(graph + '.map', None)
        invoke = 'package/dist/' + fmt + '/llm/invoke' + extension
        text = files[invoke].decode()
        text = replace_once(text, 'prepareFallbackRequest, prepareProviderMessages }) {',
                            'prepareFallbackRequest, prepareProviderMessages, prepareModel, prepareTools }) {')
        initializer = 'require_init.initializeModel' if fmt == 'cjs' else 'initializeModel'
        anchor = ('\t\tconst fbModel = ' + initializer + '({\n\t\t\tprovider: fb.provider,\n'
                  '\t\t\tclientOptions: fb.clientOptions,\n\t\t\ttools\n\t\t});')
        replacement = ('\t\tconst rawModel = ' + initializer + '({\n\t\t\tprovider: fb.provider,\n'
                       '\t\t\tclientOptions: fb.clientOptions,\n'
                       '\t\t\ttools: prepareTools == null ? tools : prepareTools(fb.provider, fb.clientOptions)\n\t\t});\n'
                       '\t\tconst fbModel = prepareModel == null ? rawModel : prepareModel(rawModel);')
        text = replace_once(text, anchor, replacement)
        files[invoke] = re.sub(r'^//# sourceMappingURL=.*$', '', text, flags=re.MULTILINE).encode()
        files.pop(invoke + '.map', None)



def patch_cold_detached_child_checkpoint(files):
    """Persist native mission background child supersteps before network effects.

    Opt-in requires the host's durable mission marker and private generation
    namespace. Ordinary detached children and HITL keep existing behavior.
    """
    source = 'package/src/tools/subagent/SubagentExecutor.ts'
    src = files[source].decode()
    src = replace_once(src,
        '      const childInvokeConfig = {\n',
        """      const nativeMissionColdChild =
        params.taskRuntime != null &&
        this.checkpointDurable &&
        childConfigurable.__librechat_mission_sync === true &&
        typeof childConfigurable.__librechat_checkpoint_ns === 'string' &&
        childConfigurable.__librechat_checkpoint_ns.length > 0;
      const childInvokeConfig = {
""")
    src = replace_once(src,
        "...(this.checkpointDurable ? { durability: 'exit' as const } : {}),",
        """...(this.checkpointDurable
          ? { durability: nativeMissionColdChild ? 'sync' as const : 'exit' as const }
          : {}),""")
    files[source] = src.encode()
    for fmt, ext in (('cjs', '.cjs'), ('esm', '.mjs')):
        name = 'package/dist/' + fmt + '/tools/subagent/SubagentExecutor' + ext
        js = files[name].decode()
        js = replace_once(js, '\t\t\tconst childInvokeConfig = {\n',
            '\t\t\tconst nativeMissionColdChild = params.taskRuntime != null && this.checkpointDurable && childConfigurable.__librechat_mission_sync === true && typeof childConfigurable.__librechat_checkpoint_ns === "string" && childConfigurable.__librechat_checkpoint_ns.length > 0;\n\t\t\tconst childInvokeConfig = {\n')
        js = replace_once(js,
            '...this.checkpointDurable ? { durability: "exit" } : {},',
            '...this.checkpointDurable ? { durability: nativeMissionColdChild ? "sync" : "exit" } : {},')
        files[name] = re.sub(r'^//# sourceMappingURL=.*$', '', js, flags=re.MULTILINE).encode()
        files.pop(name+'.map', None)

def build(base):
    if hashlib.sha256(base).hexdigest() != BASE_SHA:
        raise RuntimeError('SDK_BASE_SHA_MISMATCH')
    with tarfile.open(fileobj=io.BytesIO(base), mode='r:gz') as archive:
        files = {m.name: archive.extractfile(m).read() for m in archive.getmembers() if m.isfile()}
        modes = {m.name: m.mode for m in archive.getmembers() if m.isfile()}
    patch_sources(files)
    patch_runtime(files)
    patch_cold_detached_child_checkpoint(files)
    manifest = json.loads(files['package/package.json'])
    manifest['botmodePatch'] = {'id': 'fallback-context-cold-child-v2', 'baseSha256': BASE_SHA, 'distribution': 'mirrored source/CJS/ESM patch; modified-module source maps omitted'}
    files['package/package.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode='w', format=tarfile.USTAR_FORMAT) as archive:
        for name, data in sorted(files.items()):
            info = tarfile.TarInfo(name)
            info.size, info.mode, info.mtime = len(data), modes.get(name, 0o644), 0
            archive.addfile(info, io.BytesIO(data))
    return gzip.compress(raw.getvalue(), mtime=0)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / OUTPUT)
    args = parser.parse_args()
    base = args.base.read_bytes() if args.base else subprocess.check_output(['git', 'show', '4bbd799:' + BASE], cwd=ROOT)
    result = build(base)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(result)
    print('SDK_ARCHIVE_SHA256=' + hashlib.sha256(result).hexdigest())
