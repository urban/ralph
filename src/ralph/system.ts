import { Effect } from "effect";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import { failWithMessage } from "./errors";

export const commandExists = Effect.fn("commandExists")(function* (
  commandName: string,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
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

export const ensureCommandAvailable = Effect.fn("ensureCommandAvailable")(function* (
  commandName: string,
  commandLabel: string,
) {
  const exists = yield* commandExists(commandName);

  if (!exists) {
    return yield* failWithMessage(`${commandLabel} is required.`);
  }
});

export const notifyIfAvailable = Effect.fn("notifyIfAvailable")(function* (
  message: string,
) {
  const exists = yield* commandExists("tt");

  if (!exists) {
    return;
  }

  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
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
