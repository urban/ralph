# Checklist workflow

[`checklist-workflow/`](checklist-workflow/) is a minimal Ralph loop that implements and commits one checklist item per iteration.

It demonstrates how Ralph's independently invoked phases can coordinate through ordinary project files:

- `BEFORE_WORK.md` is intentionally blank, so Ralph skips the optional before-work phase.
- `WORK.md` selects, implements, verifies, records, and commits exactly one checklist item.
- `AFTER_WORK.md` inspects the live checklist after work and declares overall completion only when every item is done.
- `CHECKLIST.md` is the mutable backlog.
- `PROGRESS.md` is the append-only handoff log between fresh Worker invocations.

Ralph does not parse or manage `CHECKLIST.md` or `PROGRESS.md`. They are conventions defined entirely by these example prompts.

## Assumptions

This example assumes:

- Ralph runs inside a Git repository.
- The working tree is clean before the run.
- Ralph is the only process modifying the repository and checklist.
- Every checklist item can be implemented and verified within one fresh model context.
- The repository's verification commands and Git commits can run non-interactively.

The Worker commits each accepted checklist item directly to the current branch. Use a dedicated branch when you do not want Ralph committing directly to your current development branch.

## Prerequisites

Install and verify:

```bash
command -v git
command -v codex
command -v ralph
```

Ensure Git has an author identity available and the target repository is clean:

```bash
git status --short
git config user.name
git config user.email
```

## Install the workflow in a project

Copy all five example files into the target project's root because the prompts refer to `CHECKLIST.md` and `PROGRESS.md` relative to Ralph's working directory:

```bash
cp examples/checklist-workflow/*.md /path/to/project/
cd /path/to/project
```

Edit `CHECKLIST.md` before running Ralph. Keep each item concrete, independently verifiable, and small enough for one invocation:

```markdown
# Checklist

- [ ] Add validation for the primary user input
- [ ] Cover the validation behavior with tests
- [ ] Update the user-facing documentation
```

The supported markers are:

- `[ ]` — not started;
- `[/]` — in progress;
- `[x]` — complete.

Ralph creates an iteration-scoped `.ralph-snapshot-*` directory at the project root while the phases run. Add it to the target project's root `.gitignore` so the Worker cannot mistake runtime prompt snapshots for implementation changes:

```gitignore
/.ralph-snapshot-*/
```

Initialize `PROGRESS.md` with its heading and commit the workflow setup, ignore rule, and intended checklist:

```bash
git add .gitignore BEFORE_WORK.md WORK.md AFTER_WORK.md CHECKLIST.md PROGRESS.md
git commit -m "Add Ralph checklist workflow"
```

## Run one iteration

Run exactly one before/work/after sequence:

```bash
ralph once --ralph-dir .
```

Because `BEFORE_WORK.md` is blank, Ralph skips it. The Worker completes at most one checklist item. `AFTER_WORK.md` can report that work remains, but `ralph once` still succeeds after the sequence because overall workflow completion is not required for `once`.

## Drain the checklist

Run bounded iterations until `AFTER_WORK.md` declares overall completion:

```bash
ralph loop --ralph-dir . --iterations 10
```

From outside the project, set its working directory explicitly:

```bash
ralph loop -C /path/to/project --ralph-dir . --iterations 10
```

Choose an iteration limit at least as large as the number of checklist items, with additional capacity for recovery. Exhausting the limit while work remains is an error.

## What happens during each iteration

The Worker:

1. Reads the current checklist and prior progress notes.
2. Chooses one highest-priority unchecked item based on impact, dependencies, and risk rather than file order alone.
3. Changes only that item from `[ ]` to `[/]`.
4. Implements and verifies only that item.
5. Changes it to `[x]` only after verification succeeds.
6. Appends a concise handoff to `PROGRESS.md` with the completed item, verification, and useful follow-up context.
7. Commits the implementation, checklist update, and progress note together.

The independent Reviewer then reads the live checklist:

- if any `[ ]` or `[/]` item remains, it reports remaining work without ending the loop;
- if every item is `[x]`, it emits Ralph's overall completion marker and Ralph stops before another iteration.

## Customize the example

Adapt `WORK.md` when the project needs stronger execution rules, such as:

- an exact verification command;
- required test-first behavior;
- file or package boundaries;
- commit-message conventions;
- a prescribed priority order;
- additional handoff evidence.

Adapt `AFTER_WORK.md` when completion requires more than marker state, such as a final full verification command or documentation check. Keep the overall completion marker exact and emit it only after the entire workflow is complete.

The blank `BEFORE_WORK.md` may remain blank. Add instructions there only when every iteration needs a separate planning, validation, or environment-preparation phase.

## Recovery

If a Worker invocation fails after changing an item to `[/]`, Ralph aborts and does not run the Reviewer as cleanup. Inspect the repository before restarting:

```bash
git status
git diff
git log -1 --oneline
```

Then either finish the in-progress item or deliberately restore its marker to `[ ]` together with any corresponding code cleanup. Do not start another item while an unexplained `[/]` marker or partial implementation remains.

If a Git commit fails, correct the Git configuration or repository state and preserve the completed implementation, checklist update, and progress note as one commit.

If `AFTER_WORK.md` reports remaining work after every item appears complete, check for malformed markers or nested checklist content that still contains `[ ]` or `[/]`.
