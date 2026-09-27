# Fonctions shell pour piloter la stack Trello → Claude depuis le serveur (NAS).
# À charger depuis ~/.bashrc (voir README.md, « Commandes serveur ») :
#
#   source /Volume2/config/trello-claude/bobine/infra/trello-claude/bobine-shell.sh
#
# bobine-pull    checkout propre ? puis git fetch + git pull --ff-only dans bobine-repo
# bobine-rebuild rebuild des images et recréation des deux conteneurs
# bobine-deploy  bobine-pull, puis bobine-rebuild
# bobine-status  branche, commit, modifications Git et état Docker
# bobine-logs    suit les logs du listener Trello/Sentry

# Dossier de la stack (docker-compose-bobine.yml) sur le serveur.
BOBINE_STACK_DIR="${BOBINE_STACK_DIR:-/Volume2/config/trello-claude/bobine/infra/trello-claude}"

bobine-pull() {
  docker exec --user claudeuser bobine-repo bash -lc '
    set -e
    cd /workspace

    echo "=== Branche courante ==="
    git branch --show-current

    echo
    echo "=== Etat Git ==="
    git status --short

    if [ -n "$(git status --porcelain)" ]; then
      echo
      echo "ABANDON : le checkout contient des modifications non committees."
      echo "Inspecte-les avec : docker exec --user claudeuser bobine-repo bash -lc '\''cd /workspace && git status && git diff'\''"
      exit 1
    fi

    echo
    echo "=== Mise a jour ==="
    git fetch origin
    git pull --ff-only

    echo
    echo "=== Commit actif ==="
    git log -1 --oneline
  '
}

bobine-rebuild() {
  (
    set -e
    cd "$BOBINE_STACK_DIR"

    docker-compose -f docker-compose-bobine.yml \
      up -d --build --force-recreate

    echo
    docker-compose -f docker-compose-bobine.yml ps

    echo
    echo "=== Derniers logs du listener ==="
    docker logs --tail 20 trello-claude-listener
  )
}

# `&&` plutôt qu'un `set -e` : dans une fonction chargée par ~/.bashrc, un
# `set -e` s'appliquerait au shell interactif lui-même, qui se fermerait dès
# que bobine-pull échoue (checkout modifié).
bobine-deploy() {
  bobine-pull && bobine-rebuild
}

bobine-status() {
  echo "=== Git ==="
  docker exec --user claudeuser bobine-repo bash -lc '
    cd /workspace
    git status --short
    echo "Branche : $(git branch --show-current)"
    echo "Commit  : $(git log -1 --oneline)"
  '

  echo
  echo "=== Docker ==="
  (
    cd "$BOBINE_STACK_DIR"
    docker-compose -f docker-compose-bobine.yml ps
  )
}

bobine-logs() {
  docker logs -f --tail 100 trello-claude-listener
}
