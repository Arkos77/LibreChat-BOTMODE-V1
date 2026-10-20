# BOT MODE V1 — Plan de retour arrière (candidat ; non validé en production)

**Statut : restauration réelle en CI jetable prouvée pour certains volumes et versions compatibles ; retour arrière après migration de schéma NON PROUVÉ.**
Cette procédure s'applique exclusivement à un environnement de qualification ou à une installation dont l'administrateur maîtrise les sauvegardes. Elle ne constitue pas une autorisation de supprimer ou réinitialiser les données. Le GO/no-go de l'issue #19 reste obligatoire.

## Avant tout changement de version

1. Relever le SHA du code et le digest effectif de l'image exécutée. Le tag `sha-<commit>` associe l'image au commit, mais un digest immuable est préférable pour la restauration.
2. Conserver la version des fichiers Compose, le profil Lite/Full et une sauvegarde chiffrée et protégée de `.env` et `librechat.yaml`. Ne jamais publier les secrets.
3. Définir un point de retour **compatible avec le schéma de données**. Un retour du conteneur API à une ancienne version peut échouer si la base a subi des migrations. Dans ce cas, restaurer **l'ensemble cohérent des volumes de données** depuis un instantané pris avant la mise à niveau.
4. Prévoir une fenêtre d'arrêt et un test de restauration **sur un environnement jetable distinct**, jamais en premier lieu sur les données réelles.

## Inventaire sans modification

Depuis le répertoire de l'installation :

```bash
git rev-parse HEAD
docker compose -f docker-compose.botmode.yml ps
docker image inspect "$(sed -n 's/^BOTMODE_IMAGE=//p' .env | tail -1)" --format '{{index .RepoDigests 0}}'
docker volume ls --format '{{.Name}}'
```

**Attention :** ne pas copier le contenu de `.env` dans les tickets ni dans les logs. Un volume non mentionné dans le présent document peut contenir des données métiers ; l'inventaire complet est obligatoire.

## Sauvegarde cohérente

En dehors des opérations actives et après avoir enregistré les processus en cours, arrêter les services avec `./stop.sh`. Ce script lance `docker compose down` **sans** `--volumes` ; ne jamais ajouter `-v` ou `--volumes`.

