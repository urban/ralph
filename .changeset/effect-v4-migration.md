---
"@urban/ralph": major
---

Migrate Ralph from the shell-based workflow to a Bun CLI implemented on Effect v4.

This rewrites the old `ralph-once` / `ralph-loop` behavior behind a primary `ralph` command surface and removes the legacy root wrapper scripts.

- Add `ralph init` to write bundled Ralph workspace templates into a target directory, with timestamped backups before overwrite.
- Add `ralph once` and `ralph loop` as the main command surface, with clearer help and shared flag handling.
- Remove the legacy root `ralph-once` and `ralph-loop` wrappers; use `ralph once` and `ralph loop`.
- Change runtime input resolution so runs must receive `--ralph-dir` or all of `--checklist`, `--instructions`, and `--progress`; explicit file flags override `--ralph-dir` per file.
- Add `--cwd` so the Codex working directory can differ from the Ralph workspace directory.
- Move workspace validation, file handling, and Codex orchestration into Effect v4 services, with Vitest coverage around workspace behavior.

If you previously relied on implicit bundled runtime files next to the scripts, switch to `ralph init`, `--ralph-dir`, or explicit file flags before running `once` or `loop`. If you previously invoked `./ralph-once` or `./ralph-loop`, switch to `ralph once` or `ralph loop`.
