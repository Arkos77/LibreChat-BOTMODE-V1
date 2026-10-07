# BOT MODE — préparation à la publication publique

Ce document décrit la vérification à exécuter avant toute publication du fork BOT MODE.

## Principe

Publier uniquement des objets suivis par Git. Ne jamais créer une archive publique avec `tar` ou `zip` directement depuis le dossier de travail, car il contient localement des fichiers `.env*` ignorés.

Le chemin sûr est :

```bash
./scripts/botmode/audit-public-release.sh
```

Pour produire une archive publique après audit :

```bash
./scripts/botmode/audit-public-release.sh --archive /chemin/BOTMODE-public.tar.gz
```

L’archive est générée avec `git archive HEAD`, donc les fichiers ignorés/non suivis ne peuvent pas être embarqués.

## Ce que vérifie le script

- aucune modification suivie/stagée au moment de l’audit ;
- base commune avec LibreChat upstream ;
- absence de formes longues courantes de PAT GitHub, clés OpenAI, Google et Slack dans les commits BOT MODE propres ;
- absence de marqueur de clé privée dans ces commits ;
- absence de ces formes de secret dans les messages de commit ;
- aucun fichier `.env*` suivi sauf les fichiers d’exemple explicitement autorisés ;
- seules les fixtures historiques connues peuvent contenir des chaînes ressemblant à des credentials.

Le script ne montre jamais la valeur d’un secret potentiel : il ne sort que le type de problème et le chemin concerné.

## Fichiers locaux sensibles

Sur la machine de développement, `.env`, `.env.backup-*` et `.env.temp` sont ignorés par Git. Ils ne doivent jamais être copiés dans une archive publique. Les archives destinées à la publication doivent toujours provenir de `git archive`.

## Avant le push public

1. exécuter le bootstrap/reproductibilité ;
2. exécuter l’audit public ;
3. examiner les dépendances signalées par `npm audit` séparément ;
4. rotater les credentials opérationnels qui auraient pu être exposés hors Git ;
5. vérifier la cible Git distante et la branche ;
6. seulement ensuite effectuer un push explicite.

Le script d’audit ne pousse rien et ne modifie aucun remote.

## Preuve du 7 octobre 2026

Un audit de pré-clôture sur `cebf06ff` a validé :

- base upstream commune : `f9f1b2fb` ;
- 373 commits BOT MODE uniques audités ;
- 0 commit contenant une forme longue GitHub PAT/OpenAI/Google/Slack ou clé privée ;
- messages de commit : PASS ;
- fichiers `.env`, `.env.backup` ou `.env.temp` suivis hors exemples autorisés : 0 ;
- fichiers locaux non suivis au moment de l’audit : 0.

L’audit doit être relancé sur le HEAD final juste avant création de l’archive ou du dépôt public ; sa sortie finale fait foi.

## État de l'audit des dépendances au 7 octobre 2026

Avant publication, les mises à jour compatibles avec les ranges existants ont été appliquées au lockfile pour corriger notamment `proxy-addr`, le SDK MCP, `compression`, `js-yaml`, `sharp`, `undici`, `brace-expansion`, `fast-uri` et `source-map-js`. Nodemailer a été porté à 10.0.15 et sa suite SMTP ciblée passe 6/6.

`npm audit --omit=dev` ne signale plus aucune vulnérabilité critique. Il reste 9 vulnérabilités `high`, regroupées dans deux migrations qui ne sont pas forcées pendant la clôture :

- la chaîne Firebase/Firestore, dont l'intégration BOT MODE utilise Firebase App/Storage et non Firestore ; même Firebase 12.19.0 conserve actuellement une dépendance Firestore vers `@grpc/grpc-js ~1.9.0` ;
- la chaîne de build Tailwind CSS 3.x, dont le correctif proposé implique une migration majeure vers Tailwind 4.

Ne pas utiliser `npm audit fix --force` pour masquer cette dette : ces migrations doivent être traitées séparément avec tests de compatibilité complets ou une correction upstream.
