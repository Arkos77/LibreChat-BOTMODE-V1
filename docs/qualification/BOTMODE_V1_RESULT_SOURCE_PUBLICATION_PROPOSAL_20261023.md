# Lot résultat et sources — publication proposée

Le correctif et ses tests sont prêts dans la source locale `8743ae58ab10db50a187279265b4f854c95b0d88`.

## Action à autoriser

Partager les **30 fichiers de code, tests et documentation modifiés** dans le dépôt **public** https://github.com/Arkos77/LibreChat-BOTMODE-V1, sur une branche de correctif. Le manifeste JSON voisin donne chaque chemin, empreinte de blob Git, SHA-256 et taille. Le contenu sera publiquement accessible. Aucun historique local privé ni fichier de configuration utilisateur n’est inclus dans ce lot.

La source est assemblée par blobs vérifiés contre le commit local, sans pousser tout l’historique. Six blobs ont été vérifiés avant le blocage automatique sur un fichier de test volumineux ; aucune nouvelle branche/commit distant ni image n’a été créé pour ce lot.

## État vérifiable

- Résultat non vide et critère de réussite imposés côté serveur.
- Provenance des liens des tâches de recherche liée aux observations natives, avec isolation par tâche et contrôle des replays.
- 117 tests API dans 10 suites et 392 tests hôte dans 4 suites réussis, soit 509 tests ciblés.
- Typage API, lint, imports et format réussis. Une seule revue par lot et une passe de corrections vérifiées.
- initialize.spec.js bloqué par MongoMemoryServer code100 : 93 tests non exécutés jusqu’à leur corps, non présentés comme réussis. Le contexte extrait réellement appelé par initialize.js est testé directement.
- Vrai outil SDK web_search vérifié sur recherche et scraping synthétiques locaux ; protocole du modèle synthétique vérifié. Un essai isolé Run hors application a atteint sa limite de récursion sans exécuter l’outil et n’est pas retenu comme validation.

## Étapes après autorisation

Terminer le partage exact, préparer et vérifier hors ligne le workflow de qualification, construire une seule image AMD64, conserver cette image, qualifier le navigateur et le chemin réel de capture/Oracle, puis publier et installer uniquement l’image qualifiée. Les sauvegardes et la version courante sont conservées pour retour arrière. Une nouvelle mission fournisseur réelle constitue une recette distincte ; aucune n’est lancée par les sondes locales.

La version déjà installée reste celle du correctif de mode durable. Les nouvelles règles résultat/sources sont préparées, pas encore installées. La vérité factuelle et la synthèse restent distinctes de la présence d’un résultat et de la provenance d’un lien.

## Blocage

Le contrôle automatique d’approbation a rejeté l’envoi d’un fichier de test vers GitHub : l’autorisation explicite de partager ce nouveau contenu avec cette destination publique n’est pas considérée établie. Aucun contournement ni nouvel essai de publication ne sera effectué avant cette autorisation.
