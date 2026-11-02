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
| `nativeMissionRecoveredOraclePersister.js` | KEEP | Utilisé par `initialize.js`, `client.js` et le vérificateur Oracle |
| `nativeMissionReplayReceiptProof.js` | KEEP | Utilisé par `client.js` et les contrôles de preuve |
| `nativeMissionRecoveryAuthorization.js`, `nativeMissionRecoveryHostAuthorization.js` | SHARED | Autorisations à réexaminer lors de la reprise aux frontières durables |
| `nativeMissionRecoveryCoordinator.js`, `nativeMissionRecoveryHandlerFactory.js` | SHARED | Logique de coordination potentiellement réutilisable au lot B, aucun replay réactivé |
| `nativeMissionColdRuntimeHost.js`, `nativeMissionColdGraphBuilder.js` et liaison du client | UNKNOWN | Reconstruction à ne ni réinstaller ni retirer sans qualifier les frontières durables |
| Publication et contrôle des résultats récupérés, callbacks de présentation | SHARED | Tests Oracle et publication existants en dépendent ; conservation provisoire |
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

## Verdict et suite

**Lot A : NON CONCLUANT pour PASS intégral**. Nettoyage candidate publié, aucune référence résiduelle aux fichiers supprimés observée et plusieurs protections testées. Test d’exécution de non-réenregistrement du handler ajouté. Une validation de compilation/qualification ordinaire sur la candidate reste requise avant PASS.

**Attention** : retirer le replay automatique empêche cette récupération historique ; ce retrait **ne met pas encore en place** l'état utilisateur `OUTCOME_UNKNOWN` et la reprise fiable d'étape durable. C'est l'objectif du **lot B**, qui devra réutiliser le checkpointer LangGraph/Mongo et rester fail-closed. Une mission orpheline peut encore conserver un statut durable `running` : ne pas annoncer une récupération opérationnelle.

Ne pas fusionner, ne pas publier une release et ne pas réactiver le replay fournisseur au milieu d'un appel.
