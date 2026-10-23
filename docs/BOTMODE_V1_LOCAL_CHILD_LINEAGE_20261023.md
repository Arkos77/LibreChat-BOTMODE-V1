# D01 — qualification locale des sous-agents, 23 octobre 2026

## Source et périmètre
Application b2213e9717b879a91181c6ac9d7607124c30258b ; image locale sha256:6414f7af6cbb235444315ea3c8928fb2476aa2d83fc4c19c313626990c6469db, restaurée depuis le run 39880864060. Aucun rebuild applicatif, publication de registre, clé fournisseur réelle ou inférence externe dans ces workflows.

Ce lot distingue un enfant enregistré préautorisé, un contexte enfant éphémère `self`, et la création de nouveaux spécialistes enregistrés. Ces portées ne sont pas interchangeables.

## Contrôles locaux avant CI
- Deux suites existantes, sept tests : contrat natif parent → enfant → parent et identité des enfants lazy, PASS.
- Vrai SDK OpenAI contre le serveur Python local : enfant préconfiguré puis retour au parent, trois requêtes, PASS. Adaptation explicite en foreground pour ce précontrôle ; elle ne prouve pas le chemin détaché MongoDB.
- Même précontrôle avec `self`, sans enfant préconfiguré : trois requêtes, PASS. Ce résultat ne prouve ni persistance dans l'application, ni création d'un nouvel agent enregistré.
- Contrôle de lignée renforcé : réponse assistant terminée exigée, propriétaire identique, agent et type d'enfant autorisés, liens parent/run/tool cohérents. Un message initial utilisateur peut légitimement conserver `running` ; il n'est pas confondu avec la réponse finale.
- Six cas synthétiques du contrôleur de lignée : réussite normale acceptée ; erreur, annulation, réponse inachevée, autre propriétaire et autre enfant rejetés.
- Syntaxe shell du workflow, Python imbriqué et JavaScript MongoDB contrôlés.

## Essai 001 — mission non admise
[Run 39886327976](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39886327976), job 120195241393 ; pilotage 3f0b75524ea23782789662559a32390a52d1afe3. Image/source, quatre tests SDK embarqués, dépendances, licence et audit production zéro validés. Bootstrap six agents et permissions réussis. Le POST de mission répond HTTP 503 avant admission ; aucun résultat enfant/Oracle n'est établi. Nettoyage SUCCESS.

Le bootstrap ne contrôlait que /api/config. Le code applicatif accepte cette route avant la fin du démarrage, mais refuse les POST de chat tant que /readyz n'est pas prêt. Le corps du refus 001 n'a pas été conservé : la cause précise n'est donc pas confirmée uniquement par le statut 503.

## Correction du dispositif
Le second workflow attend /readyz avant l'unique POST, sans replay automatique d'une mission. Attente bornée à 60 essais, timeout de quatre secondes par GET, pause de deux secondes entre essais. Test local du code exact : deux refus puis état prêt acceptés ; indisponibilité persistante arrêtée dans la limite prévue. Le refus d'admission est désormais classé par un code autorisé, sans corps brut ni secret.

## Essai 002
Pilotage c28678f5c800d1ff8e4f942df82e1c4622c04214 ; [run 39899705393](https://github.com/Arkos77/LibreChat-BOTMODE-V1/actions/runs/39899705393), job 120238205480.

Résultat **SUCCESS**, nettoyage SUCCESS. Attente /readyz passée après environ huit secondes : le démarrage différé est effectivement observé. Trois appels locaux exactement : un appel d'outil parent, une réponse enfant, une réponse finale parent ; aucun tour non reconnu. Une finale SSE, aucune erreur SSE. Oracle du parent durablement VERIFIED et publication observée.

Une conversation enfant réelle dans MongoDB, appartenant au même propriétaire et à l'agent/type préautorisé. Réponse assistant terminée exigée ; liens parent/conversation/run/tool contrôlés. Les mêmes exigences passent avant et après redémarrage de l'API.

## Limites conservées
- Le contrôleur intégré affiche initialement `DURABLE_CHILD_LINEAGE=NOT_PROVEN` avant la lecture MongoDB ; les contrôles MongoDB renforcés ultérieurs établissent cette preuve. Ce marqueur intermédiaire n'est pas un verdict final.
- Aucun événement SSE `on_subagent_update` observé (zéro début/fin enfant), malgré la lignée MongoDB acquise. Ce lot ne valide pas l'affichage de progression enfant dans l'interface.
- Fournisseur synthétique local ; hostModelRouting désactivé pour isoler ce chemin. Ce résultat n'est pas transféré à un fournisseur réel, à son routage automatique ou à ses receipts.
- Il s'agit d'un enfant préautorisé enregistré. Ni création dynamique complète de spécialiste, ni persistance runtime du cas `self`, ni ACL HTTP avec un principal étranger ne sont acquises par ce lot.
- L'Oracle vérifié est celui de la mission parent. Ce lot ne prouve pas une validation Oracle indépendante de chaque enfant, ni la lecture MongoDB canonique P6 déjà couverte séparément par le lot receipts.
- Endurance trois heures, HITL trente minutes, autres contrôles longs, UX FR/TTS/clé/mobile et Full/RAG/migration restent dans D01. D02/D03/D04 inchangés ; NO-GO stable.

## Suite minimale
Qualifier séparément `self` dans l'application avec lignée durable et restrictions de création centralisées, en réutilisant l'image. Puis rapprocher le contrat de création éphémère des exigences de spécialistes personnalisés enregistrés. Toute nouvelle mission externe conserve son besoin d'autorisation spécifique.
