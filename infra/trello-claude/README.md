# Stack notifications Trello → Claude → Discord

Sauvegarde versionnée de la stack qui fait tourner le pipeline `trello-ticket-pipeline` sur le
serveur (NAS) : un webhook listener reçoit les événements Trello, déclenche `claude -p` dans un
conteneur qui a le repo `bobine` monté, puis notifie Discord.

## Contenu

- `docker-compose-bobine.yml` — les deux services (`webhook-listener`, `bobine-repo`).
- `listener/` — le serveur Node qui reçoit les webhooks Trello et lance Claude Code.
- `bobine-repo/` — l'image dans laquelle tourne Claude Code (avec `git`, `gh`, accès SSH) et
  `bobine-claude-run.sh`, le script qui lance chaque exécution (voir « Clone de travail de Claude »).
- `ssh-keys/` — uniquement `config` (pas de secret) ; voir `ssh-keys/README.md` pour générer la
  clé privée directement sur le serveur.
- `.env.example` — modèle des variables d'environnement à fournir via un `.env` local.
- `bobine-shell.sh` — fonctions shell `bobine-*` à charger dans le `~/.bashrc` du serveur (voir
  « Commandes serveur » plus bas).
- `update.sh` — reconstruit et redémarre uniquement `webhook-listener` (seul service qui change
  en pratique, quand `listener/server.js` est modifié).

**Aucun secret n'est présent dans ce dossier.** Toutes les valeurs sensibles (clé/token Trello,
webhook Discord, token GitHub, token OAuth Claude Code, token API Sentry) sont injectées via
`.env`, qui reste sur le serveur et n'est jamais commité (voir `.gitignore` à la racine du repo).

## Clone de travail de Claude

Claude ne travaille jamais dans le checkout du serveur : on peut donc `bobine-pull` et reconstruire
la stack sans attendre qu'il ait fini, ni le retrouver sur une branche de ticket.

- Le checkout du serveur (`../../`, celui qui contient cette stack) est monté dans `bobine-repo`
  en `/srv/bobine`. Il reste sur `main` ; seules les commandes `bobine-*` y touchent.
- Claude a son propre clone dans le volume `claude-workspace`, monté en `/workspace` (même chemin
  qu'avant, pour garder sa mémoire). Il est créé au premier lancement depuis le remote `origin`
  du checkout serveur.
- Le listener lance chaque exécution via `bobine-claude-run`, qui :
  1. prend un verrou (`flock` sur `/tmp/bobine-claude-run.lock` dans `bobine-repo`, libéré
     automatiquement même en cas de crash) et sort avec le code 75 si une exécution tourne déjà ;
  2. `git fetch`, met de côté d'éventuelles modifications laissées par une exécution interrompue
     (`git stash list` dans le clone pour les retrouver) ;
  3. repart de `main` à jour (`git switch -C main origin/main`, skills compris) ;
  4. fait le ménage : supprime les worktrees de validation locale restés dans `/tmp` (et leurs
     `node_modules`), les branches locales dont la branche distante a disparu (PR mergée ou
     fermée), les stashes de plus de 30 jours, puis `git gc --auto` ;
  5. lance `claude -p`, en ajoutant au prompt une note « REPRISE » si l'exécution précédente
     s'est interrompue (modifications mises de côté, commits locaux non poussés sur une branche
     de ticket), pour que Claude reparte de ce travail plutôt que de zéro.
- Reprise après coupure (courant, crédits épuisés, `bobine-rebuild --force`…) : la carte reste en
  `En cours` sans label, la prochaine exécution la reprend (étape 2b du skill) à partir de la
  branche/PR poussée, des commits locaux et du stash signalés dans la note. Seul le travail non
  committé d'un worktree de validation `/tmp` est perdu (il ne sert qu'aux tests locaux).
- `bobine-rebuild` lit ce même verrou avant de recréer `bobine-repo` (voir « Commandes serveur »).

Migration (une fois) : `bobine-pull`, recharger les fonctions (`source ~/.bashrc`), puis
`bobine-rebuild` (le Dockerfile, le compose et le listener changent). Si le checkout serveur
était resté sur une branche de ticket, `bobine-main` le ramène sur `main` ; il n'en bougera
plus ensuite.

