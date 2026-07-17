# Handoff contract

`HANDOFF.md` is ignored runtime coordination state for one Ralph transaction. It is not a task tracker and never overrides Git or `tm`.

Every phase must read this contract before reading or writing the live handoff. Preserve all fields and relationships that the phase does not intentionally change.

## Canonical shape

```markdown
# Ralph transaction handoff

- Version: `1`
- State: `selected`
- Actor: `ralph-loop`
- Base branch: `main`
- Base commit: `<full Git commit ID>`
- Transaction branch: `ralph/transaction-<full-work-item-id>`
- Transaction root: `<full Work Item ID>`
- Current Work Item: `<full Work Item ID or none>`
- Accepted commit: `<full Git commit ID, pending, or none>`
- Cumulative candidate tree: `<Git tree ID>`

## Transaction items

- Root: `<full Work Item ID>`
- Finding: `<full finding Work Item ID>`
  - Blocks: `<full rejected Work Item ID>`

## Current attempt

- Candidate tree before work: `<Git tree ID or pending>`
- Candidate tree after work: `<Git tree ID or pending>`

### Worker summary

Pending.

### Worker verification

- Pending.
```

The initial handoff has only the Root entry under `Transaction items`. Append each finding once, in creation order, with the exact rejected item it blocks. Do not record Work Item lifecycle status in this file; query `tm` whenever status matters.

## States

- `selected`: `Current Work Item` is open and claimed by Actor. The Worker may implement or resume it. The before-work tree is populated and the after-work tree is `pending`.
- `ready-for-review`: `Current Work Item` remains open and claimed by Actor. Both attempt tree fields and concrete Worker verification are populated.
- `planning`: no current item is selected after an accepted finding. The Planner must choose the next transaction item.
- `remediation`: no current item is selected after review created findings. The Planner must choose a finding before unrelated work.
- `accepted-awaiting-commit`: the transaction root is done in `tm`, the accepted candidate is staged on the transaction branch, and the accepted Git commit has not been created.
- `accepted-awaiting-merge`: the accepted commit exists on the clean transaction branch and has not been fully merged and cleaned up on the base branch.

Use `none`, not an omitted field, when there is no Current Work Item. Use `pending`, not an omitted field, for a value a later phase must produce.

## Candidate identities

`git write-tree` identifies the current staged candidate without creating a commit.

- `Cumulative candidate tree` is the most recently staged transaction tree after completed work and task-store mutations.
- `Candidate tree before work` identifies the staged tree inherited by the current attempt.
- `Candidate tree after work` identifies the exact tree submitted for independent review.

The handoff itself and its temporary file must be ignored, so changing them must not affect these tree IDs.

## Atomic replacement

To update the handoff:

1. Write the complete replacement to `HANDOFF.md.tmp` in the workflow directory.
2. Verify that every required field appears exactly once and all prior transaction-item relationships are preserved.
3. Rename `HANDOFF.md.tmp` to `HANDOFF.md` atomically.

Never partially edit the live handoff, append a second copy of a canonical field, or remove it before an accepted transaction has been merged and cleaned up.
