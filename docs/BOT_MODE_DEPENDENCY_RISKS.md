# BOT MODE V1 — Triage des avis npm de production

Source : [GitHub Actions 38325630542](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38325630542), commit `95ac27b`, 13 octobre 2026. Audit `npm audit --omit=dev`, **0 critical, 0 high, 3 moderate, 6 low**. Le gate au seuil High/Critical est PASS, pas un constat « zéro vulnérabilité ».

| Paquet | Gravité | Type | Correction automatique annoncée |
|---|---|---|---|
| `mammoth` | moderate | direct | Revenir à 0.3.29 (rupture majeure potentielle) |
| `argparse` | moderate | transitif | Revenir à mammoth 0.3.29 |
| `sprintf-js` | moderate | transitif | Revenir à mammoth 0.3.29 |
| `mermaid` | low | direct | Revenir à 10.8.0 |
| `katex` | low | transitif | Modifier rehype-katex vers 1.2.0 |
| `rehype-katex` | low | direct | Revenir à 1.2.0 |
| `remark-math` | low | direct | Revenir à 3.0.1 |
| `micromark-extension-math` | low | direct | Modifier remark-math vers 3.0.1 |
| `micromark-extension-llm-math` | low | direct | Aucun fix automatique |

**Triage :** Les trois moderate se rapportent à la branche de dépendances `mammoth`/traitement de documents. Étudier les chemins effectifs de parsing DOCX et les limites taille/temps avant toute décision d'acceptation. L'avis `sprintf-js` est [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). La branche Markdown/mathématiques exige des contrôles de contenu non fiable et tests de rendu avant changement de version ; avis KaTeX [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7).

**Ne pas exécuter `npm audit fix --force`** : ses suggestions comprennent des rétrogradations incompatibles et ne constituent pas à elles seules des remédiations sûres. Aucun paquet n'a été modifié lors de ce triage.

**Statut :** relevé des neuf avis terminé ; analyse d'exploitabilité, atténuations et décision d'acceptation restent **À FAIRE**. Ce document ne marque pas GO5 comme validé.

## Vérification des avis éditeurs — 13 octobre 2026

- **KaTeX / GHSA-238p-pmpm-9mq7** : la version corrigée indiquée par l'avis est **0.18.2**, affectant les versions `>=0.11.0 <0.18.2`. Il s'agit d'une vulnérabilité conditionnelle : une pollution préalable du prototype peut contourner des restrictions `trust`, sous d'autres conditions d'intégration. Références : [avis KaTeX](https://github.com/KaTeX/KaTeX/security/advisories/GHSA-238p-pmpm-9mq7) et [OSV](https://osv.dev/vulnerability/GHSA-238p-pmpm-9mq7).
- **sprintf-js / GHSA-hp3w-g68c-fv3c** : les versions jusqu'à 1.1.3 sont concernées et l'avis ne renseigne **aucune version corrigée**. Le risque décrit est un `RangeError` déclenchable si un attaquant contrôle une chaîne de formatage et des spécificateurs de précision. Référence : [GitHub Advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).

**Usage établi dans ce dépôt :** `client/src/components/Chat/Messages/Content/markdownConfig.ts` configure réellement `remark-math` et `rehype-katex` pour afficher les messages. Ces dépendances sont donc atteignables par du texte fourni dans une conversation. Ce fait **ne prouve pas à lui seul** que les préconditions exactes de l'avis KaTeX (pollution du prototype et absence de sanitation pertinente) sont réunies. L'utilisation effective de `mammoth` n'a pas encore été reliée à une route d'upload précise par une preuve de code.

**Actions de correction recommandées, non exécutées :**
1. Sur une branche de test distincte, rechercher une **résolution de KaTeX >=0.18.2 compatible avec les versions imposées de `rehype-katex` et `remark-math`** ; construire le frontend et tester les mathématiques, citations et Markdown avant tout remplacement du lockfile. N'exécuter aucune rétrogradation massive suggérée par `npm audit fix --force`.
2. Vérifier la provenance exacte de `sprintf-js` sous `mammoth`, les points d'entrée DOCX et les limites de taille/temps. Sans version patchée attestée, documenter les atténuations ou envisager un remplacement de la chaîne de dépendances après tests fonctionnels.
3. Poursuivre la revue des paramètres de rendu d'entrées non fiables, de la sanitation HTML et des essais de pollution du prototype. Aucun avis n'est accepté uniquement sur la base de sa gravité Low.

