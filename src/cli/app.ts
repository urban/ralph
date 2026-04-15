import { Console, Effect } from "effect";
import * as Command from "effect/unstable/cli/Command";
import * as Flag from "effect/unstable/cli/Flag";

import { isChecklistComplete, runCodexPass, runCodexPassCapture } from "../ralph/codex";
import type { SharedFlagsInput } from "../ralph/domain";
import { failWithMessage } from "../ralph/errors";
import { prepareRunContext } from "../ralph/run";
import { notifyIfAvailable } from "../ralph/system";

interface LoopFlagsInput extends SharedFlagsInput {
  readonly iterations: number;
}

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
  Effect.fn("onceCommand")(function* (
    input: SharedFlagsInput,
  ) {
    const runContext = yield* prepareRunContext(input);
    yield* runCodexPass(runContext);
  }),
).pipe(Command.withDescription("Run one Codex pass"));

export const loopCommand = Command.make(
  "loop",
  {
    ...createSharedFlags(),
    iterations: iterationsFlag,
  },
  Effect.fn("loopCommand")(function* (
    input: LoopFlagsInput,
  ) {
    const runContext = yield* prepareRunContext(input);

    for (let iteration = 1; iteration <= input.iterations; iteration += 1) {
      yield* Console.log(`Iteration ${iteration}`);
      yield* Console.log("--------------------------------");

      const output = yield* Effect.scoped(runCodexPassCapture(runContext));
      yield* Console.log(output);

      if (isChecklistComplete(output)) {
        yield* Console.log("Checklist complete, exiting.");
        yield* notifyIfAvailable(`Checklist complete after ${iteration} iterations`);
        return;
      }
    }

    yield* notifyIfAvailable(`Checklist not complete after ${input.iterations} iterations`);
    return yield* failWithMessage(`Checklist not complete after ${input.iterations} iterations.`);
  }),
).pipe(Command.withDescription("Run repeated Codex passes until complete or exhausted"));

export const ralphCommand = Command.make("ralph").pipe(
  Command.withDescription("Run Codex against a checklist, progress log, and instructions file"),
  Command.withSubcommands([onceCommand, loopCommand]),
);

export const runRalphCli = (args: ReadonlyArray<string>) =>
  Command.runWith(ralphCommand, {
    version: cliVersion,
  })(args);
