# Approval View

## Change Summary

- Previous snapshot SHA-256: 4df7cc8332c1e22011458ffbebb6068471fd1a4512aeff0fa598dad512ac7be1
- Removed the prior compatibility story that preserved no-flag runs using bundled repo files.
- Added an explicit-file-input story for runs that supply checklist, instructions, and progress paths without `--ralph-dir`.
- Added a fail-fast story for missing runtime Ralph inputs.
- Tightened the Codex execution-directory story so it stays compatible with either `--ralph-dir` or explicit file flags.

## Capability Areas at a Glance

- `Initialize Ralph Files` covers current-directory init, target-directory init, file-target rejection, and backup-before-overwrite.
- `Resolve Ralph Files for Runs` covers shared `--ralph-dir` resolution, per-file overrides, explicit-file-only runs, and fail-fast missing-input handling.
- `Control Codex Execution Directory` keeps `--cwd` separate from Ralph file selection so operators can aim Codex at a different working tree.

## Story Anchors and Observable Outcomes

- `US1.1`: `ralph init` with no operand writes the three Ralph files into the launch directory.
- `US1.5`: `--ralph-dir` lets one directory supply checklist, instructions, and progress files for `ralph once` or `ralph loop`.
- `US1.7`: operators may run with explicit `--checklist`, `--instructions`, and `--progress` flags and no shared Ralph directory.
- `US1.8`: missing runtime Ralph inputs hard-fail and never fall back to bundled repo files or implicit current-directory discovery.
- `US1.9`: `--cwd` changes Codex's working directory without changing the selected Ralph file sources.

## Boundary and Failure Coverage

- `US1.3` rejects an init target that resolves to an existing file and writes no Ralph files there.
- `US1.4` preserves existing Ralph files by creating backups before writing fresh defaults.
- `US1.6` keeps override precedence explicit when `--ralph-dir` and per-file flags are combined.
- `US1.8` treats omitted runtime Ralph inputs as a clear boundary error instead of a discovery fallback.

## Decisions Required for Approval

- Approve removal of the no-flag compatibility story that previously preserved bundled runtime defaults.
- Approve inclusion of the fail-fast missing-input story as first-class user-visible behavior.
- Approve inclusion of the explicit-file-only run story so `--ralph-dir` stays optional when all three file paths are supplied directly.

## Story Gaps and TODO: Confirm Items

- None

## Traceability Map

- [T1] Claim: The story set still covers init in the launch directory with no operand.
  - Source: /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/user-stories.md :: Story: Initialize Ralph in the current directory
  - Evidence quote: "- Observation: The command succeeds and the three Ralph files appear in the directory where the operator launched the command."
- [T2] Claim: The revised story set preserves backup-before-overwrite as operator-visible behavior.
  - Source: /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/user-stories.md :: Story: Preserve existing Ralph files during reinit
  - Evidence quote: "- Observation: Backup copies of the pre-existing Ralph files are created before the new default files are written."
- [T3] Claim: The revised story set supports fully explicit runtime file inputs without `--ralph-dir`.
  - Source: /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/user-stories.md :: Story: Run with explicit file flags and no shared Ralph directory
  - Evidence quote: "- Observation: The run uses the explicitly supplied file paths and starts without requiring `--ralph-dir`."
- [T4] Claim: The revised story set now treats missing runtime Ralph inputs as a hard error.
  - Source: /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/user-stories.md :: Story: Fail fast when runtime Ralph inputs are missing
  - Evidence quote: "- Observation: The command exits with a clear error and does not fall back to bundled repo files or implicit current-directory discovery."
- [T5] Claim: The revised story set still separates Ralph file sources from Codex execution location.
  - Source: /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/user-stories.md :: Story: Run Codex in a different working directory
  - Evidence quote: "- Observation: The run uses the requested Codex working directory rather than the launch directory while still honoring the selected Ralph file sources."

## Validator Status

- Canonical validator:
  - Command: bash .agents/skills/write-user-stories/scripts/validate_user_stories.sh .specs/ralph-init-and-project-directory/user-stories.md
  - Result: Passed
- Approval-view validator:
  - Command: bash .agents/skills/write-approval-view/scripts/validate_approval_view.sh artifact-revised /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/user-stories.md .specs/ralph-init-and-project-directory/approval/user-stories.md .specs/ralph-init-and-project-directory/approval/user-stories.html
  - Result: Passed

## Downstream Impact if Approved

- Requirements can replace bundled-default runtime obligations with fail-closed runtime input requirements.
- Requirements can define exact precedence among `--ralph-dir` and explicit per-file flags without carrying any implicit bundled fallback behavior.
- Technical design can treat bundled Ralph repo files as init-only template assets and remove no-input runtime fallback paths.

## Snapshot Identity

- Review type: Artifact
- Approval mode: Revised
- Canonical artifact: /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/user-stories.md
- Snapshot SHA-256: 68ee4e9616e30f3f40c572765f14d3a4ef6ffea846d49466e53d8df9ef2ac93c
- Canonical updated_at: 2026-04-15T22:58:48Z
- Approval view generated_at: 2026-04-15T23:59:10Z
