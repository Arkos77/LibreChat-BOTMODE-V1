# BOT MODE V1 — isolated security experiments, 26 October 2026

**All changes experimental. Not accepted for release, merge or runtime deployment.**

Baseline: PR83 SHA 9145de18e33c8fcde1f9ed161e6c6e95914fc843, production npm audit 0 critical / 4 high / 0 moderate.

## Attempt 1: SDK OpenAI 7.44.0 + Zod 4.6.7 across workspaces — REJECTED

Lockfile-only audit yielded 0 critical / 2 high / 0 moderate (Azure/MSAL only), BUT GitHub Frontend run 40382525312 and Backend run 40382525253 both FAILED at Build data-provider, with extensive Zod 4 API/type incompatibilities (ZodError.errors, Zod AnyZodObject, schema defaultValue, records and config type signatures). Downstream suites were skipped. Therefore this four-workspace migration is UNSAFE to integrate. No deployed runtime changes.

## Attempt 2: SDK OpenAI 7.44.0 only, retain Zod 3 across workspaces

This PR's current changes are restricted to:
- api/package.json openai 5.8.2 -> 7.44.0
- root package-lock.json updated with npm install --package-lock-only --ignore-scripts --no-audit --no-fund
- all Zod 3 declarations restored in api, client, packages/api and packages/data-provider; changes to those files are merely the revert of the first experimental commit relative to this PR (net difference against PR83 is OpenAI API manifest + package-lock and this document).

Production npm audit of this narrower candidate yields 0 critical / 3 high / 0 moderate: Azure identity/MSAL and Zod. OpenAI advisory entry is resolved.

### Required qualification before possible adoption
Exact SHA CI must pass: build data-provider, API and frontend TypeScript, static checks, backend and frontend unit tests; provider compatibility, free fallback, Worker->specialists->Oracle->P6 (especially SDK tool calling, usage receipts), and isolation. Even green CI is not proof of full real-provider behavior.

This is a DRAFT EXPERIMENT. No merge, no stable/latest tag, no Docker/GHCR publication, no 3080/3081 changes, no paid model usage. Remaining high warnings still block stable release.
