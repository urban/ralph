import { Effect } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import type { OnceFlagsInput } from "../domain/WorkInvocation";
import { failWithMessage } from "../errors/RalphExit";
import { RalphRunner } from "../services/RalphRunner";

const onceFlags = {
  work: Flag.string("work").pipe(
    Flag.withAlias("w"),
    Flag.withDescription("Work instruction file"),
    Flag.optional,
  ),
  ralphDir: Flag.string("ralph-dir").pipe(
    Flag.withAlias("d"),
    Flag.withDescription("Directory containing WORK.md"),
    Flag.optional,
  ),
  cwd: Flag.string("cwd").pipe(
    Flag.withAlias("C"),
    Flag.withDescription("Working directory for codex exec"),
    Flag.optional,
  ),
  idleTimeout: Flag.string("idle-timeout").pipe(
    Flag.withDescription("Maximum inactivity duration"),
    Flag.withDefault("5m"),
  ),
  invocationTimeout: Flag.string("invocation-timeout").pipe(
    Flag.withDescription("Maximum invocation duration"),
    Flag.withDefault("30m"),
  ),
  yolo: Flag.boolean("yolo").pipe(
    Flag.withDescription("Use --dangerously-bypass-approvals-and-sandbox"),
  ),
};

const handler = Effect.fn("commandOnce.handler")(function* (input: OnceFlagsInput) {
  const runner = yield* RalphRunner;
  yield* runner.runOnce(input).pipe(Effect.catch((error) => failWithMessage(error.message)));
});

const commandOnce = Command.make("once", onceFlags, handler).pipe(
  Command.withDescription("Run one supervised work invocation"),
);

export { commandOnce, onceFlags };
