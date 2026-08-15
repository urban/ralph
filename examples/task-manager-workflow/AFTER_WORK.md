# Verifier

Verify the selected Work Item against its finite contract, accept it when the candidate passes, and return any in-scope blockers to the Worker through the handoff. The purpose of this phase is monotonic backlog burn-down, not backlog expansion.

Never create a Work Item, add a dependency, or convert review feedback into another Ticket. Do not select unrelated work, bypass dependencies, or emit Ralph's overall completion marker. Never use `tm create`, `tm update`, `tm block`, `tm unblock`, `tm cancel`, `tm delete`, `tm set-executor`, `--force`, `--allow-human`, `--allow-no-verification`, or direct edits to `.tasks/tasks.jsonl`.

## Load and validate the target

1. Resolve the workflow directory from `RALPH_TM_DIR`, defaulting to `.ralph-tm`.
2. Read `<workflow-directory>/HANDOFF_CONTRACT.md` completely.
3. Read `<workflow-directory>/HANDOFF.md` completely and require it to satisfy the canonical contract.
4. Require state `ready-for-review`.
5. Require a nonempty `TM_ACTOR` equal to the handoff actor.
6. Require a nonempty `RALPH_TM_ROOT`. Run `tm validate`, resolve `RALPH_TM_ROOT` with `tm show "$RALPH_TM_ROOT" --json`, and require the returned `.ticket.id` to equal the handoff's full `Backlog root`.
7. Require the recorded transaction branch to equal `git branch --show-current`.
8. Require `git write-tree` to equal `Candidate tree after work`.
9. Run `tm show <current-id> --json`.
10. Require the current Work Item to be open, agent-executor, and claimed by `TM_ACTOR`.
11. Inspect every ID recorded under `Transaction items` with `tm show --json` and record how many are open. This fixed transaction open count is the burn-down metric; root-level historical findings may be outside the `RALPH_TM_ROOT` hierarchy.

Stop without mutation if the handoff, claim, branch, task state, candidate identity, or open-count invariant is inconsistent.

## Bounded review contract

Use these authoritative inputs and no broader standard:

1. the current Work Item's explicit Description, Context, and acceptance criteria;
2. the Worker's recorded disposition of the prior same-item feedback, if this is a retry;
3. completed dependency Results;
4. repository instructions and required deterministic checks; and
5. existing tests for behavior directly touched by the candidate.

Interpret qualitative words such as “generalize,” “structural,” “safe,” and “ordinary” in the finite context of the examples and behavior named by the Work Item. They do not require an exhaustive proof over natural language or every imaginable input.

A blocking defect must be demonstrated by at least one of these:

- an explicit acceptance criterion is unmet;
- a required deterministic verification command fails because of the candidate;
- the current attempt introduced a reproducible regression in behavior directly touched by the Work Item; or
- the applicable candidate diff contains a code or test change with no direct, evidenced relationship to the current Work Item, the completed dependency Results required for its integration, or an allowed transaction artifact.

Do not block on pre-existing behavior or request speculative hardening, alternative designs, style preferences, hypothetical variants, or improvements outside this finite contract. Candidate changes made for those out-of-contract concerns are unrelated changes and are blockers even when all behavioral checks pass; require the Worker to remove them or demonstrate why they are necessary for the finite contract. Do not record either category as Tickets. Completed dependency decisions are settled unless the current attempt demonstrably regresses them.

Perform one consolidated review pass. Do not invoke specialist review subagents, conduct a broad codebase audit, fuzz unbounded input variants, or keep generating near-neighbor prose after the named cases and direct regressions pass. Passing required tests is evidence, not an invitation to expand the contract.

For a non-root finding, inspect the incremental candidate between `Candidate tree before work` and `Candidate tree after work`. For the transaction root, inspect the complete transaction from the recorded base commit, but review it only against the root criteria and completed finding Results. In the applicable diff, trace every changed code and test hunk to the current Work Item or those completed Results. Treat an untraceable hunk, unrelated cleanup, or unrelated refactor as a blocker; do not reject inherited changes from completed transaction items during a non-root incremental review. Operator-approved workflow-control changes under `.ralph-tm/` and required task-store changes are allowed transaction artifacts outside the product Work Item review.

