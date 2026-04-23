---
name: ralph-checklist
description: Create a checklist from execution tasks
argument-hint: "<RALPH-CHECKLIST> <EXECUTION-TASKS>"
---

Create a Markdown checklist in `$1` from the tasks in `$2`.

Requirements:
- Read the tasks from `$2`
- Create the checklist file in `$1`
- Use Markdown checkboxes: `- [ ]`
- Preserve task order
- Preserve grouping / hierarchy if present
- Keep wording concise
