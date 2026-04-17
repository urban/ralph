import { Effect } from "effect";
import { Flag } from "effect/unstable/cli";

import type { SharedFlagsInput } from "../domain/Ralph";
import { HostTools } from "../services/HostTools";
import { RalphWorkspace } from "../services/RalphWorkspace";

const makeSharedFlags = () => ({
  checklist: Flag.string("checklist").pipe(
    Flag.withAlias("c"),
    Flag.withDescription("Checklist file path override"),
    Flag.optional,
  ),
  instructions: Flag.string("instructions").pipe(
    Flag.withAlias("i"),
    Flag.withDescription("Instructions file path override"),
    Flag.optional,
  ),
  progress: Flag.string("progress").pipe(
    Flag.withAlias("p"),
    Flag.withDescription("Progress log path override"),
    Flag.optional,
  ),
  ralphDir: Flag.string("ralph-dir").pipe(
    Flag.withDescription("Directory containing CHECKLIST.md, INSTRUCTIONS.md, and PROGRESS.md"),
    Flag.optional,
  ),
  cwd: Flag.string("cwd").pipe(
    Flag.withDescription("Working directory for codex exec"),
    Flag.optional,
  ),
  yolo: Flag.boolean("yolo").pipe(
    Flag.withDescription("Use --dangerously-bypass-approvals-and-sandbox"),
  ),
});

const iterationsFlag = Flag.integer("iterations").pipe(
  Flag.withAlias("n"),
  Flag.withDescription("Number of iterations to run"),
  Flag.filter(
    (value) => value > 0,
    (value) => `Expected a positive integer, got ${value}`,
  ),
  Flag.withDefault(10),
);

const prepareCodexRunContext = Effect.fn("prepareCodexRunContext")(function* (
  input: SharedFlagsInput,
) {
  const hostTools = yield* HostTools;
  const ralphWorkspace = yield* RalphWorkspace;

  yield* hostTools.ensureCommandAvailable("codex", "Codex CLI");
  return yield* ralphWorkspace.prepareRunContext(input);
});

export { iterationsFlag, makeSharedFlags, prepareCodexRunContext };
