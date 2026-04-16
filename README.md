# Ralph

Ralph is a small Bun CLI around `codex exec`.

It runs Codex against three files:

- a checklist
- a progress log
- an instructions file

Main entrypoints:

- `ralph init [target-directory]` — write Ralph template files
- `ralph once` — run one Codex pass
- `ralph loop` — rerun until complete or iteration limit hit

Legacy wrappers still work:

- `./ralph-once` → `./ralph once`
- `./ralph-loop` → `./ralph loop`

## Runtime inputs

`ralph once` and `ralph loop` require runtime Ralph inputs.

Pass either:

- `--ralph-dir <directory>` with `CHECKLIST.md`, `INSTRUCTIONS.md`, and `PROGRESS.md`
- all three explicit file flags: `--checklist`, `--instructions`, `--progress`

Explicit file flags override `--ralph-dir` per file.

Relative paths passed with `init`, `--ralph-dir`, `--cwd`, and file flags resolve from the directory where you launch `ralph`.

Codex runs in the launch directory by default. Use `--cwd <directory>` to run Codex somewhere else.

## Usage

```bash
./ralph init
./ralph init ./.ralph
./ralph once --ralph-dir ./.ralph
./ralph loop --ralph-dir ./.ralph -n 20
./ralph once -c ./.ralph/CHECKLIST.md -p ./.ralph/PROGRESS.md -i ./.ralph/INSTRUCTIONS.md
./ralph once --ralph-dir ./.ralph --cwd .
```

If the repo is on your `PATH`, drop the leading `./`.

## Flags

`init` supports:

- `[target-directory]`

Shared flags on `once` and `loop`:

- `-c`, `--checklist <path>`
- `-i`, `--instructions <path>`
- `-p`, `--progress <path>`
- `--ralph-dir <directory>`
- `--cwd <directory>`
- `--yolo`

`loop` also supports:

- `-n`, `--iterations <count>`

Show help:

```bash
./ralph --help
./ralph once --help
./ralph loop --help
```

## Execution mode

Default mode:

```bash
codex exec --full-auto --sandbox workspace-write
```

`--yolo` switches to:

```bash
codex exec --dangerously-bypass-approvals-and-sandbox
```

## Install

Prereqs:

- Bun
- Codex CLI

Example:

```bash
brew install bun
npm install -g @openai/codex
```

Then run:

```bash
chmod +x ralph ralph-once ralph-loop
./ralph init
./ralph once --ralph-dir .
```

## Notes

- `init` backs up existing Ralph files before overwrite with sibling names like `CHECKLIST.md.bak.<timestamp>`.
- `loop` stops early when stdout contains `<promise>COMPLETE</promise>`.
- Optional desktop notifications use `tt notify` when `tt` exists.
- Ralph is non-interactive by design.
