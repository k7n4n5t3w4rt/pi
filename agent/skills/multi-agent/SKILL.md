---
name: multi-agent
description: Launch multiple Pi coding agents in parallel using tmux and git worktrees for isolated, concurrent work on analysis, implementation, and testing. Use when you want independent agents working on different aspects of the same task without file conflicts.
---

# Multi-Agent Pi Workflow

Launch multiple Pi coding agents in parallel via `tmux`, with each agent isolated in its own `git worktree`. This avoids file conflicts — each agent works on a separate branch in a separate checkout, and you merge results later.

## Quick Start

Define your agents in a config file:

```bash
# agents.conf
architecture:You are the architecture agent. Read TASK.md, analyse the codebase, write notes/architecture.md. Do not edit source files.
implementation:You are the implementation agent. Read TASK.md and notes/architecture.md. Make minimal code changes on this branch. Commit when done.
tests:You are the test agent. Read TASK.md. Add or improve tests on this branch. Commit when done.
```

Then run:

```bash
./scripts/run-agents.sh --config agents.conf
```

Or define agents inline:

```bash
./scripts/run-agents.sh \
  architecture "Analyse the codebase. Write notes/architecture.md." \
  implementation "Implement the feature from TASK.md. Commit when done." \
  tests "Add tests for the feature. Commit when done."
```

## How It Works

1. Creates a `git worktree` per agent (e.g., `../project-agent-architecture/`) on a dedicated branch (e.g., `agent/architecture`)
2. Launches each agent in its own `tmux` window, `cd`'d into its worktree
3. Agents run in parallel with isolated filesystems — no conflicts
4. When agents finish, review their branches and merge or cherry-pick useful changes

## Merging Results

```bash
# Review what each agent did
git diff main..agent/implementation
git diff main..agent/tests

# Merge useful branches
git checkout main
git merge agent/implementation
git merge agent/tests
```

## Cleanup

```bash
./scripts/cleanup.sh
```

Removes worktrees and the tmux session.

See [references/workflow.md](references/workflow.md) for coordination patterns and safety guidelines.
