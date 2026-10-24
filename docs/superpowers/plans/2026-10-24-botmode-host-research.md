# BOTMODE — préparation de qualification hôte avec recherche native

> Exécution inline avec superpowers:executing-plans, une seule revue indépendante avant tout lancement externe.

**Goal:** Préparer une recette de la vraie application et de son outil web, avec fournisseurs synthétiques locaux, sur la même image que la qualification compilée.

**Architecture:** Réutiliser le fixture OpenAI/SearXNG/Firecrawl existant et Compose Lite + Redis de qualification. Provisionnement natif des six agents, mission canonique analyze par HTTP/SSE, observations sources/Oracle/stockage Mongo contrôlés. Un seul build futur, aucune publication ni installation dans ce lot.

**Tech Stack:** Python stdlib, Docker/Compose existants, workflow manuel enregistré.

**Spec:** feuille de route R01/R06/R11/R13/R24/R33, contrats de sources corrigés aux lots3–4 ; base2922228c55e9e276f1e5bce5de9882c30dbbc4e7.

## Global Constraints

- Préparer et tester localement les harnais uniquement : aucun push, CI, Docker, inférence externe ou installation.
- La reprise automatique d'outils reste refusée : le journal d'effets existe mais n'est pas branché aux outils ordinaires et à leur magasin de résultats privés. Ne pas inventer une réparation de paramètre ou activer un rejeu sans preuve.
- Le test hôte futur est réservé au runner GitHub hébergé, à un SHA/image exacts et à un projet Compose isolé avec configuration temporaire, secrets jetables et nettoyage borné à ce projet.
- Aucun secret fournisseur, modèle distant, compte de production ou modification des services installés.
- La recette HTTP/SSE n'est ni une preuve navigateur ni une installation par un tiers. L'utilisateur de test est jetable et créé dans Mongo comme dans le harnais historique ; agents et ACL passent par l'API native.
- Conserver l'image construite même si le contrôle hôte échoue, en enregistrant le statut exact pour éviter de la déclarer qualifiée.

## Review Focus

- tool_choice web nommé doit fonctionner sans ancien marqueur de contrat et malgré un ancien résultat dans l'historique.
- Source mode reste opt-in, délégation historique inchangée ; un outil nommé non annoncé n'est pas simulé comme exécuté.
- Isolation du projet, SHA et image : refus avant Docker en dehors du runner ou pour un identifiant non attendu.
- Aucun replay POST après erreur réseau ambiguë ; seuls les 503 explicites avant admission peuvent attendre un nouveau démarrage.
- Nettoyage et archivage conservent preuves et image après échec, sans masquer l'échec du job.

## Tâche 1 — Fixture et recette intégrée

- [x] Tests HTTP réels du fixture : phase nommée sans contrat, historique terminé, ancien contrat résultat, schéma absent, JSON résultat et délégation historique. Observer le rouge avant correction.
- [x] Corriger uniquement la priorité du choix d'outil nommé dans le mode source.
- [x] Ajouter le harnais hôte : garde runner/source/image, configuration temporaire, startup, compte jetable, setup natif idempotent, mission analyze, source observée, verdicts exacts, P6/Mongo et métriques outil ; nettoyage systématique.
- [x] Ajouter une option manuelle host_research au workflow enregistré, réutiliser la même image ; gates source pertinents avant build ; image et statuts conservés même en échec de test.
- [x] Tests locaux des fixtures, syntaxe, contrôles de configuration et revue. Aucun résultat Docker/hôte présumé ; préparer un SHA reviewable avant demande d'un run unique.

## Résultat

Préparation terminée le 24 octobre 2026. Lot initial relu : `f5f8f2e8406685b5686efa0f74071ef5be1d1c84`. Branche locale : `test/botmode-host-research-20261024`. Le SHA de clôture est relevé dans le bilan fourni après le commit ; aucune publication source n'a été effectuée.

### Vérifications locales

