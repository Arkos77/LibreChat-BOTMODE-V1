# BOT MODE V1 — résultats, sources natives et reprise

État du 24 octobre 2026. Candidate uniquement ; stable non validée.

## Source et qualification

- Source applicative figée : `ec0da8d0277ffa9895086ae65e1bf20378ad2f39`.
- Qualification : [run 40042483574](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40042483574), job `120716527832`, pilote `efbb4c59c9e9779fd1c8b773105c6a44efb15184` : **SUCCESS**, tentative 1.
- Configuration OCI qualifiée : `sha256:6d2f24ed736acb547c0a408ad3ac9ee96af9a6956271e7083869f93894a2d8de`, Linux AMD64.
- L'image conserve exactement les couches de la base `a95978795082c72c9e33637e54775402c902bab4` ; la différence Git complète est limitée à cinq fichiers JavaScript, Python ou de test. Les dépendances, le frontend et le code de production TypeScript compilé sont inchangés. Les fichiers copiés, le préfixe des couches, l'architecture et les métadonnées source sont vérifiés.

## Comportement corrigé

Le contrat hôte exige un résultat non vide. Les tâches de recherche doivent citer des URL réellement retournées par un appel natif `web_search` de cette tâche. Les nœuds de tâche retrouvent les outils et paramètres de leur agent enregistré à travers le plan autorisé, sans ajouter de permission. Les écritures de verdict conservent désormais les observations de sources déjà persistées.

Le simulateur CI conserve le nom de l'outil dans les réponses en streaming, reconnaît chaque étape planifiée et utilise des références d'environnement valides pour les clés et URL de test. Son précontrôle en lecture seule se termine explicitement et possède une limite de temps.

## Preuves acquises

- 249 tests ciblés du client, des callbacks et du client de reprise : **PASS**. Le défaut de perte de sources a été reproduit en rouge, puis corrigé en vert, y compris lors d'écritures concurrentes.
- Régression du simulateur : streaming, réponse normale, délégation héritée et analyse après recherche : **PASS**.
- Typecheck de `packages/api` : **PASS** après la correction de test `b0b8573744ff80796dd482111f3c79c6f792fb7f` ; les sources de ce paquet sont identiques dans la candidate. ESLint ciblé, format et `git diff --check` : **PASS**.
- Graphe natif historique à cinq tâches et cinq verdicts : **PASS**.
- Navigateur réel sur l'image candidate : sélection automatique/manuelle autorisée, recherche native et sources persistées : **PASS**.
- Trois tâches `research`, `analysis`, `synthesis` : respectivement **2, 1, 1 verdicts VERIFIED**.
- Réouverture par URL sans paramètres : mode conservé, nouvelle mission et nouvelles sources : **PASS**.
- Publication finale du même flux, relue dans MongoDB : **PASS** (`CI_BROWSER_P6_SAME_STREAM_PUBLISHED_MONGO`).

Ces preuves utilisent un fournisseur de modèle et des services de recherche locaux simulés. Aucun appel de modèle externe n'est requis par cette qualification. La provenance d'une URL ne démontre pas à elle seule la véracité de chaque affirmation. La suite complète du dépôt n'est pas annoncée verte : 93 tests d'initialisation précédemment bloqués par MongoMemoryServer ne constituent pas des réussites.

## Publication et installation

- Publication : [run 40043037192](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40043037192), **SUCCESS**. Même archive qualifiée, sans reconstruction.
- Index candidat : `sha256:18099cba03e6ace17803d7a2fe67cbf6f8c18837b02fe81e549f330dfa18ec8f`.
- Manifest Linux AMD64 : `sha256:553ecf6eb946fb94f7389a3e05e3a01780639d4f73d5ecdb09348609defed804`.
- Source, configuration OCI, couches et référence immuable contrôlées indépendamment avant installation.
- Installation de cette candidate : **PASS**, avec sauvegarde de la base et des volumes après arrêt contrôlé, puis vérification des archives. Le contrôle préalable exige un service arrêté ; l'ordre de l'installateur a été corrigé pour respecter cette condition. L'image déjà téléchargée a été réutilisée après vérification.
- Après installation : quatre routes de disponibilité répondent HTTP 200 ; source et digest exécutés conformes ; nombres de documents, montages, configuration et installation antérieure conservés. La référence précédente reste disponible pour retour arrière.
- Sonde locale après installation : restauration du mode, identité des outils natifs et contrats de résultat/source **PASS**. Une réponse sans résultat et une citation non observée sont refusées ; la source synthétique effectivement observée est acceptée.
- Six politiques et six agents enregistrés : liaison fournisseur/modèle cohérente, routage statique et modèles gratuits uniquement. **Aucun appel de modèle externe** pendant cette sonde.
- Les références stable/latest et les branches de release n'ont pas été modifiées.

La validation d'un scénario avec fournisseur réel et l'approbation d'une release stable restent distinctes. Les limites préexistantes des intégrations non activées et de la reprise complète sans Redis ne sont pas levées par ce lot.

## Recette avec fournisseur réel — 24 octobre 2026

Une seule mission a été autorisée puis admise sur cette image exacte, avec les politiques gratuites existantes et le fournisseur OpenRouter réel. Admission HTTP 200 et abonnement SSE réussis. Le service a terminé avec un statut erreur, sans mission encore active. Aucune relance n’a été effectuée.

La réponse de RECHERCHE, relue dans le checkpoint MongoDB natif, est exactement `{"ok":true,"result":"","sources":""}` ; aucun appel natif `web_search` n’a été observé. Le premier contrat `result-v1` refuse donc correctement le résultat vide, même si le champ `ok` vaut vrai. Les étapes analyse et synthèse ne sont pas atteintes et aucune publication P6 réussie n’est établie pour cette mission réelle. La consommation rapportée par le flux est de 3 412 jetons sur la route `openrouter/free` ; aucun modèle payant n’a été sélectionné par le routage configuré.

Les consignes enregistrées de l’agent ne contiennent pas de modèle de réponse vide. Ces observations établissent l’échec de la sortie transmise à Oracle après le SDK ; elles ne distinguent pas encore la réponse HTTP brute du fournisseur de ses transformations par le SDK. Il ne faut ni assouplir le contrat, ni convertir ce refus en réussite, ni annoncer une validation complète en production à partir des tests simulés.
