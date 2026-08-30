---
name: trello-ticket-pipeline
description: Pilote le développement à partir d'un board Trello relié à GitHub. Traite en une seule exécution tous les tickets prêts à merger, puis tous les tickets en cours débloqués ou renvoyés après review KO, puis tous les tickets à faire (un par un, sans jamais travailler activement sur plus d'un ticket à la fois), en développant chaque fonctionnalité, ouvrant une Pull Request, et déplaçant le ticket en "A valider" avec le lien de preview en commentaire. Merge aussi toutes les PR des tickets présents dans "To merge" et les passe en "Done". Utilise ce skill dès que l'utilisateur demande de "traiter le board", "avancer les tickets", "prendre le prochain ticket", "merger ce qui est prêt", ou plus généralement de faire avancer le projet à partir de Trello — même sans mentionner explicitement Trello.
---

# Workflow Trello → GitHub

Ce skill fait tourner un pipeline de développement autonome basé sur les listes d'un board Trello. Il s'appuie sur les
connecteurs **Trello** et **GitHub**. Le skill vit dans le dépôt `bobine` et n'est jamais lancé depuis un autre dépôt.

## Principe central : la colonne pilote le comportement

La liste dans laquelle se trouve une carte détermine entièrement ce que Claude doit en faire. Il n'existe aucun signal
supplémentaire à interpréter au sein d'une même liste (case cochée ou non, etc.) : une carte dans `To merge` est par
définition prête à merger, une carte dans `A faire` est par définition à démarrer. Le seul signal transversal qui module
ce comportement par défaut est le label `Bloqué — action requise` (voir plus bas).

## Listes du board

(recherche insensible à la casse/accents — adapter si le nom réel diffère légèrement)

| Liste                      | Rôle                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `Idées`                    | brainstorming / shaping / en discussion — zone purement humaine, jamais touchée par Claude                  |
| `A faire`                  | file d'attente des tickets à démarrer                                                                       |
| `En cours`                 | ticket(s) en cours de développement, bloqués en attente d'une réponse, ou renvoyés après une review KO      |
| `A valider`                | PR ouverte, en attente de review humaine — jamais touchée par Claude, sauf pour y déposer un ticket terminé |
| `To merge` (ou `A merger`) | validé par un humain, prêt à merger                                                                         |
| `Done`                     | terminé                                                                                                     |

## Label de blocage

Label existant sur le board : **`Bloqué — action requise`**. Ne jamais en créer un autre équivalent ; toujours
réutiliser exactement celui-ci.

## Règle d'or : toujours reprendre l'historique, jamais redévelopper de zéro

Une carte peut arriver dans `En cours` de trois façons différentes : nouveau ticket pris depuis `A faire`, reprise après
déblocage, ou **renvoyée manuellement depuis `A valider`** suite à une review KO (un ou plusieurs bugs remontés sur la
PR déjà ouverte).

Dans **tous les cas sauf le premier** (nouveau ticket jamais travaillé), avant d'écrire la moindre ligne de code :

1. Relire la carte en entier : description, checklists.
2. Relire **tous** les commentaires, dans l'ordre chronologique, y compris ceux qui ne semblent pas les plus récents.
3. **Regarder les images jointes aux commentaires** (captures d'écran de bug, mockups, comportement attendu vs
   observé) — elles contiennent souvent l'information la plus précise sur ce qui doit être corrigé, plus que le texte
   seul.
4. Identifier s'il existe déjà une branche et une PR ouverte pour ce ticket (via le lien en description/commentaire, ou
   une branche nommée d'après le ticket).
5. Si une branche/PR existe : la reprendre et corriger uniquement ce qui a été remonté (un ou deux bugs signalés ne
   justifient jamais de recommencer le développement à zéro). Ajouter les nouveaux commits sur la branche existante.
6. Si aucune branche n'existe encore (cas rare pour un retour depuis `A valider` ; à vérifier tout de même par
   précaution) : en créer une, en suivant les mêmes règles de nommage que pour un ticket neuf (voir étape 2c).

## Autres règles d'or

- **Jamais plus d'un ticket activement travaillé à la fois.** `En cours` peut contenir plusieurs cartes simultanément,
  mais au plus une seule sans le label `Bloqué — action requise` à un instant donné — les autres, s'il y en a, sont
  forcément bloquées en attente d'une réponse humaine. Ne jamais démarrer le travail sur une nouvelle carte (ni depuis
  `A faire`, ni en débloquant une carte existante) tant qu'une carte de `En cours` est en cours de traitement actif sans
  label.
- **Priorité aux cartes débloquées ou renvoyées avant d'en prendre une nouvelle.** Avant de piocher dans `A faire`,
  toujours vérifier si une carte de `En cours` a été débloquée (label retiré) ou vient d'être renvoyée depuis
  `A valider`, et la reprendre en priorité.