- Fixture HTTP : RED **4 échecs/2 succès**, puis **7 tests PASS**, dont streaming, choix nommé sans marqueur JSON, historique déjà terminé, priorité sur un ancien contrat résultat, schéma absent et délégation historique hors mode source.
- Gardes du harnais : **6 tests PASS** ; machine locale, runner non hébergé, source différente, image flottante/registre et projet ambigu sont refusés. Le CLI a aussi refusé l'exécution locale avant Docker.
- Harnais SDK compilé : **5 scénarios loopback PASS**, ajout de la route SDK OpenRouter native aux quatre cas précédents. Aucun serveur fournisseur distant ni vraie clé dans ces essais retenus.
- Syntaxe Python/Node, ESLint du harnais CJS, YAML et syntaxe shell de chaque étape du job, conservation des anciens jobs, un seul build sans push d'image et réseau interne : contrôles locaux PASS.
- Aucun fichier API/TypeScript produit ou verrou modifié dans ce lot : pas de répétition de leurs 126 tests ni de nouveau build API nécessaire.

### Décisions

1. Le journal Redis d'effets et le garde PTC existent ; le branchement des outils ordinaires, leurs résultats privés et leur reconstruction hôte restent absents. Le refus de reprise automatique est conservé. Ce lot prépare la qualification de l'usage normal, pas ce nouvel adaptateur.
2. Le mode source du fixture était incompatible avec la nouvelle phase qui demande web_search sans marqueur de contrat. Seule la priorité du tool_choice nommé est corrigée ; le mode historique reste inchangé.
3. La configuration de test garde l'identité du fournisseur enregistré ; elle redirige modèle/recherche/scraping vers le fixture interne, désactive le reranker et les fetch de catalogues distants. Le routeur hôte optionnel est désactivé uniquement dans cette recette à fournisseur synthétique unique ; cela ne qualifie pas ses replis/politiques réels.
4. Le test utilise un principal jetable inséré dans Mongo, comme le harnais antérieur. Provisionnement/ACL des six agents passent par l'API native et sont contrôlés après deux setup. Le scénario analyze mobilise RECHERCHE, ANALYSE et RÉDACTION ; il ne prouve pas CODE/DOCUMENTS/RAG ou l'inscription utilisateur par l'interface.
5. Les services sont dans un réseau interne, le fixture n'expose aucun port, l'API n'est publiée que sur127.0.0.1:3090. Proxy sortant désactivé pour cette pile ; aucune clé fournisseur. Les caches Python de la CI sont placés sous runner.temp, hors du contexte Docker.
6. L'archivage dépend seulement du succès du build et s'exécute même en cas d'échec de test. Les statuts compiled/host sont explicites ; une image conservée n'est pas automatiquement une image qualifiée.

### Revue et limites

Une revue indépendante unique du lot initial : aucun Critical ou Important confirmé. **Minor différé :** si `docker compose down` dépasse son timeout, le fichier détaillé host-research-outcome.json peut ne pas être écrit ; le statut du job et qualification-status.json conservent néanmoins l'échec. Aucun succès n'est inféré. Les durées de timeout, Docker/Compose, l'exécution hôte, les compteurs réels et l'annulation du runner n'ont pas été qualifiés par cette revue en lecture seule.

Après revue, quelques garde-fous de configuration ont été précisés (proxy/port local/cache hors contexte) et vérifiés sans nouvelle modification produit ni seconde revue.

Une sonde d'initialisation conservant l'URL fournisseur n'a pas été retenue : le contrôle automatique l'a bloquée comme connexion possible à OpenRouter. Une variante distincte, avec fournisseur unique pointant exclusivement sur loopback et clé factice, a confirmé provider=openrouter ; le harnais SDK a ensuite testé ce provider sur HTTP local. Aucun contournement du refus ni autorisation d'inférence externe n'en est déduit.

**Toujours non exécutés :** build Docker, création de pile, mission HTTP/SSE hôte, vrai outil web via cette pile et publication Mongo sur cette source. Les tests locaux ne valent pas validation de ces étapes. Le profil de recette est Lite+Redis temporaire et ne démontre pas le redémarrage du profil installé sans Redis, le navigateur ou une installation par un tiers. L'image e40f1e5 antérieure ne contient pas ces correctifs source.

### Prochaine action sous accord exact

Publier cette branche de qualification puis déclencher une seule fois le workflow enregistré `botmode-v1-pr77-source-built.yml` (ID393172640) avec `host_research=true`, sur le SHA final vérifié. Un build AMD64, la même image pour les contrôles compilés puis hôte, archivage de trois jours avec ses statuts même en cas d'échec. Pas de PR déclenchant les anciens jobs, fournisseur réel, publication GHCR, fusion ou installation. Stable reste NO-GO.
