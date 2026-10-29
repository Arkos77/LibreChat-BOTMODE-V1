# BOT MODE V1 — Dossier d'intégration et revue des risques avant D-04

**29 octobre 2026 (Europe/Paris)** — préparation **lecture seule du runtime**. Ce dossier complète :
- `docs/BOTMODE_V1_INVENTAIRE_INTEGRATION_371_COMMITS_20261028.md` (inventaire exhaustif des commits/chemins, sans prétendre relire chaque ligne);
- `docs/BOTMODE_V1_D04_PREFLIGHT_20261028.md` (préflight et références historiques);
- `docs/BOTMODE_V1_ADDENDUM_REVUE_PILE_PR87_86_20261029.md` (runs et revue des PR individuelles).

**Décision : préparation de l'intégration PASS ; promotion D-04 toujours NO-GO.** La création de ce fichier n'entraîne ni merge, ni tag, ni image, ni installation, ni invocation de modèle. Les validations acquises restent attachées à leurs SHA/digests respectifs.

## A. Topologie et absence de commits manquants

Relevé GitHub au 29/10 :

| PR | Base | HEAD | Commits par rapport à sa base | État |
| --- | --- | --- | ---: | --- |
| #76 | main `4d7b4922ab35838fd6b89938e6704bd4d1bbc86f` | `e001fad28d54953455ccdb5f7825016bbdb6fbea` | 100 | DRAFT, ouverte |
| #87 | HEAD #76 | `a617052e3ffdbb5b4147e4f2cf9fb8cfae898b20` | 119 | DRAFT, ouverte |
| #78 | HEAD #87 | `c0a2cb7948e9a22abee5d206c92618f892c6080a` | 1 | DRAFT, ouverte |
| #79 | HEAD #78 | `d2d32e1487ce35e4e888d83ee052c9d43f12adba` | 2 | DRAFT, ouverte |
| #80 | HEAD #79 | `a626bb071c3b1075261824058a0ae542a7dffe1d` | 5 | DRAFT, ouverte |
| #81 | HEAD #80 | `09226f506508da28a4b537706f85eb5f396eec09` | 4 | DRAFT, ouverte |
| #82 | HEAD #81 | `c25e749314278fe77d4ae2cef4277a040ce8822e` | 5 | DRAFT, ouverte |
| #83 | HEAD #82 | `9145de18e33c8fcde1f9ed161e6c6e95914fc843` | 1 | DRAFT, ouverte |
| #84 | HEAD #83 | `dfaa84b71fd89537a30084bb8eddb72b846b2e57` | 3 | DRAFT, ouverte |
| #85 | HEAD #84 | `04a5748b19d0d72db74231e2dfc71de296f4f053` | 20 | DRAFT, ouverte |
| #86 | HEAD #85 | `7605e9186b84d4a7eb6d14be1bc9528c6033bbd8` | 111 | DRAFT, ouverte |

Comparaison GitHub :
- `main` → #86 : **371 ahead, 0 behind, 231 chemins** (128 ajoutés, 102 modifiés, 1 supprimé), pas de divergence à la date du relevé.
- #76 → #87 : 119 ahead, 0 behind, 156 fichiers.
- #87 → #86 : 152 ahead, 0 behind, 81 fichiers.
- Les PR individuelles sont `mergeable=true` contre leurs bases **respectives**, mais ce champ ne donne pas de permission d'intégration sur `main`.
- #77 `7ed5ec4cb3626afcb6df0180694266857ccd8eb7` est divergente ; ses écarts propres sont documentaires selon l'inventaire précédent. **Ne pas fusionner en parallèle**. #73 et #75 ont déjà leur comportement repris dans l'ascendance : pas de doublons fonctionnels.

### Stratégie recommandée — UNE PR d'intégration de la source finale vers main

1. Conserver le HEAD de #86 **intact**, `7605e918...` : ne pas rebaser/modifier ce commit déjà qualifié.
2. Après accord distinct, ouvrir une **PR DRAFT d'intégration** vers `main` depuis le HEAD exact de #86 (ou une branche figée à ce SHA), plutôt que fusionner successivement onze PR empilées. Ne pas créer automatiquement cette PR avant décision si elle déclenche les anciens workflows incompatibles.
3. Avant toute fusion, vérifier à nouveau `main`, les règles requises et la mergeability de cette PR directement contre `main`; avoir une vraie revue du delta cumulé, notamment les 231 chemins et leur portée. **Cette stratégie réduit les opérations de fusion, pas les exigences de revue.**
4. Une fusion GitHub peut produire un **nouveau SHA de merge**, même si l'arbre source est identique. Vérifier le SHA final et l'égalité de l'arbre Git avec `7605e918...`, puis établir explicitement la filiation de l'image D-03. Ne **pas** présenter l'image déjà construite comme issue d'un nouveau SHA sans preuve d'équivalence de source et décision de release. Si le contenu change, nouvelle qualification proportionnelle des changements.
5. Les PR #76/#87/#78–86 restent DRAFT tant qu'aucune stratégie d'intégration n'est autorisée. Ne pas les fermer ni rebinder leurs bases automatiquement.

## B. Revue ciblée des points sensibles

