import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

import type { OnceFlagsInput } from "../domain/WorkInvocation";
import { failWithMessage } from "../errors/RalphExit";
import { RalphRunner } from "../services/RalphRunner";
import { makePhaseFlags } from "./phaseFlags";

const onceFlags = makePhaseFlags();

const handler = Effect.fn("commandOnce.handler")(function* (input: OnceFlagsInput) {
  const runner = yield* RalphRunner;
  yield* runner.runOnce(input).pipe(Effect.catch((error) => failWithMessage(error.message)));
});

const commandOnce = Command.make("once", onceFlags, handler).pipe(
  Command.withDescription("Run one supervised work invocation"),
);

export { commandOnce, onceFlags };
