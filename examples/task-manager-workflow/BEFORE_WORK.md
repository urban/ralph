# Planner

Prepare exactly one Work Item for the Worker while preserving the active review transaction.

This workflow is serial. Ralph is the only code worker and the sole `tm` writer. Every Work Item must use the `agent` executor. Never use `--force`, `--allow-human`, `--allow-no-verification`, destructive deletion, or direct edits to `.tasks/tasks.jsonl`.

## Runtime paths and identity

1. Resolve the workflow directory from `RALPH_TM_DIR`, defaulting to `.ralph-tm`.
2. Read `<workflow-directory>/HANDOFF_CONTRACT.md` completely and follow its canonical shape, states, candidate identities, and atomic replacement protocol.
3. Use `<workflow-directory>/HANDOFF.md` as the live handoff and `HANDOFF.md.tmp` as its temporary replacement.
4. Require a nonempty `TM_ACTOR` and use that exact identity for every claim, release, and completion in the transaction.
5. Require `git`, `jq`, and `tm` on `PATH`.
6. Confirm with `git check-ignore` that the handoff and temporary handoff are ignored.
7. Confirm with `git check-ignore --no-index .ralph-snapshot-ignore-probe/BEFORE_WORK.md` that root-level `.ralph-snapshot-*` directories are ignored. Ralph's live iteration snapshot exists while these instructions run; stop rather than risk treating it as transaction work or staging it.

Always run `tm validate` before selecting or mutating Work Items.

## Validate the agent-only backlog

Use `tm list --all --executor human --json` and recursively inspect its tree. If any object has `matchesFilter: true`, stop and report that this workflow does not support human-executor Work Items.

Do not interpret `tm next` returning `no-actionable-work` as overall completion. Overall completion requires an empty open backlog across all executors.

## Resume an existing handoff

When the handoff exists, read it completely and treat IDs and Git coordinates as assertions to validate, not as replacements for `tm` or Git state.

Require the recorded transaction branch, base branch, base commit, transaction root, current item, state, transaction-item relationships, and candidate tree fields to be internally coherent.

Handle its state as follows:

- `selected`: verify that the transaction branch is checked out and the current open item is claimed by `TM_ACTOR`. Preserve the selection so the Worker can resume interrupted implementation.
- `ready-for-review`: verify that the recorded candidate tree still equals `git write-tree`. Preserve the selection so the Worker can hand the unchanged candidate back to the Reviewer.
- `planning` or `remediation`: select the next transaction item using the transaction-aware policy below.
- `accepted-awaiting-commit`: finish the already accepted transaction commit from the recorded candidate and task-store state, then move the handoff to `accepted-awaiting-merge`.
- `accepted-awaiting-merge`: finish the recorded fast-forward merge and cleanup, then continue as though no handoff existed.
- Any other, malformed, or contradictory state: stop and report the exact inconsistency.

Never start unrelated work while an existing transaction still needs implementation, review, commit, merge, or cleanup.

## Select within an active transaction

The handoff records the transaction root and every review finding created during the transaction, including which rejected item each finding blocks.

When the state is `planning` or `remediation`:

1. Inspect every recorded transaction Work Item with `tm show --json`.
2. Reconcile completed findings in the handoff with authoritative `tm` state.
3. Consider only open transaction items. Never inspect unrelated global items while the transaction is active.
4. Prioritize an actionable review finding over the transaction root. Prefer the deepest blocking chain first, then preserve finding creation order for independent siblings.
5. When all findings blocking a rejected item are done, select that rejected item for integration and re-review. The transaction root is selected last, after all findings and rejected descendants have passed.
6. Validate a proposed candidate with `tm next --root <candidate-id> --json`. Select it only when the returned `.item.id` exactly equals the proposed ID. Do not reproduce `tm` actionability rules by reading `.tasks/tasks.jsonl`.
7. Claim the selected item with `tm claim <id> --actor "$TM_ACTOR"`.
8. Record it as `Current Work Item`, record `git write-tree` as `Candidate tree before work`, clear prior current-item verification, and set the state to `selected`.
9. Replace the handoff atomically by writing the complete new document to the temporary path and renaming it.

If transaction items remain open but none is actionable, stop and report the transaction as stalled. Do not select unrelated work.

## Start a new transaction

Only do this when no handoff exists or after successfully finishing an accepted transaction's merge and cleanup.

1. Require a named current branch. Record it as the base branch.
2. Require no merge, rebase, cherry-pick, or revert in progress.
3. Require `git status --porcelain=v1` to be empty. Do not stash, reset, commit, or discard pre-existing changes.
4. Record `git rev-parse HEAD` as the base commit.
5. Query `tm list --status open --all-executors --json`. Recursively count objects with `matchesFilter: true`.
6. If that count is zero, emit the exact overall completion marker below and do nothing else.
7. Otherwise run `tm next --json` for the initial global selection. If it has no `.item`, report an open but stalled backlog and stop.
8. Inspect the selected item with `tm show --json`; require executor `agent`.
9. Create a unique branch from the clean base named `ralph/transaction-<full-work-item-id>`. If that branch already exists without a valid handoff, stop for recovery rather than deleting or reusing it.
10. Switch to the new transaction branch and claim the selected item with `tm claim <id> --actor "$TM_ACTOR"`.
11. Create the handoff atomically with:
    - base branch and base commit;
    - transaction branch;
    - transaction root and current Work Item set to the selected full ID;
    - state `selected`;
    - actor;
    - `git write-tree` as the candidate tree before work;
    - candidate tree after work set to `pending`;
    - an empty review-finding relationship list;
    - verification set to `pending`.
12. Re-run `tm validate` and finish the Planner invocation.

Only this no-handoff path may use global `tm next` ordering.

When the entire workflow is complete, emit exactly:

<promise>COMPLETE</promise>
