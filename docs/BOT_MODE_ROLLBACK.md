# BOT MODE V1 — Plan de retour arrière (candidat ; non validé en production)

**Statut : procédure documentée, test de restauration réel non effectué.**
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

## Retour arrière du runtime uniquement (si schéma inchangé)

Dans **un checkout séparé** à la révision validée, conserver les mêmes volumes et configuration explicitement contrôlés. S'assurer que l'image référencée existe sur GHCR et que son digest correspond au build validé. La commande `./install.sh --no-start --image <image-validée>` **modifie BOTMODE_IMAGE dans .env** ; elle n'est pas une commande de diagnostic. Après cette préparation, démarrer avec `./start.sh` et effectuer les tests de santé.

Ne pas utiliser `./update.sh` comme rollback : il est conçu pour avancer une branche suivie par `git pull --ff-only` et refuse les HEAD détachés.

## Si une migration de données est intervenue

**STOP :** ne pas redémarrer automatiquement une ancienne API contre une base plus récente. Restaurer la sauvegarde cohérente dans un environnement jetable, confirmer la compatibilité, puis planifier le basculement. Tout remplacement de volumes en production exige approbation humaine, plan de récupération et contrôle post-restauration.

## Critères de sortie

Le rollback ne pourra être marqué VALIDÉ qu'après un test CI ou manuel reproductible sur une stack jetable, avec preuve d'une écriture avant mise à niveau, de sa préservation ou de sa restauration attendue, de l'authentification, des six agents, des ACL et d'une mission après redémarrage. **Aucune restauration destructrice ne doit être automatisée sans une autorisation explicite.**
