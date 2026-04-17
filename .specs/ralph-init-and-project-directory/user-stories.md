---
name: ralph-init-and-project-directory
created_at: 2026-04-15T22:41:59Z
updated_at: 2026-04-15T22:58:48Z
generated_by:
  root_skill: specification-authoring
  producing_skill: user-story-authoring
  skills_used:
    - specification-authoring
    - document-traceability
    - artifact-naming
    - user-story-authoring
    - write-user-stories
    - visual-diagramming
  skill_graph:
    specification-authoring:
      - document-traceability
      - artifact-naming
      - user-story-authoring
    document-traceability: []
    artifact-naming: []
    user-story-authoring:
      - write-user-stories
      - visual-diagramming
    write-user-stories: []
    visual-diagramming: []
source_artifacts:
  charter: .specs/ralph-init-and-project-directory/charter.md
---

# User Stories

## Capability Area: Initialize Ralph Files

### Story: Initialize Ralph in the current directory

- Story ID: US1.1
- Actor: CLI operator
- Situation: The operator is in a repository or working directory that needs Ralph's default files and runs `ralph init` with no operand.
- Action: The operator initializes Ralph in the launch directory.
- Outcome: The operator gets a ready-to-edit `CHECKLIST.md`, `INSTRUCTIONS.md`, and `PROGRESS.md` set without having to create each file manually.
- Observation: The command succeeds and the three Ralph files appear in the directory where the operator launched the command.

### Story: Initialize Ralph in a supplied target directory

- Story ID: US1.2
- Actor: CLI operator
- Situation: The operator wants Ralph's files in a specific relative directory and runs `ralph init` with a target directory operand.
- Action: The operator initializes Ralph at the supplied directory path.
- Outcome: The operator can keep Ralph's files in a deliberate project location without moving them by hand.
- Observation: The command succeeds, creates the directory when needed, and writes the three Ralph files into the requested directory.

### Story: Reject a file target during init

- Story ID: US1.3
- Actor: CLI operator
- Situation: The operator runs `ralph init` with an operand that resolves to an existing file instead of a directory.
- Action: The operator attempts to initialize Ralph at that path.
- Outcome: The operator gets a clear boundary error instead of an invalid partial setup.
- Observation: The command exits with an error that the target is a file and no Ralph files are written there.

### Story: Preserve existing Ralph files during reinit

- Story ID: US1.4
- Actor: CLI operator
- Situation: The target directory already contains one or more Ralph files and the operator reruns `ralph init` there.
- Action: The operator reinitializes Ralph in the same directory.
- Outcome: The operator refreshes the default files without silently losing earlier checklist, instructions, or progress content.
- Observation: Backup copies of the pre-existing Ralph files are created before the new default files are written.

## Capability Area: Resolve Ralph Files for Runs

### Story: Run once or loop against one Ralph directory

- Story ID: US1.5
- Actor: CLI operator
- Situation: The operator keeps Ralph's files in a separate directory and wants `ralph once` or `ralph loop` to use that set.
- Action: The operator runs the command with `--ralph-dir` pointing at that directory.
- Outcome: The operator can select one shared Ralph project directory instead of passing three file paths every time.
- Observation: The run uses the checklist, instructions, and progress content from the specified Ralph directory.

### Story: Override a shared Ralph directory with specific file flags

- Story ID: US1.6
- Actor: CLI operator
- Situation: The operator uses `--ralph-dir` but needs one or more Ralph files to come from a different path for a specific run.
- Action: The operator supplies `--ralph-dir` together with one or more explicit `--checklist`, `--instructions`, or `--progress` flags.
- Outcome: The operator can reuse a shared Ralph directory while overriding only the files that need a different source.
- Observation: The run reflects the explicitly flagged file content for overridden files and the shared Ralph directory content for the rest.

### Story: Run with explicit file flags and no shared Ralph directory

- Story ID: US1.7
- Actor: CLI operator
- Situation: The operator wants to run `ralph once` or `ralph loop` with explicit checklist, instructions, and progress paths and does not want to set `--ralph-dir`.
- Action: The operator supplies `--checklist`, `--instructions`, and `--progress` without `--ralph-dir`.
- Outcome: The operator can run Ralph with fully explicit runtime inputs and no shared Ralph directory configuration.
- Observation: The run uses the explicitly supplied file paths and starts without requiring `--ralph-dir`.

### Story: Fail fast when runtime Ralph inputs are missing

- Story ID: US1.8
- Actor: CLI operator
- Situation: The operator runs `ralph once` or `ralph loop` without `--ralph-dir` and without explicit `--checklist`, `--instructions`, or `--progress` flags.
- Action: The operator starts the run without supplying runtime Ralph inputs.
- Outcome: The operator gets a clear boundary error instead of accidentally using bundled templates or discovered files from the wrong place.
- Observation: The command exits with a clear error and does not fall back to bundled repo files or implicit current-directory discovery.

## Capability Area: Control Codex Execution Directory

### Story: Run Codex in a different working directory

- Story ID: US1.9
- Actor: CLI operator
- Situation: The operator wants Ralph's files to come from one directory but wants Codex to inspect and edit a different project directory.
- Action: The operator runs `ralph once` or `ralph loop` with `--cwd` and, when needed, `--ralph-dir` or explicit file flags.
- Outcome: The operator can separate Ralph configuration storage from the project directory where Codex works.
- Observation: The run uses the requested Codex working directory rather than the launch directory while still honoring the selected Ralph file sources.
