# BOT MODE V1 — inventaire intégral des commits et du diff d'intégration (28 octobre 2026)

**Méthode** : extraction GitHub Compare **intégrale** sur deux segments contigus non tronqués : `4d7b4922ab35838fd6b89938e6704bd4d1bbc86f` → `a617052e3ffdbb5b4147e4f2cf9fb8cfae898b20` (219/219 commits) et `a617052e3ffdbb5b4147e4f2cf9fb8cfae898b20` → `7605e9186b84d4a7eb6d14be1bc9528c6033bbd8` (152/152 commits). L'écart cumulé `main` → `7605e9186b84d4a7eb6d14be1bc9528c6033bbd8` compte **371 commits, 231 fichiers**. Les sujets de **tous les 371 commits** et la liste de **tous les 231 chemins modifiés** sont inventoriés ci-dessous, pas seulement des extraits. Ce document est un **inventaire de provenance et de risques**, pas une affirmation d'avoir relu chaque ligne du diff et de toutes les dépendances ; toute mutation `main` reste interdite sans revue et GO distinct.

## 1. Sources immuables et état

- `main` `4d7b4922ab35838fd6b89938e6704bd4d1bbc86f` : branche protégée.
- Socle indépendant `test/botmode-host-research-20261024` `a617052e3ffdbb5b4147e4f2cf9fb8cfae898b20`, 219 commits d'avance sur main, maintenant soumis à une **revue DRAFT [PR #87](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/87)**, avec base #76.
- Source fonctionnelle et D-03 `7605e9186b84d4a7eb6d14be1bc9528c6033bbd8`, PR #86 DRAFT, 371 commits au-dessus de main, pas de retard.
- D-03 OCI AMD64/ARM64 `ghcr.io/arkos77/librechat-botmode-v1@sha256:ed493e0ffdfc7a1056d11834474b4127e0ae27ea52421e8d5fa9aa26e686c8a1`. La source ne doit pas être confondue avec les commits de cette branche de documents.
- Six preuves PASS, à ne pas relancer : N réel/Oracle/P6/reboot [#40750429460](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40750429460) ; Playwright [#40750154581](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40750154581) ; candidate D-03 [#40757067711](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40757067711) ; fresh Lite [#40767920565](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40767920565) ; Full/Mongo/rollback [#40769097230](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40769097230) ; licences AMD64/ARM64 [#40769106150](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40769106150).
- Audit npm **production, exact HEAD** : [#40750154416](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40750154416) et [#40750154684](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40750154684) : **0 info, 0 low, 0 moderate, 0 high, 0 critical**. Les alertes HIGH mentionnées dans les corps historiques #83–#85 ne sont plus les résultats de ce commit. Cela ne remplace pas une validation future à la date d'une release.
- La PR #85 utilise un override MSAL 7.1 ; **validation Azure avec identifiants réels NON ACQUISE** et potentiellement nécessaire seulement pour les déploiements Azure. Ne pas inventer un PASS Azure.

## 2. Filiation et décisions sur les PR parallèles

- #76 (`e001fad28d54953455ccdb5f7825016bbdb6fbea`) est déjà **ancêtre** de la candidate : ne pas fusionner en doublon.
- #77 (`7ed5ec4cb3626afcb6df0180694266857ccd8eb7`) diverge de la source mais les **29 commits présents uniquement dans #77 touchent 2 fichiers de documentation**. Son correctif applicatif antérieur est dans l'ascendance commune. **Ne pas fusionner #77** ; récupérer séparément les mémos utiles si nécessaire.
- #73 (`90fa68414aa51d0f18f01d2d798bc7cbd0ad9425`) diverge (7 commits) mais les fonctions de liens officiels de clés API sont **présentes** dans `client/src/components/Input/SetKeyDialog/SetKeyDialog.tsx` et les traductions FR du candidat. Ne pas appliquer une deuxième implémentation sans diff fonctionnel démontrant un manque.
- #75 (`91c2f5ff430f247b6c9332f53a259e54bf709328`) diverge (5 commits) mais les fonctions `authorizeOrchestratorMissionBindings`, `assertAuthorizedOrchestratorTasks` et `getReachableMissionAgents` sont **présentes** dans la source `7605e91` ; éviter de réintroduire le correctif.
- #78 → #86 : neuf PR **DRAFT** empilées, chacune cible la base précédente. Le champ `mergeable=true` d'une PR à sa base ne prouve pas une livraison complète sur `main`.
- La version Git `v1.0.0` est déjà ancrée sur `59598c2f4e333c256296bbb8c6f45a024832745b`, les tags GHCR `:stable/latest` sont déjà ancrés sur `sha256:20e921df9fda01dba00bc925fe1ae37ae24fbcc992f52f15aad60bfa5aae4c21`. Pas de modification silencieuse. Un nouveau numéro de version et un nouveau GO D-04 restent requis.

## 3. Portée de la comparaison cumulative (231 chemins)

- **Workflows CI : 9 fichiers**
- **Racine et autres : 6 fichiers**
- **API serveur / authentification : 34 fichiers**
- **UI / UX : 39 fichiers**
- **Documentation et preuves : 44 fichiers**
- **Agents / Oracle / P6 : 57 fichiers**
- **Dépendances partagées : 16 fichiers**
- **Scripts de tests/infra : 26 fichiers**

La comparaison cumulative classe 128 ajouts, 102 modifications et 1 suppressions ; GitHub signale les fichiers binaires avec changements numériques parfois égaux à 0.

## 4. Inventaire des 371 commits (SHA exact et sujet)

### A — Socle non soumis en PR principale — 219 commits

| N° | SHA | Message de commit |
|---:|---|---|
| 1 | `2109d10ea01793e17c43fc3004f15d9620c9c9e2` | fix(botmode): bind manual specialist selection to planner |
| 2 | `7d0691609795121a4854f42bdfcef493bd1b3054` | ci: retrigger BOT MODE specialist selection validation |
| 3 | `11702f96e490c4aa924dcedbca9835f0628d4aaf` | merge: reconcile specialist selection with latest main |
| 4 | `ee3e1b59713570542720295fe35c6eb68dd82dc7` | style(botmode): format specialist selection and merged onboarding |
| 5 | `ce28e5ca82f29090277ef8c40d24325a989a9cc6` | fix(i18n): localize BOT MODE specialist controls |
| 6 | `0628c689cb6ef46a641c29efc7008ad5807311f4` | test(botmode): expect onboarding when Worker is unavailable |
| 7 | `794ff29e3d17f1bb17b47ce8ff26de3e9ddef079` | test(botmode): align manual selection assertions with i18n keys |
| 8 | `ea3bf3c5d92e638bc8216030cf904a473b6f57ea` | fix(botmode): localize specialist panel and use filtered automatic bindings |
| 9 | `6d1db114c11a4591b0e30270c025dd68e72f2af5` | ci: qualify exact OCI candidate separately from immutable v1.0.0 |
| 10 | `b62c45ee876667e63947d2d7b2bc2e61ed8947e1` | ci: allow only probe metadata after candidate source SHA |
| 11 | `6092686c924c656f3477b6d63e3d124592c60634` | fix(botmode): bind automatic specialists to authorized existing agent IDs |
| 12 | `2c4e80a518700579b68ff978588a4d2506f740f1` | ci: pin exact OCI probe to authorized agent routing candidate |
| 13 | `087c9693c55357aff3d6f931aba400e62d174914` | fix(botmode): plan only objectives supported by authorized specialists |
| 14 | `4ed6ed3adc3288b7bc735152ed10428f69b55cf9` | ci: pin exact OCI probe to supported-objectives candidate |
| 15 | `25da20f4d89363cc08d0b9cc34662133ddea06bd` | test(botmode): require correlated specialist SSE in isolated OCI acceptance |
| 16 | `33c2b0280dc6085855230dc063f3254d05f03c8c` | test(botmode): await restarted API before strict child acceptance |
| 17 | `2ad3d3638f5158245e46af0b695555fbf0f212ea` | test(botmode): classify strict admission failures safely |
| 18 | `6bb4d524fba5a021e099afffd26069cc7db2b5ee` | test(botmode): classify 503 admission reason safely |
| 19 | `52ac75d8f540ed4e06a46d5158112409d74af0b8` | test(botmode): keep 503 classification safe for non-JSON responses |
| 20 | `47d561abce0470e5b09563fa0d665d029872d24b` | test(botmode): classify changed generation ownership admission |
| 21 | `d86337e065d7ff8673fe11c6e1e208e0b464692e` | test(botmode): isolate strict specialist admission before restart |
| 22 | `3ade7a9ebb0afcc765cf09afc346c1a88bec116e` | test(botmode): require specialist-only mission capability without disabling Worker tools |
| 23 | `34ea4cf134d3ae2b316d5868e5d548d984fe0524` | test(botmode): identify first failing delegated cycle counter |
| 24 | `93be6fb80355b13fdadb6264394bee8c1773f4bf` | test(botmode): inspect planned specialist events without native-tool assumption |
| 25 | `c98ac0e58f839ae54e14c87869ed112d33a01567` | test(botmode): inspect planned specialist event envelope for strict correlation |
| 26 | `80d01cab5ac4a4209386db0adc610e3ae11406a6` | test(botmode): attest direct planned specialist run steps and durable binding |
| 27 | `affca2bc7f35e8fb3f9e57efbef217888846fcab` | test(botmode): return Oracle-valid JSON from planned specialist fixture |
| 28 | `d1c66efe1613981958d3a3ae2c2cee44896b0a1c` | test(botmode): scope specialist-only requirement to accepted mission |
| 29 | `3ff20e10a2edb4b565be9fc93a5dea781ab56971` | test(botmode): separate planned graph durability from native child thread lineage |
| 30 | `110e451611535e13bc697b3efdcd7cdf4f15bf90` | test(botmode): isolate clean public OCI Lite installation and restart |
| 31 | `e945b56c56a2032c10432b008914d2d937631d8d` | test(botmode): honor UID 1000 ownership in fresh Lite runner |
| 32 | `db283b8ac5f04c6b65ddb61ce9af845bc8067c48` | ci(botmode): scope immutable stable digest probe to main and manual runs |
| 33 | `65b81bc6d7bbc880a9abc7705c4976ca8a7df662` | ci(botmode): permit historical CI trigger scoping in OCI pin guard |
| 34 | `639dd656e8fdd12de2236ac70a6185c7347586f2` | test(botmode): browser acceptance on isolated exact OCI project selector |
| 35 | `b664372d64b67234c565652a8510fd78c0d55739` | test(botmode): verify real OCI browser launch binds authorized specialist IDs |
| 36 | `ce133b2c75bb4521f761ae6e805399115e834f27` | test(botmode): isolate manual browser scenario from auto submission |
| 37 | `12754f2eb17acc5969b0041ea1fc27c5575b89be` | test(botmode): isolate browser contexts for manual and automatic launch |
| 38 | `c9c1fb731e928cef805d208aa47fb5028e2403ea` | test(botmode): open second transient project drawer for manual selection |
| 39 | `986536b0b79af5aa1ae20ce9723a3cbdbcd08a93` | test(botmode): match manual choice to authorized Worker binding |
| 40 | `6511f8ea7d7235a6ad366db588ae76c114d8f6b2` | test(botmode): attest browser agent IDs against disposable Mongo Worker ACL |
| 41 | `1f33a0e845392104dcc485205771ce6c795028b7` | test(botmode): require real browser mission POST on isolated candidate |
| 42 | `0d21fcbdaf8f91360372f149d3d1812a5a97b469` | test(botmode): require backend admission response for browser-launched mission |
| 43 | `c40961ce786ead78778fd60f993753feae733acd` | test(botmode): verify durable Oracle for browser-originated stream |
| 44 | `8a3a306201cf4f5d61cd74149f773e14e5ddac88` | test(botmode): classify browser stream oracle failure without content |
| 45 | `39d122c85a4a81561be2b057a71452e1a8d568be` | test(botmode): diagnose task count on browser mission |
| 46 | `d353256adbc42fdb48f71bbc06011988d8a04611` | test(botmode): keep browser SSE alive until mission terminal state |
| 47 | `9345e6c9dc36ebd5d2c5b30ca4c25b8ca92cd40c` | test(botmode): measure fixture calls on browser mission exactly |
| 48 | `f0e102ffdfe4e562252c0e401781bccedcedbbbc` | fix(botmode): supply Oracle validation contract for browser missions |
| 49 | `9056f5294cb4fd140416e44b775b6021de681a22` | docs(botmode): consolidate PR76 candidate OCI and Oracle evidence checkpoint |
| 50 | `177bee8803cd268a45716ca7a0f57e0ff4d8185e` | ci(botmode): align PR76 exact OCI acceptance with f0e102f candidate |
| 51 | `9b2de2a4a93aeb2e3a94b931f1715d5463f161f9` | ci: require five correlated Oracle verdicts and private candidate for browser mission |
| 52 | `e7039cb8bcbed0887dd50b9c4b875e1c3ea498d2` | ci: pin optional free OpenRouter probe to current immutable candidate |
| 53 | `9061268167db3423acea13d7af297545b970ff5c` | ci: classify exact browser Oracle verdict and candidate conditions |
| 54 | `244833cb62dd6db33d4ede6c4e1133afddcba10e` | ci: separate five verified browser Oracle verdicts from P6 publication receipt |
| 55 | `61430daf9e7c9ad71b546316ee83eb643651344e` | ci: classify planned specialist binding and dependency on live free Oracle failure |
| 56 | `3fd2cb8b8d4d01c0b638d617ba15851069d7687b` | ci: allow exact reviewed live-only diagnostic alongside immutable OCI source |
| 57 | `fa8da6f9d5bb45147947b28b6f4704ea10b5e373` | ci: correlate live SSE native worker and specialist node events without payloads |
| 58 | `06f49dca9a2e38b8f19bc22c6beaa0f2eeec2650` | docs: record real OpenRouter sequential specialist Oracle qualification |
| 59 | `e3945bcb7657ecaf2962f3f2deede824a4aca976` | ci: assert browser stream P6 terminal Mongo final readback |
| 60 | `8f679437a1d9ab8dde9a9b010840a9a569c4dfba` | docs: record passing same-browser-stream P6 Mongo publication proof |
| 61 | `5897ec93bc9b5d785c07125ed1872723045887fb` | ci: optional five-step free-provider native Worker specialist Oracle gate |
| 62 | `5658585d30a12dfcefdb32f381a3067c3f53792a` | ci: fix five-task diagnostic Python string literals |
| 63 | `40a9d27c1311d947e2a259f235cc7a3d8c2766e6` | ci: expose opt-in five-stage real free-provider gate while preserving two-stage baseline |
| 64 | `05a0d53ede3342c17d9b567368aeb6994f36e1ee` | ci: retain strict two-task SSE guard while extending bounded five-task deadline |
| 65 | `e4cf638a452eecd72b2f443b19d04c67b9293f5c` | ci: classify incomplete versus completed five-task free-provider terminal frames |
| 66 | `03ce186d2a21d7096c3d4f984ce63f73a31e4425` | ci: distinguish terminal error content from successful Oracle publication |
| 67 | `14d048bde1289051c0f210ff42d5ef08c06ff25d` | docs: record five-stage free provider Oracle rejection and safe SSE terminal classification |
| 68 | `475874c638fed6b78e987ba05cc5d29e330efceb` | ci: add five-step synthetic native graph regression before free-provider qualification |
| 69 | `cc0fa3925bb8767f812023a99dba5b1c36de96d6` | ci: correct Python string escaping in five-stage synthetic gate |
| 70 | `1148b3638ee7cf8e05fdae711777dab1043be654` | ci: run synthetic sequential five-step graph before browser and free model |
| 71 | `ba6ac842f2859bf7facb4d84a19283a47333b98e` | ci: wait for API readiness after durability restart before five-node graph POST |
| 72 | `6f5e3ce2fc569a1697d176062ce3a83db4d092dd` | ci: run five-node synthetic regression before archival restart to isolate runtime |
| 73 | `2c387015b7ac0f26ec91d7f26cc25d0c5c175922` | ci: classify five-node admission failure without leaking response body |
| 74 | `9fdff9056f9acdef9205576d4fe2231413802769` | docs: verify five-step native graph Oracle succeeds with synthetic model while real free remains unproven |
| 75 | `9501b1dcb2fa578252b53040e4fa060d18f0505f` | ci: isolate five-stage live gate to catalog-verified named zero-cost JSON model |
| 76 | `0bc005f36663c9b5084117e81ff24cbd09cc99a1` | ci: allow reviewed CI-only named-free-model preflight, retain immutable runtime source guard |
| 77 | `ea45405f84994c99bd0a4a013c177fcffaff5da0` | ci: bound temporary model-binding update and close Mongo on all failures |
| 78 | `f7d446d56c7267805d4c983cd0706c885790352a` | ci: bind free test model by Agent.id logical identity, not Mongo _id |
| 79 | `5d77d45a3abd3b47e9b68a0e415756683b2c1c11` | ci: select named free model through authorized agent PATCH and durable versioning |
| 80 | `1464ac4fa14674cb891be8df7aea8e3d6070662d` | ci: classify pre-graph Redis terminal error with existing safe diagnostic |
| 81 | `f2d3900f509990437eb09306c7b29d25d79640ed` | ci: classify free provider startup errors without exposing model or token |
| 82 | `2212b413cb3f7082b3604c9a42cf7dd89634dec2` | ci: classify pre-agent free-model startup failure with strictly whitelisted terms |
| 83 | `59eb8c10c90478208513fc0a05a8de0b2dcf9e61` | ci: reveal only allowlisted provider/model error vocabulary for root-cause diagnosis |
| 84 | `902a8f2703b837ae7bcb13a024f5be58b80ef784` | ci: disclose only fixed verified safe model/provider initialization error literal |
| 85 | `0ed8e89946bc3ad525b525966bf48cda29aad848` | ci: classify reproducible constant model error with digits and tokens redacted |
| 86 | `b0f21122e76bc1b91c56d6062b17ba07e63c67c1` | ci: keep original openrouter/free fallback authorized alongside named free model |
| 87 | `4dbf2642439b9540448ef046e4a41eeda1d3f848` | docs: separate real free provider rate limit from five-task graph correctness |
| 88 | `c5211ddcf8a8dea1b46ab8808493c3a4bde04d43` | ci: enable opt-in authorized free-only two-model rate-limit fallback for five-task probe |
| 89 | `6199a5f40538ffda8fa9b406819d26ab810fc262` | ci: supply catalog-attested free pricing signals to fail-closed host router |
| 90 | `5322507f51df4a06df2fb6b8b27ab172e9c1ab63` | ci: fingerprint durable init error on free failover refusal without leaking provider content |
| 91 | `194784083623ce83d03f8d85ee5132fa06b8ef7b` | ci: classify redacted terminal error content and fingerprints on free-only routing |
| 92 | `86946b1f6aa2d30a99cad3c147e4249703fcf3ea` | ci: show allowlisted redacted words to classify runtime free fallback init failure |
| 93 | `d19cfa9c83ebaf64093afc103d3c05029cbf7487` | docs: checkpoint exact host free-only routing diagnosis and pending real fallback verification |
| 94 | `26b1080e98eda49f540655e10de7248bc8a220ff` | ci: probe SDK OpenRouter registration in pinned OCI before executing free fallback |
| 95 | `4bad3350908a59bbc067ad3a8ebb115c10775546` | ci: inspect safe stack tokens for OpenRouter registry failure on pinned OCI |
| 96 | `8f653ae9952082e08caad83c1b8e926e0f9ba05b` | ci: compare CJS and ESM SDK provider registration and installed pinned-image version |
| 97 | `c3556e470de092d36acd8b7911e1caed2b1654d8` | ci: allow diagnostic negative control with same authorized free bindings but no SDK fallback |
| 98 | `4137366578722406a20c3c52ac5febc8aebb8c8a` | ci: expose negative-control flag to isolate SDK fallback constructor without changing runtime |
| 99 | `bcd4ec3f83955929dbed6a1c2be7e57e6bf18bba` | ci: test authorized OpenRouter free fallback through isolated OpenAI-compatible SDK runtime |
| 100 | `e001fad28d54953455ccdb5f7825016bbdb6fbea` | ci: opt-in free-only OpenAI-compatible fallback route for SDK isolation |
| 101 | `7fe1445e92a9a1f333fdac07b40c7de5e97ffb5f` | fix: honor explicitly selected OpenAI-compatible adapter for OpenRouter custom endpoints |
| 102 | `bebe29ab807dfb4c874b65cde9011d6a34f1b964` | test: assert explicit OpenAI-compatible provider override preserves OpenRouter free URL and automatic default |
| 103 | `1144a20459bdf09aa4dd81263e62f7a740d9230b` | ci: exercise explicit OpenAI-compatible adapter in free-only fallback gate |
| 104 | `ceb60eca989b8850ac10fab84f1eaac1eedd79ec` | test: prove compatible free fallback and qualify exact source-built runtime |
| 105 | `38c4012e7b2dfa145c6cc1912766c1d54d3ba95a` | docs: record PR77 source-built evidence and pending D03 [skip ci] |
| 106 | `6dc6bd81c136252546b1ec42d5b2d8dcffe3e5c8` | docs: record explicit D03 authorization and offline execution blocker [skip ci] |
| 107 | `9ca9add262df1b4ef960b01969e6a5a79f8b8af4` | docs: record approved D03 digest and completed Lite Oracle qualification [skip ci] |
| 108 | `2c3b02bddae608005cfb46e58432c2ec35c7165f` | docs: record authorized real Oracle failure and sanitized diagnostic [skip ci] |
| 109 | `06e207266f0a3209d9f9152a880a6f1f5d58dd6a` | docs: identify real Worker invalid JSON verdict from authorized diagnostic [skip ci] |
| 110 | `a7ba172929168132d6b0fe44c56d0e3f17b40d80` | fix: transmit endpoint JSON mode through native SDK requests [skip ci] |
| 111 | `64248339750f9e0f86e01530eb7067027cec8f6b` | fix: pin patched sanitizers and network dependencies for release qualification [skip ci] |
| 112 | `d93cbfd43485fd0ea9f491b565df3509adaf3a2a` | test: reproduce missing specialist host fallback during native missions |
| 113 | `866834c8bddb2d2ef02db26200b16e6c91cbf861` | ci: verify specialist routing regression without provider credentials |
| 114 | `b1b82007d09c2256d8ed0ce1354400665942934f` | fix: apply each specialist host policy through native initialization [skip ci] |
| 115 | `9dc6d436d6b07db4121827d62c1581afd29ffc24` | test: cover mission handoff and lazy specialist fallback admission |
| 116 | `d5979b96305cf281ce116471782e720f550c76cb` | test: use explicit authorized bindings for OpenAI specialist fixture |
| 117 | `bd12434b7ddd0ee71ab87b692f994e755bcc4bc0` | test: match specialist receipt to its actual durable decision identity [skip ci] |
| 118 | `55a1e69585d7ef2487af825b82c6d02c9b42c7df` | ci: prove all three regressions red on baseline then verify corrected suite |
| 119 | `9b3d022c09859e543e6ceb7c3aec358e317128b6` | test: keep specialist policies when primary selects a model spec [skip ci] |
| 120 | `d5b4c2800c6a2ec5f017e000368386ca563941b5` | ci: preserve three baseline probes and exercise selected-spec regression |
| 121 | `a6f6fee3c7dcfb5877fe798f759966774a046a58` | fix: scope selected model-spec routing exemption to primary agent |
| 122 | `06c03d04d628fefae96ed35422553a73216c7996` | docs: record specialist routing cause fix and 109-test red-green proof [skip ci] |
| 123 | `4df7e393e58262d55ea6fd636bb0f1ec1227aac0` | docs: stage inactive single-mission proposal for corrected specialist source [skip ci] |
| 124 | `b4eb797c669b502e722c0fc8b7304c2b80e5fbc3` | test: retain JSON on actual 429 fallback with and without streaming [skip ci] |
| 125 | `02c69058b3c84855fdfb52bb5e52f2d683f8c253` | docs: close authorized a6 mission with Oracle rejection and offline JSON evidence [skip ci] |
| 126 | `4918eda7e4b9acf9e05f1e83ffca76570d5e3a6d` | docs: persist owner-approved closure method and execution boundaries [skip ci] |
| 127 | `f081767f9733dd7855828ce395342ab41a2e6409` | docs: make closure method discoverable from agent instructions [skip ci] |
| 128 | `0f075cc05de08f88e40d69c90a59b3a4779c08e9` | test: prepare bounded HTTP-to-Oracle observation without inference [skip ci] |
| 129 | `168259c917007fc674b011f34009b66829d59bb8` | test: prepare bounded HTTP-to-Oracle observation without inference [skip ci] |
| 130 | `a04957ee17bb34018f2e8a92f54d2ac6eaddbe85` | test: prepare bounded HTTP-to-Oracle observation without inference [skip ci] |
| 131 | `bbc1f6c2af1018d2d239f4dee08f77b028e04fb4` | test: classify only observed HTTP-to-Oracle matches without raw content [skip ci] |
| 132 | `80deacecb5aafd4ed08a2b730b4542ca79ab8270` | test: reject ambiguous attribution and verify private trace preload [skip ci] |
| 133 | `bc205b865c5df918962858141a000eb3c0b07f4f` | docs: stage inactive observed mission with prebuild gates and image reuse [skip ci] |
| 134 | `730e96c2f2e32555d631748579ae323449b4f943` | docs: enforce observation evidence and valid metadata [skip ci] |
| 135 | `9e8a2fdcf36e8f1329134f4e1296920e5852d05a` | docs: record reviewed closure method and remaining evidence [skip ci] |
| 136 | `828df4c5657edfbbabfc7bbb40b646e26f65c293` | docs: record single observed mission authorization and activation [skip ci] |
| 137 | `b6cb0a62c0d897790e5f6253385470e581c3fabf` | docs: record four verified stages and observed upstream 429 [skip ci] |
| 138 | `1b150a578f3d71d8084fb722f99e0e1373286b22` | docs: update latest observed mission evidence and provider blocker [skip ci] |
| 139 | `363d23f816e1f37413c1ae70ce31608d7d62e8ea` | test: bound SSE observation by event and visible content [skip ci] |
| 140 | `4dbf279a9d4fcdd6a7241c244abdd75bfac42c3e` | test: bound SSE observation by event and visible content [skip ci] |
| 141 | `0f6c4016e4d15dfd54b149da68e81869ae27cbdb` | docs: record reviewed incremental SSE diagnostic and 30 local tests [skip ci] |
| 142 | `5e058a2ab001a9035b651ff875de152171904926` | docs: prepare reviewed single mission reusing exact image without build [skip ci] |
| 143 | `07b462f07aee835f1c43cc0e77b2d15ac9bd0fc6` | docs: publish explicitly authorized five-task Oracle and P6 evidence [skip ci] |
| 144 | `9945e9ef3d5e2547d7552a7276b7a1b0c31964dd` | docs: promote proven five-task and P6 success, retain remaining gates [skip ci] |
| 145 | `e0b04d3cfb961c093b7749fe8b845bf307b34623` | fix: preserve authorized SDK alias in host usage receipts [skip ci] |
| 146 | `cacd885b4056a1ceaede7b88cf14299cedcc65c6` | fix: preserve authorized SDK alias in host usage receipts [skip ci] |
| 147 | `f4c2c6981ec739966f60fa8387a0d169f54f067f` | fix: preserve authorized SDK alias in host usage receipts [skip ci] |
| 148 | `a41dfb04d36273608f422a5ddd36c30c971daaa7` | fix: preserve authorized SDK alias in host usage receipts [skip ci] |
| 149 | `0f4691410fe614207001c8ff091a026325db2418` | fix: preserve authorized SDK alias in host usage receipts [skip ci] |
| 150 | `fd0121331403654898b73ea8dfd7671b6e78a2c3` | docs: record reproduced receipt alias bug and 264 local checks [skip ci] |
| 151 | `780937417c04a0bccae6af93986d4e22219f1b68` | fix: attribute native mission usage to canonical saved agents [skip ci] |
| 152 | `32409e019e6f93194cc52801029f2ec07c438919` | fix: attribute native mission usage to canonical saved agents [skip ci] |
| 153 | `b01a91f252723a9fbf85356cc7a76bc1228e415e` | fix: attribute native mission usage to canonical saved agents [skip ci] |
| 154 | `82514683fb471d2cc5e4909ce6826a7f356ac19b` | fix: attribute native mission usage to canonical saved agents [skip ci] |
| 155 | `b2213e9717b879a91181c6ac9d7607124c30258b` | fix: attribute native mission usage to canonical saved agents [skip ci] |
| 156 | `d59dedf071d26503ec9bec5a31ee474f0ccc9724` | fix: compose verified specialist admission and approved provider key links [skip ci] |
| 157 | `a9ff14efb01b14f0657f756a2c7a2e11380c366b` | docs: plan mission output and Oracle failure boundary fixes [skip ci] |
| 158 | `2c2fa5d6b162d9878f0a98b9e7e3be825b4f0606` | fix: align mission output contracts and reject failed draft completions [skip ci] |
| 159 | `de9c11588d4bdc3681765d2f4f66319a84307b3a` | fix: preserve queued attachment and aborted mission ownership [skip ci] |
| 160 | `3d27457050426d7a77230dcf056e65be0f5e69d4` | docs: record checked mission correction and inactive candidate scope [skip ci] |
| 161 | `fc8b1ff869c5d3b6bb74e3a1c40d6d552413cb5f` | fix: preserve BOT MODE mission routing across chat transitions [skip ci] |
| 162 | `22a2a7a0c662825f880a341bb83c4ff48b05b513` | fix(botmode): persist mission mode across conversation reopening |
| 163 | `fbd595f0010ed3d2635d9e890aeeba45a3e7a581` | docs: record exact durable mission qualification and installation [skip ci] |
| 164 | `213a897a01026d52f65f0c9f61185993d07f10de` | fix: require usable results for host-admitted BOT MODE missions [skip ci] |
| 165 | `78d96fadfd11f1145b29366436d495a04048cb30` | fix: bind research citations to native task source observations [skip ci] |
| 166 | `8743ae58ab10db50a187279265b4f854c95b0d88` | test: prepare local search and model fixtures for result-source image qualification [skip ci] |
| 167 | `ebcfd807846ab3e5f4a0d983876be182a1d0ee92` | docs: prepare exact public result-source publication approval [skip ci] |
| 168 | `843b5b9a64dc941642a9ff2605604763ab2e58c0` | fix(botmode): capture sources using native SDK node identity |
| 169 | `b0f6619ee8ae7c42b14295bcc82e3853c7df45d7` | fix(botmode): resolve native task tools through authorized saved agent context |
| 170 | `6aa75984e337a29af96d37fd2e2bd43da669f3c1` | test(botmode): narrow optional resolved identity before context lookup [skip ci] |
| 171 | `d71a00da7e9f73fd7682d2c75f8176dd612e89ac` | fix(botmode): retain native sources across verdict persistence |
| 172 | `7fa5b79dcffc8bba59db33162de66af7728fc35e` | fix(botmode): explicitly enable automatic choice for native tools |
| 173 | `9f6a2a02f2ceba35a894afc53ef3cc4a99136f4e` | fix(botmode): preserve complete server-owned mission plans |
| 174 | `8c0cc8d938c7469bd8574326a3ba4abe0f9da87a` | fix(botmode): preserve additive legacy mission obligations |
| 175 | `10c470244457b78ca77923054013676e0cc59fca` | fix(botmode): enforce checkpointed native research phases |
| 176 | `ded5065eebdcc8a937bb6652dab31c415255a8c7` | fix(botmode): include research observation usage receipts |
| 177 | `f2b23fe28aa0a743ca390a0a68185ee05e3327b9` | test(botmode): prepare exact compiled research candidate gate |
| 178 | `c4d1bf9e4b0f10bfbca1ade93e97da830f10e386` | docs(botmode): record compiled candidate preparation evidence |
| 179 | `e40f1e57c61f4d0eb82dc5304859ad1992f70bfc` | fix(ci): route research qualification through registered manual workflow |
| 180 | `cb55aa39e473d8e68bdc747ddf02495190309a9d` | fix(botmode): retain research sources through recovered Oracle state |
| 181 | `f9d50e74e26423704742b15ebef249b82c5b8daf` | test(botmode): simplify recovered source refusal fixtures |
| 182 | `41a748fe1d2d708325f045c2a1c6028a2bcc9e11` | docs(botmode): close recovered source evidence correction lot |
| 183 | `03d8aa97a56780d245d9801b52d3e18239ca3e54` | fix(botmode): persist observed sources before research result phase |
| 184 | `cc18d0a276c718f88bbf0b0d85723d698b22f565` | test(botmode): verify source barrier through host callback and compiled HTTP |
| 185 | `2922228c55e9e276f1e5bce5de9882c30dbbc4e7` | docs(botmode): record source persistence barrier verification |
| 186 | `f5f8f2e8406685b5686efa0f74071ef5be1d1c84` | test(botmode): prepare isolated host research and durable publication gate |
| 187 | `1c63ed0d741b0ea29d105b928adc7e61b71f3332` | test(botmode): finalize isolated host qualification safeguards and scope |
| 188 | `10e7ee05810c264c989750dd97a579e804c3ed44` | fix(ci): scope runner cache context to the source gate step |
| 189 | `068f9c933ae5840d6b8d8bb4feb5278aaaffb9b1` | fix(test): validate isolated research configuration before Docker |
| 190 | `bb60863add52c14edc26a1609f643001e5f58cfa` | fix(test): reach isolated API directly and reuse verified candidate image |
| 191 | `bcf76085f4a1de25e923c2099da96f4649638aae` | fix(test): isolate guard fixtures from runner environment |
| 192 | `0547740da9062d4cc7666eeba249c8f86dba62a0` | fix(test): wait for server readiness before mission admission |
| 193 | `ab4248b548f77ec66c4cf97e2109a1272f20abc9` | fix(test): recognize cached OpenRouter text blocks in source fixture |
| 194 | `0b762497297bbb631224970c0ad9d1cd46ce4482` | test(botmode): prepare bounded real free provider qualification on retained image |
| 195 | `0816123bfb5baa08af5d2fc8dfd32660e2a00842` | fix(test): reject provider redirects before forwarding credentials |
| 196 | `90a2c96679f3775a8f883befed9cb6f12f9df1f1` | test(botmode): retain bounded local relay rejection diagnostics |
| 197 | `e7bd9f1b29f391aea4e057723109a0e9fb6a60eb` | fix(test): accept native subagent schemas in bounded free relay |
| 198 | `e6784e62af0b1cb726bf0f5eecda0919330c05a1` | fix(test): validate function schema without duplicating native tool permissions |
| 199 | `5bd9ca138abb89d73be27bf4b71bf7164f1cb8e7` | fix(botmode): transmit structured task contracts to native model providers |
| 200 | `9a1a1523bb9c8a8ed3bfe138a0aaf56a80d6099d` | fix(botmode): keep null criteria honest and gate structured output transport |
| 201 | `d19f537f5aac8b00a18e621d1549e2e35fd05205` | test(botmode): reuse qualified schema image and retain provider contract parameters |
| 202 | `581e07eb9ef48373dba4663d046e4f3601616707` | test(botmode): prepare bounded fixed free-model tool and schema preflight |
| 203 | `4cc61903f8e5934471b2c42b52b5885ffd176f18` | fix(test): validate catalog size, model identity and reported free usage |
| 204 | `b22a96e830de0c9796668e4710cabd155bf99e22` | fix(test): accept observed free catalog without optional request price [skip ci] |
| 205 | `81b23dbfe111b355ac783cd488e13c1576804f4c` | test(botmode): prepare fixed free-model host qualification profile [skip ci] |
| 206 | `166357dc015055ebbe366b09bf99f1b32cd14950` | test(botmode): supply substantive bounded synthetic research report [skip ci] |
| 207 | `2c82b7578dac513909c9fdd970c424cbeb4b2fef` | fix(botmode): recognize native citation suffixes in observed URL checks [skip ci] |
| 208 | `a1cb74f492c2078222fcb865c5c389c13584aca3` | test(botmode): preserve pending provider lifecycle and native failure state [skip ci] |
| 209 | `9bd9ceb770406c0eb61312942e356760ca3d17d5` | fix(test): classify incomplete HTTP reads and guard pre-cleanup evidence writes [skip ci] |
| 210 | `77970644e275fd201edc2391588351b6ce93fbd6` | fix(botmode): scope internal research to direct source URL instructions [skip ci] |
| 211 | `99ebfc4b70bbc5765399a46b5db10fc9cd15da86` | docs(botmode): propose explicit citation contract separation [skip ci] |
| 212 | `1d98d2ccddf450a34c9f64d0ae24f67b43d8d54c` | fix(botmode): version research provenance and render verified sources [skip ci] |
| 213 | `4bbd7990a8392a0a9ca328316cbf90f54dabd1fd` | test(botmode): capture exact SSE and Mongo publication evidence [skip ci] |
| 214 | `a8b8073211367c06b33c491dc9973340692a416b` | fix(botmode): preserve authorized context across SDK fallback [skip ci] |
| 215 | `b7fdcbdf231d98858613b6742fb8a649bf66699e` | test(botmode): prepare retained-image native free fallback qualification [skip ci] |
| 216 | `e05a9fe6c51d5fa1e30a1c693e65d179b991f36b` | test(botmode): fix retained-image pre-key profile probes [skip ci] |
| 217 | `992133e2de0e6d87355f43873fa147e5e3a2ded3` | test(botmode): diagnose native fallback context drift without inference [skip ci] |
| 218 | `26e8586cbc802f5f7ca9ba2863c073cd967e78ba` | fix(botmode): preserve implicit tool choice on analysis fallback [skip ci] |
| 219 | `a617052e3ffdbb5b4147e4f2cf9fb8cfae898b20` | test(botmode): pin retained analysis correction image for synthetic host gate [skip ci] |

### B — Pile expérimentale PR #78 à #86 — 152 commits

| N° | SHA | Message de commit |
|---:|---|---|
| 1 | `c0a2cb7948e9a22abee5d206c92618f892c6080a` | feat(botmode): separate orchestrator from specialist agent selector |
| 2 | `2523cf1f769b732a8b16c5594bc97732af89a00c` | feat(botmode): offer optional project for long chat requests |
| 3 | `d2d32e1487ce35e4e888d83ee052c9d43f12adba` | style(botmode): apply repository import ordering to project prompt |
| 4 | `f985e0127f5c60242025dda7ead1f346e6e57693` | feat(botmode): show mission progress beside chat instead of thoughts |
| 5 | `c5ebbb43db64d1fce86faf50befe0d85a8560d69` | fix(botmode): pass numeric progress values to localized counters |
| 6 | `9efb0b5140d716dd6ad12904bbb2bb883707a746` | style(botmode): meet client Prettier layout checks |
| 7 | `90cd2cb51444f78600ada155c61d975fbfee6acd` | refactor(botmode): use single header progress toggle without close button |
| 8 | `a626bb071c3b1075261824058a0ae542a7dffe1d` | style(botmode): simplify Oracle progress count expressions |
| 9 | `132080e7f3390451402383c4b392d85b3490d54b` | fix(botmode): visible progress toggle and incremental mission activity |
| 10 | `2f0fbcf420125a729cb9c2546fb84c83a3382b5d` | test(botmode): preserve Presentation isolation and match Prettier |
| 11 | `548b845d8524dad3e621b3810560b2e2036c10f0` | test(botmode): count only observed mission stages |
| 12 | `09226f506508da28a4b537706f85eb5f396eec09` | chore(botmode): remove obsolete progress translation keys |
| 13 | `75933b3279f62a1a7988e2a99526d9e6076f26d9` | feat(botmode): dock interactive tool usage in left sidebar |
| 14 | `9226445c0722b351c2d1ef0cd493357ac47fa090` | fix(botmode): dock interactive tool activity inside right progress panel |
| 15 | `067e0363ca70be4e1d609b464789fd1722f11067` | style(botmode): align right progress stage section |
| 16 | `d0b7c9c9c014c69af4285e6a57a60d0a8d457da2` | fix(botmode): include single web search tool in right progress panel |
| 17 | `c25e749314278fe77d4ae2cef4277a040ce8822e` | test(botmode): meet strict lint for single tool progress |
| 18 | `9145de18e33c8fcde1f9ed161e6c6e95914fc843` | security(botmode): patch five production npm advisories without major upgrades |
| 19 | `388537f9afb09a5efd71a17030c4756404b9ad64` | experiment(security): assess OpenAI 7 and Zod 4 across workspaces |
| 20 | `bdc5ef01f4fd3620c9d1596cda15e1abb9d52286` | experiment(security): isolate OpenAI SDK 7 after Zod 4 breaks shared build |
| 21 | `dfaa84b71fd89537a30084bb8eddb72b846b2e57` | fix(experiment): declare SDK for shared API TypeScript imports |
| 22 | `d496601066f9f4827591bd9957faa330cfcc141e` | experiment(security): evaluate patched MSAL 7 override with offline Azure guard |
| 23 | `4d33ab1bff71281bef2a7bf9b82fbc86608fac16` | test(botmode): verify intent-only browser ACL and Azure Jest isolation |
| 24 | `6c196955c1771ce28e273fe6109b01cbe02e9bb3` | test(botmode): correct analyze mode acceptance and diagnose browser stream |
| 25 | `ff34fb1ca2f8a903a0b3186f388b277628065858` | style(ci): format Azure compatibility test assertion |
| 26 | `2e443695300235e9a37115ea9434f05dbe31fe37` | test(ci): diagnose bounded browser specialist selection mismatch |
| 27 | `a5763abe06ebf6422e5fd528fe7fdb724b3717dd` | test(ci): avoid comparing posted specialists with consumed route params |
| 28 | `4bf6b10518701ceb2960f3ce3af41ce0b7b9e3ec` | test(ci): capture bounded tool exposure metadata for browser mission |
| 29 | `4acf6a47f524a941b7f2537d553a54bcdd8d19d2` | test(ci): report sanitized browser model-request tool metadata |
| 30 | `7fe14b63d0defb2d61580d2beb3c2954bc610023` | test(ci): classify forced browser mission tool without request payload |
| 31 | `3b6f1f86daf7eccb1e39d19fe08e232f699929db` | test(ci): expose sanitized tool-choice classification for browser acceptance |
| 32 | `51e433df6e06e1f2b013a3ce54c4f56f247a3f70` | test(ci): honor forced native web_search in isolated browser fixture |
| 33 | `fd9b543a61a676b34ec0002295bfa323074574e6` | test(ci): serve bounded synthetic web sources for native browser tool requests |
| 34 | `926b34dc45c365bcb55ab6ad984d25881f27d7ea` | test(ci): classify browser mission Redis error without exposing error payload |
| 35 | `ec9d18543755f994683da20ce546f0537e369d3b` | test(ci): report bounded redacted browser failure message to pinpoint failing stage |
| 36 | `a35f740304b2e51f49079c9691023ea91c5e18f9` | test(ci): classify failing browser mission API logs without exposing contents |
| 37 | `6cf3a73ac8ecf08d0a2c5c57378204f2cce5e4f9` | test(ci): classify originating browser generation exception from existing API logs |
| 38 | `2ff1496d9fffca312f77deb22fb642a7e4294e34` | fix(ci): finish native browser research phases outside source-mode fixture |
| 39 | `691a5c7d48ee0afdb129f7687d3ec037095464b6` | fix(ci): configure browser native web search to isolated SearXNG fixture |
| 40 | `18db31956e5bb0a61ac0b5cc14ff6ee5baf65783` | fix(ci): resolve isolated SearXNG URL through LibreChat web search auth env |
| 41 | `04a5748b19d0d72db74231e2dfc71de296f4f053` | test(ci): expose bounded Oracle rejection metadata on real free gate |
| 42 | `2087cc4d7b88c67d7ee4e0975c83b7ae5089f186` | experiment(security): coordinate Zod 4.6.7 dependency trial |
| 43 | `47ec682286731de65254e80c4f346a4000d198cd` | fix(experiment): migrate data-provider Zod 4 record and default APIs |
| 44 | `65f4fa042edc567eb5c835953f8d1be5a780e666` | fix(experiment): migrate remaining one-argument Zod record declarations |
| 45 | `15c3ab0c875f2e35a33d5db1f96ef3349bab5685` | fix(experiment): update remaining Zod 4 records and issue metadata |
| 46 | `814833cdd7fa4523105bc13cc2bbf3aafe3f3133` | fix(experiment): align Zod 4 default with retention schema |
| 47 | `2ea4fd7d03113fa2377ca9281b06ff2e652d8f5a` | test(zod4): assert public schema description rather than v3 internals |
| 48 | `5c36355b755e1469d21ca80e16712f447272868e` | fix(zod4): align client/src/utils/email.ts with v4 typings |
| 49 | `2562a423083df45ccf941e08552853d545194df7` | fix(zod4): align packages/data-schemas/src/methods/mcpServer.spec.ts with v4 typings |
| 50 | `b3958d12481d19e77154071eff1ae21fb9c33da6` | fix(zod4): preserve HTTP validation diagnostics using Zod issues |
| 51 | `2de5c948c505840d789df2bcce37aad85886a253` | test(zod4): align expected minimum-length diagnostic with Zod 4 |
| 52 | `7eec1a16372ae6136ca2da82082e28b6c4c2f613` | fix(zod4): infer schema types rather than using removed v3 generic signatures |
| 53 | `e7da101ed47c06bdea19f02dbdd2ad62db13f3a2` | fix(zod4): infer schema types rather than using removed v3 generic signatures |
| 54 | `32d184f447fc41281a538343fe1e0b70f3708494` | fix(zod4): preserve optional MCP env output after transform |
| 55 | `08f6f49a242c63f5b032560eb3e8335bc2b4683d` | fix(zod4): explicitly type exported schemas for isolated declarations |
| 56 | `ff2169ba8d381960fc587e452b7337e2662459e1` | fix(zod4): explicitly type exported schemas for isolated declarations |
| 57 | `7b6e9ce1bca56d5f91d0be1d2eb2ea8b8ecd3f65` | fix(zod4): replace legacy agent schema declarations with inferred base shape types |
| 58 | `58f8b3aaf9e66ca4bd0394772e27f77f4477347e` | fix(zod4): explicitly type agent code environment schema for declarations |
| 59 | `71fe7ae4c955391a080915105869ab58dd25271d` | fix(zod4): infer base agent schema via typed factory for isolated declarations |
| 60 | `375ef90f57c57226a6ef79db0a4fdbc5614b2147` | fix(zod4): express agent schema shape for isolated declarations |
| 61 | `6af1569aa2b2495c32465d5f3f2740b821cfba4b` | fix(zod4): use explicit string keys for agent model parameter records |
| 62 | `ef32bc2da5cbefafccdda6dc9c61b708f3c7feaa` | test(zod4): evaluate TypeScript declaration generator instead of Oxc on draft branch |
| 63 | `cdd0cb5487cf7f9a90edeb22850e9785fd4c4e5e` | fix(zod4): infer agent schema types rather than Zod3 generic declarations |
| 64 | `4df7964db3d660e6476995397f19fe75a645512e` | fix(zod4): update deterministic Oracle record keys and safe-parse type |
| 65 | `f07812069dae25619523f1db768c797d3883bd85` | fix(zod4): infer HITL question tool schemas without legacy Zod3 types |
| 66 | `f129f8cf4b9e7f33ea0add09f88d80c4a04c2df1` | fix(zod4): use origin for oversized hook array validation issue |
| 67 | `acb037bb34eed42c8b1f56706b3e77d6ec553382` | test(zod4): assert MCP parsed paths without unsafe unknown property access |
| 68 | `e4a374d35e8103c5455e27d48adbe6e5b9aeb36e` | fix(zod4): preserve MCP field descriptions through optional nullable wrapping |
| 69 | `f7c52dbd8923bbc24476c12fbd4d43661e52fcd8` | fix(zod4): ensure empty schedule PATCH does not materialize create defaults |
| 70 | `e828a15e265e56e2332bb329bd77cd0c9f934617` | style(zod4): align seven migrated TypeScript files with Prettier |
| 71 | `961b36b12595cf153a18d2a636a1aad7700c775e` | fix(zod4): remove unused agent subagents type import to pass strict ESLint |
| 72 | `3e5c180167858ea3407981ad54d73082794cf519` | ci(zod4): isolate exact-HEAD orchestrator Oracle P6 offline integration on disposable runner |
| 73 | `e7b46ce8daf682ab43040a4a302c3b1fe8317b6a` | ci(zod4): test exact HEAD image with synthetic worker Oracle P6 browser mission |
| 74 | `cc5a01c88449b627cb57f4e8148b6f10ed98f889` | test(azure): exercise MSAL7 managed identity token exchange against local App Service fixture |
| 75 | `830ec2e84a0d34b876c4e3fd8995747001d78ead` | style(azure): format isolated managed identity token fixture |
| 76 | `58ecc1f779800ddaca6714fb623651908a055b01` | ci(zod4): gate Azure-disabled mode against actual isolated runtime before browser Oracle P6 |
| 77 | `54bd353609e75e56ff255d0080ac704d0db2e3a2` | ci(zod4): bound Azure-disabled runtime probe and close Node process deterministically |
| 78 | `6dcedc99f5b01ac282cec09e01eb22b47f2c468d` | ci(botmode): isolate one real zero-priced OpenRouter completion on explicit dispatch |
| 79 | `fd8443bbf694e7afcbb5bd1c8edf60fe567bb97f` | ci(botmode): gated exact-HEAD two-step real free OpenRouter Oracle/P6 proof |
| 80 | `d8e6d29d158d5cf8bfab927152f66a2fffbf93e6` | ci(botmode): correct free-only workflow binding interpolation |
| 81 | `4bf5af32b594157075e421b72247fed63d53d7fa` | ci(botmode): restore YAML integrity of opt-in real free mission step |
| 82 | `e41d49deb15f7e9b0642b235b7daf7077ee89306` | ci(botmode): prove strict Oracle JSON response_format on zero-priced OpenRouter model |
| 83 | `43341824cc70f848cb2d3be2044881a6876650e0` | ci(botmode): test named zero-cost model with strict supported JSON output |
| 84 | `dcf0cff77e3549d8199487b7c3cdbb1711860999` | ci(botmode): enforce strict JSON schema in free model probe and classify empty result safely |
| 85 | `541eb61eb73df463ab40ddee185c987682631173` | ci(botmode): bind real Worker and specialist to proven zero-price strict-JSON free model |
| 86 | `a975d54d7afcca39fa34659de6312656ace1bee7` | ci(botmode): fail closed on native nested subagent Mongo lineage after API restart |
| 87 | `0fe17e01137ecf95c2e85f865045040e5ffbf53d` | ci(botmode): prove free model emits native subagent tool call before full live delegation |
| 88 | `294f9f4369c23883267335d2ca83b7d724b901e6` | ci(botmode): register manual free subagent tool probe via non-generating PR workflow |
| 89 | `c3d8bd51c9e5db45f2a0dcea4a16fadfa115bb4d` | test(botmode): add single-mission real-free native child Oracle P6 gate |
| 90 | `5b349b971e0b9d64c39e8d05825337e34ce0b6d7` | fix(ci): read real-provider diagnostics from dedicated endpoint |
| 91 | `d2d4af56d86b7cff82bf82a1cf13f3fee84bc66a` | ci: opt-in bounded real-free native subagent Oracle P6 restart on disposable runner |
| 92 | `1b9673c0d980a9c2ef7b4ae428703c765cdb9781` | fix(ci): use actual Redis stream job key and allow depleted free quota on spend audit |
| 93 | `70cbdf927274ce5218ffe24b53d11e12f2aaeb30` | fix(ci): wait for fixture port release and assert real-free relay readiness before mission |
| 94 | `b850a0615f49d29cfcae2880e90fcb2e071d6486` | fix(ci): remove redundant fragile relay metrics read from real mission gate |
| 95 | `79e5f8ae25ea95167d05c8d9545bc0a8667ffc0b` | fix(ci): wait for API restart readiness before real native subagent admission |
| 96 | `cd03ecfd2f788bfeea95679594ce2440af7276c0` | fix(ci): observe async native mission SSE until terminal, reconnect GET only |
| 97 | `bea47461f27e528ae3b3094737a7b18cc34108bd` | fix(ci): bound native SSE observation by provider budget and classify Redis/provider timeout |
| 98 | `8320e81b04573e11910eaf8f21af050730994c5e` | test(ci): expose allowlisted free-relay rejection class and abort impossible SSE early |
| 99 | `b914a8ce2eb587e4b42064bc7b6f5caaa33a3576` | fix(ci): force off SDK reasoning in runner-only zero-price OpenRouter relay |
| 100 | `dac5365f50439b8e0ccb5c242cc205fb1ef1258e` | test(ci): fail fast on OpenRouter non-200 and classify request parameters without raw errors |
| 101 | `1537b1c7a5993cfc2defb6a317999db01cfd492d` | fix(ci): omit optional reasoning control rejected by zero-price Liquid provider |
| 102 | `91c9e600a6d4f8837bdff9a01829031e650f562e` | ci(botmode): classify free-model 429 without retries, paid fallback or Docker |
| 103 | `7f301171082c142bd2837590609f98a6eb97ce48` | ci: bounded zero-price alternative model selection with tool and strict JSON probes |
| 104 | `ae758bd8aa7432150ac5e3ac7d6a790158015941` | ci: opt-in free-alternative probe in existing lightweight workflow |
| 105 | `91c26ab3e80d8f181758fd5cd94e9852729f4288` | ci: isolate verified NVIDIA free tool model and safely classify strict JSON output |
| 106 | `e6a8a485c7635ba701866e2d9e0ef875b4612a7b` | ci: allow targeted two-call NVIDIA free structured/tool probe |
| 107 | `3f73abf314ae51f4787f0975df06f250c0becd4a` | ci: bind integrated free native Oracle gate to verified NVIDIA zero-price model |
| 108 | `48933a64b002c0352697b8ebc544db439bd26319` | ci: use tool+strict-JSON verified zero-price NVIDIA model for one native integrated mission |
| 109 | `45fd460a9a5ef9072bdae14273c1c38bdd20a37c` | ci: diagnose real NVIDIA native child SSE vs provider tool evidence without weakening gate |
| 110 | `264490d6a3873c1380c5ab98adb8807024181944` | test(ci): preflight forced native tool choice with JSON-object on free NVIDIA provider |
| 111 | `82f6c6133744596c39fe20e35afb0b97c18589b0` | test(ci): force only first authorized native subagent choice in real free runner |
| 112 | `007a4ec93f7f2789dab77d7b7302183fdb3b0b18` | ci: report whether first-turn native tool selection was forced by runner |
| 113 | `ebe94325b319e473bad0b451fa4d840bfec254b2` | test(ci): require native background child completion before real free mission Oracle publication |
| 114 | `a8bd98303d57e9af7433e8848cf9d4b97ec39b78` | test(ci): attest real detached subagent via completed durable Mongo lineage rather than parent SSE |
| 115 | `37a0f7f001ac0ef1eb7166a89314e88641e42859` | test(ci): inspect terminal unfinished flag in detached child readback |
| 116 | `a0be1ea945f21f8782ecec3c32dc7381502f719f` | test(ci): align detached completion with host wakeup, diagnose child status without content |
| 117 | `2cf38788562455fb9cfa7f24d4c3bf8e46f7bb4b` | fix(security): patch qs to 6.17.0; restore zero production advisories |
| 118 | `c6690f2453c47c67acb1d85db01b0564619b3835` | ci: isolate unforced free-model zero/one subagent choice, two zero-price requests |
| 119 | `f41e8e951dd595cc929891f25442b965a52e88a7` | ci: add opt-in lightweight autonomy probe to free model workflow |
| 120 | `0a074d28214cc35c46d43de4358ae77fae505c36` | ci: gate native free mission auto tool choice without any relay forcing |
| 121 | `b4eae9b798aac2f318442859c14bec87cc787535` | ci: test autonomous subagent tool_choice with exact host json_object format in one free call |
| 122 | `f55fe9deaa9f4933ceea0c47a92ed6d0bbe2bc5b` | ci: opt-in one-request JSON and automatic tool decision regression probe |
| 123 | `a590516e2d42128a2732bad887663f1796bc5b71` | fix(orchestrator): let OpenRouter native tool phases choose subagent before Oracle JSON validation |
| 124 | `14ef7c8a0dcd6d79e1ff41042578813552af9328` | test(orchestrator): preserve explicit JSON while allowing OpenRouter autonomous tools |
| 125 | `eb34ed0376e7e22ebdf453210a7ab95f9b394702` | style(orchestrator): restore mandated import order after native tool transport fix |
| 126 | `0c7e9b27d71c4ec83e418bc12439ac6911a807e6` | ci: bounded two-free-call autonomous research then analysis specialist routing probe |
| 127 | `ff5caba1f8c7f6382052f9d4af7b396850f18a76` | ci: expose opt-in lightweight two-specialist routing smoke, two free requests |
| 128 | `7835fcafb6fa1ec4aa06d2950380cafc8b5797fd` | ci: isolate six-call zero-price relay budget for explicitly opted-in two-child mission |
| 129 | `3e2c2e0e78521e0f6877cdc8a5ed87145e257fb6` | ci: fail-closed two-real-child free native Oracle P6 restart gate |
| 130 | `9c7abb79086413b582a38f9cdd50b8b2d396652c` | ci: bound multi-child free-provider SSE observation to six upstream calls |
| 131 | `d5f24db3ce7ccade41e48ae9d1e60477dd68af4f` | ci: opt-in no-force two real native specialist children gate, six zero-price requests |
| 132 | `07e715e450fa44526b7bd067e17ff34ff75087af` | ci: verify two distinct saved specialist roles and compare durable Redis tuple correctly |
| 133 | `4621edb3eca60d37464f0728605a8d27a20e67f2` | ci(botmode): capture safe request-phase metadata for multi-child failure diagnosis |
| 134 | `6e213d4ac07bfed9c0aaf6a6786ef9a20da4ee61` | ci(botmode): report bounded per-turn and child status diagnostics on multi failure |
| 135 | `29802ab0b040f6b9749038d974bcf3be2c9aa522` | ci(botmode): distinguish available native tool from emitted calls in failed multi mission |
| 136 | `f22f09b7ec6e51b295b4d5c0091af8285d3372a6` | ci(botmode): classify failed multi-mission SSE HTTP status without response body |
| 137 | `f392ad5eb65b449562a5c6b6c8ca58c88748d656` | ci(botmode): test two autonomous native children before polling; retain fail-closed evidence |
| 138 | `e6fce80391c9e2496b36185fdcf0c93ea727af73` | ci(botmode): isolate native two-child engine smoke from external search tool budget |
| 139 | `73c03e5c6c30140d9fd1cfc21b53dab2d5fe313f` | ci(botmode): allow bounded early snapshots before SSE job expires |
| 140 | `5ff780287272051a4f3a4d2237fb7897ea9b0d2a` | ci(botmode): read live parent P6 and child status during SSE observation |
| 141 | `7047cb40d8d0dcad411137203736a317337b80bb` | ci(botmode): expose allowlisted Oracle rejection reasons for real N mission |
| 142 | `b6115e271c7c713fbc3f0b1cd94ad461b4d46c22` | ci(botmode): await two native tool results before strict JSON final |
| 143 | `e71a20234fe1e243c9d33096052fd339cbc985d0` | ci(botmode): add no-Docker bounded auto two-child JSON shape probe |
| 144 | `d2615d281a0932fc1ddb324ce7982d1f11856943` | ci(botmode): wire isolated two-call native N final JSON probe |
| 145 | `f583c22786a9d170f93218ee20b763be077bf4ad` | ci(botmode): test synchronous subagent selection with 2-call free probe |
| 146 | `8486638f09d88fbcf2f65f0f0759719486a5fa37` | ci(botmode): expose synchronous mode in isolated N tool shape probe |
| 147 | `2b7aad6a82e582a5fb59f2b6a7c0a155e34b7543` | ci(botmode): log safe provider classes if terminal SSE has no native children |
| 148 | `944a73220f2dba9ac42b3f0f3f4b61a530cb2d86` | ci(botmode): extend free N output budget and fail fast on exhausted parent |
| 149 | `67f653c64ad74de080db185d6f6bbcf807b1ff44` | ci(botmode): require durable detached siblings before parent Oracle result |
| 150 | `237047924a64dbc09c3a1be2f94a0252ddadf11b` | feat(botmode): opt-in bounded wait for durable sibling results in original mission |
| 151 | `ed73e7bc9ed857e7bedfe262dff66980e48f137f` | test(botmode): narrow accepted child task type and format bounded wait schema |
| 152 | `7605e9186b84d4a7eb6d14be1bc9528c6033bbd8` | ci(botmode): count distinct native subagent calls within a provider response |

## 5. Chemins du diff cumulé main → source : les 231 fichiers

### Workflows CI (9)

| Chemin | Statut | Delta GitHub |
|---|---|---:|
| `.github/workflows/botmode-specialist-host-routing.yml` | added | 49 |
| `.github/workflows/botmode-v1-exact-candidate-oci-probe.yml` | added | 1324 |
| `.github/workflows/botmode-v1-ghcr-subagent-oracle-probe.yml` | modified | 3 |
| `.github/workflows/botmode-v1-live-provider-preflight.yml` | modified | 46 |
| `.github/workflows/botmode-v1-pr77-source-built.yml` | added | 449 |
| `.github/workflows/botmode-zod4-experimental-integration.yml` | added | 68 |
| `.github/workflows/botmode-zod4-real-free-smoke.yml` | added | 79 |
| `.github/workflows/botmode-zod4-real-free-subagent-tool-probe.yml` | added | 210 |
| `.github/workflows/botmode-zod4-runtime-mission.yml` | added | 1472 |

### Racine et autres (6)

| Chemin | Statut | Delta GitHub |
|---|---|---:|
| `AGENTS.md` | modified | 6 |
| `package-lock.json` | modified | 226 |
| `package.json` | modified | 11 |
| `vendor/librechat-agents/README.md` | modified | 0 |
| `vendor/librechat-agents/librechat-agents-3.7.17-145865e.tgz` | removed | 0 |
| `vendor/librechat-agents/librechat-agents-3.7.17-botmode-fallback-context-v1.tgz` | added | 0 |

### API serveur / authentification (34)

| Chemin | Statut | Delta GitHub |
|---|---|---:|
| `api/app/clients/specs/BaseClient.test.js` | modified | 8 |
| `api/package.json` | modified | 6 |
| `api/server/controllers/agents/__tests__/request.resumeMetadata.spec.js` | modified | 351 |
| `api/server/controllers/agents/botModeSettings.js` | added | 45 |
| `api/server/controllers/agents/botModeSettings.spec.js` | added | 86 |
| `api/server/controllers/agents/callbacks.improvementEvidence.spec.js` | modified | 303 |
| `api/server/controllers/agents/callbacks.js` | modified | 20 |
| `api/server/controllers/agents/client.js` | modified | 93 |
| `api/server/controllers/agents/client.test.js` | modified | 395 |
| `api/server/controllers/agents/orchestratorMissionBindings.js` | added | 37 |
| `api/server/controllers/agents/orchestratorMissionBindings.spec.js` | added | 67 |
| `api/server/controllers/agents/request.js` | modified | 106 |
| `api/server/controllers/agents/v1.js` | modified | 8 |
| `api/server/controllers/mcp.js` | modified | 4 |
| `api/server/routes/prompts.js` | modified | 2 |
| `api/server/routes/roles.js` | modified | 2 |
| `api/server/services/AuthService.js` | modified | 2 |
| `api/server/services/Config/loadCustomConfig.js` | modified | 2 |
| `api/server/services/Endpoints/agents/hostFallbackOracle.compat.spec.js` | added | 326 |
| `api/server/services/Endpoints/agents/hostJsonMode.compat.spec.js` | added | 148 |
| `api/server/services/Endpoints/agents/hostModelRouting.compat.spec.js` | added | 252 |
| `api/server/services/Endpoints/agents/hostModelRouting.js` | modified | 3 |
| `api/server/services/Endpoints/agents/hostModelUsage.js` | modified | 65 |
| `api/server/services/Endpoints/agents/hostModelUsage.spec.js` | modified | 225 |
| `api/server/services/Endpoints/agents/httpJsonObserver.spec.js` | added | 351 |
| `api/server/services/Endpoints/agents/initialize.js` | modified | 273 |
| `api/server/services/Endpoints/agents/initialize.spec.js` | modified | 118 |
| `api/server/services/Endpoints/agents/nativeMissionModelOnlyRecoveryCallbacks.js` | modified | 3 |
| `api/server/services/Endpoints/agents/nativeMissionPresentation.spec.js` | added | 176 |
| `api/server/services/Endpoints/agents/nativeMissionRecoveredOraclePersister.js` | modified | 1 |
| `api/server/services/Endpoints/agents/nativeMissionRecoveredOracleSources.spec.js` | added | 195 |
| `api/server/services/Endpoints/agents/nativeMissionRecoveredOracleVerifier.js` | modified | 1 |
| `api/strategies/localStrategy.js` | modified | 2 |
| `api/strategies/validators.spec.js` | modified | 4 |

### UI / UX (39)

| Chemin | Statut | Delta GitHub |
|---|---|---:|
| `client/package.json` | modified | 2 |
| `client/src/components/Chat/BotModeProgress/BotModeProgressPanel.live.spec.tsx` | added | 111 |
| `client/src/components/Chat/BotModeProgress/BotModeProgressPanel.spec.tsx` | added | 27 |
| `client/src/components/Chat/BotModeProgress/BotModeProgressPanel.tsx` | added | 285 |
| `client/src/components/Chat/BotModeProgress/state.ts` | added | 7 |
| `client/src/components/Chat/BotModeTools/SingleToolRightPortal.spec.tsx` | added | 142 |
| `client/src/components/Chat/BotModeTools/SingleToolRightPortal.tsx` | added | 48 |
| `client/src/components/Chat/BotModeTools/state.ts` | added | 8 |
| `client/src/components/Chat/BotModeViewContext.tsx` | added | 5 |
| `client/src/components/Chat/ChatView.tsx` | modified | 109 |
| `client/src/components/Chat/Header.botMode.spec.tsx` | added | 88 |
| `client/src/components/Chat/Header.tsx` | modified | 62 |
| `client/src/components/Chat/Input/BotModeProjectSuggestion.test.tsx` | added | 112 |
| `client/src/components/Chat/Input/BotModeProjectSuggestion.tsx` | added | 130 |
| `client/src/components/Chat/Input/ChatForm.tsx` | modified | 8 |
| `client/src/components/Chat/Messages/Content/ContentParts.tsx` | modified | 17 |
| `client/src/components/Chat/Messages/Content/MessageContent.tsx` | modified | 4 |
| `client/src/components/Chat/Messages/Content/Part.tsx` | modified | 3 |
| `client/src/components/Chat/Messages/Content/ToolCallGroup.tsx` | modified | 32 |
| `client/src/components/Chat/Messages/Content/__tests__/ToolCallGroup.test.tsx` | modified | 91 |
| `client/src/components/Chat/Presentation.tsx` | modified | 30 |
| `client/src/components/Chat/__tests__/ChatView.subagent.spec.tsx` | modified | 1 |
| `client/src/components/Input/SetKeyDialog/SetKeyDialog.tsx` | modified | 114 |
| `client/src/components/Projects/BotModeProjectPanel.test.tsx` | modified | 79 |
| `client/src/components/Projects/BotModeProjectPanel.tsx` | modified | 105 |
| `client/src/components/Projects/ProjectCreateDialog.tsx` | modified | 8 |
| `client/src/components/SidePanel/Agents/AgentSelect.botmode.spec.tsx` | added | 131 |
| `client/src/components/SidePanel/Agents/AgentSelect.tsx` | modified | 116 |
| `client/src/hooks/Chat/__tests__/useChatFunctions.regenerate.spec.tsx` | modified | 197 |
| `client/src/hooks/Chat/mission.spec.ts` | added | 25 |
| `client/src/hooks/Chat/mission.ts` | added | 15 |
| `client/src/hooks/Chat/useChatFunctions.ts` | modified | 185 |
| `client/src/hooks/Input/missionQueryNavigation.spec.tsx` | added | 94 |
| `client/src/hooks/Input/useQueryParams.ts` | modified | 3 |
| `client/src/hooks/SSE/__tests__/missionNavigation.spec.tsx` | added | 147 |
| `client/src/hooks/SSE/useEventHandlers.ts` | modified | 10 |
| `client/src/locales/en/translation.json` | modified | 54 |
| `client/src/locales/fr/translation.json` | modified | 49 |
| `client/src/utils/email.ts` | modified | 2 |

### Documentation et preuves (44)

| Chemin | Statut | Delta GitHub |
|---|---|---:|
| `docs/BOTMODE_V1_ANALYSIS_FALLBACK_CHECKPOINT_20261026.md` | added | 29 |
| `docs/BOTMODE_V1_CLOTURE_METHODIQUE_20261023.md` | added | 21 |
| `docs/BOTMODE_V1_DURABLE_MISSION_MODE_20261023.md` | added | 56 |
| `docs/BOTMODE_V1_FALLBACK_CONTEXT_CHECKPOINT_20261025.md` | added | 44 |
| `docs/BOTMODE_V1_FIVE_TASK_P6_SUCCESS_20261023.md` | added | 34 |
| `docs/BOTMODE_V1_HOST_USAGE_RUNTIME_ALIAS_20261023.md` | added | 21 |
| `docs/BOTMODE_V1_JSON_MODE_CHECKPOINT_20261022.md` | added | 30 |
| `docs/BOTMODE_V1_METHODE_CLOTURE_20261023.md` | added | 55 |
| `docs/BOTMODE_V1_MISSION_OUTPUT_CONTRACT_20261023.md` | added | 60 |
| `docs/BOTMODE_V1_OBSERVED_MISSION_RESULT_20261023.md` | added | 38 |
| `docs/BOTMODE_V1_PR76_CHECKPOINT_FINAL_20261022.md` | added | 102 |
| `docs/BOTMODE_V1_PR77_SOURCE_BUILT_CHECKPOINT_20261022.md` | added | 122 |
| `docs/BOTMODE_V1_RESEARCH_V2_CHECKPOINT_20261025.md` | added | 35 |
| `docs/BOTMODE_V1_RESULT_SOURCE_CONTRACT_20261023.md` | added | 27 |
| `docs/BOTMODE_V1_SECURITY_CLOSEOUT_20261022.md` | added | 51 |
| `docs/BOTMODE_V1_SPECIALIST_ROUTING_CHECKPOINT_20261022.md` | added | 110 |
| `docs/qualification/BOTMODE_V1_FINAL_COMPOSITION_20261023.md` | added | 13 |
| `docs/qualification/BOTMODE_V1_FREE_FALLBACK_a6f6fee3c7dc_PROPOSAL.yml` | added | 388 |
| `docs/qualification/BOTMODE_V1_MISSION_CONTRACT_0c3c717a44a0_PROPOSAL.yml` | added | 240 |
| `docs/qualification/BOTMODE_V1_MISSION_CONTRACT_0c3c717a44a0_SCOPE.md` | added | 17 |
| `docs/qualification/BOTMODE_V1_MSAL7_TRANSITIVE_OVERRIDE_TRIAL_20261026.md` | added | 15 |
| `docs/qualification/BOTMODE_V1_NPM_PRODUCTION_SECURITY_20261026.md` | added | 30 |
| `docs/qualification/BOTMODE_V1_OBSERVED_FREE_MISSION_a6f6fee3c7dc_PROPOSAL.yml` | added | 412 |
| `docs/qualification/BOTMODE_V1_OBSERVED_MISSION_AUTHORIZATION_20261023.md` | added | 11 |
| `docs/qualification/BOTMODE_V1_OPENAI_ZOD_V7_V4_TRIAL_20261026.md` | added | 23 |
| `docs/qualification/BOTMODE_V1_RESULT_SOURCE_PUBLICATION_PROPOSAL_20261023.json` | added | 198 |
| `docs/qualification/BOTMODE_V1_RESULT_SOURCE_PUBLICATION_PROPOSAL_20261023.md` | added | 28 |
| `docs/qualification/BOTMODE_V1_REUSE_IMAGE_SINGLE_MISSION_PROPOSAL_20261023.yml` | added | 390 |
| `docs/superpowers/plans/2026-10-23-durable-mission-mode.md` | added | 20 |
| `docs/superpowers/plans/2026-10-23-mission-output-contract.md` | added | 62 |
| `docs/superpowers/plans/2026-10-23-mission-result-contract.md` | added | 34 |
| `docs/superpowers/plans/2026-10-23-mission-source-provenance.md` | added | 43 |
| `docs/superpowers/plans/2026-10-24-botmode-host-research.md` | added | 71 |
| `docs/superpowers/plans/2026-10-24-botmode-recovery-sources.md` | added | 57 |
| `docs/superpowers/plans/2026-10-24-botmode-research-image.md` | added | 70 |
| `docs/superpowers/plans/2026-10-24-botmode-research-source-barrier.md` | added | 62 |
| `docs/superpowers/plans/2026-10-25-fallback-context.md` | added | 34 |
| `docs/superpowers/plans/2026-10-25-native-output-schema.md` | added | 41 |
| `docs/superpowers/plans/2026-10-25-real-free-fallback-harness.md` | added | 97 |
| `docs/superpowers/plans/2026-10-25-research-v2.md` | added | 36 |
| `docs/superpowers/plans/2026-10-26-analysis-fallback-tool-choice.md` | added | 14 |
| `docs/superpowers/specs/2026-10-23-mission-output-contract-design.md` | added | 19 |
| `docs/superpowers/specs/2026-10-25-native-output-schema-design.md` | added | 13 |
| `docs/superpowers/specs/2026-10-25-research-citation-contract-design.md` | added | 47 |

### Agents / Oracle / P6 (57)

| Chemin | Statut | Delta GitHub |
|---|---|---:|
| `packages/api/package.json` | modified | 4 |
| `packages/api/src/agents/background.spec.ts` | modified | 57 |
| `packages/api/src/agents/background.ts` | modified | 53 |
| `packages/api/src/agents/handlers.ts` | modified | 1 |
| `packages/api/src/agents/hitl/askUserQuestionTool.ts` | modified | 21 |
| `packages/api/src/agents/hooks/schema.ts` | modified | 2 |
| `packages/api/src/agents/oracle/deterministic.spec.ts` | modified | 164 |
| `packages/api/src/agents/oracle/deterministic.ts` | modified | 33 |
| `packages/api/src/agents/oracle/research2.spec.ts` | added | 98 |
| `packages/api/src/agents/oracle/sources.ts` | added | 76 |
| `packages/api/src/agents/oracle/types.ts` | modified | 7 |
| `packages/api/src/agents/orchestrator/admission.spec.ts` | added | 252 |
| `packages/api/src/agents/orchestrator/admission.ts` | added | 114 |
| `packages/api/src/agents/orchestrator/analysisFallbackTransport.spec.ts` | added | 146 |
| `packages/api/src/agents/orchestrator/compiledFallbackContext.spec.ts` | added | 20 |
| `packages/api/src/agents/orchestrator/evidenceContext.spec.ts` | added | 59 |
| `packages/api/src/agents/orchestrator/evidenceContext.ts` | added | 130 |
| `packages/api/src/agents/orchestrator/index.ts` | modified | 10 |
| `packages/api/src/agents/orchestrator/missionOracle.spec.ts` | modified | 155 |
| `packages/api/src/agents/orchestrator/missionOracle.ts` | modified | 91 |
| `packages/api/src/agents/orchestrator/native.spec.ts` | modified | 461 |
| `packages/api/src/agents/orchestrator/native.ts` | modified | 178 |
| `packages/api/src/agents/orchestrator/nativeToolChoiceTransport.spec.ts` | added | 251 |
| `packages/api/src/agents/orchestrator/nativeToolIdentity.spec.ts` | added | 40 |
| `packages/api/src/agents/orchestrator/objectives.spec.ts` | added | 47 |
| `packages/api/src/agents/orchestrator/objectives.ts` | added | 95 |
| `packages/api/src/agents/orchestrator/output.spec.ts` | added | 119 |
| `packages/api/src/agents/orchestrator/output.ts` | added | 45 |
| `packages/api/src/agents/orchestrator/publication.spec.ts` | added | 175 |
| `packages/api/src/agents/orchestrator/publication.ts` | added | 82 |
| `packages/api/src/agents/orchestrator/publicationTransport.spec.ts` | added | 210 |
| `packages/api/src/agents/orchestrator/research.spec.ts` | added | 549 |
| `packages/api/src/agents/orchestrator/research.ts` | added | 163 |
| `packages/api/src/agents/orchestrator/researchSources.spec.ts` | added | 0 |
| `packages/api/src/agents/orchestrator/schema.spec.ts` | added | 0 |
| `packages/api/src/agents/orchestrator/schema.ts` | added | 0 |
| `packages/api/src/agents/orchestrator/sources.spec.ts` | added | 0 |
| `packages/api/src/agents/orchestrator/sources.ts` | added | 0 |
| `packages/api/src/agents/orchestrator/transientEvidenceBuffer.spec.ts` | modified | 0 |
| `packages/api/src/agents/orchestrator/transientEvidenceBuffer.ts` | modified | 0 |
| `packages/api/src/agents/orchestrator/types.ts` | modified | 0 |
| `packages/api/src/agents/run.ts` | modified | 0 |
| `packages/api/src/agents/validation.ts` | modified | 0 |
| `packages/api/src/cdn/__tests__/azure-msal7-compat.test.ts` | added | 0 |
| `packages/api/src/endpoints/openai/config.spec.ts` | modified | 0 |
| `packages/api/src/endpoints/openai/config.ts` | modified | 0 |
| `packages/api/src/endpoints/openai/llm.spec.ts` | modified | 0 |
| `packages/api/src/endpoints/openai/llm.ts` | modified | 0 |
| `packages/api/src/mcp/__tests__/zod.spec.ts` | modified | 0 |
| `packages/api/src/mcp/zod.ts` | modified | 0 |
| `packages/api/src/prompts/schemas.spec.ts` | modified | 0 |
| `packages/api/src/prompts/schemas.ts` | modified | 0 |
| `packages/api/src/tools/toolkits/web.spec.ts` | modified | 0 |
| `packages/api/src/tools/toolkits/web.ts` | modified | 0 |
| `packages/api/src/types/openai.ts` | modified | 0 |
| `packages/api/src/utils/tokens.ts` | modified | 0 |
| `packages/api/tsdown.config.mjs` | modified | 0 |

### Dépendances partagées (16)

| Chemin | Statut | Delta GitHub |
|---|---|---:|
| `packages/data-provider/package.json` | modified | 0 |
| `packages/data-provider/specs/actions.spec.ts` | modified | 0 |
| `packages/data-provider/src/azure.ts` | modified | 0 |
| `packages/data-provider/src/botMode.spec.ts` | added | 0 |
| `packages/data-provider/src/botMode.ts` | added | 0 |
| `packages/data-provider/src/config.ts` | modified | 0 |
| `packages/data-provider/src/file-config.ts` | modified | 0 |
| `packages/data-provider/src/generate.ts` | modified | 0 |
| `packages/data-provider/src/index.ts` | modified | 0 |
| `packages/data-provider/src/mcp.ts` | modified | 0 |
| `packages/data-provider/src/schemas.ts` | modified | 0 |
| `packages/data-provider/src/types/schedules.ts` | modified | 0 |
| `packages/data-schemas/src/methods/mcpServer.spec.ts` | modified | 0 |
| `packages/data-schemas/src/schema/convo.botMode.spec.ts` | added | 0 |
| `packages/data-schemas/src/schema/convo.ts` | modified | 0 |
| `packages/data-schemas/src/types/convo.ts` | modified | 0 |

### Scripts de tests/infra (26)

| Chemin | Statut | Delta GitHub |
|---|---|---:|
| `scripts/botmode/build-fallback-context-sdk.py` | added | 0 |
| `scripts/botmode/ci-compare-http-oracle.cjs` | added | 0 |
| `scripts/botmode/ci-five-sequential-mission-gate.py` | added | 0 |
| `scripts/botmode/ci-fixed-free-preflight.py` | added | 0 |
| `scripts/botmode/ci-free-alternative-selection.py` | added | 0 |
| `scripts/botmode/ci-free-autonomous-selection-probe.py` | added | 0 |
| `scripts/botmode/ci-free-multi-specialist-routing-probe.py` | added | 0 |
| `scripts/botmode/ci-free-native-n-shape-probe.py` | added | 0 |
| `scripts/botmode/ci-host-research.py` | added | 0 |
| `scripts/botmode/ci-http-json-observer.cjs` | added | 0 |
| `scripts/botmode/ci-live-free-child-oracle-gate.py` | modified | 0 |
| `scripts/botmode/ci-live-free-child-preflight.sh` | modified | 0 |
| `scripts/botmode/ci-openai-subagent-fixture.py` | modified | 0 |
| `scripts/botmode/ci-oracle-publication-gate.py` | modified | 0 |
| `scripts/botmode/ci-real-free-native-multi-gate.py` | added | 0 |
| `scripts/botmode/ci-real-free-native-oracle-gate.py` | added | 0 |
| `scripts/botmode/ci-source-built-oracle.py` | added | 0 |
| `scripts/botmode/native-fallback-context-regression.cjs` | added | 0 |
| `scripts/botmode/native-research-image-regression.cjs` | added | 0 |
| `scripts/botmode/test-ci-fixture-stream.py` | added | 0 |
| `scripts/botmode/tests/test_fallback_sdk_artifact.py` | added | 0 |
| `scripts/botmode/tests/test_fixed_free_preflight.py` | added | 0 |
| `scripts/botmode/tests/test_host_research_guard.py` | added | 0 |
| `scripts/botmode/tests/test_publication_evidence.py` | added | 0 |
| `scripts/botmode/tests/test_source_fixture.py` | added | 0 |
| `scripts/botmode/validate-host-research-config.cjs` | added | 0 |

## 6. Distinction PASS / NON CONCLUANT / FAIL

- **PASS** : chaîne N réelle, Oracle P6, Playwright, source D-03, installation fraîche Lite, Full/Mongo rollback CI (dans son périmètre), licence SUL AMD64/ARM64 ; audit npm production à zéro conseil sur SHA `7605e9186b84d4a7eb6d14be1bc9528c6033bbd8`.
- **NON CONCLUANT pour la release finale** : revue ligne-par-ligne du cumul de 231 fichiers et des changements de sécurité optionnels, matrice Azure avec vraies clés, provenance du futur commit intégré, nouvelle version Git, protection de `main`, réconciliation des workflows D-04 anciens et politique de déplacement éventuel `:stable/latest`.
- **FAIL attendu / garde de provenance** : ancien `current-candidate-runtime` comparaît le code actuel à une ancienne candidate ; son FAIL ne peut être transformé en PASS par affaiblissement des protections.
- **NO-GO stable** : aucune fusion ni promotion par ce lot d'inventaire.

## 7. Ordre d'intégration proposé, sans mutation

1. Revue du socle indépendant de **219 commits / 163 fichiers**, vérifier les changements des agents et API avant exposition de la PR mère sur `main`. Son incorporation ne doit pas dupliquer #76.
2. Revue des **152 commits / 81 fichiers** de la pile #78–86, en conservant les frontières UX (#78–82), sécurité/dépendances (#83–86), orchestration et qualifications.
3. Examiner le diff des 29 commits documentaires de #77 **en lecture seule** ; ne pas fusionner sa branche divergente.
4. Faire respecter les garde-fous Azure si Azure fait partie des cibles de release, l'audit npm à date et les verrous Oracle/P6, sans rejouer à tort les tests déjà PASS.
5. Déterminer le commit exact à livrer via les protections de `main`, puis la compatibilité de son SHA avec l'image D-03 ; documenter toute divergence.
6. Définir une nouvelle version/tag Git sans réécrire `v1.0.0`, documenter backup/rollback vers l'ancien digest, et demander une autorisation **distincte** pour D-04 `stable/latest`.

**Ce document conserve l'inventaire complet des identifiants et chemins pour vérifier la revue des 371 commits.**