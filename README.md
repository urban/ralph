# Ralph

Ralph is a small Bun CLI around `codex exec`.

It runs Codex through independently authored before-work, work, and after-work phases.

Main entrypoints:

- `ralph init [target-directory]` — write bundled Ralph template files
- `ralph once` — run one Codex pass
- `ralph loop` — rerun until complete or iteration limit hit

## Runtime inputs

`ralph once` and `ralph loop` require runtime Ralph inputs.

Pass a required work phase with `--work` / `-w`, or pass `--ralph-dir` / `-d` to use the phase files in one directory. Optional before-work and after-work phases use `--before` / `-b` and `--after` / `-a`.

Explicit phase flags override `--ralph-dir` per phase.

Relative init targets resolve from the launch directory. Runtime phase paths resolve from the working directory selected with `--cwd` / `-C`, or from the launch directory by default.

The bundled `init` templates live in `src/templates/` inside this repo.

Codex runs in the launch directory by default. Use `--cwd <directory>` to run Codex somewhere else.

## Usage

```bash
ralph init
ralph init .ralph
ralph once --ralph-dir .ralph
ralph loop --ralph-dir .ralph -n 20
ralph once --work ./WORK.md
ralph once --ralph-dir .ralph --cwd .
```

Local repo dev:

```bash
bun run cli init
bun run cli once --ralph-dir .ralph
```

## Flags

`init` supports:

- `[target-directory]`

Shared flags on `once` and `loop`:

- `-b`, `--before <path>`
- `-w`, `--work <path>`
- `-a`, `--after <path>`
- `-d`, `--ralph-dir <directory>`
- `-C`, `--cwd <directory>`
- `--idle-timeout <duration>`
- `--invocation-timeout <duration>`
- `--yolo`

`loop` also supports:

- `-n`, `--iterations <count>`

Show help:

```bash
ralph --help
ralph once --help
ralph loop --help
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

Put `ralph` on your `PATH` from this checkout:

```bash
bun install
npm link
```

Use `npm link`, not `bun link`. Current Bun releases have a limitation around globally linking local package `bin` entries, so `bun link` does not reliably expose the `ralph` command on your `PATH`. `npm link` does.

If `ralph` is not found, add your npm global bin dir to `PATH`:

```bash
export PATH="$(npm prefix -g)/bin:$PATH"
```

Persist that in your shell rc, for example `~/.zshrc` or `~/.bashrc`.

Then run:

```bash
ralph init
ralph once --work ./WORK.md
```

Local repo dev:

```bash
bun install
bun run cli init
bun run cli once --work ./WORK.md
```

## Notes

- `init` copies bundled phase templates from `src/templates/` and backs up existing phase files before overwrite with sibling names like `WORK.md.bak.<timestamp>`.
- `loop` stops early when stdout contains `<promise>COMPLETE</promise>`.
- Optional desktop notifications use `tt notify` when `tt` exists.
- Ralph is non-interactive by design.
