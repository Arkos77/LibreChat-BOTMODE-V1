# BOT MODE V1 — lot sécurité de clôture — 22 octobre 2026

## État et source

Branche isolée fix/security-release-20261022, basée sur a7ba172929168132d6b0fe44c56d0e3f17b40d80. Le correctif JSON de ce parent reste inclus. Aucune image publiée ni fusion ; NO-GO stable.

Audit production du verrou historique inchangé (SHA256 4b0b6d51afb679bc3b1633f29609d3aa9bdce8515f4df719bf0ddc67d22b44b3) : 2 constats critical, 1 high, 5 moderate. Les deux critical correspondent à DOMPurify et à sa propagation dans Monaco, pas à deux failles indépendantes. Les avis actualisés ne sont pas couverts par D-02.

## Correction minimale

| Dépendance | Avant | Après |
|---|---|---|
| dompurify | 3.4.16 | 3.4.17 |
| follow-redirects | 1.16.0 | 1.16.1 |
| ip-address | 10.7.3 | 10.7.4 |
| sanitize-html | 2.17.7 | 2.18.1 |

Cinq transitives imposées par ces versions : is-plain-object 5.1.0, launder 1.7.2, postcss 8.5.31, dayjs 1.11.23, nanoid 3.3.20. Neuf entrées de versions modifiées au total, aucun autre module mis à jour. Monaco 0.56.0 et Mammoth 1.12.3 conservés ; aucune rétrogradation suggérée par audit fix --force n'est appliquée. Node 24 reste conforme aux engines.

La résolution npm incrémentale conservait des versions anciennes et ajoutait une copie Monaco vulnérable. Les neuf entrées ont été reconstruites à partir des manifests officiels du registre, avec leurs URL et intégrités exactes, en conservant le reste du verrou. npm ci propre a ensuite vérifié et installé les archives. Le blob GitHub du verrou est identique octet pour octet au verrou local testé.

Nouveau lock source SHA256 : **6e59734742daa69251821e2fed6a765febb4e58f9139743a98c91813dff234cf**.

## Preuves locales terminées

- npm ci --ignore-scripts : PASS, 2936 packages ; quatre versions installées conformes.
- Build data-provider, data-schemas, API et client package : PASS.
- 9 suites API (HTML/Office/DOCX/ZIP, SSRF/OAuth, config/LLM/routage free-only) : 436 tests PASS.
- API host routing / compatibilité / JSON SDK HTTP : 16 tests PASS.
- Frontend configHtml, utils artefacts, éditeur et panneau Artefacts : 182 tests PASS. Un premier lancement du panneau a échoué car son paquet dépendant n'était pas encore construit ; les 6 tests de ce panneau passent après build, sans correction applicative.
- **Total ciblé : 634 tests PASS**, pas une assertion sur toute la suite du dépôt.
- Prettier et git diff --check : PASS.
- Audit source production : 0 critical / 0 high / 3 moderate, uniquement mammoth → argparse → sprintf-js.
- npm prune --omit=dev : PASS ; versions corrigées conservées, aucune copie Monaco de DOMPurify vulnérable, audit de production installé : mêmes 3 moderate / 0 high/critical. Le verrou dérivé par prune diffère par ses métadonnées (SHA256 d2281b6657b87b20b18883818b76353af1b1b16edb343edd27e5f47df4ecbbc1) ; le verrou source ci-dessus reste celui qui doit être revu.
- Aucun appel fournisseur, secret réel ou installation utilisateur utilisé pour ce lot.

## Décisions et limites

L'acceptation D-02 du 19 octobre mentionne explicitement l'ancien hash de verrou. Elle n'est **pas étendue automatiquement** : rattacher explicitement les trois risques résiduels au nouveau verrou, avec la même revue du 16 novembre et la même expiration du 18 novembre 2026 à 23:59 Paris, requiert une décision du propriétaire avant release.

Ce source nécessite sa propre qualification d'image intégrée. Les preuves de l'image a7ba1729 et du digest public ceb60eca989b restent leurs preuves historiques ; elles ne qualifient pas ce nouveau verrou. Aucun GO D-03 de publication de ce nouveau source ni GO D-04 de fusion/stable n'est acquis.

## Sources de sécurité

- https://github.com/advisories/GHSA-cg2g-xh64-v4q7
- https://github.com/advisories/GHSA-mrv2-3pqr-j5jr
- https://github.com/advisories/GHSA-q3jh-wrc6-jgq8
- https://github.com/advisories/GHSA-8r9p-f939-6h3c
- https://github.com/advisories/GHSA-rxp7-6hxx-x8q5
- https://github.com/advisories/GHSA-x3q4-9hxx-gx8m
- https://github.com/advisories/GHSA-hp3w-g68c-fv3c
