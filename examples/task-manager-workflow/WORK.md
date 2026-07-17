# Worker

Implement and verify only the Work Item selected by the Planner. Do not select other work, create review findings, complete Work Items, commit, merge, switch branches, or remove the handoff.

Never use `--force`, `--allow-human`, `--allow-no-verification`, destructive deletion, or direct edits to `.tasks/tasks.jsonl`.

## Load the selection

1. Resolve the workflow directory from `RALPH_TM_DIR`, defaulting to `.ralph-tm`.
2. Read `<workflow-directory>/HANDOFF_CONTRACT.md` completely.
3. Read `<workflow-directory>/HANDOFF.md` completely and require it to satisfy the canonical contract.
4. Require a nonempty `TM_ACTOR` equal to the handoff actor.
5. Require the recorded transaction branch to equal `git branch --show-current`.
6. Require the current Work Item to be a full ID.
7. Run `tm validate` and `tm show <current-id> --json`.
8. Require the current item to be open, agent-executor, and claimed by `TM_ACTOR`.
9. Confirm that the current Git index tree equals the handoff's `Candidate tree before work` when state is `selected`, or its `Candidate tree after work` when state is `ready-for-review`.

If the handoff is missing, malformed, on another branch, or in any state other than `selected` or `ready-for-review`, stop without choosing replacement work.

## Resume a review-ready candidate

When the state is already `ready-for-review`, a previous Worker succeeded but the Reviewer did not finish.

Do not modify or restage the candidate. Confirm that its recorded verification evidence is concrete and that `git write-tree` still matches the recorded candidate tree after work. Then finish this invocation so the Reviewer can retry against the unchanged candidate.

## Implement a selected item

When state is `selected`:

1. Read the Work Item's Subject, Description, Context, dependencies, prior review relationships, and any completed dependency Results.
2. Inspect the cumulative transaction diff and current repository state before changing code.
3. Implement only the selected Work Item. Review findings modify the existing transaction candidate; they do not start separate branches or commits.
4. Follow repository instructions and preserve architecture, type-safety, and testing standards.
5. Run every verification command required by the Work Item and repository. Record exact commands and outcomes.
6. Stage all intended transaction changes, including relevant task-store changes, but never stage the ignored handoff or its temporary file.
7. Inspect staged and unstaged changes. Stop if unrelated or unexplained files are present.
8. Record `git write-tree` as `Candidate tree after work`.
9. Atomically rewrite the handoff with state `ready-for-review`, preserving the transaction root, branch coordinates, all review-finding relationships, and the candidate tree before work. Add concrete verification evidence and a concise implementation summary for orientation.

Do not run `tm complete`. The Reviewer alone decides acceptance.

## Integration-only passes

A previously rejected Work Item, including the transaction root, may become actionable after all of its findings are complete. It may require no additional code changes.

In that case:

- inspect the completed finding Results and cumulative candidate;
- verify that the original acceptance criteria are now satisfied;
- run the full requested verification;
- allow the before-work and after-work candidate trees to be equal;
- mark the handoff `ready-for-review` with concrete evidence.

A nonempty code diff is not required for an integration or parent-item review.
