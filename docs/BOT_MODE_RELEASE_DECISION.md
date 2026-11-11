# BOT MODE V1 — décision de périmètre et critères de publication

Date initiale : 13 octobre 2026 ; **checkpoint technique : 11 novembre 2026**. **RELEASE NO-GO** tant que les derniers risques et autorisations n'ont pas été traités.

## V1.0.6 — point de décision sur la PR #180

**Candidate applicative qualifiée, publication non autorisée.** La [PR #180](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/180) reste DRAFT et non fusionnée. **Source vérifiée avant cette mise à jour documentaire :** `3c5a90f9b83a5fc1ff7d3f5db72bbf1406bd15d1`, avec **29 SUCCESS / 2 SKIPPED / 0 FAIL** sur **31 workflows** GitHub. Le nouveau SHA issu de ce complément documentaire doit avoir sa propre CI terminale avant tout GO de distribution. **La dernière release stable demeure v1.0.5.**

### Preuves strictes et limites

| Critère | Verdict | Preuve et frontière |
| --- | --- | --- |
| CI Backend, Frontend, Playwright, Lite, Full, audit npm prod | **PASS** | 29 SUCCESS sur source `3c5a90...` ; aucune preuve automatique d'artefact GHCR v1.0.6 |
| Worker réel, fournisseur gratuit, Oracle `VERIFIED`, P6, refus `HUMAN_REVIEW` | **PASS** | [Actions #42911804825](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/42911804825) ; réception sur source applicative `dc52100...` |
| Worker → RECHERCHE acteur du graphe → Oracle/P6 | **PASS** | [Actions #42913006511](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/42913006511) ; **pas de child thread imbriqué observé** |
| `web_search` natif, recherche/extraction, Analyse/Synthèse, Oracle/P6 | **PASS, sources contrôlées** | [Actions #42926216758](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/42926216758) ; modèle gratuit externe réel et fixture Web isolée ; **pas de preuve de Keenable public ni de navigation Playwright réelle** |
| HITL deux approbations HTTP, checkpoints Mongo, exécution unique | **PASS banc intégré** | `hitlCheckpoint.e2e.spec.js` avec `FakeChatModel` ; **double HITL fournisseur externe NON CONCLUANT, ancien R5 FAIL**. Ne pas annoncer un support réel démontré |
| Sécurité dépendances de production | **PASS audit npm** | Mongoose corrigé en 8.24.7 ; 0 vulnérabilité relevée par `npm audit --omit=dev` sur la candidate |
| Sécurité CodeQL PR | **2 HIGH ouverts, mitigation testée** | #331/#332 `js/missing-rate-limiting` sur OAuth MCP ; `requireJwtAuth` et `mcpOAuthPollLimiter` présents, tests 401/429/Retry-After ; disposition formelle encore requise |
| Autres alertes | **Réserves** | `minimatch` MEDIUM, `deepmerge` LOW, `elliptic` LOW : dépendances développement ; dette historique CodeQL main distincte, voir [#154](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/154) |
| Sécurité des installations v1.0.5 | **Déploiement non autorisé** | Mac/Chromebook utilisent encore Mongoose 8.24.1 ; interfaces non toutes limitées à loopback, Mongo 4.4 Lite hors support, restauration complète des sauvegardes non démontrée |
| Image GHCR v1.0.6 multiarchitecture et pull anonyme | **NON CONCLUANT** | Build local et CI verts ne prouvent pas un digest publiquement accessible ; pas de promotion `:latest`, de tag ni de Release v1.0.6 |
| Décision humaine | **NON ACQUISE** | GO distincts : risques résiduels ; construction/push image candidate ; merge/tag/Release stable ; mise à jour Mac/Chromebook |

### Actions finales — sans refaire les PASS

1. **Acter le périmètre publié** : nouvelle installation Linux Docker Compose, Lite en réseau local/protégé, Full avec protections adaptées. Ne pas promettre Keenable public, Playwright réel, double HITL fournisseur ou restauration/migration locale non testés.
2. **Faire statuer le propriétaire sur les risques résiduels** décrits dans [#154](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/154), sans dismissal automatique.
3. Après **GO explicite pour candidate GHCR**, construire la même source AMD64/ARM64, vérifier manifest/digest, pull anonyme, lancement Lite et identité du code.
4. Après **GO distinct de promotion**, fusionner si autorisé, taguer une fois `v1.0.6` et publier les notes/digests exacts. Déploiements personnels soumis à un autre accord.

**Verdict : `L1=réserves d'exploitation documentées / L2=PASS dans les périmètres ci-dessus / L3=risques à accepter / RELEASE=NO-GO en attente des GO.`**

**V2 privée :** propositions de compétences et cloud dans [issue #181](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/181), hors V1.

---

## Gates vérifiés sur la candidate

- GO1 inférence externe Gemini → Worker → un spécialiste observé → Oracle durable : [run 38318687920](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38318687920) PASS sur le runtime immuable `d4e82dd`.
- GO2 installation Full, services MongoDB/pgvector/Meilisearch/RAG présents, API HTTP et authentification PostgreSQL : [run 38325143577](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38325143577) PASS.
- GO2 installation Lite, arrêt/redémarrage et donnée MongoDB préservée : [run 38325143730](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38325143730) PASS.
- GO3 distribution/authentification Full et Lite : [run 38325143523](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38325143523) PASS.
- GO3 motifs secrets suivis Git : [run 38325143446](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38325143446) PASS.
- GO3 vulnérabilités npm **production** : [run 38325143543](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38325143543) PASS au seuil High/Critical, mais **3 moderate + 6 low** encore signalées.

## Périmètre Helm — décision recommandée (non approuvée)

Le backfill historique `chart-1.9.1` appartient au pipeline legacy Helm, pas à l'image GHCR ni au runtime BOT MODE V1. Le run [38300420245](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38300420245) montre un refus GitHub App de création de référence à cause de la permission `workflows`.

**Proposition :** classer ce backfill comme incident externe/non bloquant **uniquement pour une release distribuée par Docker Compose/GHCR**, à condition qu'aucun artefact Helm ne soit promis aux utilisateurs V1 et que les pipelines Helm ne se déclenchent pas par la release BOT MODE. Une publication Helm est **NO-GO** jusqu'à obtention d'une permission autorisée et un run réussi. Ne pas modifier de droits, créer de tag ou contourner le contrôle pour clore artificiellement le problème.

## Réserves obligatoires avant une distribution stable

1. **Rollback données :** le test Lite prouve stop/start, **pas** la restauration après migration. Une stratégie de sauvegarde et restauration testée sur un environnement éphémère doit être validée avant de présenter la V1 comme migration sans risque. Cf. [BOT_MODE_ROLLBACK.md](BOT_MODE_ROLLBACK.md).
2. **Sécurité :** l'audit npm ne couvre pas les dépendances de développement, vulnérabilités de conteneurs, secrets stockés ailleurs ni protections réseau. Les 3 moderate/6 low de production doivent être triées et explicitement acceptées ou corrigées.
3. **Support OS :** tests Full/Lite réalisés sous runners Linux. ChromeOS/Crostini, macOS/ARM et Windows WSL2 sont décrits comme cibles, mais non validés exhaustivement.
4. **Chaîne publication :** ne pas inférer qu'un job vert autorise de lui-même le merge, un tag `v*` ou la promotion `:latest`. Exiger la revue du diff final empilé (#14, #18, #20), une qualification du SHA livré, des instructions utilisateurs et un GO humain explicite.

## Décision

GO1, GO2 installation/stop-start et GO3 contrôles ciblés sont **VALIDÉS dans leur périmètre**. GO4 Helm historique reste **BLOQUÉ dans le périmètre Helm**, avec proposition de séparation Docker encore soumise à décision. GO5 release stable = **NO-GO**.

Les PR #14, #18 et #20 restent DRAFT non fusionnées. Aucun tag stable ni image `:latest` ne doit être publié.

## Mise à jour du checkpoint de qualification — 13 octobre 2026

Le SHA exact de la PR #20 est `03ae2fbcce305fdd27a5f682687812135c0211a6` : **15/15 workflows GitHub Actions SUCCESS**, notamment [Playwright E2E](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38330642509), [Backend](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38330642458), [Frontend](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38330642499), [Full](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38330642478), [Lite](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38330642519), [KaTeX trial](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38330642490), secrets et npm production. Le correctif KaTeX `0.18.10` est intégré au lockfile et validé sur cette candidate. La régression `userGroup` n'a pas été reproduite dans les trois passages isolés (106 tests chacun), et le backend complet est vert sur ce SHA.

**Distinction des décisions** : **GO pour la qualification technique automatisée de cette candidate**, mais **NO-GO pour une distribution stable à ce stade**. L'ensemble des contrôles CI verts ne prouve pas une migration/restore réelle, les OS non-Linux ou l'absence de tous risques résiduels.

**Décisions encore ouvertes avant GO5 :** 1) qualification sauvegarde → restauration de données après migration (ou périmètre expressément limité aux nouvelles installations et sans promesse de migration), 2) acceptation documentée des risques npm modérés/faibles et revue des images conteneur, 3) choix explicite du périmètre Docker Compose/GHCR sans Helm historique, 4) compatibilité OS annoncée limitée à ce qui a été effectivement testé, 5) approbation humaine du SHA et de la release. **Ne pas fusionner les PR #14/#18/#20 ni publier de tag stable ou :latest sans ce GO final.**

## Qualification finale candidate avant décision humaine — 13 octobre 2026

**Dernier SHA vérifié en totalité** : `3666942594415f3591be95376178d1861792c359` — **21/21 workflows SUCCESS**, dont [Playwright](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38400337087), backend, frontend, statiques, Docker et sécurité. Les tests de restauration démontrent sur runners Linux jetables : MongoDB 8, PG15/pgvector, Meilisearch 1.35.1, volumes fichiers, sauvegarde coordonnée, API Full restaurée HTTP fonctionnelle, Worker réel et ACL propriétaire conservés, plus survie d'un checkpoint HITL à une reconnexion/reconstruction du saver. **Ils ne démontrent pas une reprise de mission après migration de schéma ni un downgrade des bases.**

**Périmètre technique candidat proposé, NON APPROUVÉ** : nouvelles installations via Docker Compose/GHCR ; le rollback est qualifié uniquement avec schémas et versions compatibles, avec sauvegarde et restauration testée. **Aucune promesse de migration in-place automatique, de downgrade de schéma ou de compatibilité rétroactive des données.** Toute mise à niveau de données existantes exige une qualification de migration dédiée et un point de retour validé.

**Support OS à publier sans surpromesse** : chemin Docker Compose vérifié sur runners Linux x86_64 ; ChromeOS/Crostini, macOS Intel/ARM et Windows/WSL2 restent des cibles documentées, mais **non qualifiées en CI sur machines correspondantes**. L'image GHCR figée actuellement testée est `sha-d4e82dded5df`, qui précède certains changements de dépendances/CI sur la branche de release. Aucun tag stable sans construction/vérification de l'artefact correspondant au SHA choisi.

**Sécurité npm actualisée** : [audit 38400336978](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38400336978) : `0 critical, 0 high, 3 moderate, 0 low`. Trois avis modérés restent sur `mammoth` et transitive `argparse`/`sprintf-js`; analyse d'exposition et décision d'acceptation **ouvertes**, cf. [BOT_MODE_DEPENDENCY_RISKS.md](BOT_MODE_DEPENDENCY_RISKS.md). Les scans effectués ne sont pas une preuve d'absence de tous risques conteneurs ou secrets.

**GO4 Helm** : exclusion de Helm recommandée **uniquement** pour une première distribution Docker Compose/GHCR. Décision d'exclusion encore soumise au GO humain ; pipeline legacy Helm bloqué séparément.

**GO5 : NO-GO jusqu'à** revue des trois PR empilées, qualification de l'image publiée du SHA de livraison, traitement/acceptation des 3 moderate et des risques conteneur, déclaration explicite des OS supportés et du périmètre Docker-only, décision humaine de publication. Ne pas fusionner, tagger ou promouvoir `:latest` à partir d'une CI verte seule.

## Contrôle de publication de l'image — procédure de GO5 (non exécutée)

Le workflow existant `.github/workflows/botmode-image.yml` peut construire deux architectures (`amd64`, `arm64`), fusionner leurs digests en manifest multiarchitecture, vérifier le pull GHCR anonyme et effectuer un smoke Lite. Son déclenchement manuel **publie** cependant un artefact dans GHCR ; ne pas l'exécuter sans autorisation de publication d'une candidate. Les workflows ordinaires `Docker Build Smoke Tests` et `Full/Lite` ne remplacent pas cette qualification : certains exécutent encore l'image candidate historique `sha-d4e82dded5df`.

**Checklist impérative avant GO stable** :

1. Geler le SHA **effectivement livré**, après revue des différences combinées des PR #14, #18 et #20 (la CI de branche n'est pas une revue de code).
2. Obtenir l'accord humain préalable à la publication **d'une image candidate seulement** ; exécuter ensuite le workflow de construction multiarchitecture et relever le digest immuable du manifest.
3. Vérifier sur ce **même SHA et ce même digest** les pulls AMD64/ARM64, le démarrage Lite et Full, l'API HTTP, l'onboarding natif, les droits ACL et les tests de restauration nécessaires ; classer les contrôles non exécutés comme tels.
4. Confirmer explicitement le périmètre V1 (Docker Compose/GHCR, Linux qualifié ; Helm et migrations de schéma exclus sauf qualification et accord distincts) et les trois vulnérabilités modérées npm non encore acceptées.
5. Demander un second GO humain distinct pour fusion, tag `v*`, promotion de `:latest` ou annonce publique. **La publication d'une candidate ne vaut pas autorisation de stable.**

Cette section est un protocole de vérification, **pas** un compte rendu d'exécution de build/push.
