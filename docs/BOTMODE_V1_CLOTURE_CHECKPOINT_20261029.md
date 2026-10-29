# BOT MODE V1 — Checkpoint de clôture sur la release publique v1.0.1

**Date :** 29 octobre 2026 (Europe/Paris). **Référence :** `Arkos77/LibreChat-BOTMODE-V1`.

**Objet :** actualiser l'[inventaire maître du 18 octobre](BOTMODE_V1_INVENTAIRE_MAITRE_20261018.md) sans effacer les décisions, les exigences et les preuves historiques. Ce checkpoint plus récent fait foi **uniquement** sur les critères et périmètres explicitement vérifiés ci-dessous. Aucun GO fonctionnel universel n'est accordé.

## 1. Identités et protection de release

| Objet | Identité vérifiée |
| --- | --- |
| Source applicative **publiée** et tag immuable `v1.0.1` | `1478fb34e15e1bad7c07e4928ee8812e47bea064` |
| OCI AMD64+ARM64 / `stable` / `latest` déjà publiée | `ghcr.io/arkos77/librechat-botmode-v1@sha256:97e74b9b780c6a8742a6427c49378583f4b8a4213ec43877181372852b6cf5e2` |
| Dernier commit **pilotage/workflows**, différent du runtime | `main=3ab6831204a3f5d960c6c9e13455171426b210f1` |
| GitHub Release | [v1.0.1](https://github.com/Arkos77/LibreChat-BOTMODE-V1/releases/tag/v1.0.1), publiée, non-prerelease |
| Source détaillée de publication | [Décision D-04 du 29/10](BOTMODE_V1_D04_V101_RELEASE_DECISION_20261029.md) |

Ne jamais déplacer le tag, retagger `stable/latest`, reconstruire l'OCI pour ce seul checkpoint, toucher aux appareils ou assimiler un nouveau SHA documentaire à une nouvelle image validée.

## 2. Matrice de preuves mises à jour

| Obligation | Verdict | Preuve et limite exacte |
| --- | --- | --- |
| Distribution publique, provenance OCI multiarchitecture | **PASS** | [Publication AMD64/ARM64 #40818813544](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40818813544), [promotion D-04 #40824924363](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40824924363), tag/release vérifiés |
| Installation Lite depuis GHCR sur **runner jetable**, auth, ACL, six agents via **API native de setup**, persistance après redémarrage | **PASS dans ce périmètre** | [Run #40819675546](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40819675546), `CI_FRESH_INSTALL=PASS`, `CI_BOTMODE_NATIVE_SIX_AGENTS_CREATED=PASS`, `CI_BOTMODE_NATIVE_ACL_DELEGATION=PASS`, `CI_BOTMODE_NATIVE_SETUP_DURABLE=PASS` |
| Les six agents apparaissent automatiquement **dès inscription**, sans action supplémentaire | **NON DÉMONTRÉ** | Dans ce même run, **avant** `POST /api/agents/botmode/setup`, `CI_FIRST_USER_AGENTS_PRESENT=0`, `CI_FIRST_USER_AGENT_ONBOARDING=INCOMPLETE` ; le setup explicite les crée ensuite (six), puis est idempotent. Tester séparément le vrai parcours UI/mission qui peut appeler le setup |
| Fournisseur réel gratuit, délégation **foreground** non forcée, résultat enfant remis au parent | **PASS** | [Run #40901989622](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40901989622), `CI_NATIVE_REAL_FOREGROUND_PROVIDER_CHILD_PARENT_CYCLE=PASS`, 3 appels HTTP200, `tool_choice=auto`, `simulated=false`, aucun paiement |
| Oracle vérifie la mission exacte et P6 publie **une** réponse parent durable | **PASS pour mission synchrone réelle** | Même [run #40901989622](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40901989622), `CI_NATIVE_REAL_SAME_MISSION_ORACLE_VERIFIED=PASS`, `CI_NATIVE_REAL_P6_SINGLE_PUBLISHED_MESSAGE=PASS`, relecture Mongo `TRUE` |
| Restart API après Oracle/P6, reçus inchangés et message parent lisible | **PASS pour même mission** | Même run : `CI_NATIVE_REAL_FOREGROUND_API_RESTART=PASS`, `CI_NATIVE_REAL_ORACLE_P6_SURVIVES_API_RESTART=PASS`, `BOTMODE_REAL_FREE_FOREGROUND_PROVIDER_CHILD_ORACLE_P6_RESTART=PASS` |
| Enfant **détaché** `run_in_background=true` : création / terminaison durable avec fournisseur réel | **PASS partiel historique** | [Run #40867706382](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40867706382) : appel outil réel, conversation enfant Mongo, états `running → completed`. Aucune conclusion de publication finale du parent |
| Enfant détaché → attente du parent → **wakeup automatique** → nouveau tour parent → Oracle VERIFIED → P6 unique et durable | **NON CONCLUANT / NON PROUVÉ de bout en bout** | Les runs [#40871987932](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40871987932) et [#40877938711](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/40877938711) mêlaient contrat asynchrone et acceptation Oracle **sur le premier tour** ; refus Oracle constaté, sans preuve de la continuation ultérieure. Des tests de composants de `subagentCompletionWakeup` existent, mais ne valent pas exécution réelle de l'ensemble |
| Parcours Chromebook **physique** Penguin, installation/mise à niveau Lite, UI Idées/Projets/Chat | **NON EXÉCUTÉ sur v1.0.1** | Le run GHCR sur GitHub ne prouve ni la compatibilité pratique avec cette machine, ni ses volumes existants, ni la navigation utilisateur. Ne pas la modifier sans accord explicite et sauvegarde adaptée |
| Sélection autonome **0/1/N** et cinq spécialités en mission complète (Recherche, Analyse, Code, Documents, Rédaction) | **PARTIEL** | Scénarios unitaires / fixtures / missions mono-spécialiste déjà acquis ; aucune preuve unique récente couvrant les cinq rôles réels et leur Oracle/P6. Ne pas les requalifier automatiquement à partir du mono-spécialiste |
| Free fallback 429, autres fournisseurs, Full RAG / migrations / paquets OS | **CONDITIONNEL ou NON CONCLUANT selon périmètre D-01** | Ne pas généraliser un modèle OpenRouter gratuit à tous les modèles, clés, outils ou configurations. Les validations historiques gardent leur identité SHA et scénario |
| Sécurité D-02 (mammoth/argparse/sprintf-js) | **Acceptation temporaire, pas un correctif** | Décision humaine jusqu'au **18 novembre 2026, 23:59 Paris** ; réexamen prévu au 16/11 ([issue #37](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/37)). Ne pas oublier les nouvelles vulnérabilités publiées |

**Attention à un libellé CI hérité :** le run synchrone #40901989622 affiche `CI_NATIVE_REAL_CHILD_SSE_CORRELATED=PASS` alors que les compteurs `on_subagent_update` sont à zéro. **Ne pas citer ce marqueur comme preuve d'événements SSE**. La vraie preuve synchrone vient de `CI_NATIVE_REAL_FOREGROUND_PROVIDER_CHILD_PARENT_CYCLE=PASS` et des reçus Oracle/P6. Un sous-agent foreground ne doit pas être validé sur les assertions de thread Mongo **détaché**.

## 3. Lots restants, dans l'ordre, sans rejouer les PASS

### A — Continuation asynchrone native (blocage fonctionnel ciblé)

1. **Hors fournisseur et hors publication :** exploiter les composants existants `subagentCompletionWakeup`, `subagentDelivery` et les tests d'intégration cross-replica / multi-process. Construire **un** scénario de continuation honnête : le parent achève le **premier tour sans publier comme si l'enfant avait été reçu** ; le résultat enfant est persisté ; la livraison wakeup est réclamée une seule fois ; un **second tour** natif du Worker consomme le résultat.
2. Contrôles négatifs indispensables : pas de double claim, parent encore actif → attente sans perte, réessai idempotent, cancellation, isolement de l'utilisateur et de la tâche, refus Oracle si candidat absent.
3. Un essai réel OpenRouter **uniquement si la fixture locale permet d'attribuer un futur FAIL** et après autorisation spécifique, préflight zéro prix/quota, nombre de requêtes plafonné et journal expurgé. PASS seulement si **wakeup réellement consommé, nouveau tour du parent, Oracle VERIFIED et une seule publication P6** vérifiés avant/après redémarrage. Ne pas relancer le test foreground #40901989622.

### B — Parcours utilisateur Lite Chromebook (intervention distincte, protégée)

Confirmer d'abord l'état réel de la machine, les volumes/config existants, les ports et la sauvegarde. Préparer un parcours de non-régression **sans écraser l'installation actuelle** : connexion, sélection/auto-setup d'agents au premier usage, 0/1/N selon demande, interface Chat/Idées/Projets, consultation du résultat, panneau déroulant, redémarrage. Une validation GitHub sur machine jetable ne remplace pas ce parcours. **Toute mutation sur Penguin nécessite une autorisation explicite sur la machine et la procédure de sauvegarde.**

### C — Arbitrage final D-01 et registre d'exigences non couvertes

L'inventaire maître ([IN-**, OR-**, PC-**, SE-**, UX-**](BOTMODE_V1_INVENTAIRE_MAITRE_20261018.md)) conserve **toutes** les obligations V1 précédentes ; ce checkpoint ne supprime ni la factory sous mandat, ni le contrôle des coûts/fallback, ni les exigences UI, sécurité, mémoire et RAG. Pour les capacités non qualifiées, **soit produire l'E2E adapté, soit documenter la limite de support et demander l'arbitrage D-01**. Une fonctionnalité non prouvée ne devient pas « hors scope » sans décision explicite.

## 4. Politique de clôture

- **PASS / FAIL / NON CONCLUANT** par scénario, SHA, image, modèle et état externe ; **SKIPPED ≠ PASS**.
- Ne pas redémarrer un gate PASS en l'absence d'une régression motivée.
- Aucune nouvelle release, nouvelle image ou dépense ; aucun déclenchement CI réel sur simple commit documentaire.
- Pour les prochaines actions, utiliser [la méthode de clôture du 23 octobre](BOTMODE_V1_METHODE_CLOTURE_20261023.md), [l'inventaire maître](BOTMODE_V1_INVENTAIRE_MAITRE_20261018.md) et le suivi [issue #17](https://github.com/Arkos77/LibreChat-BOTMODE-V1/issues/17).

**Décision consolidée :** **GO déjà exécuté pour la distribution officielle v1.0.1** ; **PASS de la mission synchrone OpenRouter/Oracle/P6** ; **pas encore de certification fonctionnelle universelle de tous les chemins BOT MODE V1**. Les suites asynchrones et l'acceptation matérielle doivent garder leur verdict propre.
