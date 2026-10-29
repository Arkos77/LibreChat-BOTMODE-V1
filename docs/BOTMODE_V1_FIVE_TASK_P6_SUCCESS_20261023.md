# Parcours réel gratuit cinq tâches + Oracle + P6 — 23 octobre 2026

## Résultat acquis
Run https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39877163780, job 120165439617 : SUCCESS.
Mission admise à 02:20:08 Paris, terminal à 02:21:03. Une mission uniquement, accord consommé.
Activation 8181dd0404dba5fa4a44ae7a0037ef8d9c61636d sur ops/observe-a6f6fee3c7dc-002.
Proposition revue 5e058a2ab001a9035b651ff875de152171904926; source applicative a6f6fee3c7dcfb5877fe798f759966774a046a58.
Image réutilisée du run 39870514640, sans recompilation ni publication. ID de configuration sha256:da6f786e267962eead887317ad9cb3ae5079b5c09989dead9510048e08659b8c. Archive et source vérifiées avant/après chargement.
Observateur séparé 4dbf279a9d4fcdd6a7241c244abdd75bfac42c3e, SHA256 09872c3ce6f126eda8712957fb977d495c0d69e33d918a30d00189637d74269f.

## Preuves et portée
- Source pristine exacte, lock, hashes du code dans l'image : PASS.
- Quatre tests SDK de transmission JSON dans l'image : PASS; audit installé 0 critical / 0 high / 0 moderate; notice Nodebox et SUL complète : PASS. Pas de renouvellement implicite de D02.
- Tarifs publics nuls revérifiés pour les deux routes autorisées; primaire 429 contrôlé, route de fallback réelle OpenRouter, require_parameters=true et JSON objet sur les cinq requêtes fallback.
- Plan structuré Worker + quatre spécialistes : PASS; cinq verdicts Oracle VERIFIED : PASS; terminal sans partie d'erreur, une seule trame finale.
- P6 durable de la même mission : PASS. État Redis complete, publication engagée, un seul message assistant canonique MongoDB (CI_REAL_P6_CANONICAL_ASSISTANT_COUNT=1; CI_REAL_P6_SAME_MISSION_MONGO_COMMITTED=TRUE).
- Dix requêtes HTTP observées : cinq 429 contrôlés, cinq réponses réelles acceptées. Aucun appel inattendu du primaire.
- Comparaison HTTP→Oracle : cinq JSON objets VERIFIED, jsonRequested=true et supportRequired=true. Les cinq sorties ont le même contenu/empreinte : wireMatchCount=5 et uniqueWireMatch=false pour chaque tâche. Cela prouve la présence des sorties correspondantes dans le lot HTTP mais pas une attribution unique requête→tâche.
- Nettoyage de la pile jetable : SUCCESS.

## Limites à conserver
CI_REAL_HOST_USAGE_RECEIPT=FALSE et CI_REAL_FALLBACK_RECEIPT=FALSE dans les métadonnées du message canonique. La bascule réelle est prouvée par les requêtes HTTP, mais sa receipt durable n'est pas prouvée dans ce message.
CI_LIVE_FREE_NESTED_CHILD_THREAD=NOT_OBSERVED : le plan à cinq tâches n'est pas une preuve de child externe imbriqué/dynamique. D01 et ses autres obligations restent ouverts.
Le passage de cet essai ne démontre pas rétroactivement la cause du précédent rejet JSON ou du précédent 429.
NO-GO stable reste applicable tant que l'inventaire complet et les décisions restantes ne sont pas clos. Aucun nouveau candidat GHCR, fusion, stable/latest, tag ou remplacement d'installation n'est autorisé par ce succès.
Ne pas rejouer ce parcours acquis sans nouvelle régression ou modification pertinente.

## Vérification complémentaire des receipts

Les cinq tests locaux existants de hostModelUsage.spec.js réussissent. Le code projette uniquement les événements primaires de l'agent sélectionné, avec identité fournisseur/modèle autorisée et compteurs de jetons présents. Les événements d'autres agents ou de type sequential/subagent sont exclus. Le run réel ne conserve pas dans ses traces le détail des usageEvents : la condition précise ayant supprimé la receipt n'est pas attribuable avec ces seules preuves. Aucun correctif applicatif spéculatif ni nouvelle mission n'a été lancé.

## Diffusion autorisée

Publication technique et mise à jour de l'inventaire explicitement autorisées par l'utilisateur le 23 octobre 2026. Aucun relevé du quota du compte, clé ni contenu des réponses n'est inclus. Cette autorisation documentaire ne couvre aucune nouvelle mission, publication d'image, fusion ou installation.
