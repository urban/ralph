import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

import type { SharedFlagsInput } from "../domain/Ralph";
import { CodexRunner } from "../services/CodexRunner";
import { makeSharedFlags, prepareCodexRunContext } from "./shared";

const handler = Effect.fn("commandOnce.handler")(function* (input: SharedFlagsInput) {
  const codexRunner = yield* CodexRunner;
  const runContext = yield* prepareCodexRunContext(input);

  yield* codexRunner.run(runContext);
});

const commandOnce = Command.make("once", makeSharedFlags(), handler).pipe(
  Command.withDescription("Run one Codex pass"),
);

export { commandOnce };
