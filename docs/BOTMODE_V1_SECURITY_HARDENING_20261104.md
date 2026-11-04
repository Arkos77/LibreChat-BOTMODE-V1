# BOT MODE V1 Lite — lot de durcissement ciblé du 4 novembre 2026

## Portée et règle de déploiement

Base **Git v1.0.2** (`62e75bb6f539a23f21d127ab0d2220d1e8ef2c1a`). Développement sur branche séparée : ce document **n'est pas** une nouvelle release ou une approbation d'installation. La production locale `3080`, la candidate `3081`, les volumes, les clés et les reçus Oracle/P6 doivent rester inchangés jusqu'à qualification et décision de promotion. Ne pas relancer les missions déjà PASS.

## État des alertes et recherche préalable

L'état des alertes Dependabot de `main` avant correction affichait quatre avis ouverts, dont les deux suivants touchent un lockfile de portée runtime :

| Alerte | Origine et portée observées | Décision du lot |
| --- | --- | --- |
| [#51](https://github.com/Arkos77/LibreChat-BOTMODE-V1/security/dependabot/51), [GHSA-mrwp-f3q8-3g9p](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p) HIGH | `packages/data-provider/react-query/package-lock.json` contient `follow-redirects@1.16.1`; version corrigée **1.16.2**. Le lockfile racine et l'API Docker installée contiennent déjà **1.16.2** ; pas de copie secondaire installée dans l'image contrôlée. | Modifier **uniquement** les champs version, tarball et intégrité dans ce lockfile secondaire, générés et vérifiés par `npm update follow-redirects --package-lock-only`. Ne pas ignorer l'alerte. |
| [#49](https://github.com/Arkos77/LibreChat-BOTMODE-V1/security/dependabot/49), [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) MEDIUM | `@google/genai → gaxios@7.1.3 → rimraf@5.0.10 → glob@10.5.0` en arbre runtime. L'avis concerne les traversées avec `AbortSignal` dans `glob` ; correction déclarée **glob 14.0.2**, version majeure incompatible avec la plage `^10.3.7` de `rimraf@5`. | **NON RÉSOLU**. Ne pas forcer `glob@14` sous `rimraf@5` sans qualification. Rechercher une mise à niveau amont compatible ou l'élimination d'un usage inutilisé. Examiner les chemins atteignables depuis des entrées utilisateur ; l'absence d'appel `rimraf` dans le code installé de `gaxios` ne démontre pas l'inatteignabilité absolue. |
| [#46](https://github.com/Arkos77/LibreChat-BOTMODE-V1/security/dependabot/46), [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) LOW | `deepmerge@4.3.1`, marquée développement. | Suivi inchangé : [#109](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/109), réévaluation prévue le 16/11/2026. |
| [#3](https://github.com/Arkos77/LibreChat-BOTMODE-V1/security/dependabot/3), [GHSA-848j-6mx2-7j84](https://github.com/advisories/GHSA-848j-6mx2-7j84) LOW | `elliptic@6.6.1`, marquée développement. | Suivi inchangé : [#109](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/109). |

La décision D-02 historique sur `mammoth → argparse → sprintf-js` reste suivie indépendamment dans [#37](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/37) ; elle ne doit pas être interprétée comme un avis supprimé par ce patch.

**Constat avant patch :** `npm audit --omit=dev --package-lock-only` sur le verrou principal de `v1.0.2` : **0 avis** ; même commande sur le verrou secondaire : **1 HIGH**. Après mise à jour isolée du verrou secondaire en `follow-redirects@1.16.2` : **0 avis**. Les audits de lockfiles ne prouvent pas une absence totale de défauts dans le code ni les images ; les alertes GitHub restent la référence indépendante pour suivre les exceptions.

## Analyse statique CodeQL

Le dépôt public expose une fonctionnalité GitHub Code Scanning dont `default-setup` était `not-configured` et dont l'API alertes indiquait `no analysis found`. Nouveau workflow dédié `.github/workflows/botmode-codeql-security.yml` : JS/TS, GitHub runners, CodeQL v4, analyse `security-extended`, push et pull request vers `main`, ainsi qu'une exécution hebdomadaire. Il n'emploie aucune clé OpenRouter et ne tourne pas sur le Chromebook. **PASS uniquement lorsqu'une exécution et le résultat Code Scanning auront été constatés**. Une analyse statique n'est pas un audit de pénétration.

## Ports ChromeOS — contrôle optionnel

La définition principale Compose peut maintenant utiliser `BOTMODE_HOST_BIND_IP`. Par défaut elle reste à `0.0.0.0`, comme avant le patch : **aucun changement de liaison ne doit être imposé automatiquement** sur les instances actuelles. ChromeOS peut acheminer `localhost` vers Crostini ([documentation ChromiumOS](https://www.chromium.org/chromium-os/developer-library/reference/security/port-forwarding/)), mais un verrouillage local doit être validé sur la machine utilisée.

Sur une future installation testée, définir `BOTMODE_HOST_BIND_IP=127.0.0.1` dans la configuration d'environnement, puis utiliser `docker compose config` pour vérifier que `api.ports[].host_ip` vaut `127.0.0.1`. **Tester la connexion depuis le navigateur ChromeOS avant tout basculement de production** ; restaurer l'adresse précédente si nécessaire. Cette option ne protège pas une autre configuration Compose qui écrase les ports ni un proxy inverse indépendant ; vérifier aussi les autres services publiés.

## Critères de qualification du lot

- **PASS** uniquement si la modification du lockfile secondaire est limitée au paquet corrigé et que l'audit de ce verrou revient à zéro.
- **PASS** si la configuration Compose est identique par défaut, et offre explicitement `127.0.0.1` sur demande ; pas de changement sur `3080/3081` dans le lot.
- **PASS** CodeQL après analyse JS/TS exécutée avec succès et accès aux résultats de Code Scanning.
- **NON CONCLUANT** pour `glob@10.5.0` tant que la dépendance runtime n'est pas mise à niveau ou que l'absence d'exposition est démontrée. Ne pas fermer l'alerte.
- Les validations Oracle/P6, mission Lite, MongoDB, Redis et publication de `v1.0.2` sont **déjà PASS**, non relancées.
