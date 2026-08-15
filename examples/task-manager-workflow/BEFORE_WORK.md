# Planner

Prepare exactly one Work Item for the Worker while preserving the active review transaction.

This workflow is serial. Ralph is the only code worker and the sole `tm` writer. Every Work Item must use the `agent` executor. Never use `--force`, `--allow-human`, `--allow-no-verification`, destructive deletion, or direct edits to `.tasks/tasks.jsonl`.

## Monotonic burn-down invariant

This run drains the Work Items that already exist. The transaction item set and the relevant open count may stay level during implementation but must never increase. During a live handoff, the relevant count is the number of open IDs recorded under `Transaction items`; without a handoff, it is the recursive open count under `RALPH_TM_ROOT`.

- No phase may run `tm create`, add a new dependency, or split review feedback into another Work Item.
- Review defects are repaired by the Worker under the currently selected Work Item. The Reviewer always returns a blocked candidate to `selected` with consolidated feedback in the handoff; it never repairs the candidate itself.
- Existing findings and dependency edges remain authoritative and are drained deepest-first. Do not delete, cancel, re-parent, or bypass them merely to reduce the count.
- A completed dependency is settled evidence. Re-check it only for a regression introduced by the current attempt; do not reopen its design or invent stronger acceptance criteria.

Before and after any Planner mutation, compare the applicable relevant open count. Stop if a Planner action would increase it. Root-level historical findings may sit outside the backlog hierarchy, so never use only the `RALPH_TM_ROOT` tree to count an active transaction.

## Global completion signal

Initialize `overall_completion_authorized` to `false`.

`COMPLETE` is a global Ralph loop-control signal, not an acknowledgement that this Planner invocation succeeded. Finishing selection, resuming a handoff, validating the task store, or finding no currently actionable item must never authorize it.

The only instruction allowed to set `overall_completion_authorized` to `true` is Step 6 under **Start a new transaction**, after proving both:

1. no live handoff exists; and
2. the recursive open Work Item count under `RALPH_TM_ROOT`, across all executors, is exactly zero.

Every other path must leave it `false`. In particular, a `selected`, `ready-for-review`, `planning`, `remediation`, or `accepted-awaiting-commit` handoff is not overall completion. An `accepted-awaiting-merge` handoff may authorize completion only after the merge and cleanup succeed, the handoff is removed, and the no-handoff open-count check proves zero remaining Work Items.

“Finish this invocation” means phase success only. It does not mean overall workflow completion. Do not copy a completion marker merely because it appears in these instructions.

## Runtime paths and identity

1. Resolve the workflow directory from `RALPH_TM_DIR`, defaulting to `.ralph-tm`.
2. Read `<workflow-directory>/HANDOFF_CONTRACT.md` completely and follow its canonical shape, states, candidate identities, and atomic replacement protocol.
3. Use `<workflow-directory>/HANDOFF.md` as the live handoff and `HANDOFF.md.tmp` as its temporary replacement.
4. Require a nonempty `TM_ACTOR` and use that exact identity for every claim, release, and completion in the transaction.
5. Require `git`, `jq`, and `tm` on `PATH`.
6. Run `tm validate`.
7. Require a nonempty `RALPH_TM_ROOT`. Resolve it with `tm show "$RALPH_TM_ROOT" --json`, store the returned `.ticket.id` as `target_root`, and require that Ticket to use the `agent` executor.
8. Confirm with `git check-ignore` that the handoff and temporary handoff are ignored.
9. Confirm with `git check-ignore --no-index .ralph-snapshot-ignore-probe/BEFORE_WORK.md` that root-level `.ralph-snapshot-*` directories are ignored. Ralph's live iteration snapshot exists while these instructions run; stop rather than risk treating it as transaction work or staging it.

## Validate the scoped agent-only backlog

Use `tm list --root "$target_root" --status open --executor human --json` and recursively inspect its tree. If any object has `matchesFilter: true`, stop and report that the target backlog contains open human-executor Work Items. Completed human Work Items and human Work Items outside the target subtree do not block this workflow.

Do not interpret `tm next` returning `no-actionable-work` as overall completion. Overall completion requires an empty open backlog across all executors within the target subtree.

