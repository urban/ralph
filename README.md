# Ralph

Ralph is a small shell wrapper around the Codex CLI. It runs Codex against a checklist, a progress log, and a fixed instruction prompt so you can drive checklist-based work from a simple local repo.

The repo has two entrypoints:

- `./ralph-loop` reruns Codex until the work is done or an iteration limit is reached.
- `./ralph-once` runs a single Codex pass and exits.

You can use Ralph in two ways. You can keep it inside a project, usually under `scripts/`, and edit the bundled `CHECKLIST.md`, `PROGRESS.md`, and `INSTRUCTIONS.md` files. Or you can add the repo directory to your shell `PATH` and pass your own files with flags. In either setup, keep the entrypoint scripts next to `common.sh`: both `ralph-loop` and `ralph-once` source that file from their own directory. Codex still runs in the directory where you launch the command.

By default the scripts run `codex exec --full-auto --sandbox workspace-write`. If you want the unsafe behavior, pass `--yolo` to use `--dangerously-bypass-approvals-and-sandbox` instead.

Ralph is intentionally non-interactive. It does not stop and ask the user to approve commands mid-run. In the default mode, Codex is expected to run automatically inside the `workspace-write` sandbox. If that is not enough for a given task, the run may fail instead of prompting for approval. `--yolo` exists for users who want unrestricted automatic execution instead.

## What the scripts do

Ralph always works with three files: a checklist, a progress log, and an instructions file. You can edit the bundled copies in this repo, or you can point Ralph at your own files with flags.

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

`ralph-loop` stops early when Codex determines that all checklist tasks are complete. Otherwise it exits with a non-zero status after the configured number of iterations.

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
git clone https://github.com/urban/ralph.git
cd ralph
chmod +x ralph-loop ralph-once
```

Or download the ZIP from GitHub, unzip it, and then:

```bash
cd /path/to/ralph
chmod +x ralph-loop ralph-once
```

## Two common ways to use this repo

### 1. Keep Ralph inside a project under `scripts/`

If you want Ralph to live with one project, clone or copy this repo into that project's `scripts` directory.

A common layout looks like this:

```text
your-project/
  scripts/
    ralph/
      ralph-loop
      ralph-once
      common.sh
      CHECKLIST.md
      PROGRESS.md
      INSTRUCTIONS.md
```

Edit these files to match your project and workflow:

- `scripts/ralph/CHECKLIST.md`
- `scripts/ralph/PROGRESS.md`
- `scripts/ralph/INSTRUCTIONS.md`

Those are the default files Ralph uses when you do not pass `--checklist`, `--progress`, or `--instructions`.

Run Ralph from your project root so Codex works in that project:

```bash
cd /path/to/your-project
./scripts/ralph/ralph-loop
./scripts/ralph/ralph-loop -n 20
./scripts/ralph/ralph-once
```

The scripts still load their default files from `scripts/ralph`, but Codex runs in the directory where you launch the command.

### 2. Add the repo directory to your `PATH` and pass your own files

If you want one Ralph install that you can reuse across projects, add the Ralph repo directory itself to your `PATH`.

Do not symlink only the entrypoint scripts into another directory unless you also keep `common.sh` next to them. Both scripts load `common.sh` relative to their own location.

For zsh on macOS, add Ralph to the startup file your shell actually uses. Many setups use `~/.zshrc`. If you keep your zsh config in `~/.config/zsh/.zprofile`, use that instead.

Using `~/.zshrc`:

```bash
echo 'export PATH="/path/to/ralph:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Using `~/.config/zsh/.zprofile`:

```bash
echo 'export PATH="/path/to/ralph:$PATH"' >> ~/.config/zsh/.zprofile
source ~/.config/zsh/.zprofile
```

For bash:

```bash
echo 'export PATH="/path/to/ralph:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

Replace `/path/to/ralph` with the absolute path where you cloned or unzipped this repo.

Then point Ralph at your own files:

```bash
ralph-loop -c /path/to/CHECKLIST.md -p /path/to/PROGRESS.md -i /path/to/INSTRUCTIONS.md -n 5
ralph-once -c /path/to/CHECKLIST.md -p /path/to/PROGRESS.md -i /path/to/INSTRUCTIONS.md
```

The long-form flags work too:

```bash
ralph-loop --checklist /path/to/CHECKLIST.md --progress /path/to/PROGRESS.md --instructions /path/to/INSTRUCTIONS.md --iterations 5
ralph-once --checklist /path/to/CHECKLIST.md --progress /path/to/PROGRESS.md --instructions /path/to/INSTRUCTIONS.md
```

Use this setup when your checklist, progress log, and instructions already live somewhere outside the Ralph repo.

## Common options

Ralph has two execution modes:

```bash
ralph-loop
ralph-loop --yolo
```

Show help:

```bash
ralph-loop --help
ralph-once --help
```

If Ralph lives inside `scripts/ralph` instead of your `PATH`, use `./scripts/ralph/ralph-loop` and `./scripts/ralph/ralph-once` in those examples.

## How the files work together

- `ralph-loop` handles repeated runs, completion detection, iteration limits, and optional desktop notifications.
- `ralph-once` runs the same Codex command exactly one time.
- `common.sh` contains the shared shell helpers used by both entrypoints.
- `CHECKLIST.md` is the default task list Ralph gives to Codex.
- `INSTRUCTIONS.md` defines the rules for each Codex pass.
- `PROGRESS.md` is the handoff log between passes.
- Codex runs in your launch directory, not the script install directory.
- The default execution mode is `--full-auto --sandbox workspace-write`.
- `--yolo` switches to `--dangerously-bypass-approvals-and-sandbox`.

## Notes

- The optional `tt` command is used only by `ralph-loop` for desktop notifications. Ralph still works if `tt` is not installed.
- `PROGRESS.md` is part of the workflow. Do not delete it unless you also change the scripts.
- Both entrypoints expect `codex` to be available in your shell path.
- For safest use, run Ralph inside a sandbox and a Git repository so you can inspect or roll back changes between passes.
