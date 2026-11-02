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
