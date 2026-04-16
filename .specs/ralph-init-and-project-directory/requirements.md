---
name: ralph-init-and-project-directory
created_at: 2026-04-15T23:22:01Z
updated_at: 2026-04-15T23:22:01Z
generated_by:
  root_skill: specification-authoring
  producing_skill: requirements
  skills_used:
    - specification-authoring
    - document-traceability
    - artifact-naming
    - requirements
    - write-requirements
  skill_graph:
    specification-authoring:
      - document-traceability
      - artifact-naming
      - requirements
    document-traceability: []
    artifact-naming: []
    requirements:
      - write-requirements
    write-requirements: []
source_artifacts:
  charter: .specs/ralph-init-and-project-directory/charter.md
  user_stories: .specs/ralph-init-and-project-directory/user-stories.md
---

## Functional Requirements

- FR1.1: The CLI shall provide `ralph init` with no operand, and that command shall write `CHECKLIST.md`, `INSTRUCTIONS.md`, and `PROGRESS.md` into the operator's launch directory using Ralph's bundled template content.
  - Story traceability: US1.1 — Initialize Ralph in the current directory

- FR1.2: The CLI shall accept an optional target-directory operand on `ralph init`; when supplied, Ralph shall resolve that operand to one directory target, create the directory when it does not exist, and reject the command when the resolved target is an existing file.
  - Story traceability: US1.2 — Initialize Ralph in a supplied target directory; US1.3 — Reject a file target during init

- FR1.3: When `ralph init` targets a directory that already contains one or more Ralph files, Ralph shall create backup copies of each pre-existing Ralph file before replacing that file with fresh template content.
  - Story traceability: US1.4 — Preserve existing Ralph files during reinit

- FR1.4: `ralph once` and `ralph loop` shall accept `--ralph-dir` as a shared runtime input source; when supplied, Ralph shall resolve `CHECKLIST.md`, `INSTRUCTIONS.md`, and `PROGRESS.md` from that directory.
  - Story traceability: US1.5 — Run once or loop against one Ralph directory

- FR1.5: When `--ralph-dir` is supplied together with one or more explicit `--checklist`, `--instructions`, or `--progress` flags, Ralph shall use the explicitly flagged file for each overridden role and shall continue using the shared Ralph directory for each remaining unresolved role.
  - Story traceability: US1.6 — Override a shared Ralph directory with specific file flags

- FR1.6: `ralph once` and `ralph loop` shall allow runs without `--ralph-dir` only when the operator supplies all three runtime files explicitly through `--checklist`, `--instructions`, and `--progress`.
  - Story traceability: US1.7 — Run with explicit file flags and no shared Ralph directory

- FR1.7: After applying `--ralph-dir` and any explicit per-file overrides, `ralph once` and `ralph loop` shall fail with a clear error whenever any required runtime file remains unresolved or does not exist as a regular file; they shall not fall back to bundled repo files or implicit current-directory discovery.
  - Story traceability: US1.6 — Override a shared Ralph directory with specific file flags; US1.7 — Run with explicit file flags and no shared Ralph directory; US1.8 — Fail fast when runtime Ralph inputs are missing

- FR1.8: `ralph once` and `ralph loop` shall accept `--cwd` as a separate Codex execution-directory input; when supplied, Codex shall run against that directory, and when omitted, Codex shall continue using the operator's launch directory.
  - Story traceability: US1.9 — Run Codex in a different working directory

## Non-Functional Requirements

- NFR2.1: Runtime input resolution for `ralph once` and `ralph loop` shall be fail-closed: Ralph shall not infer, discover, or silently substitute runtime Ralph files from bundled package assets or from the current directory when required runtime inputs are missing.

- NFR2.2: Adding `init`, `--ralph-dir`, and `--cwd` shall not change the existing Codex execution modes, loop iteration behavior, or checklist-completion detection beyond the approved runtime-input and execution-directory changes.

- NFR2.3: Error paths for file-target init, unresolved runtime inputs, and missing required files shall be operator-visible and shall stop the command before any Codex run begins.

## Technical Constraints

- TC3.1: The CLI surface shall expose `ralph init` with one optional target-directory operand, `--ralph-dir` on `ralph once` and `ralph loop`, `--cwd` on `ralph once` and `ralph loop`, and the existing `--checklist`, `--instructions`, and `--progress` flags.

- TC3.2: Relative paths supplied through the init operand, `--ralph-dir`, `--cwd`, `--checklist`, `--instructions`, or `--progress` shall resolve from the operator's launch directory.

- TC3.3: `--ralph-dir` shall affect only Ralph runtime file lookup, while `--cwd` shall affect only Codex's working directory.

- TC3.4: Bundled copies of `CHECKLIST.md`, `INSTRUCTIONS.md`, and `PROGRESS.md` shall be template assets for `ralph init` only and shall not act as implicit runtime fallbacks for `ralph once` or `ralph loop`.

## Data Requirements

- DR4.1: Ralph's shared project-directory model shall use three canonical runtime filenames: `CHECKLIST.md`, `INSTRUCTIONS.md`, and `PROGRESS.md`.

- DR4.2: Before a `ralph once` or `ralph loop` run starts Codex, Ralph shall have resolved exactly one checklist file, one instructions file, and one progress file.

- DR4.3: Any backup created during `ralph init` reinitialization shall preserve the full pre-existing contents of the replaced Ralph file.

## Integration Requirements

- IR5.1: `ralph init` shall integrate with the local filesystem to detect target-path type, create target directories when needed, create backup copies for overwritten Ralph files, and write new Ralph files from bundled templates.

- IR5.2: `ralph once` and `ralph loop` shall integrate the resolved Ralph runtime files and the selected Codex working directory into the Codex invocation.

- IR5.3: Ralph's packaged distribution shall include bundled template assets for `CHECKLIST.md`, `INSTRUCTIONS.md`, and `PROGRESS.md` so `ralph init` can write them without reaching into another project directory.

## Dependencies

- DEP6.1: `ralph once` and `ralph loop` require the Codex CLI to be installed and executable in the operator environment.

- DEP6.2: `ralph init` and reinit flows require filesystem permission to create directories, write Ralph files, and write backup files at the target location.

- DEP6.3: `ralph once` and `ralph loop` require the resolved checklist, instructions, and progress inputs to exist as regular files before Codex starts.

## Further Notes

- Assumptions: None
- Open questions: None
- TODO: Confirm: None
