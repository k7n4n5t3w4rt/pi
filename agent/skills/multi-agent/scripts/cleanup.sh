#!/usr/bin/env bash
# cleanup.sh — Remove git worktrees and tmux session created by run-agents.sh.
#
# Usage:
#   ./cleanup.sh [--session NAME] [repo-path]

set -euo pipefail

SESSION="pi-agents"
REPO="${1:-$PWD}"
REPO="$(cd "$REPO" && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --session)
      SESSION="$2"
      shift 2
      ;;
    *)
      REPO="$1"
      REPO="$(cd "$REPO" && pwd)"
      shift
      ;;
  esac
done

BASE="$(basename "$REPO")"
PARENT="$(dirname "$REPO")"

echo "Cleaning up multi-agent session '$SESSION' for $REPO"

# ── Kill tmux session ─────────────────────────────────────────────────────────

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "→ Killing tmux session '$SESSION'"
  tmux kill-session -t "$SESSION"
else
  echo "→ No tmux session '$SESSION' found"
fi

# ── Remove agent worktrees ────────────────────────────────────────────────────

shopt -s nullglob
for WORKTREE in "$PARENT/${BASE}-agent-"*; do
  if [[ -d "$WORKTREE" ]]; then
    WT_BASE=$(basename "$WORKTREE")
    # Derive branch name from worktree directory name
    SAFE_SUFFIX="${WT_BASE#${BASE}-agent-}"
    BRANCH="agent/$SAFE_SUFFIX"

    echo "→ Removing worktree: $WORKTREE"

    # Remove the worktree
    git -C "$REPO" worktree remove "$WORKTREE" --force 2>/dev/null || {
      echo "  Could not remove worktree via git. Manual cleanup may be needed."
      echo "  rm -rf $WORKTREE"
      echo "  git -C $REPO worktree prune"
    }

    # Delete the branch if it still exists
    if git -C "$REPO" show-ref --verify --quiet "refs/heads/$BRANCH"; then
      echo "→ Deleting branch: $BRANCH"
      git -C "$REPO" branch -D "$BRANCH" 2>/dev/null || true
    fi
  fi
done

# Prune any stale worktree references
git -C "$REPO" worktree prune 2>/dev/null || true

echo "Done."
