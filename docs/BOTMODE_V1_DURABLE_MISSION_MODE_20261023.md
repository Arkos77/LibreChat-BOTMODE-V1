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

## Limites et suite

Aucune nouvelle inférence externe, image, publication publique, fusion, stable ou installation n’a été réalisée pour ce lot. Les réglages ne sont enregistrés que pour les nouveaux envois explicites de la version corrigée : les conversations historiques ne sont pas migrées silencieusement.

Le contrat Oracle, la qualité des sources, le routage gratuit et la reprise automatique à froid ne sont pas élargis par ce correctif. La qualification de l’image exacte et son installation restent à effectuer avant de déclarer ce comportement actif chez l’utilisateur. Les autres gates de release conservent leur portée et leur statut.
