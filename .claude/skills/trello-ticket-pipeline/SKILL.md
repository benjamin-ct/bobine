---
name: trello-ticket-pipeline
description: Pilote le développement à partir d'un board Trello relié à GitHub. Prend le prochain ticket de la liste "A faire", le passe en "En cours", développe la fonctionnalité, ouvre une Pull Request, puis déplace le ticket en "A valider" avec le lien de preview en commentaire. Merge aussi les PR des tickets présents dans "To merge" et les passe en "Done". Utilise ce skill dès que l'utilisateur demande de "traiter le board", "avancer les tickets", "prendre le prochain ticket", "merger ce qui est prêt", ou plus généralement de faire avancer le projet à partir de Trello — même sans mentionner explicitement Trello.
---

# Workflow Trello → GitHub

Ce skill fait tourner un pipeline de développement autonome basé sur les listes d'un board Trello. Il s'appuie sur les connecteurs **Trello** et **GitHub**.

## Configuration

- **Board Trello** : s'il n'y en a qu'un seul connecté, l'utiliser directement. S'il y en a plusieurs, demander lequel utiliser avant de commencer.
- **Dépôt GitHub** : celui du répertoire de travail courant (remote `origin`).
- **Listes du board** (recherche insensible à la casse/accents — adapter si le nom réel diffère légèrement) :
  | Liste                      | Rôle                                        |
  | -------------------------- | ------------------------------------------- |
  | `A faire`                  | file d'attente des tickets à démarrer       |
  | `En cours`                 | ticket en cours de développement par Claude |
  | `A valider`                | PR ouverte, en attente de review humaine    |
  | `To merge` (ou `A merger`) | validé par un humain, prêt à merger         |
  | `Done`                     | terminé                                     |

## Règle d'or : un seul ticket actif à la fois

Ne jamais avoir plus d'une carte dans `En cours` en même temps. Avant de prendre un nouveau ticket dans `A faire`, toujours vérifier que `En cours` est vide.

## Règle d'or : toujours supprimer une branche mergée

Dès qu'une branche est mergée (n'importe où dans ce workflow), la supprimer immédiatement, sans exception et sans attendre qu'on le demande. Ne jamais laisser une branche déjà mergée traîner sur le dépôt.

## Boucle principale

À chaque exécution, dérouler dans cet ordre :

### 0. Faire avancer les cartes cochées comme "terminée"

Avant toute autre chose, regarder les cartes de `A valider` et de `To merge` : si une carte est cochée comme **terminée/achevée** (le check ✅ sur la carte elle-même, pas une checklist interne), c'est le signal qu'un humain valide cette étape et que la carte doit avancer.

- Carte cochée dans `A valider` → la déplacer vers `To merge` (elle sera alors mergée à l'étape 1, dans la foulée).
- Carte cochée dans `To merge` → rien à déplacer, elle y est déjà traitée à l'étape 1 ; ça confirme juste le go pour merger.

### 1. Merger ce qui est prêt (liste `To merge`)

Pour chaque carte de `To merge`, une par une, dans l'ordre :

1. Retrouver la Pull Request associée (lien dans la description/un commentaire de la carte, ou branche nommée d'après l'ID/le titre du ticket).
2. Vérifier que les checks CI sont au vert.
   - Si un check est rouge : laisser la carte dans `To merge`, ajouter un commentaire décrivant le problème, et passer à la carte suivante.
3. Merger la PR (squash merge par défaut, sauf convention contraire du dépôt).
4. Déplacer la carte vers `Done`.
5. Supprimer la branche mergée (systématiquement, dès le merge fait — ne pas laisser traîner de branches mortes).

### 2. Reprendre ou démarrer un ticket (listes `En cours` / `A faire`)

- **Si une carte est déjà dans `En cours`** : reprendre le travail dessus (relire la carte, les commentaires, la PR existante si elle existe) plutôt que d'en prendre une nouvelle.
- **Sinon, si `A faire` contient des cartes** : prendre la première carte de la liste (l'ordre = la position des cartes dans la liste Trello), puis :
  1. Déplacer la carte vers `En cours`.
  2. Lire la description, les checklists et les commentaires de la carte pour comprendre la tâche.
  3. Créer une branche dédiée avec un nom **lisible et parlant sur ce qui est fait** (et pas juste l'ID du ticket) : c'est ce nom qui se retrouve dans l'URL de preview, donc il doit rester compréhensible une fois là-dedans. Format : `<type>/<description-courte-en-mots-clés>`, ex. `feature/watchlist-films`, `fix/filtre-plateformes-streaming`. Éviter les IDs/hash illisibles ; le numéro de ticket peut être ajouté en suffixe si utile (`feature/watchlist-films-42`), mais jamais en tête ou seul.
  4. Développer ce qui est demandé, commiter au fur et à mesure.
  5. Ouvrir une Pull Request sur GitHub avec, dans la description, un lien vers la carte Trello.
  6. Récupérer l'URL de preview :
     - si un bot de déploiement (Cloudflare Pages, Netlify, Vercel…) l'a postée en commentaire sur la PR, la reprendre depuis là ;
     - sinon, la chercher dans les checks/deployments de la PR sur GitHub.
  7. Déplacer la carte vers `A valider`.
  8. Ajouter un commentaire sur la carte avec le lien de la preview (et le lien de la PR).
  9. S'arrêter là pour ce ticket : ne pas enchaîner sur un autre tant que celui-ci n'a pas été mergé (`To merge`) ou refusé.

### 3. Rien à faire

Si `To merge` et `A faire` sont vides et qu'aucune carte n'est dans `En cours`, ne rien faire — attendre la prochaine exécution.

## Notes

- `A valider` est un état géré par les humains : Claude n'y touche jamais à part y déposer un ticket terminé ou faire avancer une carte cochée "terminée" (voir étape 0). Le passage de `A valider` vers `To merge` se fait soit manuellement (déplacement de la carte par l'équipe après review), soit en cochant la carte comme terminée.
- Ce skill ne tourne pas tout seul en tâche de fond : il se déclenche à chaque fois que Claude Code est lancé/relancé sur ce projet (manuellement, ou via une tâche planifiée / un hook si vous en configurez un).
- Si les noms de listes réels diffèrent (accents, majuscules, "A merger" vs "To merge"...), les faire correspondre par similarité plutôt que par égalité stricte.
