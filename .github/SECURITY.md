# Security policy — LibreChat BOT MODE V1

This policy covers **[Arkos77/LibreChat-BOTMODE-V1](https://github.com/Arkos77/LibreChat-BOTMODE-V1)**, a fork of [LibreChat](https://github.com/danny-avila/LibreChat). Vulnerabilities affecting this fork should be reported to **BOT MODE maintainers**, not automatically to LibreChat upstream. If a problem also affects upstream, coordinate disclosure privately with both maintainers.

## Supported versions

| Version | Status |
| --- | --- |
| v1.0.3 | Latest published BOT MODE release; security reports accepted |
| Earlier BOT MODE releases | Historical; upgrade recommended where compatible |
| Unmerged branches and DRAFT pull requests | Experimental; not production releases |

Support here means reports will be reviewed. It is **not** a guarantee that every reported issue can be resolved, nor a claim that the existing release has no outstanding alerts.

## Reporting a vulnerability privately

1. **Preferred:** use [GitHub Private Vulnerability Reporting for this BOT MODE repository](https://github.com/Arkos77/LibreChat-BOTMODE-V1/security/advisories/new) **if the maintainer has enabled it**.
2. If that page is unavailable, open a [GitHub issue in this repository](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/new) **only to request a private contact channel**. Include no proof of concept, vulnerable endpoint, private URL, personal data, credentials, token, exploit steps or other sensitive details in that public issue. Coordinate a private channel with the maintainer before sharing the report.
3. Do not submit confidential BOT MODE findings to the upstream LibreChat Discord or repository unless they independently concern upstream and disclosure has been coordinated.

For the private report, please include the affected BOT MODE release or commit, impact, reproduction steps, relevant configuration/profile (Lite or Full), and proposed mitigation, with **test-only credentials**. Never include production secrets or another person's data.

The maintainer will acknowledge and triage reports as resources permit; **no fixed response-time or bug-bounty commitment is made**. Confirmed issues will be addressed through private coordination, security-focused pull requests and release notes when disclosure is safe.

## Scope and deployment

- Supported distribution: the published BOT MODE image and installer paths described in the repository. **Running an Internet-facing service requires additional hardening** (TLS, access control, network restrictions, credentials and updates).
- Historical upstream LibreChat code and third-party dependencies retain their own maintainers and licenses.
- Security fixes developed in DRAFT pull requests are not included in a published release until they have been explicitly approved, merged and released.

## Note for the repository owner — public-release gate

**Before announcing a new public release**, enable GitHub **Private Vulnerability Reporting** for this repository (Settings → Code security and analysis, where available), and verify that its submission page works without exposing the report publicly. If it cannot be enabled, establish and document an alternative **private** reporting address/channel. A public GitHub issue is not a substitute for sending technical vulnerability details confidentially.

---

## Version française

Les vulnérabilités de **BOT MODE** doivent être signalées **de manière confidentielle au responsable de ce dépôt**. Utilisez le [signalement privé GitHub de BOT MODE](https://github.com/Arkos77/LibreChat-BOTMODE-V1/security/advisories/new) **s'il est activé**. Sinon, créez uniquement une issue publique de *demande de contact privé*, **sans détails techniques ni secrets**. Attendez le canal privé avant d'envoyer votre démonstration. Les PR en DRAFT ne sont pas des versions publiées.

[Back to README](../README.md)
