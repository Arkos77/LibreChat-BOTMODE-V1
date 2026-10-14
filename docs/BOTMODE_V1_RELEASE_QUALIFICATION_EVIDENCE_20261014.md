# BOT MODE V1 — Release qualification evidence (14 October 2026)

**Decision: NO-GO stable.** This record is evidence, not authorization to merge PRs, deploy, tag stable, or move GHCR `latest`.

## Pinned candidate
- Integrated candidate commit: `54b30a342bf8f3480d7385b30cfa669b73c92878`.
- Published image: `ghcr.io/arkos77/librechat-botmode-v1:candidate-54b30a3`.
- OCI index digest: `sha256:07185a44a89b06e4ca855a868d6eb557feb60065084fdde5b2183050d1427b95`. Includes linux/amd64 and linux/arm64.
- Published-image workflow: https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38493152071 (SUCCESS, public anonymous pull and Lite smoke).
- Preserve original immutable index. Do not retag stable or publish `:latest` without explicit human approval.

## Passing disposable acceptance evidence
- Clean Lite install from published image, generated DB credentials, private dotenv and HTTP config: https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38497181747 (SUCCESS).
- Previous image → current candidate digest → previous image; Mongo marker persisted and HTTP readiness confirmed: https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38496222837 (SUCCESS). **Scope limited to Lite/image transition plus marker**; no migration/schema/durable task assertion.
- First-user registration, JWT/protected endpoint, configured **fixture** provider, native setup of six agents and ACL/delegation, idempotence, user/agent persistence after restart: https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38498130697 (SUCCESS). The six-agent setup is an explicit user-authorized API operation, not automatic on registration.
- Configuration-only checks of immutable candidate image on low-memory Crostini: `BOTMODE_RUNTIME_DISTRIBUTION=PASS`. No disruption to running user's containers.
- Static checks of rehearsal PR: https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38498130644 (SUCCESS).

## Blocking / unproven gates
1. **Actual end-to-end mission:** No qualified proof at this candidate of logged-in first-user task → orchestration → chosen model response → Oracle/publication → persisted output. The existing manual real-provider workflows pin earlier commits and can require protected credentials. No live API quota or provider availability should be assumed.
2. **Security:** Prior production npm audit exposed three MODERATE findings (`mammoth`, `argparse`, `sprintf-js`), 0 HIGH/CRITICAL; rerun against this exact lockfile, map affected paths/surfaces, remediate or formally accept with reviewer and compensating controls. Do not call findings fixed without evidence.
3. **Recovery depth:** Demonstrate authenticated/ACL-aware restore, backward-compatible database migration or recovery plan, and durable task recovery after rollback. Lite Mongo marker preservation does **not** establish these.
4. **Final promotion:** Confirm release owner, prior known-good image digest and backup, sign-off, final merged SHA requalification, and explicit human GO. PR #25 and integration PR #26 remain drafts; do not merge by inference from green CI.

## Recommended next actions
- Build a fully isolated **synthetic model mission** acceptance against the exact GHCR candidate digest. Use a local mock endpoint, no external API keys. Include explicit recorded evidence for orchestration, task completion, Oracle acceptance, user-visible publication, and restart readback; if native API cannot exercise that exact path, report missing coverage rather than substitute unrelated unit tests.
- Prepare a **separate manual live-model** check with a true free provider, hard cap of one request, guarded secret, and no unattended retries; only after clear operator consent to incur any potential charges.
- Capture `npm audit --omit=dev --json` on the locked candidate and review affected code surfaces before selecting updates or risk acceptance.

## Protection
No modification to `main`, no stable tag, no GHCR `:latest` movement, no production deployment. CI-only runs and test branch changes do not confer release authorization.
