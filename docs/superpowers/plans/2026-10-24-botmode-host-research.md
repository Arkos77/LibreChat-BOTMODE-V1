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

- [ ] Tests HTTP réels du fixture : phase nommée sans contrat, historique terminé, ancien contrat résultat, schéma absent, JSON résultat et délégation historique. Observer le rouge avant correction.
- [ ] Corriger uniquement la priorité du choix d'outil nommé dans le mode source.
- [ ] Ajouter le harnais hôte : garde runner/source/image, configuration temporaire, startup, compte jetable, setup natif idempotent, mission analyze, source observée, verdicts exacts, P6/Mongo et métriques outil ; nettoyage systématique.
- [ ] Ajouter une option manuelle host_research au workflow enregistré, réutiliser la même image ; gates source pertinents avant build ; image et statuts conservés même en échec de test.
- [ ] Tests locaux des fixtures, syntaxe, contrôles de configuration et revue. Aucun résultat Docker/hôte présumé ; préparer un SHA reviewable avant demande d'un run unique.

## Résultat

En cours. Ce lot prépare une qualification ; il ne l'exécute pas.
