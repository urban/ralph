# Ralph

Ralph is a small shell wrapper around the Codex CLI. It runs Codex against a checklist, a progress log, and a fixed instruction prompt so you can drive checklist-based work from a simple local repo.

The repo has two entrypoints:

- `./ralph-loop` reruns Codex until the work is done or an iteration limit is reached.
- `./ralph-once` runs a single Codex pass and exits.

If you add the scripts to your shell `PATH`, you can invoke them from any directory. The scripts load their default support files from their installed location, but Codex runs in the directory where you launch the command.

By default the scripts run `codex exec --full-auto --sandbox workspace-write`. If you want the unsafe behavior, pass `--yolo` to use `--dangerously-bypass-approvals-and-sandbox` instead.

Ralph is intentionally non-interactive. It does not stop and ask the user to approve commands mid-run. In the default mode, Codex is expected to run automatically inside the `workspace-write` sandbox. If that is not enough for a given task, the run may fail instead of prompting for approval. `--yolo` exists for users who want unrestricted automatic execution instead.

## What the scripts do

Both scripts send the same three files to `codex exec`:

- `CHECKLIST.md`
- `PROGRESS.md`
- `INSTRUCTIONS.md`

`ralph-loop` stops early if Codex outputs `<promise>COMPLETE</promise>`. Otherwise it exits with a non-zero status after the configured number of iterations.

## macOS installation

### 1. Install the command-line prerequisites

If you do not already have them:

```bash
xcode-select --install
brew install git node
```

If you do not use Homebrew yet, install it first from [brew.sh](https://brew.sh).

### 2. Install Codex CLI

OpenAI's current Codex CLI docs are here:

- [Codex CLI docs](https://developers.openai.com/codex/cli)

Install the CLI:

```bash
npm install -g @openai/codex
```

Then run Codex once and follow the sign-in prompt:

```bash
codex
```

### 3. Download this repo

Clone it:

```bash
git clone https://github.com/<your-user>/ralph.git
cd ralph
chmod +x ralph-loop ralph-once
```

Or download the ZIP from GitHub, unzip it, and then:

```bash
cd /path/to/ralph
chmod +x ralph-loop ralph-once
```

## Usage

Run the looping version:

```bash
./ralph-loop
```

Run a fixed number of passes:

```bash
./ralph-loop --iterations 20
```

Run a single pass:

```bash
./ralph-once
```

Use a different checklist file with either script:

```bash
./ralph-loop ./path/to/my-checklist.md --iterations 5
./ralph-once ./path/to/my-checklist.md
```

Or pass checklist and progress paths explicitly:

```bash
./ralph-loop --checklist ./path/to/my-checklist.md --progress ./path/to/my-progress.md --iterations 5
./ralph-once --checklist ./path/to/my-checklist.md --progress ./path/to/my-progress.md
```

You can also override the instructions file:

```bash
./ralph-loop -c ./path/to/my-checklist.md -p ./path/to/my-progress.md -i ./path/to/my-instructions.md -n 5
./ralph-once -c ./path/to/my-checklist.md -p ./path/to/my-progress.md -i ./path/to/my-instructions.md
```

Ralph has two execution modes:

```bash
./ralph-loop
./ralph-loop --yolo
```

Show help:

```bash
./ralph-loop --help
./ralph-once --help
```

## How the files work together

- `ralph-loop` handles repeated runs, completion detection, iteration limits, and optional desktop notifications.
- `ralph-once` runs the same Codex command exactly one time.
- `common.sh` contains the shared shell helpers used by both entrypoints.
- `CHECKLIST.md` is the default task list Ralph gives to Codex.
- `INSTRUCTIONS.md` defines the rules for each Codex pass.
- `STEERING.md` is reserved for must-do-first work. Right now it is empty.
- `PROGRESS.md` is the handoff log between passes.
- Codex runs in your launch directory, not the script install directory.
- The default execution mode is `--full-auto --sandbox workspace-write`.
- `--yolo` switches to `--dangerously-bypass-approvals-and-sandbox`.

## Notes

- The optional `tt` command is used only by `ralph-loop` for desktop notifications. Ralph still works if `tt` is not installed.
- `PROGRESS.md` is part of the workflow. Do not delete it unless you also change the scripts.
- Both entrypoints expect `codex` to be available in your shell path.
- For safest use, run Ralph inside a sandbox and a Git repository so you can inspect or roll back changes between passes.
