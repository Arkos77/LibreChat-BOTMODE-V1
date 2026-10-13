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
