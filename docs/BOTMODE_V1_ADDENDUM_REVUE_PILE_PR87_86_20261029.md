# BOT MODE V1 — Addendum de qualification du socle #87 et de la pile #78–#86

**29 octobre 2026 (Europe/Paris).** Complément de l'[inventaire intégral des 371 commits](BOTMODE_V1_INVENTAIRE_INTEGRATION_371_COMMITS_20261028.md) et du [préflight D-04 en lecture seule](BOTMODE_V1_D04_PREFLIGHT_20261028.md). Ce document n'altère pas les 371 commits inventoriés. **Aucune fusion, installation, nouvelle image, modification D-04 ni promotion stable/latest.**

## 1. Socle PR #87 — base #76

- PR [#87](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/87) toujours DRAFT, source `a617052e3ffdbb5b4147e4f2cf9fb8cfae898b20`, base `e001fad28d54953455ccdb5f7825016bbdb6fbea`; GitHub compare **119 ahead, 0 behind, 156 fichiers, +16 400 / -604**.
- [Run 40775067446](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40775067446) : **PASS** source + build AMD64 non publié + recherche compilée en boucle locale, scénarios 429/OpenRouter synthétiques, citations. Quatre tests Python de l'archive SDK : **OK, 1 SKIPPED**, régénération historique CI non vérifiée par ce run. Des contrôles unitaires valident l'intégrité lockfile et la présence des modules CJS/ESM.
- [Run 40251891580](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40251891580) : **PASS** host isolé sur image retenue, câblage fallback, outil natif, Oracle, Mongo, nettoyage ; `REAL_PROVIDER_REQUESTED=false`. **NON CONCLUANT** pour le fournisseur externe réel.
- SDK vendored dérivé : générateur épinglé sur une archive de base et sa SHA256 ; la comparaison locale de reproduction deux fois était déjà documentée comme PASS dans `docs/BOTMODE_V1_FALLBACK_CONTEXT_CHECKPOINT_20261025.md`. Ne pas prétendre qu'une reconstruction amont complète a eu lieu en CI.
- Admission de zéro spécialiste : FAST ne déclenche pas le graphe canonique ; en Analyse/Développement/Veille, le code impose explicitement une sélection non vide et Recherche/Analyse/Rédaction selon la mission. **Choix contractuel à préserver**, pas régression démontrée par les tests historiques d'autres modes.
- Revue statique ciblée : authorization du graphe d'agents, provenance des sources, phase Web, Oracle/P6 et persistance, fallback, UI, lockfile, archives. Aucun défaut supplémentaire démontré par ce lot. Cela **ne constitue pas** une revue intégrale de chaque ligne de 156 fichiers.
- Checkpoint initial [commentaire #6485788498](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/87#issuecomment-6485788498).

## 2. UI #78–#82 — preuves conservées, pas de reruns

| PR / HEAD | Changement distinct | Preuve frontend PASS | Autres preuves |
| --- | --- | --- | --- |
| [#78](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/78) `c0a2cb7` | Sélecteur orchestrateur séparé, 3 tests dédiés | [40269489406](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40269489406), 251 suites / 2829 tests dans le shard observé | [Playwright 40269488922](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40269488922), [axe 40269488906](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40269488906) |
| [#79](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/79) `d2d32e1` | Suggestion opt-in d'un projet, sans envoi modèle automatique | [40272065606](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40272065606) : build, tests, TS, Vite PASS | [Playwright 40272065502](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40272065502), [axe 40272065517](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40272065517) |
| [#80](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/80) `a626bb0` | Panneau Progression, observations enregistrées | [40277212119](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40277212119) | [Playwright 40277212129](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40277212129), [axe 40277212098](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40277212098) |
| [#81](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/81) `09226f5` | Suivi progressif, toggle visible, données réelles | [40345865427](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40345865427) | [Playwright 40345865343](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40345865343), [axe 40345865310](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40345865310) |
| [#82](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/82) `c25e749` | Used tools rendu dans Progression à droite, approbations préservées | [40369200631](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40369200631) | [Playwright 40369200241](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40369200241), [axe 40369208779](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40369208779) |

Les échecs des workflows « Exact Candidate OCI Subagent Oracle Probe » sur ces HEAD sont isolés au job `current-candidate-runtime`, arrêt **avant mission** par `CI_CANDIDATE_RUNTIME_SOURCE_DRIFT_NOT_ALLOWED` (garde d'immuabilité d'une autre candidate). **FAIL de l'admissibilité de cette sonde, NON CONCLUANT pour l'UI**, pas un défaut applicatif avéré ; ne pas les relancer sans un workflow applicable au SHA réellement testé.

## 3. Sécurité #83–#86, et candidate intégrée

- #83 : audit historique 7 HIGH / 2 MODERATE avant patch, puis 4 HIGH / 0 MODERATE. #84 : 3 HIGH après OpenAI 7 avec Zod 3. #85 : 1 HIGH (Zod 3), MSAL 7.1 override avec compatibilité Azure réelle encore hors preuve.
- **#86 (HEAD exact `7605e9186b84d4a7eb6d14be1bc9528c6033bbd8`) : PASS audit production 0 LOW, 0 MODERATE, 0 HIGH, 0 CRITICAL**, [40750154416](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40750154416) et [40750154684](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40750154684). Conserver la portée ponctuelle de l'audit npm et la limite Azure.
- **D-03 candidate conservée**, digest `sha256:ed493e0ffdfc7a1056d11834474b4127e0ae27ea52421e8d5fa9aa26e686c8a1`. Les six runs de référence restent acquis dans l'inventaire maître : 40750429460, 40750154581, 40757067711, 40767920565, 40769097230, 40769106150.

## 4. Décision et suite

- **PR #87 : REVIEW isolée documentée ; aucun blocage fonctionnel nouveau démontré.** Ses résultats ne remplacent pas ceux de la candidate descendante complète.
- **PR #78–#82 : PASS des contrôles frontend/Playwright/axe dans leurs périmètres ; OCI ancienne garde NON CONCLUANT.**
- **PR #83–#86 : risques dépendances traités jusqu'à audit npm production PASS à #86 ; Azure réel non acquis.**
- **D-04 stable : NO-GO**, `main` protégée, PR #76/#87/#78–#86 DRAFT, `v1.0.0` et GHCR `:stable/latest` historiques à préserver. L'étape restante est la revue et l'autorisation humaines de l'intégration de la pile, suivies de la qualification du SHA effectivement intégré et du choix d'une nouvelle version. Ne pas effectuer de fusion, de renommage de tag ni de promotion sans accord explicite.
