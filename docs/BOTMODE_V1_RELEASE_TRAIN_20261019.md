# BOT MODE V1 — Release train et ordre des décisions (19 octobre 2026)

> **NON AUTORISÉ À FUSIONNER OU PROMOUVOIR**. Ce document est un plan de validation, pas une approbation de risques, un tag `stable`, ni une consigne de déplacer `latest`.

## Architecture Git vérifiée, sans réécriture

- `main` actuellement `08d7309a2460268e9e8cd269dfb768b6f6ced2cc`.
- [PR #26](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/26) **Draft**, HEAD `54b30a342bf8f3480d7385b30cfa669b73c92878`, base `main` : **7 commits d'avance, 0 de retard** au moment de la vérification.
- [PR #29](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/29) **Draft**, HEAD `bde77b8eb0999cf8507f36505f6cc2356e752b9d`, base branche PR26 : **345 commits d'avance, 0 de retard**. La PR28 `ab37b2d...` est déjà ancêtre de ce HEAD ; **ne pas la re-fusionner**.
- La candidate expérimentale publique reste `ghcr.io/arkos77/librechat-botmode-v1@sha256:ee4af50a8baa8795509fb3c0abba362a104fbae7b0de5eac8a9f1afb8e4a60d0`, construite depuis le commit ancêtre `5fb904d375bffd6c54b5830cb1536088a9e77211`. La PR29 HEAD est plus récente que l'image ; ses différences runtime autorisées au contrôle OCI sont liées à l'outillage CI et aux documents. Ne pas promettre une image stable issue d'un futur commit fusionné sans requalification de provenance.

## Protections actuellement actives sur `main`

- Pull request requise, résolution des conversations obligatoire, administrateurs soumis aux protections, suppression/force-push interdits.
- Deux checks de GitHub Actions sont requis avec branche à jour : `Pre-push image smoke (amd64)` et `Pre-push image smoke (arm64)` (`app_id=15368`). **0 revue externe obligatoire**, pour ne pas bloquer un dépôt à mainteneur unique, mais validation humaine du release GO obligatoire séparément.
- Ne pas affaiblir ces règles pour franchir artificiellement un check rouge.

## Lots complémentaires non fusionnés

| PR | Périmètre isolé | Recommandation de composition |
|---|---|---|
| [#30](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/30) | Sidecar Go optionnel, gRPC 1.83.2, test Go et Docker PASS | Évaluer uniquement si le sidecar Full est réellement distribué ; ne pas forcer dans Lite |
| [#31](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/31) | Inscriptions e-mail volontaires aux annonces de mises à jour | **Après V1** ; nécessite domaine/SMTP/Mongo central ; indépendant du runtime |
| [#32](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/32) | Sonde des licences SUL/notice sur image GHCR AMD64+ARM64, **2/2 PASS** | Conserver comme preuve CI ; aucune nécessité de rebâtir l'image pour ces notices déjà présentes |
| [#33](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/33) | Inventaire, mémo, décisions de risques, digest, contrôles | Documents à réconcilier dans la branche cible après GO ; ne pas pousser sur SHA gelé pour déclencher 34 CI inutilement |
| [#34](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/34) | [Full OCI + restauration réelle du Worker/ACL #39176379024](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39176379024) **PASS**, aucun changement de runtime | Garder comme preuve indépendante ; **pas** de migration de schéma prouvée |
| [#35](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/35) | Diagnostics sans secrets lorsque le fournisseur gratuit finit en SSE mais Oracle non durable | **6/6 CI SUCCESS** ; aucune preuve fournisseur réel supplémentaire ni modification d'orchestrateur |
| [#36](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/36) | Deux images Full RAG/admin épinglées à des digests multiarchitecture ; [nouveau Full restore #39179159645](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39179159645) **PASS** | **7 SUCCESS + 1 provenance FAILURE attendu** ; [Playwright #39179159559](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39179159559) PASS ; garde de provenance ancienne FAIL car manifeste différent ; pas de GO, fonctions RAG/admin complètes non prouvées |

## Preuves de clôture déjà disponibles

- [PR29](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/29) **33 SUCCESS, 1 SKIPPED, 0 FAILURE** au SHA `bde77b8eb`.
- [Publication expérimentale OCI #39160163363](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39160163363) **8/8 PASS**, Lite, AMD64/ARM64, authentification et API dans les limites des jobs.
- [Full OCI restaurée #39176379024](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39176379024) **PASS** : profil Full/Mongo8 sur digest publié, copie à froid vers un volume différent, API/Worker/ACL conservés.
- [Restauration quatre stockages #39176451376](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39176451376) **PASS** au SHA PR29 : marqueur MongoDB/PostgreSQL/Meilisearch/fichiers, sans reprise de session authentifiée.
- [SIGKILL mission en cours #39161877003](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39161877003) **4/4 PASS** dont reprise automatique et publication Oracle unique avec fournisseur simulé.
- [SUL complète AMD64+ARM64 #39173138530](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39173138530) **2/2 PASS**.
- [Audit DOCX #39173349239](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39173349239) **151/151 PASS** ; `npm audit --omit=dev` **3 modérées** non corrigées ni acceptées.

**Diff différentiel fournisseur :** entre le commit dernier succès réel `4ee221bf` et la source OCI actuelle `5fb904d37`, aucun fichier backend `api/` ou `packages/` n'a changé ; diagnostic de quota/configuration à poursuivre, sans déduire une cause certaine ni relancer les modèles payants.

## Arbitrages / NO-GO restants

1. **D-02** : acceptation explicite et bornée du risque npm Mammoth/argparse/sprintf-js ou remédiation vérifiée ; pas de waiver silencieux. Voir [dossier](BOTMODE_V1_NPM_RISK_DECISION_20261014.md).
2. **Fournisseur gratuit réel** : [#39176515135](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39176515135) dernier échec `ORACLE_NOT_DURABLE`, SSE final HTTP 200 / 3 événements, contre ancien succès [#39150077172](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39150077172) 28 événements avec Oracle vérifié ; le HTTP 429 fut un autre préflight. Ne pas attribuer de cause unique sans preuve. Aucun modèle payant.
3. **Migration Full entre versions** : les restaurations prouvées sont des copies à froid au sein d'une même configuration ; réversibilité des changements de schéma/données de missions actives non attestée. Garder un plan de sauvegarde et de non-retour si migration irréversible.
4. **OS/capacités promis** : parcours utilisateur réel, RAG et outils externes, missions multi-heures : valider chaque promesse effectivement incluse ou laisser une limitation explicite à arbitrer, sans la reclasser silencieusement en roadmap.
5. **GO humain**, protection de `main` et nouveaux checks sur le SHA réellement fusionné, provenance OCI/source recontrôlée, promotion stable/`latest` interdite sans décision finale explicite.

**Ordre technique proposé (non autorisation de fusion)** : fermer les CI des PR spécialisées → isoler la panne Oracle externe → décider D-02 et les limites V1 → qualifier l'ensemble de manifests/source final sur staging → uniquement alors demander le GO humain avant tout merge/promotion. PR #26 précède le contenu PR #29 dans le graphe ; vérifier à nouveau la tête de `main` et le diff de fusion à cet instant.
