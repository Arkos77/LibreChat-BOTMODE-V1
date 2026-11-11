# BOT MODE V1.0.6 — Identité visuelle MJK V10

**Statut :** habillage local reproductible, versionné séparément sur `main`. Cette personnalisation ne modifie ni le tag historique `v1.0.6` ni l'image OCI officielle. La qualification de la release ne s'étend pas automatiquement aux nouvelles personnalisations.

## Périmètre

- Flamant rose MJK avec halo, logo supérieur et icônes d'application.
- Formulaire de connexion BOT MODE, police personnalisée, champs harmonisés.
- Thèmes **sombre** (bleu nuit, violet, rose) et **clair** (lavande), avec contrastes corrigés.
- Barre latérale, projets, chat, composer, paramètres et panneaux de mission.
- En bas à gauche, **initiales réelles de l'utilisateur connecté** (avatar généré), recolorées dans l'esprit du logo ; les photos personnelles ne sont pas recolorées.
- Responsive : prétests 320, 390, 768 et 1280 px, et bascule clair/sombre.
- `APP_TITLE=BOT MODE` et `CUSTOM_FOOTER` avec libellé V1.0.6.

Les textes de conversation, les agents, la sécurité, les permissions et les volumes ne font **pas** partie de la personnalisation. Les anciennes conversations intitulées « New Chat » restent inchangées. Des traductions intégrées de LibreChat peuvent demeurer en anglais.

## Compatibilité

Cette distribution d'assets est **figée pour l'image V1.0.6**, digest :

`sha256:e3640ac10833e4743796589b53d8a935d94867d73b0c25e82b4e7e1eba985cdb`

Les assets comprennent un `index.html` lié à cette version de l'application. **Ne pas les réutiliser sur une autre version sans revalidation.** Les systèmes Linux AMD64/ARM64 sont qualifiés pour l'image de base ; les vérifications ci-dessous portent sur les installations locales Chromebook Crostini AMD64 et MacBook Xubuntu AMD64. Pas de nouvelle qualification de macOS natif ou de Windows.

## Installation sans compiler l'application

Depuis la racine du dépôt, après avoir sauvegardé les configurations, les données et les inspect Docker :

```bash
mkdir -p "$HOME/.local/share/botmode-branding/v10"
cp -a branding/mjk-v10/assets/. "$HOME/.local/share/botmode-branding/v10/"
python3 scripts/branding/render-v10.py
```

Ce rendu crée seulement `~/.local/share/botmode-branding/v10/override.yml` avec des chemins absolus propres à l'utilisateur courant. Il n'écrit aucune clé ni configuration secrète dans Git.

Pour une installation **Docker Compose**, toujours procéder par l'instance de test (3081), vérifier le rendu en session réelle, puis seulement l'instance principale (3080). Les noms ci-dessous reflètent les installations locales existantes :

```bash
# Chromebook : instance de test d'abord
python3 scripts/branding/deploy-v10-compose.py --container botmode-v100-test-api-1 --port 3081 --confirm
# Vérifier puis appliquer au principal
python3 scripts/branding/deploy-v10-compose.py --container librechat-botmode-api-1 --port 3080 --confirm

# Mac Xubuntu : instance Compose de test
python3 scripts/branding/deploy-v10-compose.py --container botmode-v1-mac-litepp-api-1 --port 3081 --confirm
```

**Mac 3080, conteneur standalone en réseau `host` :** le service `LibreChat-BOTMODE-FINAL` n'est pas sous Compose. Pour ce seul environnement, utiliser `scripts/branding/deploy-v10-host-mac.py` après inspection de la configuration et validation de 3081. Ce script conserve les six montages de données, remplace les neuf montages d'assets, sauvegarde l'inspection et crée un conteneur de secours arrêté pour retour arrière. **Ne pas l'exécuter une seconde fois** si le conteneur V10 est déjà installé.

Ces scripts agissent uniquement sur le service applicatif API choisi, sans `docker compose down -v`, sans `docker volume prune` et sans mise à jour de JARVIS/GRIOT ou PangaraBOT.

## Vérification

```bash
for port in 3080 3081; do
  curl -fsS -o /dev/null -w "$port: HTTP %{http_code}\n" "http://127.0.0.1:$port/login"
  curl -fsS "http://127.0.0.1:$port/login" | grep -q 'botmode-visual-skin-v10'
  curl -fsS "http://127.0.0.1:$port/assets/logo.svg" | grep -q MJK
done
```

Puis **test humain connecté**, en mode sombre et clair : vérifier les initiales du compte en bas, le flamant MJK en haut, les menus de navigation, la saisie, les projets et les fenêtres de paramètres. Les tests CSS isolés ne prouvent pas à eux seuls la totalité des interactions authentifiées.

## Retour arrière et précautions

- Les scripts enregistrent l'inspection et les traces de migration dans `~/BOTMODE-BACKUPS/pre-v10-rollout-20261111/` (dossier privé).
- Compose : reprendre les fichiers de composition et les surcharges précédents enregistrés dans l'inspection et recréer **uniquement** `api`. Le script tente automatiquement ce retour arrière en cas d'échec.
- Mac 3080 standalone : l'ancien conteneur est conservé **arrêté** sous `LibreChat-BOTMODE-FINAL-pre-v10-rollout-20261111`. Il permet le retour arrière après arrêt du nouveau conteneur et restauration du nom.
- Ne jamais partager les `.env`, inspections Docker complètes ou sauvegardes MongoDB sur le dépôt public.
- Le checkpoint Git n'altère pas les validations antérieures de la release ni les restrictions de sécurité existantes.

**Méthode :** CONSERVER → RÉUTILISER → ADAPTER → REMPLACER → CRÉER en dernier recours. Pas de changement de données, pas d'achat de modèle, pas d'empilement de services.