- **Jamais bloqué en silence** : si Claude ne peut pas avancer sur le ticket travaillé (ambiguïté du besoin, blocage
  technique, décision à prendre, dépendance manquante), il ne s'arrête pas sans le signaler — voir section dédiée.
- **Toujours supprimer une branche mergée** : dès qu'une branche est mergée (n'importe où dans ce workflow), la
  supprimer immédiatement, sans exception et sans attendre qu'on le demande.
- **Vider les files, pas juste en traiter un** : à chaque exécution, le skill traite la totalité des cartes éligibles
  dans `To merge`, puis toutes les cartes de `En cours` débloquées/renvoyées, puis autant de cartes de `A faire` que
  possible — il ne s'arrête pas après le premier ticket traité. Il ne s'arrête que quand il n'y a plus rien à faire ou
  qu'il rencontre un nouveau blocage.

## Boucle principale

À chaque exécution, dérouler dans cet ordre :

### 1. Merger tout ce qui est prêt (liste `To merge`)

Traiter **toutes** les cartes de `To merge`, une par une, dans l'ordre, sans s'arrêter après la première :

1. Retrouver la Pull Request associée (lien dans la description/un commentaire de la carte, ou branche nommée d'après le
   titre du ticket).
2. Vérifier que les checks CI sont au vert.

- Si un check est rouge : laisser la carte dans `To merge`, ajouter un commentaire décrivant le problème, et passer à la
  carte suivante (ne pas bloquer les autres cartes de la liste pour ça).

3. Merger la PR (squash merge par défaut, sauf convention contraire du dépôt).
4. Déplacer la carte vers `Done`.
5. Supprimer la branche mergée (systématiquement, dès le merge fait).
6. Passer à la carte suivante de `To merge`, jusqu'à ce que la liste soit vide (ou ne contienne plus que des cartes en
   échec CI déjà signalées).

### 2. Recenser l'état de `En cours`

Lister toutes les cartes actuellement dans `En cours` et les classer :

- **Cartes avec le label `Bloqué — action requise` encore présent** : blocage non résolu, ne rien faire sur elles pour
  l'instant.
- **Cartes avec le label présent mais retiré depuis** : débloquées, à reprendre en priorité (sous-étape 2a).
- **Cartes sans label, mais qui viennent d'être déplacées depuis `A valider`** (review KO) : à reprendre en priorité au
  même titre que les cartes débloquées (sous-étape 2a).
- **Une carte sans label, déjà en cours de traitement actif depuis la dernière exécution** : il ne peut y en avoir
  qu'une seule à la fois — s'il y en a une, c'est celle sur laquelle continuer le développement (sous-étape 2b), et
  aucune autre carte ne doit être démarrée tant qu'elle n'est pas terminée ou bloquée.

### 2a. Reprendre les cartes débloquées ou renvoyées après review KO

Pour chaque carte concernée, une par une :

1. Appliquer la règle d'or de reprise d'historique (lecture complète carte + commentaires + **images** + recherche de
   branche/PR existante).
2. Reprendre le développement à partir de là (étape 2c), en corrigeant/complétant uniquement ce qui est demandé — jamais
   de redéveloppement complet si une branche/PR existe déjà.
3. Ne traiter qu'une carte à la fois : une fois qu'elle est terminée (PR mise à jour ou ouverte, carte déplacée en
   `A valider`) ou re-bloquée, passer à la carte suivante de cette catégorie s'il en reste, puis seulement ensuite à
   l'étape 2b/3.

### 2b. Continuer le ticket en cours de traitement actif