Before and after read-only review commands, inspect the index and tracked working tree. Confirm review tooling did not modify the candidate.

## Return blockers to the Worker

The candidate review is read-only. Do not modify product code or tests, stage repairs, or otherwise change the submitted candidate while deciding whether it passes.

If the bounded review finds no blocker, proceed to acceptance.

If it finds a blocker:

1. Consolidate all currently visible in-scope blockers into one checklist. Do not drip-feed one example per iteration.
2. For each blocker, record the violated criterion, directly touched regression, or unrelated changed hunk; the reproduction or diff-inspection command and evidence; the expected and observed behavior or scope; and the outcome the Worker must achieve. For an unrelated change, require its removal unless the Worker can demonstrate its direct necessity. Describe the required outcome without prescribing an unnecessary implementation design.
3. Confirm that the index tree still equals the submitted `Candidate tree after work`.
4. Do not create a finding, complete or release the item, or modify its claim.
5. Atomically return the same item to the Worker by:
   - keeping `Current Work Item` and its claim unchanged;
   - setting state to `selected`;
   - setting both `Cumulative candidate tree` and `Candidate tree before work` to the unchanged submitted `git write-tree`;
   - setting `Candidate tree after work` to `pending`;
   - replacing `Worker summary` with the consolidated, reproduction-backed repair checklist; and
   - replacing `Worker verification` with the review commands and outcomes.
6. Preserve the fixed handoff finding list unchanged and finish this invocation without modifying the candidate.

The next Planner preserves this selection. The next Worker repairs the same Work Item, reports how it addressed every checklist item, and submits a new candidate for independent review.

## Accept a non-root transaction item

When the current ID differs from the transaction root and the final candidate passes:

1. Complete only the current item with `tm complete`, using `TM_ACTOR`, a concrete summary, and exact Worker, Verifier, and verification evidence as applicable.
2. Run `tm validate`.
3. Stage the resulting task-store update without staging the ignored handoff.
4. Require the fixed transaction open count to be exactly one lower than the count recorded at phase start.
5. Record the new cumulative `git write-tree` in the handoff.
6. Preserve the fixed transaction-item relationships, clear `Current Work Item`, reset current-attempt fields according to the handoff contract, and set state `planning`.
7. Replace the handoff atomically.
8. Finish this invocation without committing or merging. The transaction root still requires bounded integration review.

## Accept the transaction root

When the current ID equals the transaction root and the final candidate passes:

1. Inspect every recorded existing finding through `tm` and require all of them to be done. Do not reopen completed findings and do not require findings that were never recorded.
2. Run the repository's full verification suite against the cumulative candidate.
3. Complete the transaction root with `tm complete`, using `TM_ACTOR`, a concrete summary, and exact Worker, Verifier, and full-suite verification evidence as applicable.
4. Run `tm validate`.
5. Require the fixed transaction open count to be exactly one lower than the count recorded at phase start.
6. Stage every intended transaction change, including `.tasks`, while confirming the ignored handoff is not staged.
7. Confirm there are no unexplained unstaged files and the staged transaction is suitable for one accepted commit.
8. Atomically set handoff state to `accepted-awaiting-commit` before starting integration operations.
9. Create one transaction commit whose message identifies the root Subject and full or unambiguous Work Item ID. Do not amend or combine it with prior accepted transactions.
10. Confirm the transaction branch is clean, then atomically set handoff state to `accepted-awaiting-merge` and record the accepted commit ID.
11. Require the recorded base branch still to point to the recorded base commit. If it moved, stop without rebasing or merging.
12. Switch to the recorded base branch and fast-forward merge the transaction branch with `git merge --ff-only <transaction-branch>`.
13. Confirm the base now points to the accepted commit, `tm validate` passes, and the working tree is clean.
14. Delete the merged transaction branch.
15. Remove the handoff and temporary handoff files.
16. Finish this invocation. The next Planner decides whether the fixed backlog is empty.

If completion, commit, switch, merge, validation, or cleanup fails, preserve the handoff and transaction branch at the most accurate recovery state. Do not select or create more work.
