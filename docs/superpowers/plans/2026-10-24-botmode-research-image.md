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

- [x] Ajouter scripts/botmode/native-research-image-regression.cjs : succès, prose, outil en erreur, repli HTTP 429 ; vérifier tool_choice/format, nombre d'effets, sortie et Oracle.
- [x] Exécuter ce test sur le build API local existant ; résultat attendu : quatre cas PASS, aucun fournisseur externe.
- [x] Ajouter workflow manuel botmode-native-research-candidate.yml : tests source avant Docker, build unique, identité embarquée, script dans image sous réseau Docker désactivé (loopback utilisable), conservation de la même image et empreinte.
- [x] Vérifier syntaxe Node/YAML, lint ciblé et cohérence des chemins sans lancer de CI. Faire une revue indépendante de ces seuls ajouts, corriger Important/Critical une fois si nécessaire, puis figer la source.

## Résultats

Préparation terminée le 24 octobre 2026. Commit du harnais : `f2b23fe28aa0a743ca390a0a68185ee05e3327b9`, sur la source produit `ded5065eebdcc8a937bb6652dab31c415255a8c7`. Branche : `test/botmode-native-research-candidate-20261024`.

### Vérifications exécutées

- Script autonome sur le paquet API compilé local : quatre cas PASS (succès, prose sans outil, erreur outil, repli HTTP 429). Oracle est exercé pour les deux succès ; les deux refus n'ont aucun résultat final.
- Contrôle discriminant : le même harnais, chargé avec l'ancien build API d'un worktree voisin, échoue explicitement sur une seule phase au lieu de deux. Aucun ancien paquet ni worktree modifié.
- Deux suites voisines de configuration/routage natif : 13 tests PASS. Ce total s'ajoute aux 324 tests du lot source précédent ; ils n'ont pas été relancés ici.
- Syntaxe Node, YAML, permissions read-only, déclenchement manuel seul, ordre des gates avant Docker, build unique sans push, réseau conteneur désactivé, absence de secrets et diff-check : PASS. ESLint ciblé sans diagnostic.
- Revue indépendante unique : aucun constat Critical, Important ou Minor. Aucun second cycle de revue.

### Précontrôle de la cible en lecture seule

Le Chromebook penguin était en ligne. La candidate sur le port 3081 utilise toujours `638252d1b123ca40e304b96277b68fa2b9b895da`, image locale `e45b52045d5109d2a934877ea4fa46b4a30fac3c6e8a688cb9bf07dbdb83ccc3`. L'ancienne installation sur 3080 reste active (`sha-4ed6be2bc015`). Environ 3,9 Go libres, 2 747 Mio de RAM et aucun swap ; aucune compilation lourde n'y a été lancée. Aucun Redis en cours ; USE_REDIS non défini, SCHEDULES_SINGLE_PROCESS=true dans la candidate. Aucun fichier, volume, conteneur ou réglage d'installation n'a été modifié.

### Décisions conservées et risques

- Réutiliser le worktree isolé et une branche dérivée ; aucune nouvelle architecture. Une erreur de ce choix peut affecter uniquement le harnais préparé, pas le produit installé.
- Ne pas utiliser l'ancien harnais navigateur comme preuve du nouveau research-v1 : ses réponses synthétiques et assertions datées restent dans leur périmètre historique. La nouvelle qualification est volontairement limitée au paquet compilé/SDK ; le parcours utilisateur final reste ouvert.
- Construire une image AMD64 une fois, la tester puis sauvegarder cette même image. La rétention d'artefact est de trois jours : après expiration, sa réutilisation n'est plus assurée. Capacité disque runner, Docker, actions CI et succès réel de l'upload ne sont pas encore prouvés.
- La reprise automatique hôte après crash n'est actuellement préparée que pour un sous-ensemble sans outils. Les agents avec web_search sont refusés par ce chemin ; ni le MemorySaver du lot précédent, ni cette qualification image ne ferme ce manque. Ne pas supprimer ce refus sans adapter et qualifier les droits, preuves de sources et effets du chemin natif.
- Aucun test de fournisseur réel, initialisation hôte complète, navigateur, Mongo/Redis ou installation n'a été effectué ici. Stable reste NO-GO.

### Prochaine action concrète sous autorisation correspondante

Publier uniquement cette branche de qualification, puis déclencher une seule fois le workflow manuel `.github/workflows/botmode-v1-pr77-source-built.yml` avec `native_research_only=true` sur son SHA exact. Il n'emploie aucune clé fournisseur et ne publie aucune image. Conserver l'artefact `botmode-native-research-<SHA>` et ses empreintes si le run réussit ; sa publication candidate, une mission réelle, l'installation et une promotion stable sont des actions distinctes. Ne pas déclencher une CI existante supposée équivalente ni construire sur le Chromebook.

Aucun push, lancement CI, build Docker, publication, fusion ou installation n'a été effectué dans ce lot.

### Ajustement avant lancement autorisé

L’autorisation du propriétaire couvre l’envoi de la branche et un seul run candidat. Le précontrôle GitHub constate que le nouveau nom de workflow n’est pas enregistré ; GitHub exige un workflow connu pour le dispatch manuel. Le harnais est donc ajouté comme job optionnel au workflow déjà enregistré `botmode-v1-pr77-source-built.yml` (ID 393172640). Le paramètre booléen `native_research_only=true` sélectionne exclusivement le nouveau job ; les deux anciens jobs sont ignorés pour ce run. En dehors de ce paramètre, leurs définitions sont structurellement identiques. Aucun run ni build n’a été consommé avant cet ajustement. Le nom de fichier initial est supprimé pour éviter deux définitions divergentes.
