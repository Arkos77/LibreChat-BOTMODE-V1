# BOTMODE — qualification de recherche dans l'image compilée

> Exécution inline avec superpowers:executing-plans, puis une revue indépendante unique.

**Goal:** Préparer une qualification manuelle de la candidate compilée sans modèle externe, publication ou installation.

**Architecture:** Réutiliser compileNativePlan, Run et Oracle exportés par le paquet compilé. Un serveur HTTP loopback et un outil synthétique testent les phases. Une seule image AMD64, conservée comme artefact, sera utilisée après les gates source et pourra être publiée ultérieurement sans reconstruction.

**Tech Stack:** Node natif, SDK existant, Dockerfile canonique et GitHub Actions.

**Spec:** feuille de route réconciliée du 24/10, R24/R26/R33, et lot recherche native au commit ded5065. Choix de l'implémenteur : harnais ciblé ; conserver le harnais navigateur historique avec sa portée datée, qui n'est pas une preuve du nouveau research-v1.

## Global Constraints

- Préparation et vérification locales uniquement ; aucun push, CI, Docker build, fournisseur distant, publication ou installation dans ce lot.
- Aucun changement produit, SDK, Oracle ou permission ; aucune dépendance ajoutée.
- Workflow manuel, permissions contents:read, aucun secret fournisseur et aucun push d'image.
- Le contrôle du paquet compilé ne démontre ni l'initialisation hôte complète, ni le navigateur, ni Mongo/Redis, ni la reprise des outils à froid.
- Chromebook : installation actuelle préservée ; 3,9 Go libres et 2,7 Gio RAM observés, aucune compilation lourde locale.

## Review Focus

- Identité de source et image : refus d'un BUILD_COMMIT différent.
- Échec/prose outil : aucune phase finale ni verdict annoncé comme réussi.
- Réseau : serveur local uniquement ; clé factice, aucune configuration personnelle.
- Artefact : conserver l'image testée, pas une reconstruction ultérieure ; absence de promotion stable.
- Ne pas transformer une preuve SDK synthétique en preuve d'installation fonctionnelle.

## Tâche 1 — Harnais compilé et lancement manuel préparé

Interfaces : script CJS autonome qui consomme packages/api/dist/index.cjs et SDK installé ; code de sortie non nul à toute assertion ratée. Workflow consomme le SHA du checkout et l'image exacte du build.

- [ ] Ajouter scripts/botmode/native-research-image-regression.cjs : succès, prose, outil en erreur, repli HTTP 429 ; vérifier tool_choice/format, nombre d'effets, sortie et Oracle.
- [ ] Exécuter ce test sur le build API local existant ; résultat attendu : quatre cas PASS, aucun fournisseur externe.
- [ ] Ajouter workflow manuel botmode-native-research-candidate.yml : tests source avant Docker, build unique, identité embarquée, script dans image sous réseau Docker désactivé (loopback utilisable), conservation de la même image et empreinte.
- [ ] Vérifier syntaxe Node/YAML, lint ciblé et cohérence des chemins sans lancer de CI. Faire une revue indépendante de ces seuls ajouts, corriger Important/Critical une fois si nécessaire, puis figer la source.

## Résultats

En cours. La construction candidate et son exécution ne sont pas autorisées par ce document.
