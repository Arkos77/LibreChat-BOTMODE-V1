# BOT MODE V1 — assemblage final qualifié, 23 octobre 2026

## Résultat et identités
Application figée : **d59dedf071d26503ec9bec5a31ee474f0ccc9724**, branche integration/botmode-final-candidate-20261023.
Arbre identique à la version relue/testée localement 0d513525321b2dc122a2b6142d49a98121a4eefc : **02f201a344c7de510c88a4daa48bf52032307e24**.
Les commits documentaires suivants ne sont pas la source applicative embarquée.

[Qualification 39923900344](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39923900344) **SUCCESS**, pilotage 90eec548d13b95b4a1619db3632e46ea59f2aacb. Une construction effective par architecture, aucune publication GHCR, inférence externe, fusion ou modification d'installation.

## Écart d'assemblage fermé
L'image b221 contenait les correctifs SDK JSON/sécurité/routage/receipts, mais pas les changements déjà développés PR75 et PR73. L'assemblage ajoute seulement :
- PR75 : admission des spécialistes depuis le graphe authentifié initialisé ; le contrôle du bloc réel request.js rejetait le spécialiste natif autorisé avant intégration et l'admet après. Worker, spécialistes inconnus et tâches forgées restent contrôlés.
- PR73 : dialogue existant de création/renouvellement de clé et liens officiels autorisés ; six traductions FR/EN ajoutées sans remplacer les nouvelles chaînes de sélection BOT MODE. Une correction de format JSX seulement.

Cinq tests PR75, dix tests du panneau projet, typecheck client, ESLint/Prettier ciblés et diff-check PASS. Revue indépendante de toute la différence : aucun constat Critical/Important/Minor ; revue de source, pas un substitut aux tests conteneur.

## Preuves de l'image
| Architecture | Job | ID de configuration local (pas digest de registre) |
|---|---|---|
| AMD64 | 120315491048 | sha256:0944fb0d7e5f4d4ddcd418800bf446d8c8c29e09eaf691680ec18c522ddf21f2 |
| ARM64 | 120315490564 | sha256:f8ba4b3f6cac772a8a1b5f63c7c6a6911bd5373496a82d204136af57fc9dff83 |

Les deux vérifient BUILD_COMMIT, architecture native, empreintes des six fichiers applicatifs/test modifiés, cinq tests d'admission depuis l'image, présence du portail dans les assets réellement compilés et notice/licence SUL complète.

AMD64 vérifie aussi : six agents provisionnés sous authentification, spécialiste imposé par un plan durable avec étapes corrélées, cinq tâches natives séquentielles et cinq verdicts Oracle VERIFIED, rejet HUMAN_REVIEW sans publication, lignée enfant archivale au redémarrage, sélections UI auto/manuelle autorisées, puis publication P6 MongoDB de la même mission navigateur.

Les compteurs CI_STRICT_FAILED_COUNTER / NONCANONICAL sont des diagnostics du test SINGLE planifié : il vérifie un nœud spécialiste direct et ses événements corrélés, pas un appel natif subagent. Ne pas transformer ces traces en preuve d'enfant externe ou d'événements SSE enfant.

Le fournisseur est local et synthétique, les routes du bootstrap forcées en loopback ; hostModelRouting isolé/désactivé dans ce parcours. Aucun secret de fournisseur réel. Les receipts et le self renforcé acquis sur b221 restent attachés à leurs runs ; leurs modules ne changent pas dans cet assemblage, mais aucun nouveau receipt fournisseur externe n'est revendiqué.

## Acquis conservés sans replay
- Soak 39274101022 : 180,44 minutes. Le corps du test est exactement identique (SHA256 95489dfe8839bac52dd0d77fb8526144c2a98b215875ac52869b010eb18c8f91), ainsi que configuration, faux modèle, stores/manager streaming, compilateur et planificateur natifs. Aucun nouveau soak.
- Garde update-quiescence et fence de dépenses RAG : blobs identiques à la source stable 59598c2f4e333c256296bbb8c6f45a024832745b ; ne pas rouvrir ces composants à partir d'issues historiques non actualisées.
- Receipt locale 39883796226 ; enfant autorisé 39899705393 ; self éphémère 39901355206 ; stable historique 39503107999.
- Factory persistante supplémentaire : post-V1 selon #66. Pas de nouvelle exigence bloquante.
- Le SDK a aussi été sondé hors ligne avec le provider résolu par le manifeste livré (openrouter) : fallback HTTP local PASS. L'hypothèse qu'il fallait modifier ce manifeste n'a pas été confirmée ; aucune configuration produit changée sur cette hypothèse.

## Dispositif et artefacts
Premier pilotage [39923629759](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39923629759) rejeté par le parseur Actions avant tout job : littéral Python ressemblant à une expression Actions. Actionlint reproduit le rejet, puis accepte le correctif ; shell et Python imbriqué vérifiés. Aucun build dans ce premier essai.

Images conservées un jour pour éviter toute reconstruction :
- ARM64 : artefact 12488777592, botmode-final-d59dedf071d2-arm64-39923900344, expire le 24 octobre 2026 à 10:27:35 Paris.
- AMD64 : artefact 12488284884, botmode-final-d59dedf071d2-amd64-39923900344, expire le 24 octobre 2026 à 10:30:45 Paris.
Chaque archive contient final-image.tar.gz, checksum, ID image et source. Nettoyage des stacks/volumes de runners SUCCESS.

