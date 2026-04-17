import { Context, Effect, Layer } from "effect";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import type { RalphExit } from "../errors/RalphExit";
import { failWithMessage } from "../errors/RalphExit";

export class HostTools extends Context.Service<
  HostTools,
  {
    commandExists(commandName: string): Effect.Effect<boolean>;
    ensureCommandAvailable(
      commandName: string,
      commandLabel: string,
    ): Effect.Effect<void, RalphExit>;
    notifyIfAvailable(message: string): Effect.Effect<void>;
  }
>()("ralph-effect/services/HostTools") {
  static readonly layer = Layer.effect(
    HostTools,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      const commandExists = Effect.fn("HostTools.commandExists")(function* (commandName: string) {
        const exitCode = yield* spawner
          .exitCode(
            ChildProcess.make("which", [commandName], {
              stdin: "ignore",
              stdout: "ignore",
              stderr: "ignore",
            }),
          )
          .pipe(Effect.catch(() => Effect.succeed(ChildProcessSpawner.ExitCode(1))));

        return exitCode === ChildProcessSpawner.ExitCode(0);
      });

      const ensureCommandAvailable = Effect.fn("HostTools.ensureCommandAvailable")(function* (
        commandName: string,
        commandLabel: string,
      ) {
        const exists = yield* commandExists(commandName);

        if (!exists) {
          return yield* failWithMessage(`${commandLabel} is required.`);
        }
      });

      const notifyIfAvailable = Effect.fn("HostTools.notifyIfAvailable")(function* (
        message: string,
      ) {
        const exists = yield* commandExists("tt");

        if (!exists) {
          return;
        }

        yield* spawner
          .exitCode(
            ChildProcess.make("tt", ["notify", message], {
              stdin: "ignore",
              stdout: "ignore",
              stderr: "ignore",
            }),
          )
          .pipe(Effect.catch(() => Effect.succeed(ChildProcessSpawner.ExitCode(0))));
      });

      return HostTools.of({
        commandExists,
        ensureCommandAvailable,
        notifyIfAvailable,
      });
    }),
  );
}
