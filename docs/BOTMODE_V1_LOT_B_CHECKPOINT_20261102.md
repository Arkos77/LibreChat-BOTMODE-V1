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

## Décision utilisateur confirmée — périmètre V1 figé (2 novembre 2026)

Le compromis B3 a été explicitement accepté : **conserver les résultats déjà checkpointés, ne pas reprendre automatiquement une étape dont l'appel fournisseur a une issue incertaine, et exiger une nouvelle demande explicite avec avertissement**. Le contrat V1 **ne comprend plus** la continuation automatique de la prochaine étape du graphe après SIGKILL, même quand les résultats antérieurs sont persistés. En conséquence, ce comportement ne doit plus être traité comme un test FAIL de la V1 simplifiée ; la sûreté de l'arrêt doit cependant être qualifiée.

**Preuves B3 :** commit `3f07bc50b9f3141e81069f00d23587a3df20c1fd`, run GitHub `41380463373` SUCCESS. Test MongoDB réel (en mémoire) montrant qu'une étape B déjà entrée et interrompue partage le même checkpoint que B en attente : PASS (1 test ; les 42 autres tests du fichier ne furent pas relancés). Redis de B1, garde d'absence de replay, délégation native, affichage B2 : PASS sur ce HEAD.

**Verdict corrigé pour le lot B :** contrat minimal B1/B2 et caractérisation B3 PASS dans les scénarios vérifiés ; le **lot B intégré demeure NON CONCLUANT** tant que le redémarrage effectif API + Redis/Mongo et le message visible après reconnexion ne sont pas démontrés. La conservation des sorties Mongo n'implique pas automatiquement une reprise à l'étape suivante. Ne pas affirmer une reprise fiable de B après crash.

## Passage au lot C — critères maintenus

- C1 (hors fournisseur, ciblé) : mission directe 0 spécialiste, plan et permissions 1 spécialiste, Recherche → Analyse, preuves Oracle et publication P6 validées ou refusées. Test natif et suites offline sur le HEAD exact.
- C2 : une qualification intégrée avec MongoDB et Redis, en conservant les données de l'installation actuelle intactes. Crash du service pendant appel externe → aucun rejeu, aucune publication, issue incertaine visible après reconnexion ; étape persistée A reste accessible.
- C3 : parcours LibreChat Idées → Projets → Chat, sélection 0/1/N, Oracle VERIFIED et publication P6 unique sur succès et zéro sur échec ; si un cas n'est pas testé réellement, verdict NON CONCLUANT.
- Les tests de replay automatique d'appel en plein vol 4C sont exclus. Aucune fusion/release avant autorisation explicite. Aucun appel payant.

## Lot C2 — qualification intégrée ciblée du redémarrage (candidate)

Un unique test supplémentaire est ajouté au workflow source-built existant : `native-outcome-unknown-sigkill-integration.cjs`. Il utilise un Redis et un Mongo éphémères de GitHub Actions, `RedisJobStore`, `GenerationJobManagerClass`, `getAgentCheckpointer`, `inspectDurableNativeMissionCheckpoint` et un graphe LangGraph minimal A → B. L'étape A est persistée, l'étape B entre réellement avant de se bloquer, puis son processus reçoit `SIGKILL`. Un nouveau processus charge les mêmes données et le gestionnaire intact, sans handler de replay, et vérifie la transition `running -> error / OUTCOME_UNKNOWN`, le checkpoint A conservé, aucun nouveau fournisseur/effet ni message FINAL, et l'unicité de la transition CAS.

**Limitation explicite** : c'est une qualification intégrée *du gestionnaire et de ses stores* avec graphe factice. Elle ne démarre pas le serveur HTTP/API LibreChat, ne teste pas sa reconnexion SSE dans un navigateur, n'appelle aucun modèle, et n'atteste pas Oracle VERIFIED/P6 sur une mission utilisateur. En cas de FAIL du test, examiner la preuve exacte avant tout correctif. Aucune installation locale n'est touchée.

## Lot C2 — Verdict sur source built, Mongo/Redis isolés et vrai SIGKILL (02/11/2026)

**PASS ciblé** au HEAD `566306a54a289224bfb1759a888184c6ddd896d6`, GitHub Actions run `41386087533` (SUCCESS). La CI compile les packages puis exécute exclusivement le scénario C2 : les contrôles C1/B1/B2/B3, déjà réussis sans changement de code concerné, ne sont pas répétés.

Le processus « seed » crée une génération réelle avec `RedisJobStore`, persiste l'étape A via le vrai `getAgentCheckpointer` (MongoDBSaver) et entre dans l'étape B bloquée, puis reçoit réellement `SIGKILL`. Dans un nouveau processus, `GenerationJobManagerClass.initialize()` reprend la découverte de mission sans handler de replay ; après expiration **réelle** du bail et la quarantaine de l'activité, il passe la génération à `error / OUTCOME_UNKNOWN`. Les assertions confirment un seul démarrage de B, une transition CAS finale unique, aucune nouvelle identité fournisseur, aucun `finalEvent` P6 et le même checkpoint Mongo A.

Éléments de preuve : `BOTMODE_C2_REAL_SIGKILL=PASS`, `BOTMODE_C2_REAL_SIGKILL_MONGO_REDIS_UNKNOWN_NO_REPLAY=PASS`, `BOTMODE_C2_COMPLETED_STAGE_CHECKPOINT_PRESERVED=PASS`.

La première qualification, run `41385685186`, était FAIL **du test de montage** : le script créait un namespace indépendant du namespace de génération effectivement persisté par Redis. Le second test a lu le namespace réel depuis `getJob`; la trace `C2_DURABLE_NAMESPACE_ALIGNED=false` confirme la différence initiale. Aucun correctif de logique de production n'a été nécessaire. Éviter toute nouvelle sonde du même cas sans régression.

**Limites :** graphe factice A → B sans modèle externe, processus d'exécution et gestionnaire redémarrés, mais **pas** d'API LibreChat HTTP démarrée, pas de SSE navigateur, pas de validation Oracle VERIFIED ni de publication P6 d'une vraie mission utilisateur. La preuve `finalEvent` absent concerne ce job isolé. Ces points restent pour la qualification C3/D ; ne pas transformer le PASS C2 en GO V1.

La release `v1.0.1`, `main`, les volumes Mongo/Redis de l'installation, `.env`, clés, ports et services existants n'ont pas été modifiés. La surveillance de sécurité D-02 (#37) reste active et la revue des autres vulnérabilités GitHub n'est pas clôturée.
