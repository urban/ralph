# Task Manager transaction workflow

[`task-manager-workflow/`](task-manager-workflow/) is a three-phase Ralph workflow that monotonically drains a configured, agent-only [Task Manager](https://github.com/urban/task-manager) backlog subtree through serial Git transactions. Task Manager provides the `tm` CLI used throughout this example; refer to its repository for installation and project documentation.

The phases have distinct roles:

- `BEFORE_WORK.md` is the **Planner**. It validates the repository and task store, resolves the target backlog root, selects and claims work, creates transaction branches, resumes interrupted transactions, and maintains the ignored transaction handoff.
- `WORK.md` is the **Worker**. It implements and verifies only the Work Item selected by the Planner.
- `AFTER_WORK.md` is the **Verifier**. It checks the candidate against the selected Work Item's finite contract, returns consolidated blocker feedback to the Worker, accepts passing work, and integrates an accepted transaction root.
- `HANDOFF_CONTRACT.md` defines the versioned runtime handoff shared by all three phases.

A new transaction starts with one actionable Work Item selected beneath `RALPH_TM_ROOT`. The transaction branch is merged into its recorded base branch only after the selected transaction root passes verification. The next Ralph iteration then starts another transaction or declares the configured backlog subtree empty.

## Monotonic burn-down model

This workflow drains a backlog prepared before Ralph starts. It does not expand that backlog during implementation or verification:

- no phase creates Work Items or adds dependencies;
- the Verifier returns defects to the Worker under the currently selected Work Item rather than repairing them or creating review findings;
- each active transaction's item relationship list is fixed for that transaction;
- completed dependency Results are settled evidence unless the current attempt demonstrably regresses them;
- the applicable open count may remain level while an item is being implemented, but it must never increase and must decrease by exactly one whenever an item is completed.

A new handoff contains only its transaction root. An existing version 2 handoff may already contain historical findings recorded before the transaction entered burn-down mode. Those existing findings are drained deepest-first, but no new finding is appended.

## Assumptions

This example deliberately targets a constrained unattended workflow:

- Ralph is the only code worker.
- Ralph is the sole writer to the `tm` store for the entire run.
- Only one review transaction is active at a time.
- The configured root and every open Work Item beneath it use the `agent` executor.
- No person or other process changes the base branch while a transaction is active.
- The task store is the repository-local `.tasks` directory and is committed with the code it describes.
- The repository's normal verification commands can run non-interactively.
- Acceptance criteria and required checks are concrete enough to define a finite review contract.

Completed human-executor Work Items and human-executor Work Items outside the configured target subtree do not block this workflow. Open human-executor Work Items inside the target subtree do.

Do not use this example unchanged when people or other agents may concurrently modify the repository, branches, or task store, or when review is expected to discover and create follow-up Tickets.

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

Create the complete backlog before starting Ralph. Choose the agent-executor Work Item whose subtree Ralph should drain and retain its full ID for `RALPH_TM_ROOT`. Commit the initialized backlog and all workflow setup before running Ralph. The base branch must be clean.

## Install the workflow in a project

From the Ralph repository, create the target workflow directory and copy the four instruction files into it:

```bash
mkdir -p /path/to/project/.ralph-tm
cp examples/task-manager-workflow/*.md /path/to/project/.ralph-tm/
```

These commands also replace an installed copy without nesting another directory beneath `.ralph-tm`. Do not replace the instructions while a transaction is active. A version 1 handoff does not satisfy the version 2 contract because it lacks `Backlog root`; finish or explicitly recover the old transaction with its original instructions before upgrading, rather than deleting its handoff or transaction branch.

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

`RALPH_TM_ROOT` identifies the backlog subtree to drain. The Planner resolves it through `tm` and records its canonical full ID in a new handoff. The Worker and Verifier independently resolve it and reject a handoff targeting a different root.

## Run the loop

From the project root:

```bash
TM_ACTOR=ralph-loop \
RALPH_TM_DIR=.ralph-tm \
RALPH_TM_ROOT=<full-root-work-item-id> \
ralph loop --ralph-dir .ralph-tm --iterations 50
```

Or launch it from elsewhere with an explicit working directory:

```bash
TM_ACTOR=ralph-loop \
RALPH_TM_DIR=.ralph-tm \
RALPH_TM_ROOT=<full-root-work-item-id> \
ralph loop -C /path/to/project --ralph-dir .ralph-tm --iterations 50
```

Use an iteration bound large enough for the target subtree and possible same-item review-and-repair cycles. One accepted transaction normally consumes one implementation iteration when its first candidate passes. The final accepted transaction is followed by a Planner-only iteration that proves the subtree is empty and terminates the Ralph loop.

## How a transaction proceeds

Assume the Planner selects Work Item `A` beneath the configured root while the clean base branch is `main`.

1. The Planner records the clean base commit, creates `ralph/transaction-<A>`, claims `A`, and creates a version 2 `.ralph-tm/HANDOFF.md` with state `selected`.
2. The Worker implements `A`, runs the required verification, stages the candidate, records its exact Git tree identity, and changes the handoff to `ready-for-review`.
3. The Verifier checks the exact staged candidate against `A`'s explicit Description, Context, acceptance criteria, completed dependency Results, repository instructions, required deterministic checks, and directly relevant existing tests.
4. If the candidate passes, the Verifier completes `A` through `tm`, stages the task-store update, creates one accepted transaction commit, fast-forward merges it into `main`, deletes the transaction branch, and removes the handoff.
5. If the Verifier finds an in-scope blocker, it leaves the candidate unchanged, keeps `A` claimed, returns the handoff to `selected`, and writes one consolidated, reproduction-backed repair checklist for the next Worker invocation. The next iteration resumes `A`; the Worker repairs it under the same Work Item and submits a new candidate rather than creating a finding Ticket.

The Worker never runs `tm complete`. Only the Verifier accepts Work Items.

## Bounded verification

A blocking defect must be demonstrated by at least one of these conditions:

- an explicit acceptance criterion is unmet;
- a required deterministic verification command fails because of the candidate;
- the current attempt introduced a reproducible regression in behavior directly touched by the Work Item; or
- the applicable candidate diff contains a code or test change with no direct, evidenced relationship to the current Work Item, completed dependency Results required for integration, or an allowed transaction artifact.

The Verifier does not block on pre-existing behavior or request speculative hardening, alternative designs, style preferences, hypothetical variants, or improvements outside the finite contract. Candidate changes made for those out-of-contract concerns are unrelated and are blockers even when behavioral checks pass. The Verifier performs one consolidated, read-only pass rather than modifying the candidate or broadening review through specialist subagents, unbounded fuzzing, or repeated near-neighbor probes.

## When a transaction spans iterations

A transaction may use more than one Ralph iteration while remaining on one transaction branch:

- **Same-item repair:** the Verifier returns every blocked candidate to `selected` with consolidated feedback; the next Worker repairs the same claimed Work Item and submits a new candidate.
- **Historical findings:** an existing version 2 handoff may already contain non-root transaction items recorded before burn-down mode. Each accepted non-root item moves the handoff to `planning`; the Planner selects the next existing item, then eventually reselects the root for bounded integration verification.
- **Interrupted review:** a `ready-for-review` handoff preserves the exact candidate so a restarted Ralph run can retry verification without restaging it.
- **Interrupted integration:** `accepted-awaiting-commit` and `accepted-awaiting-merge` preserve enough state for the Planner to finish the recorded commit or merge before selecting unrelated work.

A hard phase, timeout, stream, or completion-marker failure aborts the current Ralph command rather than automatically retrying it. Restarting Ralph resumes from the validated handoff state.

## Branch and commit behavior

No unrelated Work Item is selected while a live handoff identifies an active transaction. Intermediate candidates and same-item repairs accumulate in the transaction's staged tree without intermediate commits. After the transaction root passes, the Verifier creates one commit containing the accepted implementation and corresponding `.tasks` state.

Because Ralph is the only writer and the recorded base branch must remain at its recorded base commit, integration uses `git merge --ff-only`. If completion, commit, switch, merge, validation, or cleanup fails, the handoff and transaction branch remain at the most accurate recovery state. Never delete them merely to bypass recovery.

## Completion and stalled backlogs

The Planner distinguishes phase success, stalled work, and overall workflow completion:

- **Planner invocation completion** means only that the current Planner phase succeeded. Selecting or resuming work, passing `tm validate`, and completing transaction integration do not authorize Ralph's overall completion marker.
- **Stalled target backlog** means open Work Items remain beneath `RALPH_TM_ROOT`, but `tm next --root "$RALPH_TM_ROOT" --json` yields no actionable ticket. This is never completion. The Planner reports the stall without forcing, bypassing, deleting, or selecting unrelated work.
- **Verified target completion** requires no live handoff and a fresh recursive `tm list --root "$RALPH_TM_ROOT" --status open --all-executors --json` count of exactly zero. Only then does the Planner emit the overall- and invocation-completion footer that terminates Ralph's loop.

A `selected`, `ready-for-review`, `planning`, `remediation`, or `accepted-awaiting-commit` handoff never authorizes overall completion. An `accepted-awaiting-merge` handoff can lead to completion only after merge and cleanup succeed, the handoff is removed, and the no-handoff target-root count proves no open Work Items remain.

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
tm show "$RALPH_TM_ROOT"
```

Normal resumable states are documented inside the phase prompts:

- `selected`: resume Worker implementation or a same-item repair.
- `ready-for-review`: preserve the staged candidate and retry verification.
- `planning`: select the next existing transaction item.
- `remediation`: legacy state for selecting an existing historical finding.
- `accepted-awaiting-commit`: finish the accepted transaction commit.
- `accepted-awaiting-merge`: finish the fast-forward merge and cleanup.

Do not manually edit `.tasks/tasks.jsonl`, use force or verification-bypass options, create replacement findings, or delete legitimate Work Items to recover the loop. Use `tm` commands for valid state repair and preserve the transaction branch until its accepted candidate has been integrated.
