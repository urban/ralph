---
name: ralph-init-and-project-directory
created_at: 2026-04-15T21:12:17Z
updated_at: 2026-04-15T22:54:24Z
generated_by:
  root_skill: specification-authoring
  producing_skill: charter
  skills_used:
    - specification-authoring
    - document-traceability
    - artifact-naming
    - charter
    - write-charter
  skill_graph:
    specification-authoring:
      - document-traceability
      - artifact-naming
      - charter
    document-traceability: []
    artifact-naming: []
    charter:
      - write-charter
    write-charter: []
source_artifacts: {}
---

## Goals

- Add a new `ralph init [target-directory]` subcommand that writes Ralph's working files into the current working directory by default or into a supplied target directory.
- Let operators point `ralph once` and `ralph loop` at one Ralph project directory via `--ralph-dir`, where that directory contains `CHECKLIST.md`, `INSTRUCTIONS.md`, and `PROGRESS.md`, while keeping the per-file flags as stronger overrides.
- Let operators set the Codex execution working directory explicitly with an optional `--cwd` flag on `ralph once` and `ralph loop`.
- Limit the bundled Ralph repo copies of `CHECKLIST.md`, `INSTRUCTIONS.md`, and `PROGRESS.md` to template use in `ralph init`, not implicit runtime input use in `ralph once` or `ralph loop`.
- Preserve operator data when `init` overwrites existing Ralph files by backing up the pre-existing copies before writing new defaults.

## Non-Goals

- Change Ralph's Codex execution model, prompt shape, or completion detection beyond allowing an explicit `--cwd` override for where Codex runs.
- Introduce multi-directory resolution, implicit current-directory discovery, or discovery across several candidate directories.
- Use the bundled Ralph repo copies of `CHECKLIST.md`, `INSTRUCTIONS.md`, and `PROGRESS.md` as runtime fallbacks for `ralph once` or `ralph loop`.
- Redefine the bundled template file contents beyond copying the existing default `CHECKLIST.md`, `INSTRUCTIONS.md`, and `PROGRESS.md` artifacts into a target directory.

## Personas / Actors

- CLI operator initializing Ralph inside a repository or local working directory.
- CLI operator rerunning `ralph once` or `ralph loop` against runtime Ralph inputs supplied through `--ralph-dir` or explicit file flags.
- CLI operator who needs Ralph's files in one directory but needs Codex to run against another directory selected with `--cwd`.
- Maintainer preserving existing Ralph behavior while adding a simpler setup path for new projects.

## Success Criteria

- SC1.1: An operator can run `ralph init` with no operand and get `CHECKLIST.md`, `INSTRUCTIONS.md`, and `PROGRESS.md` written into the launch directory.
- SC1.2: An operator can run `ralph init <directory>` with a target directory path, and Ralph creates that directory when it does not already exist but rejects targets that resolve to a file.
- SC1.3: When the target directory already contains one or more Ralph files, Ralph creates backups before replacing those files with fresh defaults.
- SC1.4: An operator can run `ralph once` or `ralph loop` with `--ralph-dir <directory>` so Ralph resolves all three Ralph files from that directory unless a more specific per-file flag overrides the shared directory.
- SC1.5: An operator can run `ralph once` or `ralph loop` with `--cwd <directory>` so Codex runs against that directory instead of the launch directory.
- SC1.6: The bundled Ralph repo copies of `CHECKLIST.md`, `INSTRUCTIONS.md`, and `PROGRESS.md` are used only as `ralph init` templates and are never used as implicit runtime inputs for `ralph once` or `ralph loop`.
- SC1.7: When an operator runs `ralph once` or `ralph loop` without `--ralph-dir` and without explicit `--checklist`, `--instructions`, or `--progress` flags, Ralph exits with a clear error instead of falling back to bundled or discovered files.
- SC1.8: An operator can still run `ralph once` or `ralph loop` using explicit `--checklist`, `--instructions`, and `--progress` flags without supplying `--ralph-dir`.
