import { Console, Context, Effect, Layer } from "effect";

import { CodexRunner } from "./codex";
import type { InitInput, LoopFlagsInput, SharedFlagsInput } from "./domain";
import type { RalphExit } from "./errors";
import { failWithMessage } from "./errors";
import { HostTools } from "./system";
import { RalphWorkspace } from "./workspace";

export class RalphRunner extends Context.Service<
  RalphRunner,
  {
    init(input: InitInput): Effect.Effect<void, RalphExit>;
    runOnce(input: SharedFlagsInput): Effect.Effect<void, RalphExit>;
    runLoop(input: LoopFlagsInput): Effect.Effect<void, RalphExit>;
  }
>()("ralph-effect/ralph/RalphRunner") {
  static readonly layerNoDeps = Layer.effect(
    RalphRunner,
    Effect.gen(function* () {
      const codexRunner = yield* CodexRunner;
      const hostTools = yield* HostTools;
      const ralphWorkspace = yield* RalphWorkspace;

      const init = Effect.fn("RalphRunner.init")(function* (input: InitInput) {
        yield* ralphWorkspace.init(input.targetDirectory);
      });

      const runOnce = Effect.fn("RalphRunner.runOnce")(function* (input: SharedFlagsInput) {
        yield* hostTools.ensureCommandAvailable("codex", "Codex CLI");
        const runContext = yield* ralphWorkspace.prepareRunContext(input);
        yield* codexRunner.run(runContext);
      });

      const runLoop = Effect.fn("RalphRunner.runLoop")(function* (input: LoopFlagsInput) {
        yield* hostTools.ensureCommandAvailable("codex", "Codex CLI");
        const runContext = yield* ralphWorkspace.prepareRunContext(input);

        for (let iteration = 1; iteration <= input.iterations; iteration += 1) {
          yield* Console.log(`Iteration ${iteration}`);
          yield* Console.log("--------------------------------");

          const output = yield* codexRunner.runCapture(runContext);
          yield* Console.log(output);

          if (codexRunner.isChecklistComplete(output)) {
            yield* Console.log("Checklist complete, exiting.");
            yield* hostTools.notifyIfAvailable(`Checklist complete after ${iteration} iterations`);
            return;
          }
        }

        yield* hostTools.notifyIfAvailable(
          `Checklist not complete after ${input.iterations} iterations`,
        );
        return yield* failWithMessage(
          `Checklist not complete after ${input.iterations} iterations.`,
        );
      });

      return RalphRunner.of({
        init,
        runOnce,
        runLoop,
      });
    }),
  );

  static readonly layer = this.layerNoDeps.pipe(
    Layer.provideMerge(CodexRunner.layer),
    Layer.provideMerge(HostTools.layer),
    Layer.provideMerge(RalphWorkspace.layer),
  );
}
