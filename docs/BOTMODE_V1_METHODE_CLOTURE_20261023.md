# BOT MODE V1 — méthode de clôture opérationnelle

Adoptée explicitement par le propriétaire le 23 octobre 2026 (Europe/Paris). Ce document organise l'exécution ; il ne constitue ni validation fonctionnelle, ni acceptation de risque, ni autorisation de publication/fusion ou de nouvel appel fournisseur réel.

## But et périmètre

Finaliser rapidement et proprement BOT MODE V1 selon les exigences déjà convenues, sans rouvrir les preuves acquises ni supprimer implicitement des exigences. Travailler de façon autonome par lots ; demander une décision humaine seulement lorsque son périmètre n'est pas déjà autorisé. Une nouvelle permission n'est jamais un substitut à un diagnostic préparé.

## Registre unique de clôture

L'inventaire maître reste le registre de référence. Pour chaque obligation restante, conserver : résultat attendu, preuve exacte et source testée, manque précis, prochaine action minimale, critère de réussite, autorisation éventuellement nécessaire. Les checkpoints complètent ce registre ; ne pas réécrire tout l'historique à chaque tour.

Distinguer : source applicative, commit de pilotage CI, commit documentaire, ID local d'image et digest publié. Une preuve n'est jamais transférée à une autre source/image sans justification vérifiée. Aucun pourcentage d'avancement ni date de fin inventés.

## Ordre obligatoire d'un lot

1. Lire l'état courant utile et choisir un seul blocage à fermer.
2. Énoncer l'hypothèse et ce qui la confirmerait ou l'écarterait. Si les traces ne suffisent pas, préparer d'abord une collecte qui distingue les causes possibles.
3. Vérifier au moindre coût : syntaxe, configuration, prix/capacités publics si nécessaires, audit actuel, tests ciblés et revue. Un échec local accessible ne doit pas être découvert après une longue construction Docker.
4. Corriger uniquement une cause reproduite. Test rouge avant correction, vert après ; conserver les validations d'autorisations et Oracle/P6.
5. Figer la source utile. Construire une seule fois si nécessaire, puis réutiliser la même image immuable pour les contrôles successifs. Si le runner doit être détruit, prévoir avant exécution une conservation réutilisable adaptée au périmètre autorisé ; ne pas supposer que les caches GitHub sont accessibles entre nouvelles branches. Vérifier la disponibilité réelle de l'image/cache avant de promettre sa réutilisation.
6. Lancer un essai réel seulement s'il répond à une question précise, possède les observations nécessaires et entre dans une autorisation explicite disponible. L'instrumentation doit rendre un échec exploitable.
7. Lire le résultat complet utile et le nettoyage, classer honnêtement, mettre à jour le registre une fois, puis passer au prochain blocage.

## Preuves et coût

- Pas de relance identique sans nouvelle information ou changement justifié.
- Pas de nouvelle CI complète pour une modification uniquement documentaire. Utiliser les mécanismes prévus pour ignorer la CI lorsque cela convient.
- Refaire un contrôle acquis seulement si un changement, un échec ou une question non résolue le justifie.
- Grouper corrections, tests et documents en lots reviewables ; éviter une succession de microcommits déclenchant des compilations.
- Un harnais doit accepter une amélioration valide : par exemple zéro alerte d'audit, tout en refusant les alertes hors du périmètre permis. Ne pas encoder un nombre historique comme résultat obligatoire.
- Tester hors ligne le workflow/harnas lui-même, y compris ses cas de refus, avant d'y charger une clé.
- Quand l'environnement local bloque une dépendance de test, identifier la limite puis déplacer une seule vérification ciblée ; ne pas lancer plusieurs variantes coûteuses sans observation nouvelle.

## Diagnostic de la frontière fournisseur / SDK / Oracle

Sur données synthétiques, recueillir au même essai les éléments minimaux permettant de distinguer : paramètres réellement envoyés, route/modèle effectivement observés, statut/motif de fin, réponse avant transformation et candidat transmis à l'Oracle. Prévoir une collecte expurgée qui explique une erreur sans exposer clé, données personnelles ou raisonnement interne. Un simple code d'erreur, une longueur de texte ou un hash ne permettent pas de reconstruire un contenu supprimé.

Un catalogue compatible ne prouve pas le corps HTTP effectivement envoyé ; un test HTTP loopback ne prouve pas le comportement du fournisseur réel. Une réponse reçue ne vaut pas un verdict VERIFIED. Ne pas convertir un rejet Oracle en réussite, ni corriger conjecturalement un fournisseur à partir d'une trace insuffisante.

## Autorisations et points d'arrêt

Poursuivre sans demander à nouveau pour lectures, analyses, tests hors ligne et correctifs réversibles déjà dans le mandat. Préparer un résultat concret et reviewable avant toute demande.

Pour une mission externe autorisée une seule fois : suivre explicitement son admission. Un arrêt avant l'étape secret/mission ne consomme pas cette mission ; une mission admise la consomme même si elle échoue. Ne pas en déduire un droit de replay. Expliquer le périmètre exact et le motif de toute nouvelle validation humaine.

Aucune utilisation de modèle payant, achat, rotation de clé, modification d'installation Chromebook/Mac, fusion, stable/latest/tag v* ou publication d'une nouvelle source sans autorisation correspondante. Les accords antérieurs restent attachés à leur périmètre exact. Respecter D-01/D-02/D-03/D-04, sans déclassement implicite.

## Communication

Donner des mises à jour utiles sur les faits nouveaux, l'incertitude restante et la prochaine vérification. Ne pas annoncer « presque fini » à partir de tests partiels. À la clôture du lot : ce qui a été établi, ce qui manque, la preuve et la prochaine action minimale. Si une validation humaine bloque réellement, poser une seule demande précise et préparée.

## Point de départ au 23 octobre

Source applicative a6f6fee3c7dcfb5877fe798f759966774a046a58 : routage spécialiste corrigé et 109 tests ciblés verts. Image AMD64 locale contrôlée, audit production zéro au dernier constat. Mission réelle 39857859228 : worker REJECTED / INVALID_CANDIDATE (INVALID_JSON, 59 caractères), spécialistes non atteints, P6 non qualifié, nettoyage SUCCESS. L'accord d'une mission est consommé. Huit tests supplémentaires HTTP loopback montrent que le paramètre JSON peut traverser le fallback en streaming et sans streaming ; ils n'expliquent pas la sortie réelle. Aucun nouvel appel réel autorisé par ce rappel méthodologique seul. Lire le checkpoint détaillé pour les identités et limites.
