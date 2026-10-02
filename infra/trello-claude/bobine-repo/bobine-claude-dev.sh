#!/usr/bin/env bash
# Lance le développeur délégué (`claude -p`, voir « Modèle et effort par ticket » dans le skill
# trello-ticket-pipeline) avec le jeton OAuth du compte. Modèle/effort par défaut du développeur
# (CLAUDE_DEV_MODEL/CLAUDE_DEV_EFFORT, distincts de CLAUDE_MODEL/CLAUDE_EFFORT de la session
# orchestratrice) appliqués si l'appelant ne les a pas déjà passés en argument.
#
# Claude Code retire CLAUDE_CODE_OAUTH_TOKEN de l'environnement des commandes qu'il lance : un
# `claude -p` lancé depuis l'outil Bash retomberait sur ~/.claude/.credentials.json, expiré.
# bobine-claude-run écrit donc le jeton dans un fichier (chmod 600) avant chaque exécution, et ce
# script le relit. Choix assumé (carte Trello « test », option 1) : le jeton devient lisible par
# les commandes lancées par Claude.
set -euo pipefail

TOKEN_FILE="${BOBINE_CLAUDE_TOKEN_FILE:-$HOME/.bobine-claude-token}"
CLAUDE_DEV_MODEL="${CLAUDE_DEV_MODEL:-claude-opus-5-5}"
CLAUDE_DEV_EFFORT="${CLAUDE_DEV_EFFORT:-}"

if [ ! -s "$TOKEN_FILE" ]; then
  echo "bobine-claude-dev : jeton introuvable ($TOKEN_FILE). Il est écrit par bobine-claude-run ;" \
    "vérifier CLAUDE_CODE_OAUTH_TOKEN dans le .env du serveur puis bobine-rebuild claude." >&2
  exit 78
fi

CLAUDE_CODE_OAUTH_TOKEN=$(cat "$TOKEN_FILE")
export CLAUDE_CODE_OAUTH_TOKEN

args=("$@")
if ! printf '%s\n' "$@" | grep -qx -- '--model'; then
  args+=(--model "$CLAUDE_DEV_MODEL")
fi
if [ -n "$CLAUDE_DEV_EFFORT" ] && ! printf '%s\n' "$@" | grep -qx -- '--effort'; then
  args+=(--effort "$CLAUDE_DEV_EFFORT")
fi

exec claude "${args[@]}"
