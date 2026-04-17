import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

import type { LoopFlagsInput } from "../domain/Ralph";
import { failWithMessage } from "../errors/RalphExit";
import { CodexRunner } from "../services/CodexRunner";
import { HostTools } from "../services/HostTools";
import { iterationsFlag, makeSharedFlags, prepareCodexRunContext } from "./shared";

const handler = Effect.fn("commandLoop.handler")(function* (input: LoopFlagsInput) {
  const codexRunner = yield* CodexRunner;
  const hostTools = yield* HostTools;
  const runContext = yield* prepareCodexRunContext(input);

  for (let iteration = 1; iteration <= input.iterations; iteration += 1) {
    yield* Effect.log(`Iteration ${iteration}`);
    yield* Effect.log("--------------------------------");

    const output = yield* codexRunner.runCapture(runContext);
    yield* Effect.log(output);

    if (codexRunner.isChecklistComplete(output)) {
      yield* Effect.log("Checklist complete, exiting.");
      yield* hostTools.notifyIfAvailable(`Checklist complete after ${iteration} iterations`);
      return;
    }
  }

  yield* hostTools.notifyIfAvailable(`Checklist not complete after ${input.iterations} iterations`);
  return yield* failWithMessage(`Checklist not complete after ${input.iterations} iterations.`);
});

const commandLoop = Command.make(
  "loop",
  {
    ...makeSharedFlags(),
    iterations: iterationsFlag,
  },
  handler,
).pipe(Command.withDescription("Run repeated Codex passes until complete or exhausted"));

export { commandLoop };
