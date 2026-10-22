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
- Mission réelle exécutée une fois : **échec worker INVALID_CANDIDATE ; cinq verdicts/P6 non prouvés**. Voir le résultat définitif ci-dessous.
- Image intégrée a6f6fee3c7dc : **AMD64 construite et contrôlée localement, non publiée** ; ARM64 non construite pour ce source. Les images historiques 642/ceb conservent leurs seules preuves.
- D-01 résiduel ouvert ; D-02 nouveau verrou toujours à rattacher explicitement ; D-03 publication nouvelle source et D-04 fusion/stable non autorisés.

## Proposition historique — autorisée et exécutée une fois

Le YAML docs/qualification/BOTMODE_V1_FREE_FALLBACK_a6f6fee3c7dc_PROPOSAL.yml reste hors .github/workflows. Il ne déclenche rien. Autorisation distincte requise pour une seule mission réelle sur a6f6fee3c7dc, même clé GitHub, prix nuls revalidés, primaire en HTTP429 contrôlé puis fallback externe openrouter/free, cinq verdicts VERIFIED et même mission relue en Mongo.

Pour cette injection contrôlée uniquement, maxRetries=0 est placé sur le primaire local : pas d'attente artificielle de ses retries, dont l'issue est connue. Le fallback externe conserve sa politique de retry ; aucun changement produit. La configuration préparée a été exécutée à blanc sans réseau avec catalogue/clé fictifs : URL primaire locale, fallback HTTPS réel, JSON sur les deux, maxRetries=0 uniquement sur le primaire, deux politiques free_only vérifiées. YAML, Bash et Python de patch analysés. Une seule admission de mission, run_attempt=1 et event.before lié à la source exacte, nettoyage systématique, aucune publication ni fusion.

## Mission réelle du 22 octobre — résultat définitif sur a6f6fee3c7dc

L'utilisateur a autorisé explicitement une mission réelle, sans publication ni fusion.

### Arrêt préalable du harnais, sans mission ni clé réelle

[Run 39856719539](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39856719539), job 120096711009, pilote **76178fa414e0284cddfebca1f9d687ee354316f9**, branche ops/closeout-a6f6fee3c7dc : FAILURE avant les étapes fournisseur. Image AMD64 construite depuis la source exacte a6f6fee3c7dcfb5877fe798f759966774a046a58 ; identité/source et quatre tests JSON dans l'image PASS. L'audit renvoyait une liste vide, mais le harnais exigeait exactement les trois anciens modérés : assertion trop stricte. La licence, située après cette assertion, n'a pas été validée par ce premier run. Étape recevant OPENROUTER_API_KEY et mission : **SKIPPED** ; nettoyage SUCCESS. L'autorisation d'une mission n'était donc pas consommée.

Correction limitée au workflow : autoriser une liste vide ou un sous-ensemble des trois seuls noms historiques, tous de sévérité moderate, cohérent avec les compteurs ; refuser high/critical/low/info et toute alerte inconnue. Vérification locale : listes vide/trois modérés/sous-ensemble acceptées ; high, critical, inconnu, compteur incohérent et low refusés. Aucun changement applicatif ni du verrou.

### Une seule mission exécutée

[Run 39857859228](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39857859228), job **120100634900**, pilote **970353308d1dfb69ab56b41b70d01749822764aa**, branche ops/closeout-a6f6fee3c7dc-r2 : **FAILURE**, terminé. Source construite/testée exacte **a6f6fee3c7dcfb5877fe798f759966774a046a58**, distincte du pilote. Config ID local AMD64 **sha256:7ecd1ba676038586378a63c7b0870949d84dab86a312790019ea6dc068435854** : ce n'est pas un digest GHCR ni une publication multiarchitecture.

| Contrôle | Résultat |
|---|---|
| Source exacte / empreintes / BUILD_COMMIT | PASS |
| Mode JSON SDK primaire et compatible, dans l'image | 4 tests PASS |
| Versions des quatre dépendances corrigées | PASS |
| Audit production installé, à 23:38 Paris le 22/10 | **0 critical / 0 high / 0 moderate** |
| Notice Nodebox et termes SUL complets / hash | PASS |
| Deux routes autorisées et prix nuls revalidés | PASS |
| Admission de mission / plan natif | Une mission, cinq tâches planifiées |
| Primaire local contrôlé | **1 HTTP429 / 0 requête inattendue** |
| Verdict worker | **REJECTED / INVALID_CANDIDATE** |
| Forme du candidat worker | 59 caractères, INVALID_JSON, aucune clôture Markdown ; contenu brut non conservé |
| Spécialistes 1–4 | Zéro verdict chacun ; non atteints après le rejet worker |
| Terminal | Partie error, classe expurgée MISSION_ORACLE ; pas RATE_LIMIT |
| P6 final / receipts | **SKIPPED**, non qualifié |
| Nettoyage stack/volumes/image | SUCCESS |

La réponse générée malgré le primaire en 429 contrôlé atteste un chemin alternatif dans cette configuration ; le reçu final fallback n'a pas été recueilli et aucune sortie brute de modèle n'est publiée. Ce run ne constitue ni cinq verdicts VERIFIED ni une publication canonique réussie. Il n'invalide pas les 109 tests de routage des spécialistes, mais il ne les confirme pas encore en mission réelle, car le worker échoue avant eux.

### Diagnostic hors ligne après ce résultat

Le test existant hostModelRouting.compat.spec.js a été étendu pour capturer de vraies requêtes HTTP du SDK : primaire HTTP429, puis fallback compatible. Le corps de la requête fallback contient bien response_format={type:json_object}, **streaming=false et streaming=true**, avec uniquement une fixture loopback. Avec hostJsonMode.compat.spec.js : **2 suites / 8 tests PASS**, Node/Prettier/diff check PASS. Test conservé au commit **b4eb797c669b502e722c0fc8b7304c2b80e5fbc3** ; aucun nouveau patch produit.

Cette preuve exclut une perte systématique du paramètre dans le trajet SDK testé. Elle ne capture pas la requête réelle de ce run, ni son fournisseur sous-jacent, et ne permet pas d'attribuer définitivement les 59 caractères invalides à une cause précise.

La documentation officielle OpenRouter indique que response_format reste une préférence de routage si provider.require_parameters n'est pas activé ; un paramètre non pris en charge peut alors être ignoré. Ce contrôle n'était pas imposé par le préflight courant. C'est une piste fondée pour un prochain diagnostic, **pas une cause prouvée de cette réponse** :
https://openrouter.ai/docs/guides/routing/provider-selection#requiring-providers-to-support-all-parameters
https://openrouter.ai/docs/guides/features/structured-outputs

### Autorisations et décision

L'accord est maintenant consommé par cette seule mission. Aucun replay ni nouvelle inférence, nouvelle publication, fusion ou changement d'installation n'a été effectué. Le nouveau constat d'audit à zéro ne réécrit pas rétroactivement les audits précédents ni l'acceptation D-02. Aucun retrait d'avis n'est déduit de ce seul rapport. D-01 résiduel et les décisions D-02/D-03/D-04 restent aux frontières documentées.

**NO-GO stable : blocage courant = worker rejeté pour JSON invalide ; cinq tâches et P6 réels non acquis.**
