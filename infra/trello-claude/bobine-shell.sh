# Fonctions shell pour piloter la stack Trello → Claude depuis le serveur (NAS).
# À charger depuis ~/.bashrc (voir README.md, « Commandes serveur ») :
#
#   source /Volume2/config/trello-claude/bobine/infra/trello-claude/bobine-shell.sh
#
# bobine-pull    checkout serveur propre ? puis git fetch + git pull --ff-only
# bobine-main    checkout serveur propre et tout poussé ? puis bascule sur main à jour
# bobine-rebuild [all|listener|claude|tunnel] rebuild + recréation (vérifie qu'aucune exécution
#                Claude n'est en cours avant de toucher à bobine-repo ; --force pour passer outre)
#                "tunnel" (cloudflared, voir README « Exposition externe via Cloudflare Tunnel »)
#                n'est jamais inclus dans "all" : à démarrer explicitement une fois configuré.
# bobine-deploy  bobine-pull, puis bobine-rebuild (mêmes arguments)
# bobine-status  branches/commits (checkout serveur et clone de Claude), exécution en cours, Docker
# bobine-logs    suit les logs du listener Trello/Sentry
#
# Le checkout serveur est monté dans bobine-repo en /srv/bobine ; Claude travaille dans son
# propre clone (/workspace, volume claude-workspace) et ne change donc jamais sa branche.

# Dossier de la stack (docker-compose-bobine.yml) sur le serveur.
BOBINE_STACK_DIR="${BOBINE_STACK_DIR:-/Volume2/config/trello-claude/bobine/infra/trello-claude}"

bobine-pull() {
  docker exec --user claudeuser bobine-repo bash -lc '
    set -e
    cd /srv/bobine

    echo "=== Branche courante ==="
    git branch --show-current

    echo
    echo "=== Etat Git ==="
    git status --short

    if [ -n "$(git status --porcelain)" ]; then
      echo
      echo "ABANDON : le checkout contient des modifications non committees."
      echo "Inspecte-les avec : docker exec --user claudeuser bobine-repo bash -lc '\''cd /srv/bobine && git status && git diff'\''"
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

bobine-main() {
  docker exec --user claudeuser bobine-repo bash -lc '
    set -e
    cd /srv/bobine

    echo "=== Branche courante ==="
    git branch --show-current

    echo
    echo "=== Etat Git ==="
    git status --short

    # Modifications non committées, y compris fichiers non suivis.
    if [ -n "$(git status --porcelain)" ]; then
      echo
      echo "ABANDON : le checkout contient des modifications non committees."
      echo "Inspecte-les avec : docker exec --user claudeuser bobine-repo bash -lc '\''cd /srv/bobine && git status && git diff'\''"
      exit 1
    fi

    git fetch origin

    # Commits locaux absents du remote : ils seraient difficiles à retrouver
    # une fois sur main (branche sans upstream, ou en avance sur lui).
    if git rev-parse --abbrev-ref --symbolic-full-name "@{u}" >/dev/null 2>&1; then
      unpushed=$(git rev-list --count "@{u}..HEAD")
    else
      unpushed=$(git rev-list --count HEAD --not --remotes=origin)
    fi
    if [ "$unpushed" -gt 0 ]; then
      echo
      echo "ABANDON : $unpushed commit(s) de la branche courante ne sont pas pousses :"
      git log --oneline -n 10 HEAD --not --remotes=origin
      exit 1
    fi

    echo
    echo "=== Bascule sur main ==="
    git switch main
    git pull --ff-only origin main

    echo
    echo "=== Etat final ==="
    git status --short --branch
    git log -1 --oneline
  '
}

# Verrou posé par bobine-claude-run pendant une exécution Claude (voir bobine-repo/).
BOBINE_CLAUDE_LOCK="/tmp/bobine-claude-run.lock"

# 0 si une exécution Claude tourne dans bobine-repo. flock -E 75 distingue « verrou pris »
# d'un conteneur arrêté (docker exec échoue alors avec un autre code).
bobine-claude-busy() {
  docker exec --user claudeuser bobine-repo \
    flock -n -E 75 "$BOBINE_CLAUDE_LOCK" true >/dev/null 2>&1
  [ $? -eq 75 ]
}

# bobine-rebuild [all|listener|claude|tunnel] [--force]
#   listener : toujours sans risque, une exécution Claude en cours continue dans bobine-repo
#              (seul son log /tmp/claude-last-run.log est perdu).
#   claude   : bobine-repo seul ; refusé si une exécution Claude est en cours.
#   tunnel   : cloudflared seul (profil "tunnel", voir README) ; jamais inclus dans "all".
#   all      : bobine-repo + webhook-listener (défaut) ; même vérification.
bobine-rebuild() {
  local target="all" force=""
  local arg
  for arg in "$@"; do
    case "$arg" in
      all | listener | claude | tunnel) target="$arg" ;;
      --force) force=1 ;;
      *)
        echo "Usage : bobine-rebuild [all|listener|claude|tunnel] [--force]" >&2
        return 64
        ;;
    esac
  done

  local services
  case "$target" in
    listener) services="webhook-listener" ;;
    claude) services="bobine-repo" ;;
    tunnel) services="cloudflared" ;;
    all) services="bobine-repo webhook-listener" ;;
  esac

  if [ "$target" != "listener" ] && [ "$target" != "tunnel" ] && [ -z "$force" ] && bobine-claude-busy; then
    echo "ABANDON : une execution Claude est en cours dans bobine-repo."
    echo "Relance plus tard, ou 'bobine-rebuild listener' pour ne mettre a jour que le listener."
    echo "(--force pour recreer quand meme et interrompre Claude.)"
    return 1
  fi

  (
    set -e
    cd "$BOBINE_STACK_DIR"

    # shellcheck disable=SC2086 # liste de services volontairement découpée
    docker-compose -f docker-compose-bobine.yml \
      up -d --build --force-recreate $services

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
  bobine-pull && bobine-rebuild "$@"
}

bobine-status() {
  echo "=== Git (checkout serveur) ==="
  docker exec --user claudeuser bobine-repo bash -lc '
    cd /srv/bobine
    git status --short
    echo "Branche : $(git branch --show-current)"
    echo "Commit  : $(git log -1 --oneline)"
  '

  echo
  echo "=== Claude (clone de travail) ==="
  docker exec --user claudeuser bobine-repo bash -lc '
    if [ -d /workspace/.git ]; then
      cd /workspace
      echo "Branche : $(git branch --show-current)"
      echo "Commit  : $(git log -1 --oneline)"
    else
      echo "Pas encore cloné (créé à la première exécution)."
    fi
  '
  if bobine-claude-busy; then
    echo "Exécution : en cours"
  else
    echo "Exécution : aucune"
  fi

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
