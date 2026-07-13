import { Effect } from "effect";
import { Flag } from "effect/unstable/cli";

import type { SharedFlagsInput } from "../domain/Ralph";
import { IterationLimit } from "../domain/WorkInvocation";
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
    Flag.withAlias("d"),
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

const makePhaseFlags = () => ({
  before: Flag.string("before").pipe(
    Flag.withAlias("b"),
    Flag.withDescription("Optional before-work instruction file"),
    Flag.optional,
  ),
  work: Flag.string("work").pipe(
    Flag.withAlias("w"),
    Flag.withDescription("Required work instruction file"),
    Flag.optional,
  ),
  after: Flag.string("after").pipe(
    Flag.withAlias("a"),
    Flag.withDescription("Optional after-work instruction file"),
    Flag.optional,
  ),
  ralphDir: Flag.string("ralph-dir").pipe(
    Flag.withAlias("d"),
    Flag.withDescription("Directory containing phase instruction files"),
    Flag.optional,
  ),
  cwd: Flag.string("cwd").pipe(
    Flag.withAlias("C"),
    Flag.withDescription("Working directory for codex exec"),
    Flag.optional,
  ),
  idleTimeout: Flag.string("idle-timeout").pipe(
    Flag.withDescription("Maximum inactivity duration"),
    Flag.withDefault("5m"),
  ),
  invocationTimeout: Flag.string("invocation-timeout").pipe(
    Flag.withDescription("Maximum invocation duration"),
    Flag.withDefault("30m"),
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
  Flag.map(IterationLimit.make),
  Flag.withDefault(IterationLimit.make(10)),
);

const prepareCodexRunContext = Effect.fn("prepareCodexRunContext")(function* (
  input: SharedFlagsInput,
) {
  const hostTools = yield* HostTools;
  const ralphWorkspace = yield* RalphWorkspace;

  yield* hostTools.ensureCommandAvailable("codex", "Codex CLI");
  return yield* ralphWorkspace.prepareRunContext(input);
});

export { iterationsFlag, makePhaseFlags, makeSharedFlags, prepareCodexRunContext };
