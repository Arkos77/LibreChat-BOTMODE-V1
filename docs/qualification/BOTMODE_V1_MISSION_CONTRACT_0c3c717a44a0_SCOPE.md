# Qualification et publication candidate proposées — source 0c3c717a44a0

Source publique exacte : **0c3c717a44a044200fe4bdc72174195d5b40d713**, arbre 1cf5bac9c08fcba354d0d58741f912e010f5d238.

## Périmètre à autoriser

1. Activer le [workflow de qualification proposé](BOTMODE_V1_MISSION_CONTRACT_0c3c717a44a0_PROPOSAL.yml) sur sa branche ops dédiée, à partir de cette seule source. Construire une fois en AMD64 et une fois en ARM64. Exécuter uniquement les contrôles locaux synthétiques décrits dans le workflow, sans clé ni inférence de fournisseur réel.
2. Seulement si les deux qualifications réussissent, publier leurs images retenues sans reconstruction. Reprendre le protocole D03 éprouvé : vérifier run d'origine, checksum, source, config ID, architecture et BUILD_COMMIT ; publier uniquement ghcr.io/arkos77/librechat-botmode-v1:sha-0c3c717a44a0-amd64 et :sha-0c3c717a44a0-arm64, puis l'index :sha-0c3c717a44a0 à partir des digests immuables.
3. Contrôler les configurations distantes, les deux architectures Linux et la visibilité anonyme de l'index. Consigner les digests et résultats. Le run et les config IDs seront figés à partir des résultats de cette qualification avant activation du protocole de publication ; aucune autre source/archive n'est admissible.

## Gardes et limites

Proposition inactive, autorisation spécifique requise avant activation. Source inchangée pendant le lot, run_attempt=1, pas de replay aveugle. Une qualification échouée bloque la publication ; diagnostic préalable à toute autre tentative. Les archives des images construites sont conservées un jour, même si un contrôle ultérieur échoue, pour éviter une reconstruction inutile.

Aucune inférence réelle automatique, modèle payant, achat, rotation de clé, fusion, release, tag v* ou modification de stable/latest. Le workflow ne modifie aucune installation utilisateur et ne contient aucune information sur une machine privée. Une éventuelle opération locale se prépare séparément, en privé.

Les résultats simulés et les checks de completion ne certifient pas la vérité factuelle des réponses futures. Cet accord proposé couvre seulement les images de cette source, pas une source ultérieure.
