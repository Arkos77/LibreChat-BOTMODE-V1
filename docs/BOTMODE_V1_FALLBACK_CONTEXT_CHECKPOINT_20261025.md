# BOTMODE — contexte conservé après fallback SDK

25 octobre 2026, Europe/Paris. Lot de correction et de test hors ligne ; pas de publication, build Docker, appel fournisseur ou installation autorisé dans ce lot.

## Cause et changement

La version SDK épinglée 3.7.17/145865e prépare le modèle principal avec le systemRunnable de son AgentContext et getPreparedToolsForBinding. Sa branche fallback initialisait un modèle nu et ne recevait que agentContext.tools. Cela perdait les instructions système/dynamiques et les outils injectés dans graphTools, notamment subagent.

Le dérivé fallback-context-v1 ajoute deux hooks internes optionnels de préparation du modèle et des outils. Graph y réutilise le même pipeline de contexte que le principal, avec le fournisseur et les options de la cible. La préparation de requête et l'invocation utilisent le même modèle enveloppé ; les filtres de découverte, d'appel direct et d'exécution sont conservés. Les appels standalone sans hooks gardent leur ancien comportement. Les règles zero-chunk, erreurs admissibles, refus après chunk, aborts, budgets, autorisations et Oracle/P6 ne sont pas modifiés.

## Distribution reproductible

Archive : vendor/librechat-agents/librechat-agents-3.7.17-botmode-fallback-context-v1.tgz.
SHA256 : 28d5c2f2858feb3c0468cc50dbf43232989f9c8ed625e7d777f032d28dd312ea.
Intégrité npm : sha512-VLLFvqRrNkO0kHLkdyyLu2osQbyZpP9ygJj/OY+Av5mTSr2BtXttxvF4b+nS82KneDItkinTq/qPYbj/W90CLg==.

Le générateur versionné refuse toute base autre que l'archive originale SHA5937a2be89c761b7ccb9749e2ed9f15343dae887b5f1d84debc55307b691ac2b et les ancres inattendues. Deux générations identiques et une comparaison indépendante vérifient les douze membres modifiés/supprimés attendus, sans changement des autres octets ou modes. Le verrou npm ne change que les deux chemins de l'archive et son intégrité ; aucun paquet transitif n'est mis à niveau. L'ancienne archive reste disponible dans l'historique Git, pas en doublon dans l'arbre courant. Docker copie déjà vendor avant npm ci ; aucune procédure manuelle de modification de node_modules n'est ajoutée.

Décision de construction : une tentative isolée de recompilation de deux modules a rencontré les exports de barrels optimisés de la distribution et a été abandonnée. Le dérivé conserve donc la distribution originale et reflète explicitement le petit patch dans les sources, CJS, ESM et déclarations. Les quatre source maps runtime modifiées sont retirées pour ne pas conserver des correspondances erronées. Il n'est pas déclaré comme build/typecheck complet du dépôt SDK amont ; les piles de ces modules pointent vers le JS distribué.

## Vérifications

- Deux tests renforcés observés rouges avant correction : prompt fallback vide et subagent absent. Ils passent avec l'archive isolée, sans exception de tolérance.
- 222 tests API dans 17 suites passent avec tous les exports SDK mappés vers l'archive corrigée : contrats, Oracle, admission, observations, SDK natif, schémas, refus des erreurs ordinaires et des bascules après chunk, publication.
- 432 tests hôte dans 7 suites passent avec le même SDK isolé et le bon dist API : client, requête/reprise/déconnexion, usage, compatibilité de routage et publication.
- Quatre scénarios Node réels CJS/ESM sur HTTP loopback : 429 primaire, fallback contenant instructions propriétaire et dynamiques exactement une fois, enfant déclaré réellement exécuté une fois ; type interdit zéro exécution ; outil différé non découvert absent de toutes les requêtes. Vingt requêtes HTTP locales, aucune inférence externe.
- Les huit scénarios API compilée + SDK sont inclus dans les 222 tests ; les huit passent aussi après suppression des anciennes exceptions de perte d'instructions. Le code API compilé testé est inchangé dans ce lot ; le SDK réellement résolu est bien le nouveau, sans modification de la dépendance partagée installée.
- Quatre tests Python d'archive passent : verrou/intégrité, présence source/runtime/déclarations, régénération exacte deux fois et périmètre exact des octets, refus d'une base inconnue.
- Typage complet consommateur du workspace API avec déclarations et alias du nouveau SDK : PASS. Le smoke de déclaration standalone initial n'était pas une reproduction rouge exploitable à cause des alias ; il ne compte pas comme preuve.
- Lint des tests TS touchés et du nouveau driver CJS sans avertissement ; syntaxe Python/JS/YAML et tous les scripts bash du workflow, diff-check : PASS.

Les tests sont exécutés avec une extraction isolée du nouveau SDK et des configurations de résolution temporaires. Aucun node_modules partagé, container, volume ou fichier de configuration d'installation utilisateur n'est modifié.

## Revue unique

Une revue fraîche, lecture seule : zéro Critical, zéro Important, un Minor différé. Le checkout compilé CI est peu profond ; le test de régénération/périmètre depuis le commit historique peut donc être SKIPPED. La comparaison locale a bien été exécutée sans skip et vérifiée indépendamment. Ce détail ne doit pas être annoncé comme une vérification de régénération effectuée en CI. Pas de seconde revue ni de correction du mineur dans ce lot.

## Limites et suite

Ce lot qualifie hors ligne la conservation du contexte SDK dans les chemins OpenRouter et OpenAI compatibles testés. Il ne qualifie pas tous les changements de familles fournisseur ni l'interopérabilité des formats de prompt-cache du contexte primaire. Le fournisseur réel, l'installation propre npm, l'image applicative et le build/typecheck complet amont ne sont pas prétendus validés par ces tests.

Les preuves des missions 40213117715 et 40222229005 restent acquises pour l'image applicative 1d98d2c. Elles ne sont pas transférées automatiquement à une nouvelle image SDK. L'ancienne image ne peut pas qualifier ce changement d'archive/verrou ; le garde de dérive ne doit pas être élargi.

Proposition suivante sous accord distinct : publier le commit figé de ce lot et construire UNE nouvelle image applicative. Exécuter les scénarios SDK compilés et les quatre scénarios de fallback/délégation simulés dans cette image, sans appel fournisseur ni répétition de la mission réelle déjà validée. Workflow393172640, native_research_only=true, host_research=false, reuse_host_candidate=false, real_free_provider=false. Conserver l'image et ses preuves. La qualification hôte/fournisseur du fallback reste une étape distincte ; aucune release stable n'est autorisée.
