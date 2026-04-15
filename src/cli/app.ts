import { Effect } from "effect";
import * as Command from "effect/unstable/cli/Command";
import * as Flag from "effect/unstable/cli/Flag";

import type { LoopFlagsInput, SharedFlagsInput } from "../ralph/domain";
import { RalphRunner } from "../ralph/run";

export const cliVersion = "0.0.0";

const createSharedFlags = () => ({
  checklist: Flag.string("checklist").pipe(
    Flag.withAlias("c"),
    Flag.withDescription("Checklist file path (default: bundled CHECKLIST.md)"),
    Flag.optional,
  ),
  instructions: Flag.string("instructions").pipe(
    Flag.withAlias("i"),
    Flag.withDescription("Instructions file path (default: bundled INSTRUCTIONS.md)"),
    Flag.optional,
  ),
  progress: Flag.string("progress").pipe(
    Flag.withAlias("p"),
    Flag.withDescription("Progress log path (default: bundled PROGRESS.md)"),
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

export const onceCommand = Command.make(
  "once",
  createSharedFlags(),
  Effect.fn("onceCommand")(function* (input: SharedFlagsInput) {
    const ralphRunner = yield* RalphRunner;
    yield* ralphRunner.runOnce(input);
  }),
).pipe(Command.withDescription("Run one Codex pass"));

export const loopCommand = Command.make(
  "loop",
  {
    ...createSharedFlags(),
    iterations: iterationsFlag,
  },
  Effect.fn("loopCommand")(function* (input: LoopFlagsInput) {
    const ralphRunner = yield* RalphRunner;
    yield* ralphRunner.runLoop(input);
  }),
).pipe(Command.withDescription("Run repeated Codex passes until complete or exhausted"));

export const ralphCommand = Command.make("ralph").pipe(
  Command.withDescription("Run Codex against a checklist, progress log, and instructions file"),
  Command.withSubcommands([onceCommand, loopCommand]),
);

export const runRalphCli = (args: ReadonlyArray<string>) =>
  Command.runWith(ralphCommand, {
    version: cliVersion,
  })(args).pipe(Effect.provide(RalphRunner.layer));
