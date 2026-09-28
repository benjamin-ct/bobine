#!/usr/bin/env bash
# Lance une exécution `claude -p` dans le clone de travail dédié de Claude.
# Appelé par le listener : docker exec --user claudeuser bobine-repo bobine-claude-run "<prompt>"
#
# - Claude ne travaille jamais dans le checkout du serveur (monté en $BOBINE_STACK_REPO) : il a
#   son propre clone ($BOBINE_WORKSPACE, volume Docker), qu'il peut changer de branche à volonté
#   sans empêcher un humain de faire `bobine-pull` / `bobine-rebuild` côté serveur.
# - Une seule exécution à la fois : verrou flock, libéré automatiquement à la fin du processus
#   (même en cas de crash). Code de sortie 75 si une exécution est déjà en cours ; bobine-shell.sh
#   teste ce même verrou avant de recréer le conteneur.
set -euo pipefail

WORKSPACE="${BOBINE_WORKSPACE:-/workspace}"
STACK_REPO="${BOBINE_STACK_REPO:-/srv/bobine}"
LOCK_FILE="${BOBINE_CLAUDE_LOCK:-/tmp/bobine-claude-run.lock}"
CLAUDE_MODEL="${CLAUDE_MODEL:-claude-opus-5-5}"

if [ $# -ne 1 ] || [ -z "$1" ]; then
  echo "Usage : bobine-claude-run \"<prompt>\"" >&2
  exit 64
fi
prompt="$1"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Une execution Claude est deja en cours dans bobine-repo." >&2
  exit 75
fi

# Premier lancement : le volume est vide, on clone depuis le même remote que le checkout serveur.
if [ ! -d "$WORKSPACE/.git" ]; then
  origin_url=$(git -C "$STACK_REPO" remote get-url origin)
  git clone --quiet "$origin_url" "$WORKSPACE"
fi

cd "$WORKSPACE"
git fetch --quiet --prune origin

# Une exécution précédente interrompue a pu laisser des modifications : on les met de côté
# (récupérables via `git stash list`) plutôt que de les perdre ou de partir d'un état sale.
if [ -n "$(git status --porcelain)" ]; then
  branch=$(git branch --show-current || true)
  git stash push --quiet --include-untracked \
    -m "bobine-claude-run $(date -u +%Y-%m-%dT%H:%M:%SZ) (${branch:-HEAD détachée})"
  echo "Modifications non committées mises de côté : $(git stash list -1 --format=%gs)" >&2
fi

# Chaque exécution part de main à jour (skills compris) ; les branches locales restent intactes.
git switch --quiet --force-create main origin/main

# Pas d'`exec` et `9>&-` : le verrou reste tenu par ce script seul, pas par les processus que
# Claude laisserait tourner (ex. un `wrangler dev` orphelin), qui le bloqueraient indéfiniment.
status=0
claude --model "$CLAUDE_MODEL" -p "$prompt" \
  --dangerously-skip-permissions \
  --allowedTools 'Bash(git *)' 'Bash(curl *)' Read Write \
  9>&- || status=$?
exit "$status"
