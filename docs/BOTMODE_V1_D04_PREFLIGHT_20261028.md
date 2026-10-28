# BOT MODE V1 — Revue de pile et préparation D-04 en lecture seule (28 octobre 2026)

**Verdict : GO technique de la candidate D-03, NO-GO de promotion stable.** Aucun merge, aucun changement de `stable/latest`, aucun Git tag déplacé et aucun workflow D-04 de publication modifié dans ce lot.

## Preuves exactes

- Source runtime : `7605e9186b84d4a7eb6d14be1bc9528c6033bbd8`, PR [#86](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/86), **DRAFT**, non fusionnée.
- Image publiée : `ghcr.io/arkos77/librechat-botmode-v1@sha256:ed493e0ffdfc7a1056d11834474b4127e0ae27ea52421e8d5fa9aa26e686c8a1`, plateforme AMD64+ARM64 et tags immuables `:candidate-botmode-v1-7605e9186b84`, `:sha-7605e9186b84`.
- Six runs PASS de même périmètre : mission réelle N/Oracle/P6/restart [#40750429460](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40750429460), Playwright [#40750154581](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40750154581), publication D-03 et pulls anonymes [#40757067711](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40757067711), installation Lite et onboarding [#40767920565](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40767920565), Full/Mongo8/rollback dans son périmètre [#40769097230](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40769097230), licences AMD64+ARM64 [#40769106150](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40769106150).

## Empilement Git et protection de livraison

Selon GitHub, `main` est protégée, et `compare/main...7605e9186b84d4a7eb6d14be1bc9528c6033bbd8` annonce **371 commits d'avance, zéro en retard** et 231 fichiers modifiés. PR #86 dépend de #85 → #84 → #83 → #82 → #81 → #80 → #79 → #78 → `test/botmode-host-research-20261024` (branche intermédiaire sans PR ouverte correspondante). Toutes les PR #78–86 sont encore DRAFT. **Aucune intégration en bloc de 371 commits n'est autorisée** : revoir l'ensemble du diff cumulé, les conflits, les fonctionnalités et l'ordre de fusion avant une décision.

## Détail de la filiation et exclusion des doublons

- Le nœud `test/botmode-host-research-20261024` pointe sur `a617052e3ffdbb5b4147e4f2cf9fb8cfae898b20`, à **219 commits d'avance sur main, 0 de retard**, avec **163 fichiers modifiés** ; aucune PR ouverte de ce nom n'a été trouvée lors de l'inventaire. Il faut donc créer/revoir une vraie proposition d'intégration de ce socle avant les PR #78–86, ou restructurer une pile équivalente avec preuve de provenance.
- Du socle `a617052e3` jusqu'à la source `7605e9186`, GitHub indique **152 commits d'avance, 0 de retard** et **81 fichiers modifiés** : ce segment porte la pile visible des PR #78–86.
- La PR [#76](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/76), HEAD `e001fad28d54953455ccdb5f7825016bbdb6fbea`, est **déjà un ancêtre** du runtime candidat (271 commits d'avance depuis ce point, 0 de retard) : ne pas redéployer ni fusionner son contenu en doublon.
- La PR [#77](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/77), HEAD `7ed5ec4cb3626afcb6df0180694266857ccd8eb7`, est au contraire **divergente** : comparaison vers le runtime candidat `ahead=262`, `behind=29`. **Ne pas la fusionner automatiquement** ; relever d'abord ses 29 commits absents et traiter uniquement les exigences encore utiles, avec validation des régressions.
- Le champ GitHub `mergeable=true` de la PR #86 ne prouve que sa faisabilité de fusion avec sa **branche de base #85** ; il ne certifie ni la pile entière vers `main`, ni la candidate D-03 sur un commit de release final.

## Provenance des références actuelles — conditions bloquantes

- `v1.0.0` pointe sur le commit **antérieur** `59598c2f4e333c256296bbb8c6f45a024832745b`. **Ne jamais réécrire ce tag.**
- `:stable` et `:latest` pointent sur le digest antérieur `sha256:20e921df9fda01dba00bc925fe1ae37ae24fbcc992f52f15aad60bfa5aae4c21`.
- Le workflow `.github/workflows/botmode-v1-d04-promote-stable.yml` exige la source et le digest anciens, le tag `v1.0.0`, une exécution sur `main`, un GO humain au format exact et **refuse les alias divergents**. **Il ne peut ni ne doit être utilisé pour la nouvelle candidate.**
- Un nouveau numéro de version (distinct de `v1.0.0`), une nouvelle preuve du SHA **réellement intégré**, une politique explicite pour migrer les alias déjà existants, un point de restauration pré-promotion et un accord D-04 distinct sont nécessaires.

## Préflight non destructif

Le script `scripts/botmode/ci-d04-readonly-preflight.sh` ne fait que des lectures GitHub/GHCR. Il vérifie les deux tags D-03, le digest immuable et les architectures, `main` protégée, la branche source, les six preuves PASS, le tag `v1.0.0` et les alias `:stable/latest` (sans les toucher). Il retourne `D04_PROVENANCE=BLOCKED` si les anciennes références divergent et `D04_READ_ONLY_ASSESSMENT=PASS` lorsque le **diagnostic** est complet. Ce PASS ne vaut **jamais** autorisation de promotion.

## Suite de release, interdite sans validation indépendante

1. Définir et revoir une proposition d'intégration des 371 commits, sans modifier `main` ; conserver les protections GitHub.
2. Choisir une **nouvelle version** et la politique de remplacement éventuel de `:stable/latest` ; ne pas déplacer `v1.0.0`.
3. Faire approuver explicitement les merges nécessaires, qualifier le SHA exact après intégration (il peut différer de `7605e9186b84d4a7eb6d14be1bc9528c6033bbd8`), puis produire ou justifier une candidate au même SHA avec son digest.
4. Préparer un **nouveau** contrôle de promotion D-04 avec GO humain distinct, sauvegarde/rollback et protection des références existantes ; n'exécuter aucune promotion avant cette décision.

**État final du présent lot : D-04 PRÉPARÉ POUR DÉCISION, STABLE NO-GO.**
