# BOT MODE vendored Agents SDK

BOT MODE pins one reproducible local npm artifact for `@librechat/agents`.
Historical SDK tarballs are intentionally not retained in the current tree; their provenance remains available through Git history.

## Canonical artifact

- Package: `@librechat/agents` 3.7.17
- Base source commit: `145865e` (`fix(agents): fail over stalled zero-chunk models`)
- Local derivative: `fallback-context-v1`
- Artifact: `librechat-agents-3.7.17-botmode-fallback-context-v1.tgz`
- SHA-256: `28d5c2f2858feb3c0468cc50dbf43232989f9c8ed625e7d777f032d28dd312ea`
- npm integrity: `sha512-VLLFvqRrNkO0kHLkdyyLu2osQbyZpP9ygJj/OY+Av5mTSr2BtXttxvF4b+nS82KneDItkinTq/qPYbj/W90CLg==`

`api/package.json` and the root `package-lock.json` both reference this exact archive.
The Docker build copies this directory before dependency installation so a clean checkout can resolve the package without a second runtime or a manual `node_modules` overlay.

## Runtime contract

`MODEL_RATE_LIMIT_ZERO_CHUNK` remains rate-limit-only. `MODEL_RETRYABLE_ZERO_CHUNK` additionally admits explicit provider overloads and explicit timeout errors, only before any model chunk. Ordinary errors, context overflow, stream-limit aborts and post-chunk failures remain fail-closed.

The host still owns provider/model validation, authorization, budget admission, durable provenance and publication policy. The vendored SDK does not become a second source of truth.

The derivative lets Graph supply the same current AgentContext system runnable and prepared tool set to fallback initialization that the primary uses. Tool preparation still applies visibility, discovery and execution filters for the target provider. Optional hooks leave standalone fallback callers unchanged. No instructions are inserted into user messages and no runtime prototype is patched.

## Validation and regeneration

The base artifact's previous validation remains historical evidence for that base. It does not qualify this derivative.

Regenerate the exact derivative with `python3 scripts/botmode/build-fallback-context-sdk.py`. The generator reads the original archive from commit `4bbd799`; a shallow clone must fetch that history, or supply `--base /path/to/librechat-agents-3.7.17-145865e.tgz`. Its required base SHA-256 is `5937a2be89c761b7ccb9749e2ed9f15343dae887b5f1d84debc55307b691ac2b`. The generator rejects unknown bytes and unexpected patch anchors before producing output.

This is a mirrored, minimal distribution patch: two source files, their CJS/ESM implementations, the fallback declaration and package provenance metadata. All unrelated file bytes and file modes are preserved. The four modified runtime source maps are removed rather than publishing inaccurate maps. This recipe does not claim a complete upstream SDK rebuild or typecheck; those modules' debugging stacks refer to distributed JavaScript.

`python3 -m unittest discover -s scripts/botmode/tests -p test_fallback_sdk_artifact.py` checks archive/lock integrity, source/runtime/declaration presence, exact changed-file scope, unknown-base refusal and byte-identical regeneration twice when the historical base is available. Regeneration uses Python's standard library; installation uses the committed archive and does not need its historical base or a generator.

Run `node scripts/botmode/native-fallback-context-regression.cjs node_modules/@librechat/agents` to exercise CJS and ESM over loopback HTTP: primary typed 429, fallback instructions, one actually executed declared child, no forbidden child, and no undiscovered deferred tool. The targeted API native fallback suites also require the former missing prompts and subagent schema. Docker/live-provider qualification remains a separate step for the exact new image.
