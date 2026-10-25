# BOTMODE — checkpoint du contrat de recherche v2

25 octobre 2026, Europe/Paris. Lot hors ligne autorisé après présentation du design `docs/superpowers/specs/2026-10-25-research-citation-contract-design.md`.

## Résultat du lot

Les nouvelles admissions BOTMODE utilisent explicitement research-v2. Les appels historiques de prepareBotModeMission restent v1 par défaut ; les anciens plans, candidats et verdicts ne sont pas convertis. Le contrat v2 conserve les sources natives terminées, bornées et liées à la tâche ; toutes les URL présentes dans result doivent être déclarées et observées. Il permet de présenter séparément les sources déclarées, sans obliger le modèle à les recopier dans result. Les critères de réussite, preuves indépendantes, contradictions et revue humaine sont conservés. Une exigence v1 explicite additionnelle garde sa force, y compris lorsqu'elle accompagne v2 sur la même tâche.

Le compilateur, le schéma et le contexte de recherche suivent le contrat sélectionné. Les déclarations d'observation de l'hôte et les reçus d'usage reconnaissent les deux versions. La topologie à deux phases ne change pas : researchExecutionVersion reste 1 ; outputContract porte la nouvelle sémantique et reste persisté dans le plan et les verdicts.

Le rendu public relit et revalide chaque candidat brut avec les exigences du plan, les preuves et les sources enregistrées. Il refuse des verdicts manquants, modifiés ou incohérents, une source étrangère, un texte vide ou une URL finale inventée. Après toutes les validations, il présente la synthèse terminale et la liste des sources vérifiées. Il ne modifie ni le candidat Oracle ni son verdict. Le même rendu est utilisé par la terminaison normale, la reprise chaude et la préparation de publication froide.

Le rendu v2 dépend du plan admis, indépendamment du nom ou des métadonnées du Worker. Une pause ou un arrêt non HITL efface le rendu précédent et retire les textes/reasoning candidats des contenus persistables ; les éléments d'activité/outils déjà autorisés restent conservés. Le contenu final, une fois validé, suit la voie existante de publication unique et de persistance.

## Preuves hors ligne

- 207 tests API ciblés dans 14 suites passent : Oracle v1/v2, admission, observations, schémas, compilation native et rendu. La fixture de typage a ensuite été corrigée (Providers.OPENROUTER/clientOptions) ; les 11 tests publication ont été rejoués avec succès.
- 428 tests hôte dans 6 suites passent après les corrections de revue : client, requête/reprise/déconnexion, observations, usage et publication.
- Parcours SDK natif HTTP loopback : une recherche puis analyse et synthèse, quatre appels contrôlés, sources transmises aux successeurs, quatre verdicts VERIFIED, rendu déterministe avec source ; candidats bruts inchangés.
- Le candidat exact de la mission réelle 40205245845 reste REJECTED sous v1. Il est VERIFIED sous v2 uniquement avec l'observation native fournie au test. Ce replay n'est pas une nouvelle réussite de la mission passée.
- Le test hôte de publication froide utilise les vraies fonctions de staging/publication avec adaptateurs de stockage et de transport en mémoire : même contenu enregistré et transmis, un seul événement final, second passage refusé ; sources disparues refusées avant publication. Il ne constitue pas une preuve Redis/Mongo/SSE réelle.
- Huit scénarios compilés v1 API + SDK loopback passent. La perte préexistante d'instructions système après fallback reste explicitement NOT_QUALIFIED.
- Typage API complet, build API, lint des fichiers touchés sans avertissement, syntaxe JS/YAML et diff-check passent. Le contexte web UI par défaut conserve exactement le SHA256 fc70c542b09387f30762a369a61b05b97206c54b37a51d39fec35578ac7cdc11.
- Les tests hôte locaux utilisent une configuration Jest temporaire pointant vers le dist de ce worktree : le node_modules partagé résolvait une ancienne bibliothèque. Aucun lien partagé n'a été modifié. La première exécution avait un échec d'export ancien ; la suivante utilise le bon code compilé.
- Sept assertions historiques d'admission attendaient v1 sur les nouvelles missions ; elles ont été mises à jour pour v2, en conservant les assertions de contraintes, preuves et déclarations d'observation. Les anciens plans restent testés séparément sous v1.

## Revue unique et corrections

Une revue indépendante lecture seule : zéro Critical, deux Important, zéro Minor. Les deux défauts ont été reproduits par trois tests rouges avant correction, puis les 428 tests hôte ont passé : Worker renommé contournant le rendu ; candidat partiel conservé après preempt_incomplete. Pas de seconde campagne de revue.

## Limites et prochaine étape

Aucun push, construction Docker, appel fournisseur, installation, fusion ou publication stable n'a eu lieu dans ce lot. L'image 7797064 et son ancienne mission ne qualifient pas ce nouveau produit. La mission complète réelle, le navigateur, Redis/Mongo et leur reprise effective, le fallback gratuit, les sous-agents imbriqués et l'installation demeurent à qualifier suivant la feuille de route. La provenance n'atteste pas chaque affirmation d'une page. Stable reste NO-GO.

La prochaine action proposée, sous autorisation distincte, est la publication du commit figé de ce lot, une seule nouvelle image AMD64 et une seule mission réelle gratuite à modèle fixe, après tous les gates, au maximum quatre requêtes de 2048 tokens. Le succès doit montrer les trois tâches, quatre verdicts VERIFIED, un résultat normal unique SSE/Mongo incluant la source validée, puis nettoyage PASS. Aucun replay n'est déduit de l'accord précédent.
