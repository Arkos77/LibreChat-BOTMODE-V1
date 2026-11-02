# BOT MODE V1 — Lot B : frontières durables et issue incertaine

Date : 2 novembre 2026. Branche candidate `simplify/botmode-v1-lot-a-20261102`, sans fusion ni nouvelle release.

## Objet de ce premier sous-lot

Le bootstrap V1 n'enregistre plus de handler de reprise automatique d'appel fournisseur. Il faut empêcher une mission devenue orpheline après SIGKILL de rester indéfiniment présentée comme `running` quand son appel fournisseur n'est plus vivant.

La V1 exploite ses protections existantes : identification de génération, namespace Mongo checkpoint, lease Redis fondé sur l'horloge serveur, quiescence, claim exclusif et transition CAS `running -> error`. Aucun modèle ni outil n'est relancé.

## Comportement ajouté

- La boucle d'inspection déjà présente reprend ses relevés à l'initialisation Redis et aux balayages existants ; **aucun timer ou service supplémentaire**.
- En absence de handler d'exécution automatique, l'observation se limite aux missions avec checkpoint durable correspondant, statut `running`, fournisseur initial démarré, `providerDrained=false`, bail expiré et délai d'inactivité respecté.
- Le `claimCheckpointedOrphanForInspection` existant vérifie l'absence de lease actif puis réinspecte le même checkpoint Mongo ; si l'éligibilité est confirmée, une transition CAS de génération **enregistre** `status=error`, `error=OUTCOME_UNKNOWN`, `completedAt`.
- Si le fournisseur a gagné entre-temps le CAS final, le changement est refusé. Si la génération, le plan, le checkpoint ou l'identité fournisseur changent, aucun changement de statut n'est effectué. Le claim est relâché.
- Aucune reprise de modèle, outil, Oracle, publication P6 ou création de nouvelle génération n'est déclenchée par ce chemin.

## Preuves limitées

- Script `scripts/botmode/native-outcome-unknown-regression.cjs` : les méthodes réelles du gestionnaire TypeScript sont extraites, transpilées et exécutées avec un store et des leases simulés ; cas de succès unique, détection de doublon, bail non acquis, génération remplacée, plan manquant, checkpoint modifié, CAS perdu et store incapable. **Les baux et l'atomicité Redis sont des primitives existantes, pas retestées en réel par ce script.**
- Test de préflight historique : absence de handler/store sans action, single-flight, cadence, filtrage : PASS ciblés sur la version modifiée.
- Le workflow existant `botmode-v1-native-subagent-contract.yml` exécute désormais les deux tests de non-replay après compilation, sans création d'un second workflow.

## Limites et suites impératives

**Ce sous-lot ne valide pas encore le lot B entier** :

1. La détection ne couvre pas les missions privées de checkpoint durable initial, les situations où l'état Redis a déjà expiré, ou les anciennes générations hors protocole ; ne pas prétendre qu'elles sont toutes classées automatiquement.
2. `OUTCOME_UNKNOWN` est conservé comme erreur de job Redis selon sa politique de rétention existante. Ce code doit encore être présenté clairement dans l'interface avec un avertissement de coût et de duplication avant **toute** nouvelle tentative explicitement demandée.
3. La reprise automatique des **étapes suivantes déjà autorisées** depuis un checkpoint certain n'est **pas implémentée**. Aucune continuation n'est autorisée en cas d'appel externe incertain ; il faut une preuve des frontières et des permissions.
4. Des tests intégrés sur Redis/Mongo réels restent requis avant d'affirmer la sûreté du chemin SIGKILL ; les tests unitaires du gestionnaire n'en sont pas la preuve.
5. Les protections Oracle/P6, identité utilisateur/tenant/agent et le checkpointer existant ne sont pas modifiés par ce sous-lot.

**Verdict :** sous-lot B1 en qualification ; lot B global = NON CONCLUANT avant essais intégrés. La release `v1.0.1` reste inchangée.

## B2 — Retour utilisateur et consentement avant une nouvelle tentative (candidate)

- L'erreur SSE persistée `OUTCOME_UNKNOWN` est interprétée par le composant de message d'erreur existant. Le libellé localisé en français/anglais informe que l'appel précédent peut avoir abouti et qu'une relance peut consommer du quota, entraîner des coûts ou répéter des effets externes.
- Les deux chemins existants d'actions sur les messages (optimisé et historique) interceptent `Régénérer` **uniquement** pour les messages d'erreur ayant exactement le code `OUTCOME_UNKNOWN` ; une confirmation explicite est exigée. Les autres erreurs ne changent pas de comportement.
- Les tests Jest du client vérifient l'affichage localisé et la confirmation acceptée/refusée. Le workflow ciblé de la branche compile toujours les packages et lance ces tests, sans outil nouveau ni autre workflow.
- Cette confirmation est une protection d'interface, pas une autorisation serveur de rejouer un appel incertain. Une soumission explicite nouvelle passe par les contrôles normaux LibreChat ; aucun mécanisme ne reprend la même exécution.
- La rétention Redis existante limite la durée de disponibilité de la preuve `OUTCOME_UNKNOWN` ; il ne faut pas annoncer une conservation permanente de cet état. Les essais de SIGKILL intégrés Mongo+Redis et la reprise automatique aux frontières certaines restent hors de ce sous-lot.

## B3 — Frontière durable : vérification de sécurité avant toute reprise

L'analyse du runtime existant confirme la distinction suivante : le dernier état Mongo peut préserver la sortie de l'étape A et indiquer B dans `snapshot.next`, **même si B avait déjà commencé et échoué lors d'un appel externe**. La présence du même `checkpoint_id` et de B dans `next` n'établit pas que B n'avait pas commencé. Une invocation `graph.invoke(null, ...)` peut réexécuter B depuis le début (comportement LangGraph documenté et déjà observé dans `checkpointer.integration.spec.ts`).

La vérification `B3 safety: a checkpoint head cannot distinguish pending from already-started provider execution` exécute A puis bloque B après son entrée ; elle compare l'état Mongo pendant B et après son échec, puis vérifie le préflight read-only. **Ce test ne lance aucune continuation** et ne crée aucun appel fournisseur externe.

**Décision de sécurité pour B3 :** en l'absence de reçu distinct prouvant que l'étape suivante n'a jamais commencé, l'état du checkpoint **ne suffit pas** pour autoriser une reprise automatique. La branche V1 conserve la politique B1 : `OUTCOME_UNKNOWN` après constat d'abandon, aucune continuation automatique ni publication. Le checkpoint et les sorties des étapes achevées restent préservés par Mongo, mais cela ne prouve pas une reprise automatique complète.

Il faut choisir pour la suite entre : (a) clôturer V1 avec reprise manuelle explicite sur nouvelles générations, sans garantie de continuation automatique des étapes restantes ; ou (b) ajouter un mécanisme durable d'admission de chaque étape avant l'appel externe. **La variante (b) ajoute de la complexité et ne doit pas être engagée sans décision utilisateur.**

**Verdict B3 :** test Mongo en qualification ; reprise autonome de la prochaine étape = NON CONCLUANT / non autorisée sur cette architecture. Aucun changement du moteur de production dans ce sous-lot.
