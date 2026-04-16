# Approval View

## Change Summary

- Previous snapshot SHA-256: 0ec133112adb1bc58c1deac21fbe08f86cd962ac81a692802c61d94f74684a26
- Removed the prior charter commitment that bundled runtime defaults remain compatible for `ralph once` and `ralph loop`.
- Added a charter goal and success criteria that limit the bundled Ralph repo files to `ralph init` template use only.
- Added a hard-error charter commitment for `ralph once` and `ralph loop` when neither `--ralph-dir` nor explicit file flags supply runtime Ralph inputs.
- Clarified that implicit current-directory discovery is out of scope.

## Goals at a Glance

- This revised charter keeps `ralph init`, `--ralph-dir`, `--cwd`, and backup-before-overwrite, but removes bundled runtime defaults for `ralph once` and `ralph loop`.
- The bundled Ralph repo files are now scoped as `ralph init` templates only, not implicit runtime inputs for other project runs.
- The runtime contract is now stricter: operators must supply Ralph inputs through `--ralph-dir` or explicit file flags, or Ralph fails fast.

## Non-Goals / Scope Exclusions

- Using bundled Ralph repo files as implicit runtime fallbacks for `ralph once` or `ralph loop`.
- Implicit current-directory discovery when runtime Ralph inputs are not supplied.
- Internal implementation structure for path resolution, backup naming, or Codex invocation wiring.

## Personas / Actors that Matter

- CLI operator initializing Ralph inside a repository or local working directory.
- CLI operator rerunning `ralph once` or `ralph loop` against runtime Ralph inputs supplied through `--ralph-dir` or explicit file flags.
- CLI operator who needs Ralph's files in one directory but needs Codex to run against another directory selected with `--cwd`.
- Maintainer preserving existing Ralph behavior while adding a simpler setup path for new projects.

## Success Criteria that Define Done

- `SC1.1`: An operator can run `ralph init` with no operand and get `CHECKLIST.md`, `INSTRUCTIONS.md`, and `PROGRESS.md` written into the launch directory.
- `SC1.4`: An operator can run `ralph once` or `ralph loop` with `--ralph-dir` pointing at one shared directory so Ralph resolves all three Ralph files from that directory unless a more specific per-file flag overrides the shared directory.
- `SC1.5`: An operator can run `ralph once` or `ralph loop` with `--cwd` pointing at a selected directory so Codex runs against that directory instead of the launch directory.
- `SC1.7`: When an operator runs `ralph once` or `ralph loop` without `--ralph-dir` and without explicit `--checklist`, `--instructions`, or `--progress` flags, Ralph exits with a clear error instead of falling back to bundled or discovered files.
- `SC1.8`: An operator can still run `ralph once` or `ralph loop` using explicit `--checklist`, `--instructions`, and `--progress` flags without supplying `--ralph-dir`.

## Decisions Required for Approval

- Approve removal of bundled runtime defaults for `ralph once` and `ralph loop`.
- Approve the stricter runtime contract: `--ralph-dir` or explicit file flags must supply Ralph inputs, otherwise Ralph exits with a clear error.
- Approve keeping the bundled Ralph repo files only as `ralph init` templates.

## Scope Risks and Open Questions

- Removing implicit bundled defaults makes the CLI safer for external projects, but it is a breaking behavior change for users who relied on no-input runs.
- Hard-error behavior avoids accidental cross-project template reuse, but it shifts more setup responsibility onto operators before first run.
- Keeping explicit file flags and `--ralph-dir` together preserves flexibility, but later requirements must state precedence with little room for ambiguity.

## Traceability Map

- [T1] Claim: The revised charter limits the bundled Ralph repo files to template use in `ralph init`, not runtime use in `ralph once` or `ralph loop`.
  - Source: /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/charter.md :: Goals
  - Evidence quote: "- Limit the bundled Ralph repo copies of `CHECKLIST.md`, `INSTRUCTIONS.md`, and `PROGRESS.md` to template use in `ralph init`, not implicit runtime input use in `ralph once` or `ralph loop`."
- [T2] Claim: The revised charter makes bundled runtime fallbacks an explicit non-goal.
  - Source: /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/charter.md :: Non-Goals
  - Evidence quote: "- Use the bundled Ralph repo copies of `CHECKLIST.md`, `INSTRUCTIONS.md`, and `PROGRESS.md` as runtime fallbacks for `ralph once` or `ralph loop`."
- [T3] Claim: The revised charter requires a clear hard error when `once` or `loop` have neither `--ralph-dir` nor explicit runtime file flags.
  - Source: /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/charter.md :: Success Criteria
  - Evidence quote: "- SC1.7: When an operator runs `ralph once` or `ralph loop` without `--ralph-dir` and without explicit `--checklist`, `--instructions`, or `--progress` flags, Ralph exits with a clear error instead of falling back to bundled or discovered files."
- [T4] Claim: The revised charter still preserves explicit per-file runtime inputs without requiring `--ralph-dir`.
  - Source: /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/charter.md :: Success Criteria
  - Evidence quote: "- SC1.8: An operator can still run `ralph once` or `ralph loop` using explicit `--checklist`, `--instructions`, and `--progress` flags without supplying `--ralph-dir`."
- [T5] Claim: The revised charter still keeps `--cwd` as separate Codex execution-directory control.
  - Source: /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/charter.md :: Goals
  - Evidence quote: "- Let operators set the Codex execution working directory explicitly with an optional `--cwd` flag on `ralph once` and `ralph loop`."

## Validator Status

- Canonical validator:
  - Command: bash .agents/skills/write-charter/scripts/validate_charter.sh .specs/ralph-init-and-project-directory/charter.md
  - Result: Passed
- Approval-view validator:
  - Command: bash .agents/skills/write-approval-view/scripts/validate_approval_view.sh artifact-revised /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/charter.md .specs/ralph-init-and-project-directory/approval/charter.md .specs/ralph-init-and-project-directory/approval/charter.html
  - Result: Passed

## Downstream Impact if Approved

- User stories must replace bundled-default compatibility coverage with explicit missing-input error coverage.
- Requirements can now specify a fail-closed runtime input contract for `once` and `loop`.
- Technical design can remove bundled runtime fallback logic and treat repo-bundled Ralph files as init-only template assets.

## Snapshot Identity

- Review type: Artifact
- Approval mode: Revised
- Canonical artifact: /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/charter.md
- Snapshot SHA-256: f3e35a8e2c6f9b28a19b75a28a1d9a7b0b40f50ee569b58620560af47376ff8e
- Canonical updated_at: 2026-04-15T22:54:24Z
- Approval view generated_at: 2026-04-15T23:59:00Z
