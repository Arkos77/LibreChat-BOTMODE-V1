# Assemblage final V1 — registre de travail

Base applicative b2213e9717b879a91181c6ac9d7607124c30258b. Aucun déploiement, merge, publication, build image ou appel fournisseur autorisé par ce document.

Décision : réutiliser les changements PR75 (91c2f5ff) et PR73 (90fa6841), absents de cette base ; aucun nouveau développement de factory persistante (#66 post-V1).

Acquis conservés : soak180,44 min au run39274101022 ; receipts locales39883796226 ; enfant préautorisé39899705393 ; selféphémère39901355206 ; stable historique39503107999. Pas de rerun par défaut.

Ruling : espace isolé supplémentaire nécessaire, car le worktree précédent contient des modifications préexistantes à préserver. Les dépendances et sorties packages existantes sont réutilisées après égalité du verrou ; aucune réinstallation globale.

Tâches : intégrer75, intégrer73 et fusionner ses traductions sans perdre les nouvelles clés ; contrôles ciblés puis une revue globale. Les preuves d'image b221 restent attachées à b221, pas transférées à l'assemblage.

Résultats locaux : contrôle de l'admission de request.js rouge avant75 (spécialiste natif autorisé rejeté), vert après intégration75. Suite75 :5PASS ; sélecteur projet existant :10PASS ; typecheck client PASS. Une erreur de format préexistante de la PR73 corrigée sans changement de comportement ; ESLint/Prettier/diff-check ciblés PASS après correction. Verrou inchangé. Pas de reprise des tests longs ni d'inférence externe.
