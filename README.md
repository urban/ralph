# Ralph

Ralph is a small Bun CLI that runs `codex exec` through independently authored before-work, work, and after-work phases.

## Install

Prerequisites:

- Bun
- Codex CLI

From this checkout:

```bash
bun install
npm link
```

Use `npm link`, not `bun link`; current Bun releases do not reliably expose local package `bin` entries globally. If `ralph` is still unavailable, add the npm global bin directory to `PATH`:

```bash
export PATH="$(npm prefix -g)/bin:$PATH"
```

For local development, replace `ralph` in the examples below with `bun run cli`.

## Phase model

| Phase       | Canonical file   | Explicit flags   | Requirement           |
| ----------- | ---------------- | ---------------- | --------------------- |
| Before work | `BEFORE_WORK.md` | `--before`, `-b` | Optional              |
| Work        | `WORK.md`        | `--work`, `-w`   | Required and nonblank |
| After work  | `AFTER_WORK.md`  | `--after`, `-a`  | Optional              |

Supply either `--ralph-dir <directory>` or explicit phase flags with at least `--work`. An explicit phase flag overrides the corresponding file from `--ralph-dir`. This includes an explicitly supplied blank optional file, which disables that directory-provided phase.

Runtime validation is fail-fast:

- missing or blank work instructions are errors;
- a missing optional canonical file under `--ralph-dir` skips that phase;
- a blank optional file skips that phase;
- an explicitly supplied missing optional file is an error;
- every ready phase must be a regular, readable UTF-8 file contained within the resolved working directory.

Ralph does not infer a phase directory when neither `--ralph-dir` nor explicit phase flags are supplied.

## Quick start

Initialize a phase directory:

```bash
ralph init .ralph
```

`init` creates exactly these three genuinely empty files:

```text
.ralph/
├── BEFORE_WORK.md
├── WORK.md
└── AFTER_WORK.md
```

Author a nonblank `.ralph/WORK.md` before running Ralph. Blank before-work and after-work files are valid and are reported as skipped; blank work is an actionable runtime error.

Run one sequence or repeat until overall completion:

```bash
ralph once --ralph-dir .ralph
ralph loop --ralph-dir .ralph
ralph loop --ralph-dir .ralph --iterations 20
```

You can instead provide explicit files:

```bash
ralph once --before ./BEFORE_WORK.md --work ./WORK.md --after ./AFTER_WORK.md
ralph loop -b ./BEFORE_WORK.md -w ./WORK.md -a ./AFTER_WORK.md -n 20
```

The optional init target resolves from the directory where Ralph was launched. If the target directory does not exist, Ralph creates it. Reinitializing backs up each existing phase file before replacing it, using sibling names such as `WORK.md.bak.<timestamp>`.

## Working-directory and path semantics

`--cwd` / `-C` behaves like Git's `-C`:

```bash
ralph loop -C ./project --ralph-dir .ralph
```

`./project` resolves from Ralph's launch directory. It then becomes both the Codex working directory and the base for relative `--ralph-dir`, `--before`, `--work`, and `--after` paths. The command above therefore reads phase files from `./project/.ralph`. Without `--cwd`, the launch directory is the working directory and path base.

Canonical phase files must remain inside the resolved working directory, including in `--yolo` mode.

## Execution semantics

Each nonblank phase starts a fresh, independent `codex exec` invocation. Ralph does not resume a conversation or inject phase names or loop iteration numbers into prompts.

For each iteration Ralph:

1. snapshots and validates all resolved phase prompt files;
2. runs before work when present and nonblank;
3. runs the required work phase;
4. runs after work when present and nonblank.

Ralph materializes ready phase files into an iteration-scoped internal snapshot directory under the working directory, then points Codex at those snapshot files. The three phase prompts are immutable within an iteration. Changes to them take effect on the next loop iteration. Other repository files remain live: work can update an application file, checklist, or progress log and after work can observe that update in the same iteration.

`ralph once` performs one sequence. It succeeds after every executed phase completes, even when no phase declares the whole workflow complete.

`ralph loop` repeats fresh snapshots until overall completion. `--iterations` / `-n` defaults to 10 and must be a positive integer. Exhausting the limit without overall completion is an error.

Any input, process, stream, marker, or timeout failure aborts immediately. Ralph does not retry and does not run later phases as cleanup.

## Completion markers

Ralph recognizes two exact, case-sensitive stdout markers:

```text
<promise>INVOCATION_COMPLETE</promise>
<promise>COMPLETE</promise>
```

Ralph automatically appends generic instructions requiring Codex to emit `INVOCATION_COMPLETE` only after the current phase succeeds. Users do not need to add that protocol to phase files. After a successful process exit, Ralph requires the exact marker as a standalone final stdout line; a zero exit without it is a phase failure.

`COMPLETE` means the entire workflow is complete. A user-authored phase that can make that decision must instruct Codex to emit the exact `<promise>COMPLETE</promise>` marker. Overall completion is accepted only when the invocation also emits `INVOCATION_COMPLETE`; marker order does not matter. Ralph then skips all remaining phases and loop iterations.

