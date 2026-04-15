# Ralph

Ralph is a small Bun CLI around `codex exec`.

It runs Codex against three files:

- a checklist
- a progress log
- an instructions file

Main entrypoint:

- `ralph once` — run one Codex pass
- `ralph loop` — rerun until complete or iteration limit hit

Legacy wrappers still work:

- `./ralph-once` → `./ralph once`
- `./ralph-loop` → `./ralph loop`

## Defaults

If you do not pass file flags, Ralph uses the bundled files in this repo:

- `CHECKLIST.md`
- `PROGRESS.md`
- `INSTRUCTIONS.md`

Relative paths passed with flags resolve from the directory where you launch `ralph`.

Codex still runs against that launch directory.

## Usage

```bash
./ralph once
./ralph loop
./ralph loop -n 20
./ralph once -c ./CHECKLIST.md -p ./PROGRESS.md -i ./INSTRUCTIONS.md
```

If the repo is on your `PATH`, drop the leading `./`.

## Flags

Shared flags on both commands:

- `-c`, `--checklist <path>`
- `-i`, `--instructions <path>`
- `-p`, `--progress <path>`
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
./ralph once
```

## Notes

- `loop` stops early when stdout contains `<promise>COMPLETE</promise>`.
- Optional desktop notifications use `tt notify` when `tt` exists.
- Ralph is non-interactive by design.