## Proposition D03 présentée avant autorisation (historique)
[Proposition inactive](BOTMODE_V1_D03_d59dedf071d2_PROPOSAL.yml), hors Actions : réutiliser seulement ces archives, vérifier source/checksum/config ID/architecture, publier deux tags d'architecture propres à d59 puis l'index sha-d59dedf071d2 à partir de leurs digests immuables, vérifier sa visibilité anonyme. Aucun build, modèle, stable/latest, fusion ni installation dans cette proposition. Syntaxe Actions, shell et Python PASS.

L'accord spécifique de cette source a ensuite été reçu et exécuté ci-dessous. L'installation Chromebook reste séparée : préparer sauvegarde, quiescence, espace et conservation des configurations locales avant toute bascule. Cette qualification ne retire pas la stable historique et ne constitue pas un GO stable global de la nouvelle candidate.

## D03 candidate autorisée et publiée — 23 octobre 2026

Accord utilisateur reçu après présentation de la proposition figée f189ac947311ac3d9b81b2660fbb20c9c493e2bf. Activation exacte sur ops/publish-d59dedf071d2-approved, commit pilote eb20b62342d5848880e145d419f1c5f9de8558d9, départ de la source applicative d59dedf071d26503ec9bec5a31ee474f0ccc9724.

[Publication 39926287063](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39926287063) **SUCCESS** : restauration des archives déjà qualifiées 39923900344, checksum/source/configuration/architecture contrôlés, aucune reconstruction ni inférence.

| Objet publié | Digest immuable |
|---|---|
| Index sha-d59dedf071d2 | sha256:2eb9e3714beda2603ce7efdff2c9fde581ab236dc0b4495a6156856f0757f685 |
| AMD64 sha-d59dedf071d2-amd64 | sha256:c14d9192a01877fd6de06053cc0d0a3d504b3653358d65c4d30662dcfe4611ff |
| ARM64 sha-d59dedf071d2-arm64 | sha256:d8d282d6d8fea5af02d7482661093f3046de8a92ef13f2703315c49282885f9f |

Référence : ghcr.io/arkos77/librechat-botmode-v1@sha256:2eb9e3714beda2603ce7efdff2c9fde581ab236dc0b4495a6156856f0757f685.

Jobs AMD64 120323371123, ARM64 120323371494, index 120329380382 : SUCCESS. Le job index vérifie les configurations distantes des deux manifests contre les ID qualifiés, assemble leurs digests, supprime l'authentification puis vérifie publiquement les plateformes Linux AMD64 et ARM64 : CANDIDATE_PUBLIC_TWO_ARCH_INDEX=PASS. Nettoyage d'authentification réussi. Preuve index/digest : artefact 12490147943, candidate-d59dedf071d2-publication-proof, conservé jusqu'au 30 octobre 2026 à 08:55:35 UTC.

Le transfert ARM64 a pris plus longtemps ; aucune relance ni seconde compilation. Stable/latest, releases, fusion et installation restent inchangés. D03 est clos uniquement pour cette candidate ; ceci ne transforme pas les limites de qualification en preuves supplémentaires ni en GO stable global.

Installation suivante à préparer séparément : préserver les modifications locales, sauvegarder configurations et données, vérifier espace et quiescence, utiliser le digest immuable, garder un retour arrière. Aucun effacement, arrêt ou basculement du Chromebook autorisé par cet accord D03.

## Installation locale de la candidate — 23 octobre 2026

Après accord de poursuite de l'installation puis nettoyage ciblé autorisé, la candidate d59 est installée sur l'instance de travail locale, port 3081, via le digest immuable sha256:2eb9e3714beda2603ce7efdff2c9fde581ab236dc0b4495a6156856f0757f685. La stable publique n'est pas promue et l'ancienne instance locale du port 3080 reste intacte.

Préparation : configurations et modifications locales sauvegardées ; copie locale d'une image historique inutilisée supprimée seulement après vérification de sa disponibilité publique par digest ; cache de téléchargements npm vidé. Aucun dossier de travail, volume, donnée ou conteneur ancien supprimé. Environ 5,2 Go libérés, puis image candidate récupérée ; environ 4,0 Go restent libres après installation.

Docker local utilise le magasin containerd : image inspect Id est ici le digest d'index, pas le digest de configuration attendu en CI. Le premier contrôle fondé sur cette égalité a donc échoué avant toute bascule. Vérification corrigée dans le seul dispositif d'installation, sans changement applicatif : SHA256 index et manifest AMD64, blob de configuration 0944fb0d… attendu, toutes les diff_ids RootFS locales, environnement, Entrypoint, Cmd, architecture et BUILD_COMMIT correspondent exactement. Aucun relâchement de provenance.

Seule l'API de travail a été arrêtée ; garde update-quiescence PASS, Redis non configuré. Sauvegarde MongoDB sous arrêt de l'API et archive des volumes applicatifs effectuées et vérifiées en lecture, empreintes conservées localement. Remplacement de l'API seule, mêmes volumes et port ; épinglage du digest dans BOTMODE_IMAGE, librechat.yaml et modification locale du bootstrap préservés. Image précédente conservée pour retour arrière.

Contrôles après démarrage : /readyz, /health, /api/config et page d'accueil HTTP 200 ; conteneur actif sur la référence exacte ; comptes/conversations/messages/agents inchangés. Cette vérification HTTP ne revendique ni nouveau parcours navigateur authentifié ni mission fournisseur réelle. Aucun appel modèle, reconstruction, fusion, tag stable/latest ou promotion globale. Les sauvegardes et métadonnées privées restent sur la machine ; aucune clé/configuration personnelle publiée.

Cet état remplace les mentions précédentes d'installation en attente pour cette instance uniquement. Les limites fonctionnelles et décisions globales de release restent celles de l'inventaire.
