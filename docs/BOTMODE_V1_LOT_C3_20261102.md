# BOT MODE V1 simplifiée — Lot C3, qualification des parcours utilisateur

Date : 2 novembre 2026. Branche isolée : `simplify/botmode-v1-lot-a-20261102`.

## Prérequis acquis

C1 : 85 tests offline orchestration, Recherche/Analyse, autorisation et contrats Oracle/P6 PASS au commit `95834293` (run `41381432629`). C2 : SIGKILL réel sur gestionnaire + Redis + Mongo, `OUTCOME_UNKNOWN`, sans rejeu ni publication, PASS au commit `566306a5` (run `41386087533`). Ni l'un ni l'autre ne démontre encore le parcours HTTP+SSE+UI d'une mission utilisateur sur la candidate.

## C3 — Première qualification ciblée, sans fournisseur

Réutiliser le workflow source-built existant avec l'entrée `c3_only`, sans relancer les tests déjà acquis et sans reconstruction d'image Docker. Sur le commit exact, exécuter les tests existants :

- API : routes HTTP Projet, projection des messages/observations par propriétaire et tenant, validation/onboarding de 5 spécialistes, permissions et liaison effective de spécialistes au graphe du Worker.
- Client : Idée → création Projet → lancement Chat avec Worker autorisé, refus de modèle payant/agent non autorisé, projection du résultat Oracle dans la fiche Idée, affichage Projet, choix auto/manuels des spécialistes et progression de mission.
- Conservation de la barrière Oracle/P6 : les contrats offline C1 restent la preuve historique sur leur périmètre. Ne pas prétendre un succès d'une mission intégrée P6 sans nouveau test concret.

## Frontière de preuve

Ces suites utilisent React/Jest, des modèles, routes et données partiellement simulés ; elles ne lancent ni navigateur avec API LibreChat réelle, ni fournisseur. Un PASS prouve les contrats de surface testés, **pas** un parcours E2E complet. Un FAIL exige d'examiner les logs et de corriger uniquement le défaut démontré. Un test hors service réel ne doit pas être déclaré GO V1.

C3 ne pourra être déclaré globalement PASS qu'après des preuves cohérentes du parcours utilisateur réel et d'un verdict Oracle et P6 sur la même mission source exacte. En attendant, verdict : **NON CONCLUANT**. La release `v1.0.1` et l'installation utilisateur restent inchangées.

## Premier résultat de qualification C3

Run `41386621665` sur le commit `565df960557601dc00abd66a4b19719e6b95ecce` : **API PASS, 5 suites / 22 tests** (permissions, projection, initialisation, contrôles agent). Les quatre suites React ont échoué **avant d'exécuter le moindre test** : le workflow ne construisait pas `@librechat/client`, dépendance déjà définie dans le dépôt (`npm run build:client-package`). Verdict client : **NON CONCLUANT**, il ne s'agit pas d'un défaut produit. Correctif limité à la préparation du package client ; prochain run `c3_ui_only` pour ne pas répéter les 22 tests API déjà acquis. Aucun code produit modifié.

## Résultats C3 hors fournisseur — vérifiés sur GitHub Actions

- Run API [41386621665](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/41386621665), commit `565df960557601dc00abd66a4b19719e6b95ecce` : **5 suites / 22 tests API PASS**, incluant l'inventaire des spécialistes, les contrôles d'identité et de permissions, les projections Projet et les routes HTTP simulées. Verdict du run global : FAIL, car les suites UI qui suivaient ne pouvaient pas démarrer sans le package interne client.
- Run client [41386838354](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/41386838354), commit `5a9709d4dcc7966672048da7a9a74856eaca6515` : **4 suites / 23 tests React PASS**, après `npm run build:client-package`. Le workflow est SUCCESS. Teste notamment Idée → Projet → lancement Chat, choix du Worker autorisé, sélection auto/manuelle, résultats Oracle affichés, suivi d'exécution.
- Total C3 sur les deux sous-périmètres : **45 tests PASS**. Pas de modification du code de production ; seule la CI et la documentation ont changé depuis C2.

**Verdict : C3 contrats API/UI ciblés PASS, C3 parcours complet NON CONCLUANT.** Une authentique session utilisateur avec LibreChat API démarrée, propagation de l'état des spécialistes, appel fournisseur réel contrôlé, Oracle VERIFIED et publication P6 unique sur une même mission n'a pas été réalisée sur cette candidate. Aucune nouvelle qualification 4C ne doit être engagée pour compenser cette absence.

**Point de sortie pour le prochain sous-lot** : produire une seule preuve E2E sur environnement isolé de la candidate source exacte, en réutilisant les briques déjà présentes ; ne pas basculer la release officielle, ne pas utiliser les secrets privés sans mandat, et ne pas relancer les 45 tests sans changement pertinent.

## Qualifier une seule mission E2E dans l'API et le navigateur réels

