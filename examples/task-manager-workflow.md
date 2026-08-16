# Task Manager transaction workflow

[`task-manager-workflow/`](task-manager-workflow/) is a three-phase Ralph workflow that drains an existing, agent-only [Task Manager](https://github.com/urban/task-manager) backlog. It implements one Work Item at a time on a transaction branch, verifies it, and merges accepted work into the starting branch.

Use this example only when Ralph is the sole code worker and sole writer to the repository-local `.tasks` store.

## Prerequisites

Install `git`, `jq`, `tm`, `codex`, and `ralph`. Start from a named branch in a clean Git repository.

Initialize the task store if needed, then create the complete backlog before running Ralph:

```bash
cd /path/to/project
if [ ! -d .tasks ]; then tm init; fi
tm validate
```

The selected backlog root and every open Work Item beneath it must use the `agent` executor.

## Install

From the Ralph repository, copy the workflow into the target project:

```bash
mkdir -p /path/to/project/.ralph-tm
cp examples/task-manager-workflow/*.md /path/to/project/.ralph-tm/
```

Add these runtime files to the target project's root `.gitignore`:

```gitignore
/.ralph-tm/HANDOFF.md
/.ralph-tm/HANDOFF.md.tmp
/.ralph-snapshot-*/
```

Do not ignore the entire `.ralph-tm` directory or `.tasks`. The four workflow instruction files and the task store must be committed.

```bash
cd /path/to/project
git add .gitignore .ralph-tm .tasks
git commit -m "Add Ralph Task Manager workflow"
```

## Choose the backlog root

List the backlog and choose the Work Item whose subtree Ralph should drain:

```bash
tm list --all --all-executors
tm show <root-work-item-id> --json | jq -r '.ticket.id'
```

Use the printed canonical ID as `RALPH_TM_ROOT`.

## Run

From the project root:

```bash
TM_ACTOR=ralph-loop \
RALPH_TM_DIR=.ralph-tm \
RALPH_TM_ROOT=<full-root-work-item-id> \
ralph loop --ralph-dir .ralph-tm --iterations 50
```

From another directory, add Ralph's working-directory option:

```bash
TM_ACTOR=ralph-loop \
RALPH_TM_DIR=.ralph-tm \
RALPH_TM_ROOT=<full-root-work-item-id> \
ralph loop -C /path/to/project --ralph-dir .ralph-tm --iterations 50
```

Use the same `TM_ACTOR` and `RALPH_TM_ROOT` values whenever you restart the run.

## What the workflow does

1. The Planner selects and claims one actionable Work Item, creates a transaction branch, and writes `.ralph-tm/HANDOFF.md`.
2. The Worker implements and stages that Work Item.
3. The Verifier either accepts and integrates the candidate or returns focused repair feedback for the same Work Item.
4. Ralph repeats until no open Work Items remain beneath `RALPH_TM_ROOT`.

The workflow never creates Work Items or dependencies. The Worker never completes Work Items; only the Verifier accepts them.

`HANDOFF.md` is generated runtime state. Do not create, edit, or delete it manually. Its absence before the first run is normal.

## Restart after a failure

Ralph preserves the transaction branch and handoff when a phase fails. Inspect the current state:

```bash
git status
git branch --show-current
tm validate
cat .ralph-tm/HANDOFF.md 2>/dev/null || true
```

Fix the reported prerequisite or verification failure, then rerun the same Ralph command. Do not delete the handoff, reset the transaction branch, edit `.tasks/tasks.jsonl` directly, or bypass Task Manager checks.

If the Worker or Verifier reports a missing handoff, inspect the preceding Planner output. The most common causes are a dirty starting repository, an unignored `.ralph-snapshot-*` directory, an invalid task store, or missing runtime environment variables.
