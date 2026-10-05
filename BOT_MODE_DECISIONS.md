# BOT MODE DECISIONS LOG


## 2026-09-27

### Décision

Création d'une mémoire opérationnelle durable par checkpoints.

### Pourquoi

Le projet BOT MODE dépasse la capacité d'un simple contexte conversationnel.

### Règle

Le checkpoint devient la source de reprise opérationnelle.

### Conséquence

Toute nouvelle session doit commencer par lecture du checkpoint.

## 2026-10-05 — Economic Enablement / Finom

### Statut

RETENU COMME CAPABILITY EXTERNE OPTIONNELLE — PAS UNE AUTORITÉ BOT MODE.

### Rôle retenu

Finom est classé comme fournisseur opérationnel potentiel pour freelance / entrepreneur individuel / PME : compte professionnel, IBAN français, facturation, suivi des dépenses, cartes, virements et intégrations comptables.

### Intégration BOT MODE

- Economic Enablement / Finance Ops
- facturation et suivi de paiements
- rapprochement dépenses / justificatifs
- exports ou intégrations comptables lorsque disponibles
- support aux activités Personal Shopper, conciergerie, achats PME et autres missions facturables

### Règles

BOT MODE ne délègue à Finom aucune autorité de décision. Toute action financière reste sous Policy/Auth/Budget/Risk et HITL lorsque nécessaire. L'existence d'une API exploitable directement doit être vérifiée avant toute automatisation ; les intégrations comptables annoncées ne valent pas preuve d'une API publique générale.

## 2026-10-05 — Economic Enablement / Unlockt

### Statut

RETENU COMME CANAL DE MONÉTISATION CRÉATEUR À EXPÉRIMENTER — PAS UNE DÉPENDANCE CENTRALE.

### Rôle retenu

Unlockt permet à un créateur vérifié de vendre photos/vidéos via liens payants, profil-boutique, bundles, remises, tips et analytics. Les fans peuvent acheter sans installer l'application.

### Cas BOT MODE

- monétisation d'influenceurs virtuels et créateurs IA lorsque le contenu et le compte respectent les règles de la plateforme
- vente de contenus premium, coulisses, drops, bundles et médias personnalisés
- distribution par Instagram, X, Telegram, DM et autres canaux
- mesure conversion / prix / revenu via analytics

### Contraintes

Le créateur doit être majeur et vérifié avec identité, adresse et compte bancaire concordants. Le contenu IA est traité par les règles spécifiques d'Unlockt et doit être vérifié avant déploiement. Les paiements, fiscalité, droits sur les médias, modération, disclosure de contenu synthétique et règles des réseaux de distribution restent sous Policy/Compliance/HITL.

### Décision architecturale

Unlockt appartient à Economic Enablement → Creator Monetization Providers. Il peut être proposé par le Capability Router mais ne devient ni source de vérité, ni scheduler, ni autorité de publication.
