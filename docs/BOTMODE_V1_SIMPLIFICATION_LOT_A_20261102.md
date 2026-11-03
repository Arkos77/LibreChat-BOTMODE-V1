# BOT MODE V1 — lot A, retrait contrôlé (2 novembre 2026)

## Sources et limites

- Décision utilisateur : commentaire PR #107 `6566855153`.
- Base de comparaison : `main` à `49503d417045b939deff61e6f2576071c542a8b5`.
- Branche candidate isolée : `simplify/botmode-v1-lot-a-20261102`.
- Release `v1.0.1` et PR #107 non modifiées, non fusionnées.
- Ancien 4C SIGKILL pendant appel externe : FAIL historique, non requalifié.

## Inventaire d'usage et décisions

| Famille | Classement | Justification |
| --- | --- | --- |
| Orchestrateur, spécialistes, Oracle, P6, outils métier | KEEP | Parcours ordinaires à conserver, sans refonte |
| `nativeMissionCapabilityAttestation.js` | KEEP | Utilisé par `request.js`, `initialize.js` et les métadonnées de mission |
| `nativeMissionRecoveredOraclePersister.js` | KEEP | Importé par `initialize.js` et utilisé via les options du client ; conserver avant qualification du lot B |
| `nativeMissionReplayReceiptProof.js` | KEEP | Utilisé par `client.js` et les contrôles de preuve |
| Les 14 modules de la chaîne de récupération à froid non reliés à des appelants de production | DELETE | Graphe d'imports sans entrée de production après retrait du handler ; inclut autorisation spéciale, coordination et assemblage, runtime froid, présentation terminale récupérée et leurs tests exclusifs |
| `nativeMissionRecoveredOracleSources.spec.js` | KEEP / ADAPT | Conserver les cas de persistance Oracle, retrait des assertions utilisant le vérificateur de reprise supprimé |
| Tests historiques du replay à froid | DELETE | Exclusifs aux composants sans appelants ; les preuves restent consultables dans l'historique Git |
| Sondes de diagnostic host/claim 4C et leurs tests | DELETE | Uniquement branchées sur les anciens modes d'audit CI |
| Assembleur original de reprise automatique `model-only` et replay dédié | DELETE | Cible la reprise automatique fournisseur incertaine abandonnée |
| Workflow `botmode-sdk-cold-sigkill-qualification.yml` | DELETE | Qualification coûteuse de récupération à froid abandonnée ; scripts génériques utiles conservés |
| Couches nouvellement ajoutées dans la PR #107 | EXCLUDE | Non fusionnées dans `main` : ne pas les importer en bloc |

## Actions réellement effectuées

1. Création d'une branche GitHub isolée depuis `main` et d'un worktree séparé sur `penguin`.
2. Suppression des deux sondes d'audit, de leurs scripts de tests et des traces d'audit dédiées.
3. Suppression de l'enregistrement au démarrage du handler historique de replay à froid.
4. Suppression de l'assembleur `model-only`, du replay dédié, de leurs scripts de tests et du workflow CI dédié.
5. Nettoyage des références et des déclencheurs YAML concernés.
6. Conservation de la règle `GenerationJobManager`: sans handler explicitement enregistré, aucune dispatch de reprise automatique n'est lancée par ce mécanisme.

Bilan au HEAD `7426540401d33a4fece1be80f8bbe86076e33682` : **14 chemins modifiés, 9 fichiers retirés, 4 lignes ajoutées, 1 264 lignes supprimées**. Aucun volume, `.env`, secret, port ni service installé n'a été changé.

## Preuves ciblées (sans Docker ni requête modèle)

- `node --check` sur les modules JavaScript `nativeMission` restants et `api/server/index.js` : PASS.
- `git diff --check` : PASS.
- Absence d'appel `setNativeMissionRecoveryHandler` dans le bootstrap et garde `handler == null` dans le gestionnaire : PASS statique, ne constitue pas un test de crash intégré.
- Régressions Node : callbacks Oracle/P6, publication durable, coordination, terminal unique, persistance des verdicts Oracle, vérification Oracle, reçus, attestation de capacités : PASS dans leurs périmètres isolés.
- `scripts/botmode/native-no-auto-cold-provider-replay-regression.cjs` : PASS, huit configurations du vrai bootstrap (Redis/non Redis, ancien réglage de reprise et audit CI). Aucune inscription du handler automatique.
- Qualification Docker **hors réseau** sur image locale déjà présente, sans construction ni appel fournisseur : `native-orphan-preflight-cadence-regression.cjs` PASS (six contrôles), transpilation TypeScript des deux fichiers modifiés PASS, parsing YAML des workflows ciblés PASS. Aucun service ni volume utilisateur monté/modifié.
- Compilation TypeScript **complète avec vérification de types** et qualification LibreChat intégrée : NON CONCLUANT (environnement de dépendances local incomplet ; non exécutées). La transpilation de deux fichiers n'est pas une vérification de types.
- Aucun test CI Docker, SIGKILL intégré ou consommation de fournisseur n'a été déclenché.


