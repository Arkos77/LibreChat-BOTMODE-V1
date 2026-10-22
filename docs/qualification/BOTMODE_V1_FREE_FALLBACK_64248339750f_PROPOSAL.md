# Proposition de qualification réelle — exécutée une fois après accord explicite

Source exacte : **64248339750f9e0f86e01530eb7067027cec8f6b**. [Preuves sans fournisseur réel](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39846965864) : SUCCESS, AMD64 et ARM64.

## Accord demandé pour le prochain lot

Une seule mission native API à cinq tâches de test, sur runner jetable. Contrat : préparer la réponse puis vérifier l'étape précédente, chaque tâche retournant strictement `{"ok":true}`. Worker puis quatre nœuds dépendants réutilisant le spécialiste autorisé ; cela ne représente pas quatre nouveaux agents ni quatre threads enfants.

- Primaire autorisé : `google/gemma-4-31b-it:free`. Son erreur HTTP 429 est produite par une fixture locale avant tout jeton : **pas une affirmation de quota réel OpenRouter**.
- Fallback externe réel : `openrouter/free`, via l'adaptateur compatible déjà contrôlé.
- Clé existante : secret GitHub OPENROUTER_API_KEY, masqué et chargé uniquement pour cette étape.
- Catalogue public : modèles et prix prompt/completion/request/reasoning nuls revalidés avant l'appel ; politique free_only et deux bindings stricts.
- Données uniquement synthétiques, aucun compte/volume utilisateur, modèle payant, achat ou rotation de clé.
- Une seule admission de mission avec fournisseur externe, durée bornée par le harnais ; reprise éventuelle du même SSE sans nouveau POST. Workflow non rejouable pour générer une seconde mission.
- PASS attendu : 429 contrôlé réellement observé, cinq tâches natives identifiées, cinq verdicts durables VERIFIED, terminal sans partie error et un seul message assistant canonique relu en Mongo pour la même mission. Les receipts sont inspectés sans transformer une absence en preuve positive.
- Quota indisponible ou échec Oracle : classer le résultat réel, pas de répétition identique ni critère assoupli.

Le YAML voisin est une **proposition inactive hors du répertoire Actions**, avec un seul job AMD64. Les gates synthétiques déjà acquis ne sont pas redemandés ; seul le bootstrap jetable nécessaire à la mission est repris. Un build local non publié du même source reste nécessaire dans le nouveau runner, car les images précédentes ont été nettoyées. Le lanceur, les patches temporaires de configuration, les deux URLs, l'allowlist du 429 et les compteurs ont été contrôlés hors ligne.

## Frontières conservées après cet accord

| Décision | État |
|---|---|
| D-01, portée V1 restante | Aucune exigence déclassée sans accord. Nested child externe, création dynamique réelle sous mandat, endurance/HITL longue durée, TTS FR/renouvellement de clé/mobile manuel et limites Full/migrations restent à arbitrer ou prouver selon la promesse de V1. Les contrats et preuves historiques restent conservés. |
| D-02 | Nouveau lock SHA256 **6e59734742daa69251821e2fed6a765febb4e58f9139743a98c91813dff234cf** : trois modérés résiduels mammoth/argparse/sprintf-js, zéro high/critical. L'ancien accord ne vaut pas automatiquement pour ce hash. Rattachement explicite à approuver, sans prolonger la revue du 16 novembre ni l'expiration du 18 novembre 2026 à 23:59 Paris. |
| D-03 | Aucune publication de ce source. Attendre le résultat réel et la source finale avant de demander une unique publication candidate immuable ; ne pas rebâtir/publier une succession de candidates exploratoires. |
| D-04 | Aucune fusion, promotion stable/latest, tag v* ou remplacement d'installation sans accord final distinct. |

## Pourquoi une nouvelle autorisation est requise

Le contrôle automatique a rejeté la préparation de l'essai réel, car les deux autorisations précédentes portaient chacune sur une mission déjà exécutée. La demande générale de poursuite n'a pas été considérée suffisamment explicite pour réutiliser cette clé. Aucune tentative d'exécution indirecte n'est effectuée.

Les vérifications sans secret ont été achevées indépendamment. L'accord demandé ci-dessus n'autorise ni publication ni fusion.

## Mission réelle explicitement autorisée — résultat du 22 octobre 2026

L'utilisateur a explicitement autorisé une seule mission après lecture de la proposition. Activation inchangée du YAML proposé sur ops/closeout-64248339750f, commit pilote **297f8ae60cac0c72f364bfe63db624173dbf1890**. [Run #39850473486](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39850473486), job **120074940170** : **FAILURE**. Source construite/testée exacte **64248339750f9e0f86e01530eb7067027cec8f6b**, image locale non publiée, config ID sha256:a5c1a1d489f3124c783c9fe0efd24e8654b8a0631d810ea3b027e5cbfaa2ee7f.

- Source/empreintes, quatre tests SDK JSON, audit production et licences : PASS. Les preuves multiarchitecture synthétiques du run 39846965864 restent acquises.
- Catalogue public : les deux routes autorisées à prix nuls ont été revalidées ; primaire local contrôlé, fallback externe openrouter/free et JSON mode configurés.
- Une seule mission réelle admise, cinq tâches planifiées. Worker : **un verdict VERIFIED / CRITERION_MET**, candidat JSON_OBJECT de 11 caractères, un champ, okExactlyTrue=true. Aucun contenu brut ni secret conservé dans ce registre.
- Spécialistes 1 à 4 : **zéro verdict chacun**. Terminal SSE reçu avec une partie error ; classe expurgée **RATE_LIMIT**, résultat harnais **BLOCKED_PROVIDER**. La mission n'est pas qualifiée.
- Fixture primaire : **14 réponses HTTP 429 contrôlées, 0 requête inattendue**. Ce compteur est une injection locale, pas une mesure de quota OpenRouter. Le worker vérifié avec primaire exclusivement en échec atteste un passage génératif alternatif dans cette configuration ; les traces retenues ne permettent pas d'attribuer définitivement l'erreur terminale au quota externe plutôt qu'au traitement/retry du routage. Aucun reçu fallback final n'a été recueilli.
- Ancien défaut de registre SDK : 0 log Unsupported LLM provider: openrouter ; 0 exception child-thread enregistrée.
- Readback final P6/receipts : **SKIPPED** car la mission échoue ; cinq verdicts, publication canonique réussie et preuve complète PC-04 **NON ACQUIS**.
- Nettoyage stack/volumes/image : SUCCESS. Aucune publication GHCR, fusion, promotion stable/latest ni modification d'installation utilisateur.

Cette autorisation d'une mission est consommée. Aucun replay ni seconde inférence n'est lancé. Le format JSON du worker est désormais validé dans ce scénario, mais le blocage RATE_LIMIT exige une attribution fondée sur des traces ; aucun correctif produit conjectural ni assouplissement Oracle n'est appliqué. D-01 résiduel reste ouvert ; D-02 doit encore rattacher explicitement les trois modérés au nouveau verrou ; D-03 publication nouvelle source et D-04 stable/fusion restent non autorisés.
