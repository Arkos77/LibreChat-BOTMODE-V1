# Mission observée unique — 23 octobre 2026, heure de Paris

## Décision
NO-GO stable maintenu. Mission partiellement réussie : quatre verdicts VERIFIED sur cinq; arrêt au dernier spécialiste avec HTTP 429 de la route gratuite. P6 et receipts finaux non validés. Ne pas relancer à l'identique.

## Identité et portée
- Run https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39870514640 ; job 120143482290, terminé en échec.
- Activation c2e22c063abc749746e5d846c19af7b460489387 ; source applicative a6f6fee3c7dcfb5877fe798f759966774a046a58 inchangée.
- Image locale AMD64, ID de configuration sha256:da6f786e267962eead887317ad9cb3ae5079b5c09989dead9510048e08659b8c. Ce n'est pas une publication GHCR.
- Une mission admise, autorisation consommée. Aucun second appel de mission ni relance.
- Contrôles source/helpers, tarifs nuls, transmission JSON SDK dans l'image, dépendances et licence réussis. Audit installé : 0 critical / 0 high / 0 moderate, sans modification rétroactive des rapports ni extension de D02.

## Résultat réel et observation
Worker VERIFIED (JSON objet, 11 caractères); specialist_1 VERIFIED (14); specialist_2 VERIFIED (12); specialist_3 VERIFIED (11); specialist_4 sans verdict. Le terminal classe RATE_LIMIT.
Dix requêtes observées : cinq 429 du primaire artificiel, quatre réponses 200 de openrouter/free, puis un 429 réel de openrouter/free. Aucun appel inattendu du primaire.
Les cinq requêtes de fallback portent jsonObjectRequested=true et requireParameters=true.
Les réponses des spécialistes 1 et 2 correspondent exactement par SHA256 aux entrées Oracle et sont VERIFIED_JSON_OBJECT.
Les observations Worker et spécialiste 3 ont atteint la borne de capture (truncated=true) : aucun hash complet disponible. Cela explique l'échec WIRE_ORACLE_EVIDENCE_INCOMPLETE du contrôle de comparaison. Aucun changement HTTP→Oracle n'est démontré pour ces deux flux. Les verdicts Oracle restent VERIFIED.
Les données ne prouvent pas que require_parameters était la cause du précédent rejet de 59 caractères. Elles prouvent quatre sorties acceptées dans cette exécution et le 429 final. La cause précise du 429 (quota, capacité amont, autre limitation) n'est pas déduite du statut seul.

## Conservation et nettoyage
- Archive image non configurée : artifact 12466023772 (1548162386 octets), https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39870514640/artifacts/12466023772 ; expiration 24 octobre 2026 à 01:24:15 Paris. Réutiliser cette image si une suite est autorisée avant expiration; ne pas reconstruire automatiquement.
- Métadonnées sans contenu ni clé : artifact 12466866105, https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39870514640/artifacts/12466866105 ; expiration 26 octobre à 00:27:45 Paris. Archive téléchargée et dix lignes JSONL lues; deux captures bornées confirmées, 429 final confirmé.
- Nettoyage de la pile jetable : SUCCESS.

## Suite
Aucun correctif applicatif justifié par ce run. Ne pas prétendre qu'un 429 fournisseur est une régression du routage des spécialistes : trois ont produit un verdict accepté et le dernier a envoyé une requête réelle au fournisseur.
Avant un nouvel essai, lever la limite fournisseur ou choisir une autre route gratuite autorisée; ne pas répéter la même mission sans information nouvelle. Une nouvelle mission exige un nouvel accord spécifique. Si une attribution complète de chaque réponse est nécessaire, adapter et tester hors réseau l'observateur SSE pour traiter le flux par morceaux sans conserver le raisonnement, plutôt que simplement relever la borne mémoire.
D01/D02/D03/D04 et leurs limites précédentes restent inchangés; aucune publication, fusion ou modification d'installation.


## Correctif diagnostic hors réseau — 23 octobre 2026

L'observateur SSE traite désormais les lignes au fil de l'eau, avec limite par ligne et limite cumulée du contenu visible, plutôt qu'une limite sur la taille totale du flux. Le raisonnement n'est pas conservé entre événements ni publié. Les flux hors limites restent explicitement tronqués, sans empreinte partielle présentée comme complète. Le comptage UTF-8 respecte les paires de surrogates réparties sur deux événements JSON.

Preuves locales : reproduction rouge du long flux (1 échec / 14 réussites), reproduction rouge du cas surrogate (1 / 16), puis quatre suites ciblées : 30 tests réussis en 10,702 s. Couverture du graphe natif/fallback/Oracle, confidentialité, préchargement, gros événement et gros contenu, flux contrôlé octet par octet (UTF-8, CRLF et fin sans saut de ligne). Syntaxe et Prettier réussis. Revue indépendante : aucun constat restant après corrections. Aucun test global supplémentaire ni validation fournisseur n'est revendiqué.

Code et tests figés au commit 4dbf279a9d4fcdd6a7241c244abdd75bfac42c3e, branche fix/specialist-host-fallback-20261022. Helper SHA256 : 09872c3ce6f126eda8712957fb977d495c0d69e33d918a30d00189637d74269f. Aucun changement du code applicatif a6, aucun nouveau build/CI/inférence. Ce correctif n'était pas présent dans le run 39870514640; il ne récupère pas les captures antérieures tronquées et ne change pas les preuves de ce run. Le workflow historique/proposé reste figé sur son ancien helper; toute future activation devra intégrer explicitement le nouveau pin et être revue avant utilisation. Blocage réel inchangé : 429 avant le cinquième verdict, P6 non validé, NO-GO stable et D01–D04 inchangés.
