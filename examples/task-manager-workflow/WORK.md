# Worker

Implement and verify the Work Item selected by the Planner to completion. Do not select other work, create or modify other Work Items, complete Work Items, commit, merge, switch branches, or remove the handoff.

The backlog is in monotonic burn-down mode. Never run `tm create`, add dependencies, or turn implementation discoveries into more Tickets. Never use `--force`, `--allow-human`, `--allow-no-verification`, destructive deletion, or direct edits to `.tasks/tasks.jsonl`.

## Load the selection

1. Resolve the workflow directory from `RALPH_TM_DIR`, defaulting to `.ralph-tm`.
2. Read `<workflow-directory>/HANDOFF_CONTRACT.md` completely.
3. Read `<workflow-directory>/HANDOFF.md` completely and require it to satisfy the canonical contract.
4. Require a nonempty `TM_ACTOR` equal to the handoff actor.
5. Require a nonempty `RALPH_TM_ROOT`. Run `tm validate`, resolve `RALPH_TM_ROOT` with `tm show "$RALPH_TM_ROOT" --json`, and require the returned `.ticket.id` to equal the handoff's full `Backlog root`.
6. Require the recorded transaction branch to equal `git branch --show-current`.
7. Require the current Work Item to be a full ID.
8. Run `tm show <current-id> --json`.
9. Require the current item to be open, agent-executor, and claimed by `TM_ACTOR`.
10. Confirm that the current Git index tree equals the handoff's `Candidate tree before work` when state is `selected`, or its `Candidate tree after work` when state is `ready-for-review`.

If the handoff is missing, malformed, on another branch, or in any state other than `selected` or `ready-for-review`, stop without choosing replacement work.

## Resume a review-ready candidate

When the state is already `ready-for-review`, a previous Worker succeeded but the Reviewer did not finish.

Do not modify or restage the candidate. Confirm that its recorded verification evidence is concrete and that `git write-tree` still matches the recorded candidate tree after work. Then finish this invocation so the Reviewer can retry against the unchanged candidate.

## Implement a selected item

When state is `selected`:

1. Read the Work Item's Subject, Description, Context, dependencies, prior review relationships, any completed dependency Results, and any consolidated same-item review feedback left in the handoff's Worker summary.
2. Inspect the cumulative transaction diff and current repository state before changing code. Operator-approved workflow-control changes under `.ralph-tm/` may already be in the inherited candidate; preserve them and do not treat them as implementation work.
3. Implement the complete root-cause repair needed for the selected Work Item. “Only the selected Work Item” limits scope; it does not require the smallest patch. Replace a brittle mechanism when another local exception would perpetuate the failure pattern.
4. Treat acceptance criteria as a finite contract. Satisfy the explicitly named cases, completed dependency Results, and reasonable regressions in the behavior directly changed. Do not attempt to prove every possible natural-language variant, broaden the product contract, or anticipate speculative future review probes.
5. Prefer one coherent implementation and focused table-driven coverage over accumulating one regex branch and many near-duplicate tests per example. Existing tests may be consolidated when behavior remains covered.
6. Follow repository instructions and preserve architecture, type-safety, and testing standards.
7. Run every verification command required by the Work Item and repository. Record exact commands and outcomes.
8. Stage all intended transaction changes, including relevant task-store changes, but never stage the ignored handoff or its temporary file.
9. Inspect staged and unstaged changes. Stop if unrelated or unexplained files are present.
10. Record `git write-tree` as `Candidate tree after work`.
11. Atomically rewrite the handoff with state `ready-for-review`, preserving the transaction root, branch coordinates, the fixed review-finding relationships, and the candidate tree before work. Replace any prior same-item review feedback in the Worker summary with a concise implementation summary that identifies every checklist item and explains how it was addressed, and replace the prior review evidence with concrete Worker verification evidence.

Do not run `tm complete`. The Reviewer alone decides acceptance.

## Integration-only passes

A previously rejected Work Item, including the transaction root, may become actionable after all of its findings are complete. It may require no additional code changes.

In that case:

- inspect the completed finding Results and cumulative candidate;
- verify that the original acceptance criteria are now satisfied without searching for new requirements or hypothetical variants;
- run the full requested verification;
- allow the before-work and after-work candidate trees to be equal;
- mark the handoff `ready-for-review` with concrete evidence.

A nonempty code diff is not required for an integration or parent-item review.
