# BOT MODE vendored Agents SDK

BOT MODE pins one reproducible local npm artifact for `@librechat/agents`.
Historical SDK tarballs are intentionally not retained in the current tree; their provenance remains available through Git history.

## Canonical artifact

- Package: `@librechat/agents` 3.7.17
- Source commit: `145865e` (`fix(agents): fail over stalled zero-chunk models`)
- Artifact: `librechat-agents-3.7.17-145865e.tgz`
- SHA-256: `5937a2be89c761b7ccb9749e2ed9f15343dae887b5f1d84debc55307b691ac2b`
- npm integrity: `sha512-ZDi1UtGTIYNgmWHgOI/jUibMrbRjyzzKyMvOMyHVTbo807pRc/E9MYIYsFLlXJh6THMVrT4Wnk5toJAKPtZXzg==`

`api/package.json` and the root `package-lock.json` both reference this exact archive.
The Docker build copies this directory before dependency installation so a clean checkout can resolve the package without a second runtime or a manual `node_modules` overlay.

## Runtime contract

`MODEL_RATE_LIMIT_ZERO_CHUNK` remains rate-limit-only. `MODEL_RETRYABLE_ZERO_CHUNK` additionally admits explicit provider overloads and explicit timeout errors, only before any model chunk. Ordinary errors, context overflow, stream-limit aborts and post-chunk failures remain fail-closed.

The host still owns provider/model validation, authorization, budget admission, durable provenance and publication policy. The vendored SDK does not become a second source of truth.

## Validation and regeneration

The adopted artifact was validated with the targeted fallback suite (22/22), targeted ESLint, `tsdown`, and `git diff --check`.

To regenerate the artifact, build the exact SDK source commit in an isolated checkout, run the relevant SDK tests, then `npm pack --ignore-scripts`. After replacing the archive, update the root lockfile with `npm install --package-lock-only --ignore-scripts`, verify the SHA-256/integrity values, and run the BOT MODE reproducibility suite before adoption.
