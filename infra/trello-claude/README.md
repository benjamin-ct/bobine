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
- `update.sh` — reconstruit et redémarre uniquement `webhook-listener` (seul service qui change
  en pratique, quand `listener/server.js` est modifié).

**Aucun secret n'est présent dans ce dossier.** Toutes les valeurs sensibles (clé/token Trello,
webhook Discord, token GitHub, token OAuth Claude Code) sont injectées via `.env`, qui reste sur
le serveur et n'est jamais commité (voir `.gitignore` à la racine du repo).

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