**Décision :** inventaire et références vérifiés, remédiation/acceptation des risques encore **EN COURS**. Le GO5 stable reste NO-GO.

## État actualisé sur la candidate qualifiée `3666942` — 13 octobre 2026

Audit effectif : [GitHub Actions 38400336978](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38400336978), `npm audit --omit=dev`, **0 critical / 0 high / 3 moderate / 0 low**. Le tableau historique ci-dessus est antérieur à la mise à jour KaTeX ; **ne plus annoncer 6 Low résiduels**. KaTeX `0.18.10` et ses overrides ont passé les validations npm/CI.

Advisories résiduels **modérés** :

- `mammoth` direct (range annoncé `>=0.3.30`) ; suggestion npm de retour à `0.3.29` avec rupture SemVer, **non appliquée**.
- `argparse` transitif (`1.0.0 - 1.0.10`), correction suggérée via rétrogradation de `mammoth`, **non appliquée**.
- `sprintf-js` transitif, [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) ; scénario de déni de service par précision de format non bornée si l'entrée attaquante atteint le formatteur. Exploitabilité effective du chemin applicatif non démontrée.

**Décision sécurité : risques modérés non acceptés à ce stade.** Avant GO5, établir la route exacte des traitements DOCX, les limites de taille/temps, l'exposition aux entrées non fiables, les atténuations et le responsable de l'acceptation éventuelle. Un audit PASS au seuil High/Critical ne suffit pas à approuver ces trois avis. Ne pas recourir à `npm audit fix --force`.

## Traçage de la surface de traitement des documents

Le dépôt déclare `mammoth: ^1.11.0` dans `packages/api/package.json` (dépendance directe). La route serveur `api/server/services/Files/process.js` appelle `@librechat/api.parseText` pour les fichiers textuels autorisés. Lorsqu'une extraction de texte RAG configurée échoue, les lignes 931–959 prévoient explicitement un **fallback vers un parseur de documents intégré**, y compris pour DOCX/PDF. Le chemin est donc potentiellement exposé aux documents non fiables, sous réserve du filtrage de types et des garde-fous en amont.

**Limite du constat :** l'appel précis du parseur à `mammoth` et les bornes effectives (taille, durée, ressources, rejet des archives) restent à démontrer par traçage de l'implémentation de `parseText` et du fallback `resolveDocumentText`. Il serait incorrect d'affirmer que les trois avis modérés sont inexploitables ou, inversement, directement exploitables, sur ces seules observations. **Décision de risque toujours ouverte.**

## Protections DOCX vérifiées dans le code — 13 octobre 2026

Le point d'appel exact est `packages/api/src/files/documents/crud.ts` : `parseDocument` refuse les types MIME non reconnus et les documents de plus de **15 MiB** (`DOCUMENT_PARSER_MAX_FILE_SIZE`, via `megabyte`). Pour les DOCX, `wordDocToText` lit le fichier, attend `assertSafeZipSize(buffer)`, puis charge `mammoth` et appelle **`extractRawText({ buffer })`**. Le chemin DOCX n'appelle donc pas la conversion HTML de mammoth.

`packages/api/src/files/documents/zipSafety.ts` parcourt réellement les entrées ZIP à l'aide de `yauzl` et limite la décompression à **100 MiB au total** et **25 MiB par entrée**. Le comptage ne se fonde pas seulement sur la taille déclarée dans le répertoire central, qui peut être falsifiée. Les dépassements provoquent `ZipBombError`. **Protections contre le gonflement ZIP établies ; ne pas les réimplémenter.**

**Limites restantes** : aucun délai maximal de traitement par document, isolation CPU/mémoire du parseur ou preuve d'inexploitabilité des avis `mammoth`, `argparse`, `sprintf-js` n'ont été établis par ce traçage. L'appel `extractRawText` réduit les risques liés à la sortie HTML, sans démontrer l'absence de vecteurs DoS. Rechercher les limites des processus RAG et les points d'entrée non fiables, puis demander une acceptation explicite du risque ou appliquer un correctif ciblé. **Aucune acceptation implicite.**

