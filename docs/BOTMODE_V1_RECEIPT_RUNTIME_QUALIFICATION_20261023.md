# Qualification des receipts persistées — 23 octobre 2026

## Résultat acquis et portée
**Persistance MongoDB validée dans l'image corrigée avec un fournisseur HTTP local déterministe.**
Run https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39883796226, job 120187128591 : SUCCESS. Activation 231963f1315bbe486501297e0f80fd780d7b2628, branche ops/receipts-local-b2213e9717b8-003.
Source applicative b2213e9717b879a91181c6ac9d7607124c30258b, image AMD64 ID de configuration sha256:6414f7af6cbb235444315ea3c8928fb2476aa2d83fc4c19c313626990c6469db. Archive source, checksum, ID et hashes applicatifs vérifiés avant utilisation.
Le run utilise le vrai SDK, l'API et les bases jetables MongoDB/Redis. Toutes les routes modèles sont dirigées vers le serveur local; aucun secret fournisseur réel, catalogue fournisseur ou inférence externe n'est utilisé. L'image est réutilisée sans compilation.

## Preuves du run local réussi
- Cinq verdicts Oracle VERIFIED et P6 durable de la même mission : PASS.
- Un seul message assistant canonique MongoDB : CI_REAL_P6_CANONICAL_ASSISTANT_COUNT=1, CI_REAL_P6_SAME_MISSION_MONGO_COMMITTED=TRUE.
- CI_REAL_HOST_USAGE_RECEIPT=TRUE; CI_REAL_FALLBACK_RECEIPT=TRUE; CI_REAL_RECEIPT_FREE_ONLY=TRUE.
- CI_REAL_RECEIPT_MODEL_CALL_COUNT=1 : la receipt primaire couvre le Worker, sans absorber les usages des spécialistes.
- CI_REAL_RECEIPT_ACTOR_AND_BINDING_VERIFIED=TRUE : acteur du plan Redis, fournisseur configuré, fournisseur SDK, modèle, binding autorisé et présence des jetons contrôlés dans le message MongoDB.
- CI_REAL_AGGREGATE_USAGE_PRESENT=TRUE; CI_REAL_DURABLE_FALLBACK_RECEIPT=PASS.
- Cinq 429 primaires contrôlés puis cinq réponses locales acceptées. Dix requêtes observées, JSON et require_parameters présents; contenu identique entre sorties, donc correspondance par lot et pas attribution unique des empreintes.
- Nettoyage de la pile jetable : SUCCESS.
Les préfixes CI_REAL/CI_LIVE_FREE sont hérités du harness; ils ne qualifient pas ici le fournisseur comme externe.

## Compilation unique et mission externe autorisée
Run https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39880864060, job 120177633764, activation 2a1950acf7c3ed17faf6b221e400b50356e987a6.
Une compilation de b221 et une seule mission externe gratuite ont été exécutées selon l'accord utilisateur. L'identité et les hashes applicatifs, quatre tests SDK JSON dans l'image, audit installé 0 critical / 0 high / 0 moderate et licence Nodebox/SUL passent.
La mission externe échoue avant le contrôle des receipts : Worker REJECTED / CRITERION_FAILED, objet JSON de huit caractères sans propriété ok. Une réponse HTTP 200 correspond exactement et uniquement à l'entrée Oracle; jsonRequested=true et supportRequired=true. Le transport n'a pas modifié le candidat. Aucun correctif applicatif n'est déduit de ce seul résultat.
Un seul 429 primaire contrôlé; aucun spécialiste validé, P6/receipt readback SKIPPED. Nettoyage SUCCESS. L'accord d'une mission externe est consommé; aucun replay externe.
Image non configurée conservée comme artifact 12471215501, nom botmode-receipts-b2213e9717b8-image-39880864060, réutilisable jusqu'au 24 octobre 2026 à 03:03:06 Paris. Aucune publication GHCR.

## Deux échecs du dispositif local, conservés explicitement
- Run 39882417829 / job 120182651130 : échec LOCAL_ENDPOINTS_ONLY avant mission; une route supplémentaire du bootstrap manquait dans le prétest. Le dispositif force désormais toutes ses routes personnalisées vers le serveur local. Prétest complété avec cette troisième route, réseau refusé pendant l'évaluation.
- Run 39882928179 / job 120184311160 : le faux fournisseur réutilisait le même identifiant de réponse. Worker VERIFIED puis sortie du nœud suivant absente; le SDK/graphe dédupliquait les messages. Reproduction hors CI en ne changeant que l'identifiant du faux fournisseur : rouge avec identifiant constant, vert avec identifiants uniques.
Le serveur Python exact du workflow, avec UUID unique par réponse et usage SSE, a ensuite été testé dans le vrai SDK/graphe/ModelEndHandler/projection : PASS avant le run local réussi. Aucune modification supplémentaire de l'application ni reconstruction entre ces runs.

## État de clôture
Les 270 tests locaux et la revue indépendante appuient b221. La persistance de ses receipts est maintenant acquise dans MongoDB avec fournisseur local déterministe.
La persistance de ces nouvelles receipts sous fournisseur externe n'est pas prouvée par ce run. Le parcours externe cinq tâches/Oracle/P6 du run 39877163780 reste acquis sur a6; ne pas transférer cette preuve rétroactivement.
D01 (dont enfants externes/dynamiques, endurance/HITL et UX résiduelle), D02, D03 nouvelle publication et D04 stable/fusion/installation conservent leurs limites. NO-GO stable maintenu. Aucun relevé de quota, clé, prompt, raisonnement ou contenu utilisateur n'est publié.
