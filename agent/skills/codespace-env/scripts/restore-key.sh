#!/usr/bin/env bash
# Restore the codespace's GitHub SSH key after a container rebuild.
# The key survives stop/start but is wiped by a devcontainer rebuild.
set -euo pipefail

BACKUP_DIR="$HOME/.ssh/codespace-backups/super-duper-waffle-75j7r6jvjhpr7x"
HOST="codespace"

if [ ! -f "$BACKUP_DIR/id_ed25519" ] || [ ! -f "$BACKUP_DIR/id_ed25519.pub" ]; then
  echo "Backup key not found in $BACKUP_DIR" >&2
  exit 1
fi

ssh "$HOST" 'mkdir -p ~/.ssh && chmod 700 ~/.ssh'
scp "$BACKUP_DIR/id_ed25519" "$BACKUP_DIR/id_ed25519.pub" "$HOST":.ssh/
ssh "$HOST" 'chmod 600 ~/.ssh/id_ed25519 && chmod 644 ~/.ssh/id_ed25519.pub'
ssh "$HOST" 'ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null || true'
# Re-apply the SSH URL rewrite if the rebuild reset global git config
ssh "$HOST" 'git config --global url."git@github.com:".insteadOf "https://github.com/"'

echo "Key restored. Verify with:"
echo "  ssh codespace 'ssh -T git@github.com'"
