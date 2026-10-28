# BOT MODE V1 — préparation D-03 sans publication (28 octobre 2026)

**Décision : préparation uniquement. Pas d'autorisation de fusion, de GHCR push, de tag stable/latest ou de D-04.** Le commit de cette branche contient exclusivement les contrôles de distribution ; le runtime qualifié reste `7605e9186b84d4a7eb6d14be1bc9528c6033bbd8` (PR #86 DRAFT).

## Preuves du runtime exact

- [Qualification réelle deux spécialistes #40750429460](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40750429460) : PASS, deux enfants Mongo liés et terminés, Oracle VERIFIED, P6 unique, données inchangées après redémarrage, 5/6 requêtes OpenRouter `:free`, aucune dépense positive.
- [Playwright E2E #40750154581](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40750154581) : PASS, trois shards mémoire, Redis et MCP.
- Backend/TypeScript, Frontend, Static/Prettier, mission E2E synthétique, image runtime et npm production : PASS au même SHA.
- `current-candidate-runtime` : FAIL **attendu** face à l'ancienne candidate immuable. Ne pas l'affaiblir.

## Références candidates prévues, non publiées

- Git source `SOURCE_SHA=7605e9186b84d4a7eb6d14be1bc9528c6033bbd8`, **sans reconstruire depuis le commit de préparation**.
- Image `ghcr.io/arkos77/librechat-botmode-v1`.
- Tag candidat `candidate-botmode-v1-7605e9186b84`.
- Tag source `sha-7605e9186b84`.
- Plateformes prévues : `linux/amd64` et `linux/arm64`. Un digest OCI immutable ne pourra être consigné qu'après une publication autorisée.
- Inventaire GitHub Packages du 28 octobre : ces deux tags sont absents (lecture seule). Le garde de tags sera rejoué avant publication.

## Séparation explicite des actions

Le workflow `.github/workflows/botmode-v1-d03-candidate-manual.yml` a désormais deux modes :

1. **`approval=NO`** : contrôle `prepare-only` **en lecture seule** ; vérification du SHA Git, des noms de tags et de leur absence dans GHCR. Aucune étape de build/push, aucun modèle externe, aucune promotion.
2. **`approval=AUTHORIZE_D03_CANDIDATE_ONLY`** : chemin de publication **non autorisé dans ce lot**, nécessitant de plus `source_sha_confirmation=7605e9186b84d4a7eb6d14be1bc9528c6033bbd8`. Une confirmation manquante ou incorrecte arrête le workflow avant tout push ; les tags doivent rester absents.

Seul le chemin 1 peut être exécuté avec l'autorisation actuelle de préparation.

Le workflow `.github/workflows/botmode-v1-d03-fresh-lite-acceptance.yml` a été épinglé sur cette source et ces tags. **Ne pas l'exécuter avant publication future de l'image candidate**, sinon son pull GHCR est nécessairement non concluant.

## Garde-fous de clôture ultérieure

Après une **nouvelle autorisation D-03 explicite**, publier/contrôler le digest multiarchitecture, vérifier pulls anonymes, installation Lite de première utilisation, onboarding des six agents, ACL, redémarrage et données, puis qualifier Full et rollback suivant le périmètre de distribution. Les workflows D-04 ont été **laissés inchangés** : ils pointent vers une ancienne source/digest et ne sont **pas applicables** à ce runtime. D-04, `stable/latest` et fusion `main` restent soumis à un GO humain **distinct** et à une nouvelle preuve de provenance.

**Ne pas interpréter un mode préparation PASS comme une image publiée ou une release stable.**
