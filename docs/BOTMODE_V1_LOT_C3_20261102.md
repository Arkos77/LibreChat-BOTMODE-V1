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
