# Multi-Agent Workflow Reference

## Coordination Patterns

### Pattern 1: Shared Task File (Analysis → Implementation → Review)

Create a `TASK.md` on `main` before launching agents:

```bash
cat > TASK.md << 'EOF'
# Task: Add NFT minting with whitelist support

## Goal
Allow whitelisted addresses to mint NFTs at a discounted price.

## Constraints
- Must not break existing ERC-721 transfers
- Gas-efficient batch minting
- Owner can update whitelist

## Files of interest
- contracts/NFT.sol
- test/NFT.test.js
EOF

git add TASK.md && git commit -m "Add task brief"
```

Then launch agents that chain their outputs:

```bash
./scripts/run-agents.sh \
  architecture "Read TASK.md. Analyse contracts/ and test/. Write findings to notes/architecture.md. Do not edit source files." \
  implementation "Read TASK.md and notes/architecture.md. Make minimal implementation changes. Commit with a clear message." \
  tests "Read TASK.md and notes/architecture.md. Add or improve tests for the implemented feature. Commit when done."
```

The **architecture agent** writes analysis first. The **implementation agent** reads it. The **test agent** reads both. This creates a natural dependency chain even though they run in parallel — later agents will see files as they appear.

### Pattern 2: Parallel Analysis Only

No worktrees needed. All agents are read-only. Use a single tmux session with panes:

```bash
tmux new-session -d -s pi-analysis "pi -p 'Audit contracts/ for reentrancy and overflow bugs.'"
tmux split-window -h -t pi-analysis "pi -p 'Audit contracts/ for access control issues and privilege escalation.'"
tmux split-window -v -t pi-analysis "pi -p 'Audit contracts/ for gas optimisation opportunities.'"
tmux select-layout -t pi-analysis tiled
tmux attach -t pi-analysis
```

### Pattern 3: Full Parallel with Coordinator

Use four agents: a coordinator that writes a plan, and three workers that follow it:

```
agents.conf:
  coordinator:Read TASK.md. Write a detailed implementation plan to notes/plan.md. Do not edit source files.
  implementation:Wait for notes/plan.md, then implement the changes on this branch. Commit when done.
  tests:Wait for notes/plan.md, then add tests covering the plan. Commit when done.
  docs:Read notes/plan.md and update README.md or NatSpec comments. Commit when done.
```

## Safety Guidelines

### 1. Only one agent edits a given file

Git worktrees on separate branches provide filesystem isolation — agents physically cannot overwrite each other's files. Conflicts only arise at merge time.

### 2. Commit often

Each agent should commit its work so you can `git log` per branch to understand what happened:

```
pi -p '... Make changes and commit each logical unit with a clear message.'
```

### 3. Review diffs before merging

```bash
# See everything each agent did
git diff main..agent/implementation
git log --oneline agent/implementation

# Cherry-pick specific commits instead of full merge
git cherry-pick <commit-hash>
```

### 4. Stale worktrees

If a worktree exists from a prior run, the script will skip creation and reuse it. To force a fresh start:

```bash
./scripts/cleanup.sh
./scripts/run-agents.sh ...
```

### 5. Branch naming

Agent branches follow the pattern `agent/<name>`. The `<name>` is lowercased and sanitised: spaces become hyphens, special characters are stripped. Avoid using the same name for two agents with the same sanitised form (e.g., `code-review` and `code_review` both become `agent/code-review`).

## Post-Agent Workflow

After agents finish (tmux windows exit when pi completes):

```bash
# See the branch topology
git log --oneline --all --graph --decorate -20

# Review each agent's diff
for branch in $(git branch --list 'agent/*' --format='%(refname:short)'); do
  echo "=== $branch ==="
  git diff main.."$branch" --stat
done

# Merge the ones you want
git checkout main
git merge agent/implementation
git merge agent/tests

# Or cherry-pick selectively
git cherry-pick abc1234  # just that commit from the implementation agent
```

## Troubleshooting

### "Session already exists"

Kill it first:
```bash
tmux kill-session -t pi-agents
```

### "worktree already exists"

Either clean up with `./scripts/cleanup.sh` or manually:
```bash
git worktree remove ../project-agent-implementation --force
git branch -D agent/implementation
git worktree prune
```

### Agent appears stuck

Attach to tmux and navigate to its window to see what it's doing:
```bash
tmux attach -t pi-agents
# Ctrl-b w to list windows
# Ctrl-b n / p for next/previous window
```

### Pi not found

Ensure `pi` is installed and on your PATH. The script uses `pi -p '...'` as the command invoked in each tmux window.
