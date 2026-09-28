# Stack notifications Trello → Claude → Discord

Sauvegarde versionnée de la stack qui fait tourner le pipeline `trello-ticket-pipeline` sur le
serveur (NAS) : un webhook listener reçoit les événements Trello, déclenche `claude -p` dans un
conteneur qui a le repo `bobine` monté, puis notifie Discord.

## Contenu

- `docker-compose-bobine.yml` — les deux services (`webhook-listener`, `bobine-repo`).
- `listener/` — le serveur Node qui reçoit les webhooks Trello et lance Claude Code.
- `bobine-repo/` — l'image dans laquelle tourne Claude Code (avec `git`, `gh`, accès SSH).
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

| Commande         | Effet                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `bobine-pull`    | Vérifie que le checkout de `bobine-repo` est propre, puis `git fetch` et `git pull --ff-only` sur la branche actuellement checkoutée |
| `bobine-rebuild` | Rebuild les images et recrée les deux conteneurs (`up -d --build --force-recreate`)                                                  |
| `bobine-deploy`  | Lance `bobine-pull`, puis `bobine-rebuild` s'il a réussi                                                                             |
| `bobine-status`  | Affiche branche, commit, éventuelles modifications Git et état Docker                                                                |
| `bobine-logs`    | Suit les logs du listener Trello/Sentry                                                                                              |

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