## Resume an existing handoff

When the handoff exists, read it completely and treat IDs and Git coordinates as assertions to validate, not as replacements for `tm` or Git state.

Require the recorded backlog root to equal the canonical target backlog root resolved from `RALPH_TM_ROOT`. Require the recorded transaction branch, base branch, base commit, transaction root, current item, state, transaction-item relationships, and candidate tree fields to be internally coherent.

Handle its state as follows:

- `selected`: verify that the transaction branch is checked out and the current open item is claimed by `TM_ACTOR`. Preserve the selection so the Worker can resume interrupted implementation.
- `ready-for-review`: verify that the recorded candidate tree still equals `git write-tree`. Preserve the selection so the Worker can hand the unchanged candidate back to the Reviewer.
- `planning` or `remediation`: select the next transaction item using the transaction-aware policy below.
- `accepted-awaiting-commit`: finish the already accepted transaction commit from the recorded candidate and task-store state, then move the handoff to `accepted-awaiting-merge`.
- `accepted-awaiting-merge`: finish the recorded fast-forward merge and cleanup, then continue as though no handoff existed.
- Any other, malformed, or contradictory state: stop and report the exact inconsistency.

Never start unrelated work while an existing transaction still needs implementation, review, commit, merge, or cleanup.

## Select within an active transaction

The handoff records the transaction root and the existing review findings already created during the transaction, including which rejected item each finding blocks. The list is now fixed: preserve it exactly and never append another finding.

When the state is `planning` or `remediation`:

1. Inspect every recorded transaction Work Item with `tm show --json`.
2. Reconcile completed findings in the handoff with authoritative `tm` state. Require the handoff's finding set to remain unchanged.
3. Consider only open transaction items. Never inspect unrelated global items while the transaction is active.
4. Prioritize an actionable review finding over the transaction root. Prefer the deepest blocking chain first, then preserve finding creation order for independent siblings.
5. When all findings blocking a rejected item are done, select that rejected item for integration and bounded re-review. The transaction root is selected last, after all findings and rejected descendants have passed. Integration review verifies the original criteria and completed dependency Results; it is not a fresh exploratory audit.
6. Validate a proposed candidate with `tm next --root <candidate-id> --json`. Select it only when the returned `.ticket.id` exactly equals the proposed ID. Do not reproduce `tm` actionability rules by reading `.tasks/tasks.jsonl`.
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
5. Query `tm list --root "$target_root" --status open --all-executors --json`. Recursively count objects with `matchesFilter: true`.
6. If and only if that count is zero:
   - require that no live handoff exists;
   - record the exact query and zero count as completion evidence;
   - set `overall_completion_authorized` to `true`;
   - perform no further planning or mutation;
   - proceed to the Final output gate.
7. Otherwise leave `overall_completion_authorized` as `false` and run `tm next --root "$target_root" --json` for the initial scoped selection. If it has no `.ticket`, report the target backlog as open but stalled and stop.
8. Inspect the selected `.ticket` with `tm show --json`; require executor `agent`.
9. Create a unique branch from the clean base named `ralph/transaction-<full-work-item-id>`. If that branch already exists without a valid handoff, stop for recovery rather than deleting or reusing it.
10. Switch to the new transaction branch and claim the selected item with `tm claim <id> --actor "$TM_ACTOR"`.
11. Create the handoff atomically with:
    - the canonical target backlog root;
    - base branch and base commit;
    - transaction branch;
    - transaction root and current Work Item set to the selected full ID;
    - state `selected`;
    - actor;
    - `git write-tree` as the candidate tree before work;
    - candidate tree after work set to `pending`;
    - an empty, fixed review-finding relationship list;
    - verification set to `pending`.
12. Re-run `tm validate` and finish the Planner invocation.

Only this no-handoff path may use target-root `tm next` ordering.

## Final output gate

Check `overall_completion_authorized` immediately before responding.

- When it is `false`, do not emit Ralph's `COMPLETE` marker anywhere in the response. Follow Ralph's appended protocol for ordinary invocation completion only.
- When it is `true`, emit the following two standalone lines at the very end, with nothing after them:

<promise>COMPLETE</promise>
<promise>INVOCATION_COMPLETE</promise>
