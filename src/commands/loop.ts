import { Effect } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { IterationLimit, type LoopFlagsInput } from "../domain/WorkInvocation";
import { failWithMessage } from "../errors/RalphExit";
import { RalphRunner } from "../services/RalphRunner";
import { makePhaseFlags } from "./phaseFlags";

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

const loopFlags = {
  ...makePhaseFlags(),
  iterations: iterationsFlag,
};

const handler = Effect.fn("commandLoop.handler")(function* (input: LoopFlagsInput) {
  const runner = yield* RalphRunner;
  yield* runner.runLoop(input).pipe(Effect.catch((error) => failWithMessage(error.message)));
});

const commandLoop = Command.make("loop", loopFlags, handler).pipe(
  Command.withDescription("Run repeated phase sequences"),
);

export { commandLoop, loopFlags };
