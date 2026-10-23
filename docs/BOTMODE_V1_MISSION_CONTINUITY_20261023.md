# BOT MODE V1 — continuité de mission, 23 octobre 2026

Source applicative figée : `d25358c2d71ed72ba00e78630bdb2c87d2815e44`, parent `0c3c717a44a044200fe4bdc72174195d5b40d713`.
Branche : `fix/mission-continuity-20261023`.

## Cause et correction

Le contexte BOT MODE était perdu à trois frontières de navigation : envoi initial dans `useChatFunctions`, nettoyage des paramètres de lancement dans `useQueryParams`, fin de réponse/restauration de brouillon dans `useEventHandlers`. Un envoi ultérieur pouvait ainsi devenir un chat ordinaire sans contrat de mission.

Un helper pur conserve uniquement le drapeau BOT MODE, le mode explicite, la sélection des spécialistes et l'identité du Worker. Les paramètres de lancement à usage unique (prompt, q, submit) sont retirés. Le projet conserve son traitement existant. Un chat ordinaire ne devient pas une mission et le choix FAST reste respecté. Aucune interprétation d'un JSON textuel comme appel d'outil n'est ajoutée.

## Vérifications

- Reproduction avant correction : 2 échecs sur l'envoi initial, 3 sur la navigation terminale, 4 sur le nettoyage de saisie.
- Après correction et traitement de la revue : 167 tests frontend, 8 suites ; 42 tests natifs/Oracle, 2 suites ; tous réussis (209 tests ciblés, pas la totalité du monorepo).
- Les vrais hooks et React Router couvrent fin normale, fin en erreur, restauration après arrêt précoce, sélection automatique/manuelle et nettoyage avec envoi différé, sans double envoi.
- Le vrai SDK avec modèle de test local rejette le JSON textuel de délégation avant la synthèse.
- TypeScript client `tsc --noEmit`, ESLint ciblé sans avertissement, Prettier et `git diff --check` : réussis.
- Revue indépendante en lecture seule : un point Important sur le nettoyage de saisie, traité par quatre cas rouges puis verts ; aucune seconde revue prétendue.
- Neuf blobs source/test contrôlés identiques au commit local testé `fc8b1ff869c5d3b6bb74e3a1c40d6d552413cb5f`.

## Limites et prochaine étape

Aucun nouvel appel de modèle externe, construction Docker, publication d'image ou déploiement pour cette source. Le succès d'une mission réelle reste à établir. Ce lot ne prétend pas résoudre la vérité factuelle, l'obéissance de chaque fournisseur, ni la conservation du mode après réouverture depuis la barre latérale sans les paramètres de mission.

Périmètre proposé : construire une seule image AMD64 pour la machine cible, vérifier cette image avec fournisseur local synthétique et interface réelle, conserver l'image exacte, publier uniquement sa référence candidate spécifique à cette source sur `ghcr.io/arkos77/librechat-botmode-v1`, puis mettre à jour l'installation autorisée avec sauvegarde et retour arrière. Aucun changement stable/latest ni fusion. Activation soumise à l'accord correspondant.

Documentation primaire consultée : [React Router, useSearchParams](https://reactrouter.com/api/hooks/useSearchParams), [OpenRouter, protocole tool calling](https://openrouter.ai/blog/tutorials/tool-calling/). Un appel exécutable se transmet dans le protocole `tool_calls`, pas simplement dans le texte de l'assistant.
