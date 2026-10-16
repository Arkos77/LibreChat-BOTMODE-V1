# BOT MODE V1 — Qualification finale (14 octobre 2026)

**Décision actuelle : NO-GO** pour fusion stable ou publication.

## Preuves sur la vraie candidate
- PR [#26](https://github.com/Arkos77/LibreChat-BOTMODE-V1/pull/26), commit `c2a408945336c1cd636fc51f88cf07fddbd14112`.
- 26 workflows CI SUCCESS, 1 FAILURE (Static Checks), 2 SKIPPED.
- Backend, frontend, Playwright complet, Runtime Image et Docker Build Smoke : SUCCESS.
- Essais jetables de restauration MongoDB, PostgreSQL, Meilisearch, fichiers, restauration coordonnée et Lite rollback : SUCCESS. **Ces essais ne prouvent pas le rollback d'une image publiée depuis GHCR en staging.**

## Lot A — Dernier échec CI
- Static Checks: 43 erreurs ESLint `prettier/prettier` sur quatre fichiers de tests API au moins, plus dérive Prettier sur plusieurs autres fichiers modifiés.
- Appliquer exactement la version de Prettier épinglée dans le dépôt aux fichiers JS/TS modifiés contre `main`, vérifier un diff exclusivement stylistique et relancer la CI sur le nouveau commit.
- Desktop Commander `penguin` hors ligne lors du contrôle, donc correction locale bloquée. Ne pas modifier `main`.

## Risque de dépendances — qualification distincte
- `npm audit --omit=dev` depuis [le workflow de la PR #26](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38482289831): 3 MODERATE, 0 HIGH, 0 CRITICAL.
- Noms: `mammoth` (direct), `argparse` (transitive), `sprintf-js` (transitive).
- Le rapport propose une résolution `mammoth@0.3.29` avec changement majeur; **ne pas rétrograder automatiquement** une version qualifiée. L'avis `sprintf-js` couvre un risque de déni de service via la précision de format non bornée.
- Exiger qualification de l'exposition réelle, contrôles compensatoires et acceptation documentée par responsable avant release.

## Lot B — Conditions de distribution toujours ouvertes
1. Après CI verte et revue du diff : geler le commit et enregistrer SHA + digest de lockfile.
2. Avec **autorisation de publication candidate distincte** : envoyer une image à référence immuable de préproduction, sans `:latest`; inspecter index OCI AMD64/ARM64 et digests.
3. Pull depuis GHCR sur les deux architectures, démarrer une installation Lite propre, vérifier santé/auth, mission BOT MODE, DOCX et données.
4. Faire rollback d'une image **réellement tirée du registre** avec restauration config/DB en préproduction et collecter les preuves.
5. Autorisation humaine séparée avant toute fusion de `main`, tag stable ou promotion `:latest`.

**La réussite d'un workflow ne constitue pas une autorisation de publication.**
