# BOT MODE V1 — contrat de sortie et refus de publication, 23 octobre 2026

## Source et résultat

Correctif applicatif figé : **0c3c717a44a044200fe4bdc72174195d5b40d713**, branche fix/mission-output-contract-20261023, base d59dedf071d26503ec9bec5a31ee474f0ccc9724. Arbre **1cf5bac9c08fcba354d0d58741f912e010f5d238**, identique au commit local final de9c11588d4bdc3681765d2f4f66319a84307b3a ; les treize blobs Git correspondent exactement. Les commits documentaires suivants ne changent pas la source applicative.

**Correctif local qualifié, pas encore construit en image ni installé.** L'image d59 publiée/installée reste inchangée. Aucun nouvel appel fournisseur réel, build Docker, publication GHCR, fusion ou promotion stable/latest.

## Causes établies et changements

Une mission réelle a produit une recherche Markdown puis subi un refus Oracle sur la transition du prédécesseur. Le SDK a regroupé les erreurs de transitions ; le client les traitait comme une erreur fournisseur ordinaire et conservait le texte intermédiaire dans une completion. Le message d'erreur enregistré ne conservait pas le motif Oracle détaillé. Un test hors réseau sur l'Oracle installé reproduit le rejet d'un candidat Markdown comme INVALID_CANDIDATE ; le checkpoint réel atteste REJECTED, pas son reasonCode précis.

- Le compilateur natif fournit maintenant au producteur les exigences de validation exactes de la tâche. Pour les bindings Chat Completions OpenAI/OpenRouter validés, il demande JSON object, conserve les formats JSON explicites et les autres options. Responses API et familles non prises en charge ne reçoivent pas de paramètre inventé. Les instructions demandent des valeurs scalaires, un résultat détaillé en chaîne, des faits sourcés et des incertitudes explicites. Aucun ok=true n'est fabriqué par le code.
- Les refus sont retrouvés depuis les résultats Oracle détenus par l'hôte et rattachés à la tâche/nœud du plan courant, même si le SDK enveloppe l'erreur. Lancement initial et reprise propagent le refus ; une autre erreur de mission reste un échec expurgé, sans completion finale du brouillon. Arrêts utilisateur, limites de pas et contrôles de publication existants sont conservés.
- Le mode analyze passe par recherche, analyse, synthèse ; vérification documentaire seulement si l'envoi possède effectivement des pièces jointes. Les tâches techniques restent dans develop. Modes watch et choix manuels inchangés. Le choix des documents suit les mêmes sources que les fichiers réellement envoyés, notamment les overrides vides de la file d'attente.

Le contrat de completion est structurel : il ne constitue pas un contrôle indépendant de toutes les affirmations factuelles. Les consignes ne garantissent pas qu'un fournisseur les respectera. Aucune nouvelle preuve externe ni validation réelle du contenu n'est revendiquée.

## Vérifications et revue

Reproductions rouges puis vertes : contrat/transport natif, incompatibilité Responses, agrégat du vrai SDK après refus de recherche, absence de verdict persisté, reprise, choix d'objectifs et propriété des pièces jointes/arrêt utilisateur.

| Vérification finale | Résultat |
|---|---|
| Compilateur natif, Oracle, planificateur, configuration OpenAI | 171 tests PASS, 4 suites |
| AgentClient et contrôleur de reprise | 382 tests PASS, 2 suites |
| Objectifs, hook réel de régénération, profondeur, panneau projet | 47 tests PASS, 4 suites |
| Total ciblé | **600 tests PASS**, pas toute la suite du monorepo |
| Typage API et client | PASS |
| ESLint ciblé, Prettier et diff-check | PASS |
| Build du paquet API | PASS ; pas une image Docker |
| Vrai SDK avec serveur HTTP loopback | response_format JSON réellement envoyé, Oracle VERIFIED, une requête locale |
| Vrai SDK avec Markdown invalide et transitions parallèles | agrégat produit, résultat refusé récupéré, aucune donnée candidate dans l'erreur |

Le premier typage API a dépassé le heap Node local de 2 Go ; 6 Go ont suffi. Il a également identifié quatre diagnostics dans le transport JSON existant : ajout de deux lignes de type fondées sur le SDK OpenAI, sans effet d'exécution ni dépendance nouvelle. Le verrou de dépendances est inchangé ; pas de nouvel audit d'avis revendiqué dans ce lot.

Revue indépendante gpt-6-astra de toute la différence d59 → 2c2fa5d : deux constats Important, aucun Critical/Minor. Corrections finales de9c115 : overrideFiles vide face aux fichiers du brouillon suivant (test hook rouge puis vert) ; arrêt utilisateur gagnant pendant une reprise avec rejet Oracle agrégé (tests initial/reprise rouges puis verts, contrôles existants de settlement planifié verts). Une seule passe de correction, pas de seconde revue présentée comme acquise.

## Décisions consignées

- Base candidate installée plutôt que branche upstream dev : corriger la source réellement concernée ; une mauvaise base invaliderait la provenance. Pas de fusion effectuée.
- Ledger local équivalent aux scripts de skill non exposés comme exécutables : mêmes preuves par tâche, aucune incidence produit.
- Trois tâches liées groupées dans un commit de correctif puis une passe de revue : moins de granularité de cherry-pick, pas de CI répétée.
- Deux lignes de type OpenAI incluses pour fermer les diagnostics du même transport ; aucune modification de comportement.
- Pas de transport inventé pour Responses/API inconnue : ces producteurs peuvent encore échouer au contrat plutôt que recevoir une option incompatible.
- Conformité réelle du fournisseur non jugée hors de l'autorisation d'inférence : un fournisseur peut encore refuser ou ignorer le format.
- Vérité factuelle non certifiée par les checks scalaires : un résultat bien formé peut encore contenir une affirmation fausse.
- Prêt côté source ne vaut pas prêt côté image/install : qualification séparée de cette source indispensable avant bascule.

## Suite préparée, inactive

[Workflow de qualification proposé](qualification/BOTMODE_V1_MISSION_CONTRACT_0c3c717a44a0_PROPOSAL.yml), conservé hors Actions. Il reprend le dispositif déjà qualifié, fixe la source 0c3, vérifie les onze chemins applicatifs/test modifiés, construit une fois par architecture native, contrôle le compilateur réellement livré par HTTP loopback et l'agrégat Oracle, puis sur AMD64 le runtime, cinq tâches programmatiques et le même flux navigateur analyze à trois tâches/Oracle/P6. Le garde navigateur attend explicitement research/analysis/synthesis ; le graphe à cinq tâches reste un scénario distinct. ARM64 n'est pas présenté comme une preuve navigateur/DB.

Archivage de l'image exacte après construction, même si un contrôle suivant échoue, pour éviter une reconstruction sans raison ; aucune publication autorisée à partir d'une qualification en échec. Images conservées un jour, checksum/source/configuration enregistrés. Syntaxe actionlint 1.7.7 officielle vérifiée par checksum, shell et Python PASS. Le premier script de préparation a eu une erreur de composition de chemin Python, corrigée avant tout workflow ; aucun essai CI ni build n'a été lancé.

[Périmètre proposé pour une autorisation groupée](qualification/BOTMODE_V1_MISSION_CONTRACT_0c3c717a44a0_SCOPE.md) : qualification, publication candidate depuis les images retenues puis mise à jour de la seule instance de travail, sans nouvelle inférence réelle, merge ou stable. L'accord de l'ancien d59 ne s'étend pas implicitement à cette nouvelle source.