Markers are recognized only from native stdout and evaluated after a successful exit. Ralph scans only the trailing stdout footer, so markers count only when they appear as contiguous standalone final lines, aside from optional trailing blank lines. Spelling, casing, embedded-marker text, and output that continues after a marker line are not accepted, and markers may remain visible in terminal output.

## Timeouts

Every Codex invocation has both an idle timeout and an absolute invocation timeout:

```bash
ralph once --work ./WORK.md --idle-timeout 45s --invocation-timeout 20m
ralph loop --ralph-dir .ralph --idle-timeout 5m --invocation-timeout 30m
```

Defaults are `5m` idle and `30m` absolute. Both durations must be finite and positive, and idle must be strictly less than absolute. Any stdout or stderr activity resets the idle timer; output does not reset the absolute timer.

On timeout Ralph requests graceful process-group termination, waits up to five seconds, then force-kills Codex and its descendants. The phase and command fail.

## Terminal output and notifications

Ralph streams native Codex stdout and stderr to the terminal in real time. It also prints:

- one iteration header at the start of each loop iteration;
- a header before each executed phase;
- a footer with the phase outcome and duration;
- a brief skipped message for a missing or blank optional phase.

At the final outcome, Ralph attempts one best-effort `tt notify` notification for success, overall completion, validation or phase failure, timeout, or loop exhaustion. The optional `tt` tool being absent or failing never changes Ralph's result.

## Checklist workflow example

[`examples/checklist-workflow.md`](examples/checklist-workflow.md) explains a five-file workflow from [`examples/checklist-workflow/`](examples/checklist-workflow/):

- blank `BEFORE_WORK.md` shows an optional skipped phase;
- `WORK.md` chooses and completes exactly one highest-priority item, updates state, and commits it;
- `AFTER_WORK.md` reads the live checklist and declares overall completion only when no work remains;
- `CHECKLIST.md` and `PROGRESS.md` hold mutable workflow state.

`CHECKLIST.md` and `PROGRESS.md` are user-managed example artifacts. Ralph does not parse, validate, snapshot, initialize, or require them.

Copy and adapt the example into a project, then make that project the working directory:

```bash
cp examples/checklist-workflow/*.md ./project/
ralph once -C ./project --ralph-dir .
ralph loop -C ./project --ralph-dir .
```

## Task Manager transaction workflow example

[`examples/task-manager-workflow.md`](examples/task-manager-workflow.md) explains a serial, agent-only workflow backed by [Task Manager](https://github.com/urban/task-manager) and its `tm` CLI:

- `BEFORE_WORK.md` scopes the run to `RALPH_TM_ROOT`, plans or resumes one transaction, claims its Work Item, creates a transaction branch, and maintains an ignored handoff;
- `WORK.md` implements and verifies only the selected Work Item;
- `AFTER_WORK.md` verifies the candidate against a finite contract, returns consolidated blocker feedback to the Worker under the same Work Item, and integrates accepted work;
- no phase creates Work Items or dependencies, so the configured backlog subtree burns down monotonically;
- an accepted transaction is committed and fast-forward merged into its recorded base branch before the next target-root Work Item is selected.

Copy the workflow instructions into a clean project with an initialized `tm` backlog whose configured target subtree is agent-only, commit the setup, and run it with a stable actor and target root. Do not replace an installed copy while it has a live handoff; finish or recover that transaction with its original instructions first.

```bash
mkdir -p ./project/.ralph-tm
cp examples/task-manager-workflow/*.md ./project/.ralph-tm/
TM_ACTOR=ralph-loop \
RALPH_TM_DIR=.ralph-tm \
RALPH_TM_ROOT=<full-root-work-item-id> \
  ralph loop -C ./project --ralph-dir .ralph-tm --iterations 50
```

This example assumes Ralph is the sole code worker and sole task-store writer for the run. Read the complete instructions before using it.

## CLI reference

```text
ralph init [target-directory]

ralph once [--before <path>] --work <path> [--after <path>]
ralph once --ralph-dir <directory>

ralph loop [--before <path>] --work <path> [--after <path>] [--iterations <count>]
ralph loop --ralph-dir <directory> [--iterations <count>]
```

Shared `once` and `loop` options:

- `-b`, `--before <path>`
- `-w`, `--work <path>`
- `-a`, `--after <path>`
- `-d`, `--ralph-dir <directory>`
- `-C`, `--cwd <directory>`
- `--idle-timeout <duration>` (default `5m`)
- `--invocation-timeout <duration>` (default `30m`)
- `--yolo`

Loop option:

- `-n`, `--iterations <count>` (default `10`)

Show command help:

```bash
ralph --help
ralph init --help
ralph once --help
ralph loop --help
```

By default Ralph invokes:

```bash
codex exec --full-auto --sandbox workspace-write
```

`--yolo` instead uses:

```bash
codex exec --dangerously-bypass-approvals-and-sandbox
```

Ralph is non-interactive and requires the Codex CLI to be available on `PATH`.
