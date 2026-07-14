import { Context, Effect, Layer } from "effect";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

export class HostTools extends Context.Service<
  HostTools,
  {
    notifyIfAvailable(message: string): Effect.Effect<void>;
  }
>()("@urban/ralph/services/HostTools") {
  static readonly layer = Layer.effect(
    HostTools,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      const notifyIfAvailable = Effect.fn("HostTools.notifyIfAvailable")(function* (
        message: string,
      ) {
        yield* spawner
          .exitCode(
            ChildProcess.make("tt", ["notify", message], {
              stdin: "ignore",
              stdout: "ignore",
              stderr: "ignore",
            }),
          )
          .pipe(Effect.asVoid, Effect.ignore);
      });

      return HostTools.of({
        notifyIfAvailable,
      });
    }),
  );
}
