# Approval View

## Obligations that Define Scope

- This requirements set turns the approved charter and user stories into a fail-closed runtime-input contract for `ralph once`, `ralph loop`, and `ralph init`.
- The highest-impact obligation is the removal of implicit bundled runtime defaults: operators must supply runtime Ralph inputs through `--ralph-dir` or explicit file flags, or Ralph must fail fast.
- The requirements also preserve the product split between Ralph file selection and Codex execution-directory control through `--cwd`.

## Integration, Data, and Validation Hotspots

- `ralph init` must resolve one directory target, reject file targets, and create backups before overwriting existing Ralph files.
- `--ralph-dir` may supply all three runtime Ralph files, but explicit `--checklist`, `--instructions`, and `--progress` flags override it role by role.
- Before any Codex run starts, Ralph must resolve exactly one checklist file, one instructions file, and one progress file.
- Missing or non-regular runtime Ralph files hard-fail the run before any Codex invocation begins.

## Non-Functional and Technical Constraints

- Runtime input resolution for `ralph once` and `ralph loop` must stay fail-closed: no bundled fallback files and no implicit current-directory discovery.
- Relative paths supplied through the init operand, `--ralph-dir`, `--cwd`, or explicit per-file flags resolve from the operator's launch directory.
- `--ralph-dir` affects only Ralph runtime file lookup, while `--cwd` affects only Codex's working directory.
- Bundled copies of `CHECKLIST.md`, `INSTRUCTIONS.md`, and `PROGRESS.md` are template assets for `ralph init` only.

## Decisions Required for Approval

- Approve the fail-closed runtime-input contract: no `ralph once` or `ralph loop` run may start without all three runtime Ralph files resolved.
- Approve the input precedence contract: explicit per-file flags override `--ralph-dir`, and `--cwd` stays independent from Ralph file lookup.
- Approve bundled Ralph repo files as init-only template assets rather than runtime defaults.

## Requirement Risks and TODO: Confirm Items

- This requirements set formalizes a breaking change for users who relied on no-input bundled defaults.
- The requirements intentionally keep backup naming unspecified, so implementation still needs a design that preserves prior contents without weakening operator clarity.
- The contract has two nearby directory concepts, so later design and help text must keep file-source selection separate from Codex execution location.

## Traceability Map

- [T1] Claim: `ralph init` with no operand must write the three Ralph files into the launch directory from bundled templates.
  - Source: /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/requirements.md :: Functional Requirements
  - Evidence quote: "- FR1.1: The CLI shall provide `ralph init` with no operand, and that command shall write `CHECKLIST.md`, `INSTRUCTIONS.md`, and `PROGRESS.md` into the operator's launch directory using Ralph's bundled template content."
- [T2] Claim: Runtime runs may use `--ralph-dir`, but explicit file flags override it role by role.
  - Source: /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/requirements.md :: Functional Requirements
  - Evidence quote: "- FR1.5: When `--ralph-dir` is supplied together with one or more explicit `--checklist`, `--instructions`, or `--progress` flags, Ralph shall use the explicitly flagged file for each overridden role and shall continue using the shared Ralph directory for each remaining unresolved role."
- [T3] Claim: Missing runtime Ralph inputs must hard-fail and must not fall back to bundled repo files or implicit discovery.
  - Source: /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/requirements.md :: Functional Requirements
  - Evidence quote: "- FR1.7: After applying `--ralph-dir` and any explicit per-file overrides, `ralph once` and `ralph loop` shall fail with a clear error whenever any required runtime file remains unresolved or does not exist as a regular file; they shall not fall back to bundled repo files or implicit current-directory discovery."
- [T4] Claim: `--cwd` controls Codex's working directory separately from Ralph file lookup.
  - Source: /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/requirements.md :: Technical Constraints
  - Evidence quote: "- TC3.3: `--ralph-dir` shall affect only Ralph runtime file lookup, while `--cwd` shall affect only Codex's working directory."
- [T5] Claim: Bundled copies of the three Ralph files are init-only template assets.
  - Source: /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/requirements.md :: Technical Constraints
  - Evidence quote: "- TC3.4: Bundled copies of `CHECKLIST.md`, `INSTRUCTIONS.md`, and `PROGRESS.md` shall be template assets for `ralph init` only and shall not act as implicit runtime fallbacks for `ralph once` or `ralph loop`."

## Validator Status

- Canonical validator:
  - Command: bash .agents/skills/write-requirements/scripts/validate_requirements.sh .specs/ralph-init-and-project-directory/requirements.md
  - Result: Passed
- Approval-view validator:
  - Command: bash .agents/skills/write-approval-view/scripts/validate_approval_view.sh artifact /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/requirements.md .specs/ralph-init-and-project-directory/approval/requirements.md .specs/ralph-init-and-project-directory/approval/requirements.html
  - Result: Passed

## Downstream Impact if Approved

- Technical design can now define path-resolution flow, init template handling, and runtime validation against a stable fail-closed contract.
- Implementation planning can treat bundled Ralph files as template assets only and remove runtime fallback behavior from the solution space.
- Testing strategy can center on init path cases, override precedence, missing-input errors, and `--cwd` separation.

## Snapshot Identity

- Review type: Artifact
- Approval mode: Initial
- Canonical artifact: /Users/urbanfaubion/.supacode/repos/ralph/ralph-effect/.specs/ralph-init-and-project-directory/requirements.md
- Snapshot SHA-256: 465dcb7d544b6426504958cd795c3f4c0e167540727f8fe161156f078ddb1a89
- Canonical updated_at: 2026-04-15T23:22:01Z
- Approval view generated_at: 2026-04-15T23:59:20Z
