# Ralph

Ralph is a small shell wrapper around the Codex CLI. It runs Codex against a checklist, a progress log, and a fixed instruction prompt so you can drive checklist-based work from a simple local repo.

The repo has two entrypoints:

- `./ralph-loop` reruns Codex until the work is done or an iteration limit is reached.
- `./ralph-once` runs a single Codex pass and exits.

If you add the repo directory to your shell `PATH`, you can invoke the scripts from any directory. Keep the entrypoint scripts next to `common.sh`: both `ralph-loop` and `ralph-once` source that file from their own directory. Codex still runs in the directory where you launch the command.

By default the scripts run `codex exec --full-auto --sandbox workspace-write`. If you want the unsafe behavior, pass `--yolo` to use `--dangerously-bypass-approvals-and-sandbox` instead.

Ralph is intentionally non-interactive. It does not stop and ask the user to approve commands mid-run. In the default mode, Codex is expected to run automatically inside the `workspace-write` sandbox. If that is not enough for a given task, the run may fail instead of prompting for approval. `--yolo` exists for users who want unrestricted automatic execution instead.

## What the scripts do

The primary way to use Ralph is to pass your own files on the command line:

```bash
ralph-loop -c /path/to/CHECKLIST.md -p /path/to/PROGRESS.md -i /path/to/INSTRUCTIONS.md -n 10
ralph-once -c /path/to/CHECKLIST.md -p /path/to/PROGRESS.md -i /path/to/INSTRUCTIONS.md
```

The file flags are:

- `-c` / `--checklist` for the checklist file
- `-p` / `--progress` for the progress log
- `-i` / `--instructions` for the instructions file
- `-n` / `--iterations` for the loop count in `ralph-loop`

Both scripts pass three files to `codex exec`:

- the checklist you provide with `-c`
- the progress log you provide with `-p`
- the instructions file you provide with `-i`

If you do not pass custom paths, Ralph falls back to the bundled defaults in this repo:

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

### 4. Add Ralph to your shell `PATH`

If you want to run `ralph-loop` and `ralph-once` from anywhere, add the Ralph repo directory itself to your `PATH`.

Do not symlink only the entrypoint scripts into another directory unless you also keep `common.sh` next to them. Both scripts load `common.sh` relative to their own location.

For zsh on macOS:

```bash
echo 'export PATH="/path/to/ralph:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

For bash:

```bash
echo 'export PATH="/path/to/ralph:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

Replace `/path/to/ralph` with the absolute path where you cloned or unzipped this repo.

## Usage

The most common usage is to point Ralph at your own files. If you added the repo directory to your `PATH`, you can drop the leading `./` from the examples below:

```bash
./ralph-loop -c ./path/to/my-checklist.md -p ./path/to/my-progress.md -i ./path/to/my-instructions.md -n 5
./ralph-once -c ./path/to/my-checklist.md -p ./path/to/my-progress.md -i ./path/to/my-instructions.md
```

You can still use the positional checklist argument as a shorthand for `--checklist`:

```bash
./ralph-loop ./path/to/my-checklist.md -n 5
./ralph-once ./path/to/my-checklist.md
```

If you omit all file flags, Ralph uses the default files that ship with this repo:

```bash
./ralph-loop
./ralph-loop -n 20
./ralph-once
```

The long-form flags work too:

```bash
./ralph-loop --checklist ./path/to/my-checklist.md --progress ./path/to/my-progress.md --instructions ./path/to/my-instructions.md --iterations 5
./ralph-once --checklist ./path/to/my-checklist.md --progress ./path/to/my-progress.md --instructions ./path/to/my-instructions.md
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