Le workflow existant `botmode-v1-real-oci-idea-projection-e2e.yml` a déjà qualifié une ancienne candidate, mais son contrôle D03 (`ci-release-composition-source-guard.py`) refuse par conception les modifications de runtime de notre simplification. Ajouter une entrée explicite `simplified_v1=true` pour autoriser exclusivement un **checkout propre au SHA exact de cette branche**, sans remplacer ni supprimer le garde D03 des autres exécutions. Construire l'image localement sur le runner (Buildx `push: false`, `load: true`), ne jamais utiliser l'image publiée `v1.0.1` ou GHCR et ne pas passer de véritable secret fournisseur.

Le scénario existant `ci-real-idea-runner.sh` doit vérifier sur une même mission : création du Worker et des cinq spécialistes via API authentifiée, exécution SSE avec fixture de fournisseur local (aucun quota payant), Oracle VERIFIED, P6 finale unique, persistance des messages, projection vers un Projet et une Idée, puis lecture du vrai résultat dans un navigateur Chromium et refus d'accès à un second utilisateur. La fixture reste **une simulation des réponses du modèle**, mais l'orchestration, les stockages et les interfaces doivent provenir du runtime source-built réel.

Ne conclure PASS global que si le workflow atteint tous ces marqueurs effectivement mesurés ; distinguer strictement mise en route, verdict Oracle, P6 et lecture navigateur. Ne pas réparer l'ancien replay 4C même si un diagnostic historique l'évoque.

## C3 — E2E HTTP / Oracle / P6 / Projet / Idée / Chromium réussi sur la candidate (02/11/2026)

Run [41391258105](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/41391258105) = **SUCCESS** sur le commit exact `3b8fc0067adf68acc76d622242f8390f9538c52f`. Image construite uniquement dans le runner GitHub et non publiée, modèle déterministe simulé localement (aucune clé personnelle ni API distante). Tests sur API LibreChat réelle, Redis/Mongo éphémères, navigateur Chromium réel et deux comptes CI isolés :

- Buildx image depuis le HEAD propre et tag exact : PASS ; OpenRouter configuré vers la fixture locale, pas de frais modèle.
- API authentifiée : refus sans JWT (401) et accès propriétaire 200 PASS, 6 agents persistés (Worker + cinq spécialistes), capacités/permissions et délégation configurées PASS.
- Mission Worker via endpoint HTTP/SSE, HTTP 200, 7 événements SSE et **1 événement final** ; deux messages et une conversation persistés dans Mongo. Aucun événement d'erreur SSE.
- Mission Oracle ACCEPT avec verdict **VERIFIED** persisté : **exactement 1** événement final et zéro erreur ; mission revue HUMAN_REVIEW : **zéro** événement final et candidat privé non publié. Ces deux scénarios sont distincts, et l'acceptation produit le contenu repris dans la projection de Projet/Idée.
- Projet et Idée réels créés dans Mongo, conversation Oracle acceptée associée, résultat vérifié via HTTP puis affiché dans Chromium sous le compte propriétaire ; compte étranger refusé à l'API et résultat absent du navigateur : PASS.

**Limite de preuve majeure confirmée par lecture du scénario :** `CI_SUBAGENT_UPDATE_COUNT=0`, `CI_SUBAGENT_UNIQUE_RUNS=0`, `CI_SUBAGENT_EVENT_ASSERTION_SCOPE=informational_only` pour la mission Worker de recherche. La fixture `scripts/botmode/ci-openai-compatible-mock.py` renvoie **toujours une réponse texte constante** (`{"ok":true}`) et **n'émet aucun appel d'outil `subagent`**, ni dans la voie streaming ni dans la voie non-streaming. La mission Worker du test ne peut donc pas établir une véritable délégation ; l'absence d'événements SSE n'est pas un défaut produit démontré. De plus, le flux peut être récupéré après achèvement. La mission Oracle acceptée utilise explicitement un plan sans spécialistes. Il ne faut PAS déclarer une mission 1/N spécialistes E2E démontrée sur ce run. Les tests SDK parent→enfant→parent précédemment PASS ne remplacent pas cette preuve serveur.

**Suite minimale distincte, sans ancien 4C :** une seule qualification réellement déléguée 1 spécialiste, avec une fixture d'appel d'outil déterministe et un reçu enfant durable vérifié, devra être conçue sur le runtime courant avant GO. **Ne pas relancer** la fixture texte identique pour obtenir cette preuve ; elle ne peut pas l'apporter. Ne pas remplacer ce test par un nombre de sous-agents configurés ou des événements SSE seulement.

**Verdict C3 : PASS pour parcours réel sans spécialiste Oracle/P6/Projet/Idée/Chromium et isolation multi-utilisateur, NON CONCLUANT pour délégation réelle 1/N dans ce même environnement et sélection automatique du modèle gratuit hors fixture.** L'absence d'appel fournisseur réel reste une limite assumée de la qualification gratuite. Une qualification Lite sur le Chromebook et la revue des vulnérabilités GH (17 alertes affichées au dernier push : 6 élevées, 7 modérées, 4 faibles sur branche par défaut) sont encore requises avant GO stable.

Aucune fusion, aucune publication GHCR, aucune modification de `main`, de `v1.0.1`, de `.env`, des clés, des volumes et installations personnelles.