## Distinction critique : aperçu HTML DOCX — 13 octobre 2026

Le constat `extractRawText` ci-dessus ne concerne **que l'extraction textuelle**. Un second chemin est confirmé dans `packages/api/src/files/documents/html.ts` : `renderMammothBody` appelle **`mammoth.convertToHtml({ buffer }, { styleMap: DOCX_STYLE_MAP })`**, puis **`sanitizeOfficeHtml(result.value)`**. L'aperçu DOCX emploie cette sortie HTML assainie, y compris comme fallback de rendu CDN. La fonction d'aperçu DOCX appelle aussi `assertSafeZipSize` avant la conversion. **Ne pas prétendre que Mammoth n'est jamais utilisé en mode HTML.**

Les tests `packages/api/src/files/documents/zipSafety.spec.ts` couvrent les plafonds de décompression, dont un scénario ZIP bomb. `packages/api/src/files/documents/crud.spec.ts` couvre la taille maximale d'un fichier en extraction. Ces tests ne constituent pas une preuve de timeout global ni de limitation CPU du parseur Mammoth ; `sanitizeOfficeHtml` réduit les risques de sortie HTML non fiable mais ne corrige pas un éventuel déni de service dans les dépendances au moment du parsing.

**Décision** : ne pas accepter automatiquement les avis modérés avant une qualification dédiée des deux chemins (texte et HTML) et du contexte concret des chaînes de formatage `sprintf-js`.

## Résultat ciblé : sortie et temps d'exécution de l'aperçu DOCX

`packages/api/src/files/documents/html.ts` (lignes 612–638) effectue le contrôle ZIP avant `tryLibreOfficePreview`, puis `mammoth.convertToHtml` en chemin de repli ou pour produire le contenu HTML de secours du rendu CDN. Le plafond de sortie HTML est **512 KiB** (`OFFICE_HTML_OUTPUT_CAP`), mais il est vérifié **après la conversion Mammoth** : il protège le cache et la restitution, pas le temps CPU ni le pic de mémoire consommé *pendant* la conversion. La voie « petit DOCX via CDN » exécute elle aussi Mammoth au préalable. Les tests `html.spec.ts` couvrent le fallback, la sanitisation des balises/script et gestionnaires d'événements, le plafond de sortie, les versions/SRI du CDN et la CSP du rendu iframe.

**Mesure de risque proposée** : inventorier les limites effectives du processus API (CPU/mémoire/concurrence), puis tester la conversion avec documents inoffensifs mais volumineux sur environnement isolé avant de fixer un budget de ressources. Un simple `Promise.race` ne stoppe pas un parseur synchrone qui monopolise le thread Node ; ne pas le présenter comme une isolation de ressources. Aucun contournement par désactivation des vérifications ZIP ou retour à `mammoth 0.3.29` n'est justifié ici. Les trois avis modérés restent **NON ACCEPTÉS** jusqu'à décision sécurité traçable.

## Isolation comparative des convertisseurs — 13 octobre 2026

**LibreOffice optionnel** : `packages/api/src/files/documents/libreoffice.ts` utilise un sous-processus `spawn` et un délai de **30 secondes** (`LIBREOFFICE_TIMEOUT_MS=30_000`) avec `SIGKILL` si le délai expire. Cette protection existe pour ce moteur de conversion, **pas** pour le chemin de repli `mammoth.convertToHtml` ni pour `mammoth.extractRawText` exécutés dans le processus Node API.

**Déploiement** : le `docker-compose.botmode.yml` inspecté n'établit pas de plafonds Compose explicites `mem_limit`, `cpus` ou `pids_limit` pour le service API. Ne pas inférer pour autant l'absence de limites imposées à Docker par l'hôte. Un timeout LibreOffice ne démontre pas une isolation de Mammoth. Pour GO5, privilégier une qualification de charge sous limites conteneur explicitement définies et un audit ciblé des trois avis modérés, ou un isolement borné du parseur document si les mesures démontrent une exposition inacceptable. Toute mesure susceptible de rendre l'API indisponible nécessite un test de régression dédié.
