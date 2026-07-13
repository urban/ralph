import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

import type { LoopFlagsInput } from "../domain/WorkInvocation";
import { failWithMessage } from "../errors/RalphExit";
import { RalphRunner } from "../services/RalphRunner";
import { iterationsFlag, makePhaseFlags } from "./shared";

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
