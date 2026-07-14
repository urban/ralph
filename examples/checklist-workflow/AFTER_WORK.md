# Validate workflow completion

Read the current `CHECKLIST.md` from the filesystem after the work phase finishes.

If any checklist item remains unchecked (`[ ]`) or in progress (`[/]`), report the remaining work and do not emit the overall completion marker.

Only when every checklist item is complete (`[x]`), emit this exact, case-sensitive marker:

<promise>COMPLETE</promise>
