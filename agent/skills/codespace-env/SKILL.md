---
name: codespace-env
description: Connect to and manage the persistent GitHub Codespaces cloud dev environment (super-duper-waffle). Use when connecting via ssh codespace, troubleshooting GitHub auth from inside the codespace, restoring SSH keys after a container rebuild, or changing the codespace idle timeout.
---

# Persistent Codespaces Dev Environment

A persistent cloud dev environment running as a GitHub Codespace, accessed over plain `ssh`.

## Connect

```bash
ssh codespace
```

The `codespace` host is an alias in `~/.ssh/config` that wraps `gh codespace ssh` as a ProxyCommand, so OpenSSH (and `scp`, `rsync`, `sshfs`, git remotes, tab-completion) treats it as a normal host.

Current `~/.ssh/config` entry:

```
Host codespace
	User codespace
	ProxyCommand /opt/homebrew/bin/gh cs ssh -c super-duper-waffle-75j7r6jvjhpr7x --stdio -- -i /Users/m1/.ssh/codespaces.auto
	UserKnownHostsFile=/dev/null
	StrictHostKeyChecking no
	LogLevel quiet
	ControlMaster auto
	IdentityFile /Users/m1/.ssh/codespaces.auto
```

The `Host codespace` block must stay **above** the `Host *` block in `~/.ssh/config`.

## Identity

- Codespace name: `super-duper-waffle-75j7r6jvjhpr7x`
- Repo: `k7n4n5t3w4rt/agent` (checked out at `/workspaces/agent`)
- Home dir inside codespace: `/home/codespace`
- Ubuntu 24.04.5 LTS, 4 CPU / 15 GB RAM / 32 GB disk

## Auth architecture (two layers)

**Layer 1 — local Mac → codespace.** Uses the dedicated ed25519 key `~/.ssh/codespaces.auto`, generated and uploaded by `gh`. The local `gh` OAuth token (keyring) only manages the codespace (list/create/upload key), never the session. No action needed.

**Layer 2 — codespace → GitHub.com.** Uses a dedicated ed25519 key generated inside the codespace at `~/.ssh/id_ed25519` (comment `codespace-super-duper-waffle`). Its public key is registered on the GitHub account. The codespace has a global git config rule routing all GitHub HTTPS URLs through SSH:

```bash
git config --global url."git@github.com:".insteadOf "https://github.com/"
```

No `GITHUB_TOKEN` is injected into this codespace (created without it), and `gh` is not logged in inside the codespace — git auth is via the SSH key only.

## Key backup and restore

The codespace key is backed up locally at `~/.ssh/codespace-backups/super-duper-waffle-75j7r6jvjhpr7x/` (`id_ed25519` + `id_ed25519.pub`).

The key survives normal stop/start cycles, but a container **rebuild** wipes `~/.ssh`. After a rebuild, restore with:

```bash
~/.pi/agent/skills/codespace-env/scripts/restore-key.sh
```

No re-registration needed — it is the same key, same fingerprint.

## Persistence

- Idle timeout: **30 minutes** (auto-stop; wake with `ssh codespace`). Left as default by choice.
- Retention: 30 days stopped, then auto-delete. Touch at least monthly.

## Managing the codespace

```bash
gh codespace list                          # status
gh codespace ssh -c super-duper-waffle-75j7r6jvjhpr7x   # raw gh connection (fallback)
scp codespace:/workspaces/agent/foo .      # copy down
rsync -av ./local codespace:/workspaces/agent/   # sync up
```

If the codespace is recreated under a new name, update the ProxyCommand `-c <name>` line in `~/.ssh/config` and the backup directory name.
