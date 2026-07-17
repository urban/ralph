# Task Manager transaction workflow

[`task-manager-workflow/`](task-manager-workflow/) is a three-phase Ralph workflow that drains an agent-only [Task Manager](https://github.com/urban/task-manager) backlog through serial Git transactions. Task Manager provides the `tm` CLI used throughout this example; refer to its repository for installation and project documentation.

The phases have distinct roles:

- `BEFORE_WORK.md` is the **Planner**. It validates the repository and task store, selects and claims work, creates transaction branches, and maintains the transaction handoff.
- `WORK.md` is the **Worker**. It implements and verifies only the Work Item selected by the Planner.
- `AFTER_WORK.md` is the **Reviewer**. It independently accepts the candidate or creates agent Work Items that block the rejected work.
- `HANDOFF_CONTRACT.md` defines the shared runtime handoff format used by all three phases.

A transaction starts with one Work Item selected from the global backlog. Review findings remain in that transaction and take priority over unrelated work. The transaction branch is merged into its recorded base branch only after the original Work Item passes final review. The next loop iteration then starts another transaction or declares the backlog complete.

## Assumptions

This example deliberately targets a constrained unattended workflow:

- Ralph is the only code worker.
- Ralph is the sole writer to the `tm` store for the entire run.
- Only one review transaction is active at a time.
- Every Work Item uses the `agent` executor.
- No person or other process changes the base branch while a transaction is active.
- The task store is the repository-local `.tasks` directory and is committed with the code it describes.
- The repository's normal verification commands can run non-interactively.

Do not use this example unchanged when people or other agents may concurrently modify the repository, branches, or task store.

## Prerequisites

Install and verify:

```bash
command -v git
command -v jq
command -v tm
command -v codex
command -v ralph
```

Initialize the repository-local task store and validate it:

```bash
tm init
tm validate
```

Create the backlog before starting Ralph. Every Work Item must explicitly or implicitly use the `agent` executor. The Planner refuses to run if it finds any human-executor Work Item, including a done or cancelled historical item.

Commit the initialized backlog and all workflow setup before running the loop. The base branch must be clean.

## Install the workflow in a project

From the Ralph repository, copy the complete workflow directory into the target project:

```bash
cp -R examples/task-manager-workflow /path/to/project/.ralph-tm
```

Add the runtime handoff and Ralph's iteration-scoped prompt snapshots to the target project's root `.gitignore` before starting:

```gitignore
/.ralph-tm/HANDOFF.md
/.ralph-tm/HANDOFF.md.tmp
/.ralph-snapshot-*/
```

If you install the workflow under a different directory, adjust the first two patterns to match it.

Commit the three phase files, handoff contract, root ignore rules, and initialized task store before running Ralph:

```bash
cd /path/to/project
git add .gitignore .ralph-tm .tasks
git commit -m "Add Ralph Task Manager workflow"
```

The prompts use `RALPH_TM_DIR` to locate the live handoff. It defaults to `.ralph-tm`, matching the copy command above. If you choose another directory, set `RALPH_TM_DIR` to its path relative to Ralph's working directory.

## Run the loop

From the project root:

```bash
TM_ACTOR=ralph-loop \
RALPH_TM_DIR=.ralph-tm \
ralph loop --ralph-dir .ralph-tm --iterations 50
```

Or launch it from elsewhere with an explicit working directory:

```bash
TM_ACTOR=ralph-loop \
RALPH_TM_DIR=.ralph-tm \
ralph loop -C /path/to/project --ralph-dir .ralph-tm --iterations 50
```

Use an iteration bound large enough for the backlog and possible review remediation. One accepted transaction normally consumes one iteration. A rejected transaction consumes additional iterations for findings and re-reviews.

## How a transaction proceeds

Assume the Planner selects Work Item `A` from base branch `main`.

1. The Planner verifies that `main` is clean, creates `ralph/transaction-<A>` from its current commit, claims `A`, and creates `.ralph-tm/HANDOFF.md`.
2. The Worker implements `A`, runs its required verification, stages the candidate, and marks the handoff ready for review.
3. The Reviewer independently evaluates the complete candidate.
4. If accepted, the Reviewer completes `A`, commits the implementation and `.tasks` state together, fast-forward merges the transaction branch into `main`, deletes the transaction branch, and removes the handoff.
5. If rejected, the Reviewer creates one or more root-level agent Work Items, records each as a real dependency of `A`, releases `A`, and leaves the cumulative candidate on the transaction branch.
6. On the next iteration, the Planner selects those findings before unrelated global work. When every finding is complete, it selects `A` again for integration verification and final review.

A finding can itself be rejected. The Reviewer then creates another finding that blocks it. The Planner follows the deepest actionable remediation before returning through the rejected finding and ultimately the transaction root.

The Worker never runs `tm complete`. Only the independent Reviewer accepts Work Items.

## Branch and commit behavior

A transaction may span several Ralph iterations, but it uses one transaction branch throughout. No unrelated global Work Item is selected while the handoff identifies an active transaction.

The example does not commit intermediate rejected candidates. It accumulates the implementation and remediation on the transaction branch, then creates one accepted transaction commit after the root passes review. Because Ralph is the only writer and the base branch must not move, the Reviewer uses a fast-forward merge.

If commit or merge fails, the ignored handoff remains with a recovery state. A later Planner invocation must finish that integration operation before selecting more work. Never delete the handoff or transaction branch merely to bypass recovery.

## Completion and stalled backlogs

The Planner emits Ralph's overall completion marker only when all of these are true:

- no transaction handoff exists;
- the base branch is clean;
- `tm validate` succeeds;
- no open Work Item remains across all executors.

If open Work Items remain but none is actionable, the workflow is stalled rather than complete. Likely causes include an unexpected claim, an incomplete dependency, or invalid task-store state. The Planner reports the condition and stops without using `--force`.

## Recovery

Ralph aborts immediately when a phase fails, so the transaction branch and handoff intentionally remain available for diagnosis.

Before resuming:

```bash
git status
git branch --show-current
tm validate
```

Then inspect:

```bash
cat .ralph-tm/HANDOFF.md
tm show <current-work-item-id>
```

Normal resumable states are documented inside the phase prompts:

- `selected`: resume Worker implementation.
- `ready-for-review`: preserve the candidate and retry review.
- `planning` or `remediation`: let the Planner select the next transaction item.
- `accepted-awaiting-commit`: finish the accepted transaction commit.
- `accepted-awaiting-merge`: finish the fast-forward merge and cleanup.

Do not manually edit `.tasks/tasks.jsonl`, use `--force`, or delete legitimate Work Items to recover the loop. Use `tm` commands for state repair and preserve the transaction branch until its code is accepted or intentionally abandoned.
