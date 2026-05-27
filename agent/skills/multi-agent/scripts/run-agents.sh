#!/usr/bin/env bash
# run-agents.sh — Launch multiple Pi coding agents in parallel with git worktree isolation.
#
# Usage:
#   ./run-agents.sh [--config FILE] [--session NAME] [repo-path]
#   ./run-agents.sh NAME "PROMPT" [NAME "PROMPT" ...] [--session NAME] [repo-path]
#
# Config file format (one agent per line):
#   name:prompt text
#
# Each agent gets its own git worktree at ../<repo>-agent-<name> on branch agent/<name>.

set -euo pipefail

SESSION="pi-agents"
REPO=""
CONFIG_FILE=""
declare -a AGENTS=()  # alternating name prompt pairs

# ── Parse args ────────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      CONFIG_FILE="$2"
      shift 2
      ;;
    --session)
      SESSION="$2"
      shift 2
      ;;
    -*)
      echo "Unknown flag: $1"
      exit 1
      ;;
    *)
      # Either a repo path or the start of name/prompt pairs.
      if [[ -z "$REPO" ]] && [[ -d "$1" || "$1" == /* || "$1" == .* || "$1" == ~* ]]; then
        REPO="$1"
        shift
      else
        AGENTS+=("$1")
        shift
      fi
      ;;
  esac
done

# Load agents from config file if provided.
if [[ -n "$CONFIG_FILE" ]]; then
  if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "Config file not found: $CONFIG_FILE"
    exit 1
  fi
  while IFS=':' read -r name prompt || [[ -n "$name" ]]; do
    # Skip empty lines and comments
    [[ -z "$name" || "$name" =~ ^[[:space:]]*# ]] && continue
    # Trim leading/trailing whitespace from name
    name=$(echo "$name" | xargs)
    prompt=$(echo "$prompt" | xargs)
    AGENTS+=("$name" "$prompt")
  done < "$CONFIG_FILE"
fi

# If we have an odd number of remaining args, last one is the repo.
if [[ $(( ${#AGENTS[@]} % 2 )) -ne 0 ]]; then
  REPO="${AGENTS[-1]}"
  unset 'AGENTS[-1]'
fi

REPO="${REPO:-$PWD}"
REPO="$(cd "$REPO" && pwd)"

if [[ ${#AGENTS[@]} -eq 0 ]]; then
  echo "Usage: run-agents.sh [--config FILE] [--session NAME] NAME PROMPT [NAME PROMPT ...]"
  echo ""
  echo "Example:"
  echo "  run-agents.sh architecture 'Analyse the codebase.' implementation 'Implement TASK.md.'"
  exit 1
fi

# ── Validate prerequisites ────────────────────────────────────────────────────

if ! command -v tmux &>/dev/null; then
  echo "tmux is required but not installed."
  exit 1
fi

if ! command -v pi &>/dev/null; then
  echo "pi is required but not found in PATH."
  exit 1
fi

if ! git -C "$REPO" rev-parse --is-inside-work-tree &>/dev/null; then
  echo "$REPO is not a git repository."
  exit 1
fi

# ── Check for existing session ───────────────────────────────────────────────

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "tmux session '$SESSION' already exists."
  echo "Attach:  tmux attach -t $SESSION"
  echo "Kill:    tmux kill-session -t $SESSION"
  exit 1
fi

# ── Create worktrees and launch agents ────────────────────────────────────────

BASE="$(basename "$REPO")"
PARENT="$(dirname "$REPO")"
FIRST_WINDOW=1

for ((i = 0; i < ${#AGENTS[@]}; i += 2)); do
  NAME="${AGENTS[$i]}"
  PROMPT="${AGENTS[$((i + 1))]}"

  # Sanitise name for branch/filesystem
  SAFE_NAME=$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/-\+/-/g' | sed 's/^-//;s/-$//')
  BRANCH="agent/$SAFE_NAME"
  WORKTREE="$PARENT/${BASE}-agent-${SAFE_NAME}"

  echo "→ Agent '$NAME': worktree=$WORKTREE branch=$BRANCH"

  # Create worktree
  git -C "$REPO" worktree add "$WORKTREE" -b "$BRANCH" 2>/dev/null || {
    echo "  Worktree already exists or branch in use — using existing worktree."
  }

  # Prepare pi command
  PI_CMD="cd '$WORKTREE' && pi -p '$PROMPT'"

  if [[ $FIRST_WINDOW -eq 1 ]]; then
    tmux new-session -d -s "$SESSION" -n "$NAME" "$PI_CMD"
    FIRST_WINDOW=0
  else
    tmux new-window -t "$SESSION" -n "$NAME" "$PI_CMD"
  fi

  echo "  Launched in tmux window '$NAME'"
done

# ── Finalise ──────────────────────────────────────────────────────────────────

cat <<EOF

All agents launched in tmux session '$SESSION'.

  Attach:  tmux attach -t $SESSION
  List:    tmux list-windows -t $SESSION

When done, inspect each branch:

  git -C '$REPO' log --oneline --all --graph
  git -C '$REPO' diff main..agent/<name>

Then merge:

  git -C '$REPO' checkout main
  git -C '$REPO' merge agent/<name>

Cleanup worktrees:  ./scripts/cleanup.sh --session '$SESSION' '$REPO'
EOF
