# BOT MODE V1 — décision de périmètre et critères de publication

Date : 13 octobre 2026. Statut : **RELEASE NO-GO** jusqu'à levée explicite des réserves.

## Gates vérifiés sur la candidate

- GO1 inférence externe Gemini → Worker → un spécialiste observé → Oracle durable : [run 38318687920](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38318687920) PASS sur le runtime immuable `d4e82dd`.
- GO2 installation Full, services MongoDB/pgvector/Meilisearch/RAG présents, API HTTP et authentification PostgreSQL : [run 38325143577](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38325143577) PASS.
- GO2 installation Lite, arrêt/redémarrage et donnée MongoDB préservée : [run 38325143730](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38325143730) PASS.
- GO3 distribution/authentification Full et Lite : [run 38325143523](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38325143523) PASS.
- GO3 motifs secrets suivis Git : [run 38325143446](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38325143446) PASS.
- GO3 vulnérabilités npm **production** : [run 38325143543](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38325143543) PASS au seuil High/Critical, mais **3 moderate + 6 low** encore signalées.

## Périmètre Helm — décision recommandée (non approuvée)

Le backfill historique `chart-1.9.1` appartient au pipeline legacy Helm, pas à l'image GHCR ni au runtime BOT MODE V1. Le run [38300420245](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38300420245) montre un refus GitHub App de création de référence à cause de la permission `workflows`.

**Proposition :** classer ce backfill comme incident externe/non bloquant **uniquement pour une release distribuée par Docker Compose/GHCR**, à condition qu'aucun artefact Helm ne soit promis aux utilisateurs V1 et que les pipelines Helm ne se déclenchent pas par la release BOT MODE. Une publication Helm est **NO-GO** jusqu'à obtention d'une permission autorisée et un run réussi. Ne pas modifier de droits, créer de tag ou contourner le contrôle pour clore artificiellement le problème.

## Réserves obligatoires avant une distribution stable

1. **Rollback données :** le test Lite prouve stop/start, **pas** la restauration après migration. Une stratégie de sauvegarde et restauration testée sur un environnement éphémère doit être validée avant de présenter la V1 comme migration sans risque. Cf. [BOT_MODE_ROLLBACK.md](BOT_MODE_ROLLBACK.md).
2. **Sécurité :** l'audit npm ne couvre pas les dépendances de développement, vulnérabilités de conteneurs, secrets stockés ailleurs ni protections réseau. Les 3 moderate/6 low de production doivent être triées et explicitement acceptées ou corrigées.
3. **Support OS :** tests Full/Lite réalisés sous runners Linux. ChromeOS/Crostini, macOS/ARM et Windows WSL2 sont décrits comme cibles, mais non validés exhaustivement.
4. **Chaîne publication :** ne pas inférer qu'un job vert autorise de lui-même le merge, un tag `v*` ou la promotion `:latest`. Exiger la revue du diff final empilé (#14, #18, #20), une qualification du SHA livré, des instructions utilisateurs et un GO humain explicite.

## Décision

GO1, GO2 installation/stop-start et GO3 contrôles ciblés sont **VALIDÉS dans leur périmètre**. GO4 Helm historique reste **BLOQUÉ dans le périmètre Helm**, avec proposition de séparation Docker encore soumise à décision. GO5 release stable = **NO-GO**.

Les PR #14, #18 et #20 restent DRAFT non fusionnées. Aucun tag stable ni image `:latest` ne doit être publié.

## Mise à jour du checkpoint de qualification — 13 octobre 2026

Le SHA exact de la PR #20 est `03ae2fbcce305fdd27a5f682687812135c0211a6` : **15/15 workflows GitHub Actions SUCCESS**, notamment [Playwright E2E](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38330642509), [Backend](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38330642458), [Frontend](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38330642499), [Full](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38330642478), [Lite](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38330642519), [KaTeX trial](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38330642490), secrets et npm production. Le correctif KaTeX `0.18.10` est intégré au lockfile et validé sur cette candidate. La régression `userGroup` n'a pas été reproduite dans les trois passages isolés (106 tests chacun), et le backend complet est vert sur ce SHA.

**Distinction des décisions** : **GO pour la qualification technique automatisée de cette candidate**, mais **NO-GO pour une distribution stable à ce stade**. L'ensemble des contrôles CI verts ne prouve pas une migration/restore réelle, les OS non-Linux ou l'absence de tous risques résiduels.

**Décisions encore ouvertes avant GO5 :** 1) qualification sauvegarde → restauration de données après migration (ou périmètre expressément limité aux nouvelles installations et sans promesse de migration), 2) acceptation documentée des risques npm modérés/faibles et revue des images conteneur, 3) choix explicite du périmètre Docker Compose/GHCR sans Helm historique, 4) compatibilité OS annoncée limitée à ce qui a été effectivement testé, 5) approbation humaine du SHA et de la release. **Ne pas fusionner les PR #14/#18/#20 ni publier de tag stable ou :latest sans ce GO final.**
