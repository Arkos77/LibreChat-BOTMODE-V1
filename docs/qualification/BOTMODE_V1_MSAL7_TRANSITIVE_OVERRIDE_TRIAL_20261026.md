# BOT MODE V1 — Azure/MSAL 7.1 experimental compatibility gate (26 October 2026)

EXPERIMENT ONLY; NOT APPROVED FOR PRODUCTION OR STABLE RELEASE.

Base: PR84 OpenAI 7-only SHA dfaa84b71fd89537a30084bb8eddb72b846b2e57. Applied a root npm override for transitive @azure/msal-node 7.1.0, then updated package-lock with npm update @azure/msal-node --package-lock-only --ignore-scripts --no-audit --no-fund.

Security: npm audit --omit=dev reduces from 3 HIGH (Azure identity, MSAL, Zod) to 1 HIGH (Zod only), 0 critical and 0 moderate. Override forces a major version outside @azure/identity@4.13.1 dependency range on @azure/msal-node ^5.1.0.

Offline tests: packages/api/src/cdn/__tests__/azure-msal7-compat.test.ts validates DefaultAzureCredential constructor, missing-config fallback and BlobServiceClient managed identity object initialization with fake account; NO token requests or external Azure connections.

Acceptance: exact-SHA GitHub CI and compile must succeed, plus independent real Managed Identity token and storage authentication qualification on any Azure-enabled installation before merge. Current Chromebook 3081 has no Azure settings and cannot prove real credential compatibility.

Zod 3 remains HIGH. Broad Zod 4 migration was rejected due to shared TypeScript failures. Stable remains NO-GO.

No secrets, paid model, running container, volume, GHCR publication or stable merge changed.