Conserver les volumes nommés de MongoDB, Redis (s'il est configuré et persistant), PostgreSQL/pgvector, Meilisearch, images et fichiers ainsi que toutes les données configurées en bind mounts. Pour les bases transactionnelles, privilégier un dump natif vérifié ou un snapshot arrêté ; une copie à chaud de fichiers bruts n'est pas une sauvegarde cohérente garantie.

Ne pas entreprendre la mise à niveau avant qu'une restauration sur conteneurs jetables démontre :
- authentification du compte et accès aux données,
- six agents et ACL conservés,
- état des missions et checkpoints durables,
- lisibilité des documents, fichiers joints et index nécessaires,
- absence de perte après un second redémarrage.

## Scripts de sauvegarde/restauration — protections sur le HEAD de PR #29

Le script `scripts/botmode/backup.sh <dossier-destination>` conserve le chemin de destination fourni par l'appelant, même lancé depuis un autre répertoire. Il **échoue** si MongoDB n'est pas démarré, si une archive finale existe déjà, si `mongodump` échoue ou si le dump est vide. Il n'annonce `BOTMODE_BACKUP_DB=COMPLETE` qu'après l'écriture de l'archive sous un nom temporaire, la publication du nom final sans écraser une archive existante, puis le calcul de son fichier `.sha256`. En cas d'échec, la sortie partielle est nettoyée. Le dossier `mongodb.SKIPPED` signale un backup incomplet, jamais exploitable comme archive de restauration.

Le script `scripts/botmode/restore.sh <dossier>/mongodb-LibreChat.archive` refuse les archives vides ou corrompues lorsqu'un checksum est présent et garde la confirmation explicite `BOTMODE_CONFIRM_RESTORE=YES` avant `mongorestore --drop`. Les anciennes archives sans checksum exigent la même autorisation et une vérification manuelle préalable. Les checksums détectent les corruptions accidentelles mais **ne prouvent ni l'authenticité ni la cohérence logique des données**.

La sauvegarde native de MongoDB seule n'englobe **pas** les volumes Redis, PostgreSQL, Meilisearch, les fichiers utilisateurs ni les autres services ; elle n'est pas une capture multi-volumes cohérente. Ne jamais s'en servir seule pour autoriser une mise à jour du schéma ou un rollback de mission longue. **Tests de ces protections :** 10 simulations Docker sans données réelles, à revalider dans le préflight GitHub du SHA final.

## Retour arrière du runtime uniquement (si schéma inchangé)

Dans **un checkout séparé** à la révision validée, conserver les mêmes volumes et configuration explicitement contrôlés. S'assurer que l'image référencée existe sur GHCR et que son digest correspond au build validé. La commande `./install.sh --no-start --image <image-validée>` **modifie BOTMODE_IMAGE dans .env** ; elle n'est pas une commande de diagnostic. Après cette préparation, démarrer avec `./start.sh` et effectuer les tests de santé.

Ne pas utiliser `./update.sh` comme rollback : il est conçu pour avancer une branche suivie par `git pull --ff-only` et refuse les HEAD détachés.

## Si une migration de données est intervenue

**STOP :** ne pas redémarrer automatiquement une ancienne API contre une base plus récente. Restaurer la sauvegarde cohérente dans un environnement jetable, confirmer la compatibilité, puis planifier le basculement. Tout remplacement de volumes en production exige approbation humaine, plan de récupération et contrôle post-restauration.

## Critères de sortie

Le rollback ne pourra être marqué VALIDÉ qu'après un test CI ou manuel reproductible sur une stack jetable, avec preuve d'une écriture avant mise à niveau, de sa préservation ou de sa restauration attendue, de l'authentification, des six agents, des ACL et d'une mission après redémarrage. **Aucune restauration destructrice ne doit être automatisée sans une autorisation explicite.**

## Qualification réelle des restaurations en CI — 13 octobre 2026

Le titre historique « test de restauration réel non effectué » au début de ce document ne décrit plus l'état actuel. Des essais **réels en environnements CI jetables** ont depuis validé : MongoDB, PostgreSQL/pgvector, Meilisearch, quatre volumes fichiers, une capture cohérente coordonnée des quatre ensembles, redémarrage de l'API Full sur un volume Mongo restauré, conservation d'un Worker provisionné par le script réel et de son ACL propriétaire. Référence : [API Restore Boot](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38397054603) et [CI complète 21/21](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/38400337087).

**Ce qui n'a PAS été validé par ces essais** : une migration de schéma suivie d'un retour à une ancienne version, un redémarrage d'une mission complète à partir d'un checkpoint issu d'une **restauration physique**, ni l'authentification utilisateur finale au sein de ce dernier workflow. Le checkpoint HITL survit à une reconnexion Mongo dans des tests d'intégration dédiés, ce qui n'est pas équivalent. Les six agents synthétiques du test de restauration ne doivent pas être présentés comme six spécialistes natifs réellement provisionnés ; l'onboarding natif est qualifié séparément dans [la documentation d'installation](BOT_MODE_INSTALL.md).

**Périmètre de rollback proposé pour V1** : reprise vers la **même version et un schéma compatible** à partir d'un ensemble sauvegardé hors ligne et d'un digest d'image verrouillé. Le rollback transversion de données déjà migrées reste explicitement **NO-GO**. Ne jamais convertir ces tests jetables en autorisation de modifier des volumes utilisateur sans validation humaine et sauvegarde indépendante.

## Vérification d'une restauration authentifiée (qualification CI, aucun volume personnel)

Les commandes `mongodump` et `mongorestore` doivent utiliser l'authentification MongoDB réellement activée dans `docker-compose.botmode.yml` : nom et secret root lus depuis l'environnement **du conteneur MongoDB**, avec `--authenticationDatabase admin`. La réussite des tests avec une imitation de Docker ne prouve pas que les comptes sont valides. Le préflight de PR #29 inclut désormais une tentative d'aller-retour authentifié sur un conteneur MongoDB jetable : insertion d'un canari, backup, modification, refus d'une archive altérée, restauration explicitement autorisée en CI isolée, puis lecture du canari initial. Seul le résultat final de ce nouveau job sur le SHA candidat fait foi ; les premiers tests unitaires seuls restent insuffisants. Cette restauration **ne concerne que MongoDB** et n'autorise ni remplacement d'une base existante ni rollback transversion.