| Surface | Éléments contrôlés | Verdict et limite |
| --- | --- | --- |
| Admission des agents/ACL | `api/server/controllers/agents/orchestratorMissionBindings.js` refuse agent/plan non joignable ; `packages/api/src/agents/orchestrator/admission.ts` dérive les capacités du graphe serveur, pas des noms client ; tests admission | **PASS ciblé / traces historiques**, pas audit de toutes les routes |
| Oracle et P6 | `orchestrator/native.ts` exige bindings exacts et vérifie prédécesseurs ; `orchestrator/publication.ts` compare les résultats conservés aux verdicts VERIFIED et aux sources ; publication unique prouvée sur D-03 | **PASS D-03**, pas de nouvel essai |
| Sources et contrats | `orchestrator/research.ts` sépare observation Web et rédaction ; les sources sont contrôlées ; tests dans #87 et #86 | **PASS ciblé**, résultats factuels réels dépendants du fournisseur |
| Reprise et persistance | Référence D-03 [40750429460](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40750429460), publication/reprise 344 tests dans [40750154821](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40750154821) | **PASS acquis** |
| Sécurité npm | Audit de production de `7605e918...` : [40750154416](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40750154416) et [40750154684](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40750154684) | **PASS : 0 critical/high/moderate/low le 28/10**, résultat ponctuel |
| Azure/MSAL 7.1 | Override MSAL 7 forcé au-delà du major déclaré par Azure Identity, tests sans jeton réels, image D-03 testée avec profil explicitement non Azure | **NON CONCLUANT en authentification Azure réelle**. Ne pas promettre Azure supporté sans son test ; décision de périmètre support V1 nécessaire |
| Lite/Full, restauration, rollback, multiarch/licences | [40767920565](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40767920565), [40769097230](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40769097230), [40769106150](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40769106150) | **PASS D-03**, ne pas requalifier sans changement |
| UI Progression/Used Tools | #78–#82 : 5 groupes Frontend, Playwright, axe PASS, distingués des tests de candidate | **PASS de ces SHA et de leurs tests**, ne pas remplacer les preuves de D-03 |

## C. Bloqueurs de processus, sans faux FAIL du moteur

1. **Protection de `main` non inspectable par le connecteur actuel** : lecture GitHub `/branches/main/protection` renvoie **403 Resource not accessible by integration**. L'API `/rulesets?includes_parents=true` renvoie `[]`, ce qui ne prouve pas l'absence de protections classiques. Il faut lire les règles/reviewers/required checks avec les droits appropriés avant de décider de la fusion. **NON CONCLUANT**.
2. **Check historique incompatible sur HEAD #86** : GitHub expose **66 check-runs, 52 success, 13 skipped, 1 failure**. Le seul échec est `current-candidate-runtime` de [40750154766](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40750154766/job/123034423637), sur l'étape de garde d'ancienne candidate `CI_CANDIDATE_RUNTIME_SOURCE_DRIFT_NOT_ALLOWED` ; il est **arrêté avant la mission**. Ceci ne réfute pas [40750429460](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40750429460) et la candidate D-03. Si ce check est requis sur `main`, il faut traiter sa politique de déclenchement sur la bonne branche/les bons SHA avec un changement CI dédié, **sans affaiblir la garde d'immuabilité** et sans relancer les scénarios acquittés. Ne pas le « passer vert » artificiellement.
3. **Ancien workflow D-04 incompatible** : `.github/workflows/botmode-v1-d04-promote-stable.yml` est épinglé au SHA `59598c2f4e333c256296bbb8c6f45a024832745b`, au tag Git historique `v1.0.0` et à l'ancien digest. Il ne doit **jamais** promouvoir silencieusement D-03. La migration de `:stable/latest` nécessite une nouvelle politique/version/commande avec approbation, contrôle de digest, sauvegarde et rollback.
4. **Décision Azure** : clarifier si Azure est hors support V1 ou couvert par un test d'authentification réelle dédié. Le PASS du profil non Azure ne valide pas les déploiements Azure.

## D. Gates à satisfaire avant demande d'autorisation de fusion

- Vérifier que les SHAs sources n'ont pas bougé, `main` est toujours `4d7b4922...` ou refaire uniquement la comparaison delta si le HEAD de main a changé.
- Vérifier les règles obligatoires GitHub avec un accès autorisé ; évaluer le check historiquement échoué sans l'effacer.
- Obtenir la revue humaine du diff cumulé en s'appuyant sur l'inventaire complet et la revue des zones sensibles ; ne pas assimiler revue de topologie à audit ligne par ligne.
- Fixer explicitement le sort du support Azure V1 et les éventuelles restrictions de publication.
- Geler la source et l'image candidate, demander le **GO distinct pour créer/fusionner la proposition d'intégration**.
- Après intégration seulement, rapprocher HEAD/tree/provenance OCI ; conserver les preuves de test quand le contenu est identique ; si changement observé, qualification ciblée.
- Décider d'un **nouveau tag de version** sans déplacer `v1.0.0`, puis préparer workflow D-04 avec confirmation séparée et politique de migration `:stable/latest`.

## E. Conclusion

**Lot 1 (topologie et plan d'intégration) : PASS. Lot 2 (revue de sécurité ciblée) : PASS sur les contrôles déjà acquis et les surfaces inspectées ; 2 décisions de support/gouvernance et la stratégie de publication restent à régler.**

**Stable NO-GO ; aucune fusion ni release autorisée par ce document.** La candidate D-03 `sha256:ed493e0ffdfc7a1056d11834474b4127e0ae27ea52421e8d5fa9aa26e686c8a1` et le Chromebook restent intacts.