Pas de parallélisation pour l'instant : le verrou limite à une exécution à la fois, comme la règle
« un seul ticket actif » du skill. Un worktree par ticket le permettrait techniquement, mais il
faudrait d'abord qu'une exécution « réserve » sa carte sur Trello (deux exécutions prendraient
sinon la même), éviter les conflits sur les ressources partagées (port 8787 du `wrangler dev`,
numéros de migrations D1, limite de sessions Claude) et accepter plusieurs PR en review à la fois.

## Webhook Sentry → Claude (triage automatique)

En plus de `/trello-webhook`, le listener expose `POST /sentry-webhook?secret=<SENTRY_WEBHOOK_SECRET>` :
une alerte Sentry déclenche une notification Discord immédiate, puis (si le pipeline n'est pas déjà
occupé) un `claude -p` dans `bobine-repo` qui suit le skill `sentry-triage` (lecture du détail de
l'issue via l'API Sentry, correctif direct en PR ou création d'une carte Trello "A faire" selon le
cas). Voir `.claude/skills/sentry-triage/SKILL.md` à la racine du repo pour le détail du
comportement de Claude une fois déclenché.

La notification Discord immédiate (`🚨 Nouvelle alerte Sentry : ...`, envoyée dès réception du
webhook, avant même que Claude ne traite l'alerte) part sur `DISCORD_SENTRY_WEBHOOK_URL`, un
webhook dédié au salon "erreurs-prod" — distinct de `DISCORD_WEBHOOK_URL` pour ne pas mélanger ces
alertes avec les notifications de fin de pipeline Trello.

Étapes manuelles pour l'activer (ne peuvent pas être faites depuis ce repo) :

1. Renseigner dans `.env` : `SENTRY_WEBHOOK_SECRET` (valeur aléatoire, ex. `openssl rand -hex 32`),
   `SENTRY_AUTH_TOKEN` (Sentry > Settings > Auth Tokens, scope `event:read` a minima), `SENTRY_ORG_SLUG`
   et `SENTRY_PROJECT_SLUG`.
2. Créer un webhook Discord dans le salon "erreurs-prod" (Paramètres du salon > Intégrations >
   Webhooks > Nouveau Webhook) et renseigner son URL dans `.env` sous `DISCORD_SENTRY_WEBHOOK_URL`.
3. Redéployer avec les nouvelles variables (`docker-compose -f docker-compose-bobine.yml up -d`
   pour recréer les deux services avec le `.env` à jour, ou `./update.sh` si seul le listener a
   changé — ici il faut aussi recréer `bobine-repo` pour lui injecter `SENTRY_AUTH_TOKEN`).
4. Dans Sentry, sur le projet concerné : Alerts > Create Alert Rule > condition souhaitée (ex. "a
   new issue is created") > action "Send a notification via a webhook" > URL =
   `https://<host-du-listener>:29000/sentry-webhook?secret=<SENTRY_WEBHOOK_SECRET>`.

## Vérification visuelle par Claude (navigateur headless)

L'image `bobine-repo` embarque Chromium (via Playwright) et un script `bobine-screenshot` :
Claude peut capturer une page en desktop (1440×900) et en mobile (iPhone 13), puis lire le PNG
pour vérifier son travail. Deux cibles possibles :

- **La preview de la PR** (`https://<branche>-bobine.creusatbenjamin.workers.dev`), avec sa
  base D1 de preview et les vraies données TMDB. Elle est protégée par Cloudflare Access : il faut
  un **jeton de service** (étapes 1 et 2 ci-dessous).
- **Un serveur local** `wrangler dev` lancé dans le conteneur, avec une D1 locale remplie de
  données de test. Il faut une clé TMDB pour avoir de vraies affiches et fiches (étape 3).

Étapes manuelles (une seule fois) :

1. Cloudflare Zero Trust > **Access > Service Auth > Service Tokens** > _Create Service Token_
   (ex. `claude-screenshots`, durée « Non-expiring » ou 1 an). Copier le _Client ID_ et le
   _Client Secret_ (le secret n'est affiché qu'une fois) dans `.env` :
   `CF_ACCESS_CLIENT_ID=…` et `CF_ACCESS_CLIENT_SECRET=…`.
2. Zero Trust > **Access > Applications** > l'application qui protège les previews
   (`*-bobine.creusatbenjamin.workers.dev`) > _Policies_ > _Add a policy_ : **Action =
   Service Auth**, _Include_ > **Service Token** = le jeton créé en 1. Enregistrer. (Une policy
   « Allow » ne suffit pas : un jeton de service n'est accepté que par une policy « Service
   Auth ».)
3. (Optionnel, pour le serveur local) Renseigner `TMDB_API_KEY=…` dans `.env` (clé API TMDB
   v3, la même que le secret du Worker convient).
4. Reconstruire l'image (le Dockerfile a changé, d'où le `--build`) et recréer les services
   (`bobine-rebuild`, ou à la main) :

   ```bash
   docker-compose -f docker-compose-bobine.yml up -d --build --force-recreate bobine-repo webhook-listener
   ```

5. Vérifier :

   ```bash
   docker exec -u claudeuser bobine-repo bobine-screenshot https://example.com /tmp/test.png
   # Preview (après les étapes 1-2) : doit afficher « HTTP 200 » et l'URL de la preview,
   # pas une page cloudflareaccess.com.
   docker exec -u claudeuser bobine-repo bobine-screenshot https://<une-preview>-bobine.creusatbenjamin.workers.dev /tmp/preview.png
   ```

Sans les étapes 1-2, les captures fonctionnent quand même, mais uniquement sur le serveur local.

## Déploiement initial sur le serveur

```bash
# Sur le NAS, dans le dossier qui accueille la stack (ex. /Volume2/config/trello-claude) :
cp .env.example .env
# éditer .env avec les vraies valeurs

mkdir -p ssh-keys && cd ssh-keys
ssh-keygen -t ed25519 -f id_rsa_theapac -C "<email associé>" -N ""
ssh-keyscan github.com >> known_hosts
cd ..

docker-compose -f docker-compose-bobine.yml up -d --build
```

## Commandes serveur (`bobine-*`)

Raccourcis pour vérifier, mettre à jour et reconstruire la stack depuis un shell du serveur.
Installation (une fois), en adaptant le chemin si le clone du repo est ailleurs :

```bash
echo "source /Volume2/config/trello-claude/bobine/infra/trello-claude/bobine-shell.sh" >> ~/.bashrc
source ~/.bashrc
```

| Commande                                 | Effet                                                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `bobine-pull`                            | Vérifie que le checkout serveur est propre, puis `git fetch` et `git pull --ff-only` sur sa branche                          |
| `bobine-main`                            | Vérifie que le checkout serveur est propre et que tous ses commits sont poussés, puis bascule sur `main` et le met à jour    |
| `bobine-rebuild [all\|listener\|claude]` | Rebuild + recréation (`up -d --build --force-recreate`) des deux conteneurs (`all`, défaut), du listener ou de `bobine-repo` |
| `bobine-deploy [all\|listener\|claude]`  | Lance `bobine-pull`, puis `bobine-rebuild` avec les mêmes arguments s'il a réussi                                            |
| `bobine-status`                          | Branche et commit du checkout serveur et du clone de Claude, exécution Claude en cours ou non, état Docker                   |
| `bobine-logs`                            | Suit les logs du listener Trello/Sentry                                                                                      |

Avant de recréer `bobine-repo` (`all` ou `claude`), `bobine-rebuild` vérifie qu'aucune exécution
Claude n'est en cours et s'arrête sinon (`--force` pour passer outre, ce qui l'interrompt).
`bobine-rebuild listener` est toujours sans risque : une exécution en cours continue dans
`bobine-repo` (seul son log `/tmp/claude-last-run.log` est perdu) et le verrou empêche le nouveau
listener d'en lancer une seconde en parallèle.

`git pull --ff-only` actualise la branche sans créer de merge commit implicite et s'arrête si
l'historique local a divergé. `--build` est indispensable pour prendre en compte un changement de
Dockerfile ou d'un fichier copié dans une image (ex. `listener/server.js`), `--force-recreate`
garantit une nouvelle instance de conteneur. Le dossier de la stack peut être changé avec la
variable `BOBINE_STACK_DIR`.

## Mise à jour (commande simple)

Après avoir modifié `listener/server.js` (ou récupéré les derniers changements du repo) :

```bash
./update.sh
```

Équivalent à la commande manuelle utilisée jusqu'ici
(`docker-compose -f docker-compose-bobine.yml up -d --build --force-recreate webhook-listener`),
mais sans avoir à s'en souvenir.

## Mise à jour automatique (optionnel)

Si `/Volume2/config/trello-claude` est un clone (ou un `git sparse-checkout` de ce seul dossier)
du repo `bobine`, une entrée crontab permet de récupérer et appliquer les changements
automatiquement :

```cron
0 4 * * * cd /Volume2/config/trello-claude && git pull --quiet && ./update.sh >> /tmp/trello-claude-update.log 2>&1
```
