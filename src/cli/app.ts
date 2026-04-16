import * as BunServices from "@effect/platform-bun/BunServices";
import { Effect, Layer } from "effect";
import * as Argument from "effect/unstable/cli/Argument";
import * as Command from "effect/unstable/cli/Command";
import * as Flag from "effect/unstable/cli/Flag";

import type { InitInput, LoopFlagsInput, SharedFlagsInput } from "../ralph/domain";
import { RalphRunner } from "../ralph/run";

export const cliVersion = "0.0.0";

const createSharedFlags = () => ({
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

export const initCommand = Command.make(
  "init",
  {
    targetDirectory: Argument.path("target-directory", {
      mustExist: false,
      pathType: "either",
    }).pipe(
      Argument.withDescription("Directory to initialize; defaults to the launch directory"),
      Argument.optional,
    ),
  },
  Effect.fn("initCommand")(function* (input: InitInput) {
    const ralphRunner = yield* RalphRunner;
    yield* ralphRunner.init(input);
  }),
).pipe(Command.withDescription("Write bundled Ralph template files"));

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
  Command.withDescription("Initialize Ralph files or run Codex against Ralph inputs"),
  Command.withSubcommands([initCommand, onceCommand, loopCommand]),
);

const cliLayer = RalphRunner.layer.pipe(Layer.provideMerge(BunServices.layer));

export const runRalphCli = (args: ReadonlyArray<string>) =>
  Command.runWith(ralphCommand, {
    version: cliVersion,
  })(args).pipe(Effect.provide(cliLayer));
