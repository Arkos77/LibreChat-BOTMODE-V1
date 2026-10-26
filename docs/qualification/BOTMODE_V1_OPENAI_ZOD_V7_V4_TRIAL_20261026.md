# Security compatibility experiment: OpenAI SDK 7 / Zod 4

Date: 2026-10-26. EXPERIMENTAL ONLY; not approved for integration or deployment.

Baseline: PR83 SHA 9145de18e33c8fcde1f9ed161e6c6e95914fc843 with five production npm advisories resolved and four HIGH still reported.

## Trial changes
- api: OpenAI SDK 5.8.2 -> 7.44.0; Zod dependency ^3.22.4 -> ^4.6.7.
- client and packages/data-provider: Zod dependency ^3.22.4 -> ^4.6.7.
- packages/api: Zod peer range ^3.22.4 -> ^4.6.7.
- Regenerated root package-lock with npm install --package-lock-only --ignore-scripts --no-audit --no-fund. No forced audit fix.
- No source or code migrations attempted yet; incompatibilities are expected and MUST be measured with CI.

## Security evidence
- Baseline production audit: 0 critical, 4 HIGH, 0 moderate (2 Azure/MSAL and 2 OpenAI/Zod).
- Experiment production audit: 0 critical, 2 HIGH, 0 moderate (both Azure/MSAL). OpenAI/Zod advisory package entries gone from lockfile.
- This audit is lockfile-level only. It neither establishes functional compatibility nor ensures the new dependencies are present in a built final Docker image.

## Acceptance gates
- Strict frontend TypeScript/Vite/Jest, backend tests, static checks, SDK/tool calling compatibility, provider fallback and Worker->specialists->Oracle->P6 regressions.
- Ensure no incompatible Zod 3 parse/schema APIs or OpenAI SDK v7 runtime paths; a passing audit cannot waive failing tests.
- After CI evaluation, preserve base PR83 until a deliberate decision to integrate, refine or reject.
- No changes to running 3080/3081, no Docker build on Chromebook, no secrets, no paid models, no GHCR, no merge/stable publication.

## Azure/MSAL
- Independent security advisory GHSA-xcx6-jx8p-x3h5 impacts MSAL authorization-code flow and is patched in MSAL 7.1.0. BOT MODE application uses DefaultAzureCredential for Azure Blob and OpenID OBO through openid-client, with no direct acquireTokenByCode call observed. Not enough evidence to claim Azure not exploitable through all transitive paths.
