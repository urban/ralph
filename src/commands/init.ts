import { Effect } from "effect";
import { Argument, Command } from "effect/unstable/cli";

import type { InitInput } from "../domain/Ralph";
import { RalphWorkspace } from "../services/RalphWorkspace";

const handler = Effect.fn("commandInit.handler")(function* (input: InitInput) {
  const ralphWorkspace = yield* RalphWorkspace;
  yield* ralphWorkspace.init(input.targetDirectory);
});

const commandInit = Command.make(
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
  handler,
).pipe(Command.withDescription("Write bundled Ralph template files"));

export { commandInit };