S'il existe une carte de `En cours` sans aucun label et déjà en développement actif depuis avant (hors reprise après
blocage/rejet) : reprendre le travail dessus (règle d'or de reprise d'historique également applicable ici si l'exécution
précédente s'est arrêtée en cours de route) et continuer le développement (étape 2c).

### 2c. Développement (commun à 2a, 2b et aux nouveaux tickets pris en 3)

1. Si ce n'est pas déjà fait, créer une branche dédiée avec un nom **lisible et parlant sur ce qui est fait** (et pas
   juste l'ID du ticket) : c'est ce nom qui se retrouve dans l'URL de preview, donc il doit rester compréhensible une
   fois là-dedans. Format : `<type>/<description-courte-en-mots-clés>`, ex. `feature/watchlist-films`,
   `fix/filtre-plateformes-streaming`. Éviter les IDs/hash illisibles ; le numéro de ticket peut être ajouté en suffixe
   si utile (`feature/watchlist-films-42`), mais jamais en tête ou seul.
2. Développer ce qui est demandé, commiter au fur et à mesure.
3. **Si un blocage survient** (ambiguïté du besoin, blocage technique, décision à prendre, dépendance manquante) et
   empêche de finaliser :
   1. Ajouter un commentaire détaillé sur la carte expliquant précisément le blocage et ce qui est attendu comme réponse.
   2. Ajouter le label `Bloqué — action requise` sur la carte.
   3. Assigner la carte au membre humain concerné.
   4. Laisser la carte en `En cours`, ne pas ouvrir/mettre à jour de PR au-delà de ce qui est déjà fait, et arrêter le
      traitement de ce ticket. Revenir à la boucle principale (cette carte ne compte plus comme "en cours de traitement
      actif").
4. Si le développement se termine sans blocage :
   1. Ouvrir une nouvelle Pull Request (cas d'un ticket neuf) ou pousser les nouveaux commits sur la PR existante (cas
      d'une reprise après review KO), avec dans la description un lien vers la carte Trello si ce n'est pas déjà fait.
   2. Récupérer l'URL de preview :
      - si un bot de déploiement (Cloudflare Workers, Netlify, Vercel…) l'a postée en commentaire sur la PR, la reprendre
        depuis là ;
      - sinon, la chercher dans les checks/deployments de la PR sur GitHub.
   3. Déplacer la carte vers `A valider`.
   4. Ajouter un commentaire sur la carte avec le lien de la preview (et le lien de la PR).
      **Toujours préfixer le commentaire par `🤖 [Claude]`** pour indiquer clairement qu'il s'agit d'un message automatisé.

### 3. Démarrer un nouveau ticket (liste `A faire`)

Ne démarrer un nouveau ticket que si, à ce stade, aucune carte de `En cours` n'est en cours de traitement actif sans
label (donc : aucune carte du tout en `En cours`, ou seulement des cartes bloquées avec le label toujours présent).

Tant que `A faire` contient des cartes et que la condition ci-dessus est vraie, répéter pour chacune, dans l'ordre de la
liste :

1. Prendre la première carte de `A faire`, la déplacer vers `En cours`.
2. Lire la description, les checklists et les commentaires de la carte pour comprendre la tâche.
3. Développer en suivant l'étape 2c.
4. Une fois ce ticket terminé (PR ouverte) ou bloqué, passer à la carte suivante de `A faire` si la condition de
   démarrage est de nouveau vraie (c'est le cas dès qu'un ticket est terminé ou bloqué, puisqu'il n'y a alors plus de
   traitement actif sans label en cours).

### 4. Rien de plus à faire

Si `To merge` et `A faire` sont vides, qu'aucune carte débloquée/renvoyée n'attend en `En cours`, et qu'il n'y a aucune
carte de `En cours` sans label en traitement actif : l'exécution est terminée. Attendre la prochaine exécution.

## Notes

- `A valider` et `Idées` ne sont jamais lues ni modifiées par ce skill, sauf pour déposer une carte dans `A valider` une
  fois un ticket terminé.
- Le passage `A valider` → `To merge` (validation OK) ou `A valider` → `En cours` (review KO) se fait manuellement par
  un humain, par simple déplacement de la carte — aucun autre signal (case, label) n'entre en jeu à cette étape.
- Ce skill ne tourne pas tout seul en tâche de fond : il se déclenche à chaque fois que Claude Code est lancé/relancé
  sur ce projet (manuellement, ou via une tâche planifiée / un hook si vous en configurez un).
- Si les noms de listes réels diffèrent (accents, majuscules, "A merger" vs "To merge"...), les faire correspondre par
  similarité plutôt que par égalité stricte.
- Si un appel à l'API Trello ou GitHub échoue (rate limit, erreur réseau, permission), ne pas modifier partiellement un
  état (ex. ne pas déplacer une carte si l'action associée a échoué). Réessayer une fois ; si l'échec persiste,
  s'arrêter et signaler l'erreur plutôt que de continuer sur un état incohérent.
- Tous les commentaires postés sur Trello par ce skill sont préfixés par `🤖 [Claude]` pour les distinguer des messages humains.

## Sortie attendue

À la fin de l'exécution, produis **toujours** un résumé JSON structuré de la forme suivante, même si aucune action n'a été effectuée :

```json
{
  "status": "success",
  "merged": [
    { "cardId": "...", "cardName": "...", "prUrl": "..." }
  ],
  "resumed": [
    { "cardId": "...", "cardName": "...", "status": "in_progress" | "blocked" }
  ],
  "started": [
    { "cardId": "...", "cardName": "...", "prUrl": "..." }
  ],
  "blocked": [
    { "cardId": "...", "cardName": "...", "reason": "..." }
  ],
  "summary": "Résumé en une phrase des actions effectuées"
}
```

- `merged` : cartes mergées de `To merge` → `Done`
- `resumed` : cartes reprises de `En cours` (débloquées ou renvoyées après review KO)
- `started` : nouveaux tickets démarrés depuis `A faire`
- `blocked` : cartes bloquées avec le label `Bloqué — action requise` ajouté
- `summary` : une phrase synthétique

Si une erreur survient en cours d'exécution (rate limit, tokens épuisés, bug), produis ce JSON à la place :

```json
{
  "status": "error",
  "error": "Description courte de l'erreur"
}
```

Ce résumé sera automatiquement envoyé comme notification de synthèse.
