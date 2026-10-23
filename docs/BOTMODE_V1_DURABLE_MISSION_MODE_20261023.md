# BOT MODE V1 — mode de mission durable

23 octobre 2026. Parent local testé : `fc8b1ff869c5d3b6bb74e3a1c40d6d552413cb5f`, équivalent applicatif du lot installé `d25358c2d71ed72ba00e78630bdb2c87d2815e44`.

## Correction

Le réglage versionné `botMode` de la conversation conserve le mode, le Worker et la sélection des spécialistes. Il est présent dans le contrat partagé et le schéma Mongo, restauré par le véritable chemin d’envoi après réouverture, et conservé par les sauvegardes normales et en erreur. Les presets ne le transportent pas vers des conversations sans rapport et les sauvegardes génériques ne l’effacent pas.

La restauration ne rejoue ni ancien plan ni prompt de lancement. Chaque nouvel envoi utilise de nouvelles identités et repasse par les droits du graphe initialisé. Le serveur refuse la disparition silencieuse d’un contexte de mission avant l’initialisation des modèles. FAST explicite reste FAST ; un chat historique sans réglage n’est pas converti automatiquement. Les nouveaux brouillons et les autres agents/endpoints ne récupèrent pas le mode d’une autre conversation.

L’en-tête affiche le mode effectif. Lorsque seule l’activation BOT MODE est présente avant une première admission, il affiche un mode automatique ; après admission, le réglage conservé rétablit le mode. Les paramètres explicites gardent leur priorité.

## Preuves

- Avant correction : trois échecs du hook réel sur réouverture/FAST, un échec de contrat partagé, un échec de projection Mongo et un échec d’admission serveur. Une régression supplémentaire de réouverture avec le seul drapeau BOT MODE a été observée rouge avant correction.
- Après correction : **683 tests ciblés réussis**, pas la totalité du monorepo : frontend 80 (8 suites), contrat partagé 337 (3 suites), contrôleur 143 (1 suite), sauvegarde/admission 122 (2 suites), options de sauvegarde AgentClient 1 (1 suite, les 234 autres tests de ce fichier non exécutés pour cette sonde).
- Contrôles de types : déclarations data-provider, `tsc --noEmit` data-schemas et client strict réussis. Le contrôle client épingle le paquet data-provider modifié pour éviter l’unification avec les déclarations d’un autre worktree ; aucune règle de typage assouplie.
- ESLint ciblé sans avertissement, Prettier, tri des imports et `git diff --check` réussis.
- Le test local de sérialisation du schéma Mongo est passé. Le test de démarrage MongoMemoryServer local est bloqué par `open: Operation not permitted` ; il n’est pas présenté comme réussi. Le fragment exact du nouveau schéma a été vérifié sur une vraie base de qualification isolée : aller-retour automatique et manuel, mise à jour FAST et nettoyage réussis. Cette preuve porte sur le nouveau champ, pas sur une nouvelle image applicative.
- Une revue indépendante en lecture seule a trouvé un point Important sur l’affichage FAST d’un mode inféré. Il est traité par les tests du vrai en-tête, la restauration du mode admis et les tests de réouverture avec/sans drapeau ; aucune seconde revue prétendue.
- Le binaire de build natif tsdown n’est pas disponible dans les dépendances locales de cet hôte. Le runtime data-provider utilisé par les tests est assemblé localement avec Rollup et TypeScript ; ce n’est pas un build de release. Un premier lancement large du contrôleur a été interrompu sans résultat exploitable ; la vérification instrumentée et bornée de la suite complète du contrôleur a ensuite passé ses 143 tests.

## Qualification de l’image exacte

Source applicative figée : `a0aa5bde3e6f9803ec385fbddcb334c4fbd5e817` (22 blobs vérifiés contre le commit local `22a2a7a0c662825f880a341bb83c4ff48b05b513`).

Le [run de qualification 40011847074](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40011847074), job `120613949010`, est terminé avec succès. Une seule image AMD64 a été construite avec le build canonique. Sa configuration est `sha256:8a3f0082cf5e0201b8a82be17e55cfa49855f16f77a13edd4ec3e7fd918dea90`. L’artefact conserve cette image exacte pour une publication sans reconstruction.

Les contrôles exécutés couvrent le code compilé, le refus de perte du contexte, le transport JSON, la persistance Mongo des réglages, la réouverture sans paramètres, une nouvelle mission après réouverture et la publication P6 sur le même flux. Les essais navigateur et les sondes utilisent un modèle local synthétique : **aucune inférence externe**. Cela ne valide pas la qualité factuelle d’un modèle réel.

## Limites et suite

Aucune nouvelle inférence externe, fusion ou promotion stable/latest n’a été réalisée pour ce lot. Les réglages ne sont enregistrés que pour les nouveaux envois explicites de la version corrigée : les conversations historiques ne sont pas migrées silencieusement.

Le contrat Oracle, la qualité des sources, le routage gratuit et la reprise automatique à froid ne sont pas élargis par ce correctif. La qualification, la publication et l’installation de l’image exacte sont acquises pour ce correctif, selon les preuves ci-dessous. Les autres gates de release conservent leur portée et leur statut.

## Publication candidate

Le [run de publication 40013465446](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40013465446), piloté par `c69dfa49651716bd0e3ed03e737a96e22d11282e`, a réussi. Il vérifie d’abord la réussite de la qualification exacte, restaure son artefact, compare l’identité de configuration et publie sans reconstruire.

- Dépôt : `ghcr.io/arkos77/librechat-botmode-v1`.
- Index candidat AMD64 : `sha256:9da2960177d093889033f9b24d2b9b4490933539f1c7f0c9f9771c8c61a28d6d`.
- Manifest AMD64 : `sha256:8d61074f047be068d076abb5acda104a64131835b9318c87cd00f41da942209a`.
- Configuration : `sha256:8a3f0082cf5e0201b8a82be17e55cfa49855f16f77a13edd4ec3e7fd918dea90`.

Une vérification anonyme depuis la cible a recalculé les empreintes index/manifest/configuration et confirmé l’architecture AMD64 et le `BUILD_COMMIT` exact. Aucun tag stable/latest, release ou branche principale n’a été modifié.

## Installation contrôlée

L’image candidate épinglée par digest est installée sur la cible autorisée. Avant le basculement, la configuration a été sauvegardée ; après arrêt contrôlé de l’application, les archives de la base et des volumes applicatifs ont été créées et vérifiées. Le téléchargement et l’identité locale ont été vérifiés avant l’arrêt.

Les contrôles après installation ont réussi : source active exacte, quatre réponses HTTP 200 (disponibilité, santé, configuration et page d’accueil), mêmes montages, mêmes nombres de documents avant/après, configuration YAML inchangée et ancienne installation conservée. La référence précédente reste disponible pour un retour arrière. Seule une ancienne image sans référence de conteneur a été supprimée pour libérer de l’espace ; aucun volume n’a été supprimé.

Une sonde exécutée dans l’application installée confirme la restauration du mode enregistré avec et sans paramètres d’URL, la priorité de FAST explicite, le refus de perte silencieuse du contexte et la conservation des six politiques et six agents configurés en modèles gratuits. Elle ne lance aucune génération externe et ne modifie pas les conversations.

Le correctif de conservation du mode est actif. Les anciennes conversations sans réglages enregistrés nécessitent un nouvel envoi explicite en mode mission. La qualité factuelle et les sources d’une vraie mission restent une validation distincte ; cette installation ne constitue pas une promotion stable/latest ni une validation globale de BOT MODE.
