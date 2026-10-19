# BOT MODE V1 — Mise à jour en présence de missions actives

**Protection provisoire fail-closed** (issue #42). L'objectif est d'éviter qu'une mise à jour automatique détruise ou duplique une mission qui exécute encore Worker → spécialistes → Oracle.

L'exécutable `update.sh` vérifie **avant** `git pull --ff-only`, puis à nouveau avant `bootstrap.sh`, que l'API du projet Compose n'est plus active. Un conteneur en cours, en démarrage ou en redémarrage provoque un **refus** sans changement du dépôt ni de la pile à la première vérification. Cela couvre également les missions en mémoire, pour lesquelles aucune preuve Redis n'existe.

Si Redis est activé via `USE_REDIS`, `USE_REDIS_STREAMS` ou `REDIS_URI`, `update.sh` **refuse toujours une mise à jour interversion automatisée**, même après arrêt de l'API. Une mission en état `running`, en attente HITL `requires_action`, ou en cours de reprise peut conserver un état durable. Un service API arrêté n'est pas une preuve que ses tâches sont terminées. L'absence ou l'ambiguïté de la configuration, un démon Docker inaccessible et les surcharges Compose non prises en charge déclenchent également un refus.

**Conséquences opérationnelles :** pour une installation sans Redis, terminer les missions, arrêter volontairement l'API, puis relancer la procédure standard `./update.sh`. Ne jamais arrêter une API au milieu d'une mission en croyant que ce geste garantit son achèvement. Pour une installation Redis, conserver la version en place : la reprise interversion pendant une mission active n'est pas qualifiée. Prévoir un plan de sauvegarde et une procédure de migration avec validation explicite avant toute transition. Aucun drapeau de contournement automatique n'est fourni.

La protection se limite au parcours `update.sh` pour la pile Compose gérée ; elle ne bloque pas une commande Docker ou Git manuelle externe. Elle ne démontre pas l'absence de travail chez des orchestrateurs ou replicas externes. Une mise à jour à chaud et la reprise interversion de Redis restent **hors périmètre prouvé V1**.

Preuves : test Python hors ligne avec Git/Docker simulés, test CI jetable avec vraies étiquettes Docker et vrais hash/index Redis (`running` et `requires_action`), vérification qu'aucun `git pull`, bootstrap ni changement Redis n'a été effectué dans les chemins de refus.