## Retrait d'orphelins supplémentaires (lot A, même branche)

Analyse par import et référence depuis les parcours hors tests : 17 modules JavaScript `nativeMission` examinés après les deux premiers commits, dont **3 avec des appelants de production** et **14 appartenant seulement à la chaîne de récupération désactivée**. Les 14 modules exclusifs ont été retirés avec 15 scripts de régression correspondants et trois tests Jest dédiés à l'ancien replay à froid. Le test mixte `nativeMissionRecoveredOracleSources.spec.js` est conservé pour ses contrôles d'autorisation, de CAS et de persistance Oracle ; les seuls cas dépendant du vérificateur supprimé ont été retirés.

Références de workflows nettoyées : test ancien `nativeMissionPresentation.spec.js` non exécutable et paramètre sans effet `BOTMODE_DISABLE_NATIVE_MISSION_RECOVERY`. Les workflows P6, Oracle et checkpoint ordinaires n'ont pas été supprimés.

Modules supprimés dans ce second nettoyage (14, aucun appelant de production confirmé dans le graphe d'import examiné) :

- Identification et autorisation exclusivement cold : `nativeMissionAuthenticatedRecoveryContext`, `nativeMissionAuthorizedClientInitializer`, `nativeMissionRecoveryAuthorization`, `nativeMissionRecoveryHostAuthorization`.
- Reconstruction et assemblage exclusivement cold : `nativeMissionColdGraphBuilder`, `nativeMissionColdRuntimeHost`, `nativeMissionRecoveredClientBinding`, `nativeMissionRecoveryCoordinator`, `nativeMissionRecoveryHandlerFactory`.
- Publication/contrôle exclusivement cold : `nativeMissionDurablePublicationStage`, `nativeMissionModelOnlyRecoveryCallbacks`, `nativeMissionRecoveredGraphOutput`, `nativeMissionRecoveredOracleVerifier`, `nativeMissionRecoveredTerminalPublisher`.

Cette qualification de non-usage se fonde sur les références de fichiers et imports statiques du dépôt ; elle ne constitue pas une preuve de l'absence de chargement dynamique externe. Les fichiers sont conservés dans l'historique Git et la release officielle reste intacte.


Tests Node encore exécutables sur le code de la candidate : garde de non-reprise automatique (8 configurations), persistance Oracle avec refus d'autorisation et de relecture contradictoire, attestation des capacités et vérification des reçus : PASS. La régression de schéma Oracle réel et le test de préflight/checkpoint ont été exécutés hors réseau dans une image existante : PASS. Références locales aux modules supprimés : aucune trouvée par le contrôle ciblé.

La build TypeScript complète et la qualification de la mission intégrée restent **NON CONCLUANTES** ; aucune relance CI ni fournisseur n'a été effectuée pour ces suppressions.

## Verdict et suite

**Lot A : NON CONCLUANT pour PASS intégral**. Nettoyage candidate publié, aucune référence résiduelle aux fichiers supprimés observée et plusieurs protections testées. Test d’exécution de non-réenregistrement du handler ajouté. Une validation de compilation/qualification ordinaire sur la candidate reste requise avant PASS.

**Attention** : retirer le replay automatique empêche cette récupération historique ; ce retrait **ne met pas encore en place** l'état utilisateur `OUTCOME_UNKNOWN` et la reprise fiable d'étape durable. C'est l'objectif du **lot B**, qui devra réutiliser le checkpointer LangGraph/Mongo et rester fail-closed. Une mission orpheline peut encore conserver un statut durable `running` : ne pas annoncer une récupération opérationnelle.

Ne pas fusionner, ne pas publier une release et ne pas réactiver le replay fournisseur au milieu d'un appel.
