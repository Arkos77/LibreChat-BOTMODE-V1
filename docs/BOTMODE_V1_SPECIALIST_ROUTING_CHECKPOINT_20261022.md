# BOT MODE V1 — routage des spécialistes — checkpoint du 22 octobre 2026

## Source et périmètre

Source figée **a6f6fee3c7dcfb5877fe798f759966774a046a58**, branche fix/specialist-host-fallback-20261022, issue de **64248339750f9e0f86e01530eb7067027cec8f6b**. Aucun changement du verrou sécurité SHA256 **6e59734742daa69251821e2fed6a765febb4e58f9139743a98c91813dff234cf**, des modèles, des prix autorisés ou de la barrière Oracle/P6. Les commits applicatifs sont b1b82007d09c2256d8ed0ce1354400665942934f (routage partagé) et a6f6fee3c7dcfb5877fe798f759966774a046a58 (portée du choix de modèle primaire) ; les autres commits ajoutent/corrigent les tests et leur workflow. Ces commits de source sont distincts des ajouts documentaires.

## Cause du blocage précédent

Le [run réel 39850473486](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39850473486), source 6424833, avait obtenu un worker VERIFIED puis une erreur RATE_LIMIT avant tout verdict spécialiste, avec 14 réponses 429 de la fixture locale et 0 requête inattendue.

Dans initializeClient, resolveHostModelRouting n'était appelé que pour le primaire. Le chemin initializeLoadedSubagent utilisé pour les spécialistes de mission appelait directement initializeAgent, sans appliquer la politique hostModelRouting pourtant déclarée pour le spécialiste. Même omission pour les agents découverts via handoff. Ainsi le spécialiste gardait son primaire volontairement en échec, sans fallback. Cette cause est maintenant reproduite hors fournisseur réel ; l'ancien classement harnais BLOCKED_PROVIDER ne doit pas être présenté comme preuve d'un quota OpenRouter.

## Correction

La logique de routage primaire existante est déplacée dans un initialiseur partagé au sein de la même requête, puis utilisée pour le primaire, les handoffs découverts et les spécialistes chargés à la demande ou pour une mission. Chaque agent passe avec sa propre définition et sa propre politique dans les mêmes validations natives, contrôles de budget, provenance durable et décision centrale. Aucun fallback n'est recopié depuis le worker. Les options et méthodes spécifiques aux outils/ACL restent celles de l'appelant.

Deux fichiers applicatif/test modifiés : api/server/services/Endpoints/agents/initialize.js et initialize.spec.js. Aucun nouveau routeur, scheduler ou mécanisme de retry. L'initialisation froide initializeClientFromDocuments reste inchangée et hors de cette preuve.

## Vérification

[Run 39855394250](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39855394250), job **120092164281**, source exacte ci-dessus : **SUCCESS**.

1. Installation propre et builds data-provider, data-schemas, API : SUCCESS.
2. Le même test valide est lancé contre le initialize.js de 6424833 : **trois échecs attendus**, mission/handoff/lazy, chacun Received: undefined sur le fallback ; CI_SPECIALIST_BASELINE_THREE_MISSING_FALLBACKS=CONFIRMED.
3. Rétablissement de l'initialiseur corrigé, quatre suites complètes : **109 tests PASS, zéro échec**. Initialisation (93 tests), routage host, compatibilité HTTP429 SDK et transmission JSON réelle loopback. Les quatre nouveaux cas vérifient la politique free_only propre au spécialiste et la provenance en Mongo correspondant à sa décision, sans secret dans les observations.
4. Node --check, Prettier et git diff --check : PASS localement.

Ces 109 tests sont ciblés, pas toute la suite du monorepo. Les tests d'initialisation utilisent le harnais existant avec constructeur natif substitué, mais le routage et Mongo sont réels ; les autres suites couvrent le SDK HTTP. Aucun fournisseur externe ni secret réel dans ce workflow.

Historique de vérification conservé : premier test rouge 39853412918 (1 failed / 105 passed) ; 39853929385 échoue sur une fixture utilisant à tort le raccourci OpenRouter pour un agent OpenAI ; 39854213307 obtient 107 PASS et échoue sur une hypothèse de comptage de provenance, car le chemin mission initialise le spécialiste deux fois. La fixture utilise désormais des bindings explicites et vérifie l'identité de la décision durable effectivement utilisée. Aucun assouplissement des verdicts Oracle, des prix ou des autorisations ; le correctif applicatif n'a pas changé entre ces essais.

La revue a relevé un cas important : un model spec choisi pour le primaire désactivait aussi le routage des spécialistes, alors que le constructeur natif n'applique ce choix qu'à isInitialAgent=true. Le test mission-spec du [run 39855152787](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39855152787) reproduit ce défaut (1 failed / 108 passed). L'exemption est désormais limitée au primaire, et le quatrième cas vérifie à la fois le choix primaire préservé et le fallback propre au spécialiste. Relecture après correction : aucun autre constat concret. Le [run 39854610607](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39854610607) avait déjà validé les trois premiers cas et 108 tests avant ce complément.

## Statut de clôture

- Régression de routage spécialiste reproduite et corrigée, preuve rouge/verte acquise.
- Mission externe complète à cinq tâches sur cette nouvelle source : **non exécutée / non prouvée**.
- Image intégrée a6f6fee3c7dc : **non construite ni publiée** ; les images historiques 642/ceb conservent leur identité et leurs seules preuves.
- D-01 résiduel ouvert ; D-02 nouveau verrou toujours à rattacher explicitement ; D-03 publication nouvelle source et D-04 fusion/stable non autorisés.

## Prochain essai préparé, inactif

Le YAML docs/qualification/BOTMODE_V1_FREE_FALLBACK_a6f6fee3c7dc_PROPOSAL.yml reste hors .github/workflows. Il ne déclenche rien. Autorisation distincte requise pour une seule mission réelle sur a6f6fee3c7dc, même clé GitHub, prix nuls revalidés, primaire en HTTP429 contrôlé puis fallback externe openrouter/free, cinq verdicts VERIFIED et même mission relue en Mongo.

Pour cette injection contrôlée uniquement, maxRetries=0 est placé sur le primaire local : pas d'attente artificielle de ses retries, dont l'issue est connue. Le fallback externe conserve sa politique de retry ; aucun changement produit. La configuration préparée a été exécutée à blanc sans réseau avec catalogue/clé fictifs : URL primaire locale, fallback HTTPS réel, JSON sur les deux, maxRetries=0 uniquement sur le primaire, deux politiques free_only vérifiées. YAML, Bash et Python de patch analysés. Une seule admission de mission, run_attempt=1 et event.before lié à la source exacte, nettoyage systématique, aucune publication ni fusion.
