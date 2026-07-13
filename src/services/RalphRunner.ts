import { Clock, Context, Duration, Effect, Layer, Result, Stdio, Stream } from "effect";

import type { OnceFlagsInput, TimeoutInputError } from "../domain/WorkInvocation";
import { type CodexInvocationError, OperatorOutputError } from "../domain/WorkInvocation";
import type { WorkInputError } from "../domain/WorkInputError";
import type { RalphExit } from "../errors/RalphExit";
import { decodeTimeoutPolicy } from "../domain/WorkInvocation";
import { CodexRunner } from "./CodexRunner";
import { HostTools } from "./HostTools";
import { RalphWorkspace } from "./RalphWorkspace";

export type RunOnceError =
  | TimeoutInputError
  | WorkInputError
  | RalphExit
  | CodexInvocationError
  | OperatorOutputError;

export class RalphRunner extends Context.Service<
  RalphRunner,
  {
    runOnce(input: OnceFlagsInput): Effect.Effect<void, RunOnceError>;
  }
>()("ralph-effect/services/RalphRunner") {
  static readonly layer = Layer.effect(
    RalphRunner,
    Effect.gen(function* () {
      const codexRunner = yield* CodexRunner;
      const hostTools = yield* HostTools;
      const workspace = yield* RalphWorkspace;
      const stdio = yield* Stdio.Stdio;

      const writeOperatorOutput = Effect.fnUntraced(function* (output: string) {
        return yield* Stream.make(output).pipe(
          Stream.run(stdio.stdout({ endOnDone: false })),
          Effect.mapError(
            (error) =>
              new OperatorOutputError({
                message: `Could not write Ralph output: ${error.message}`,
              }),
          ),
        );
      });

      const notifyBestEffort = (message: string) =>
        hostTools.notifyIfAvailable(message).pipe(Effect.catchDefect(() => Effect.void));

      const runOnce = Effect.fn("RalphRunner.runOnce")(function* (input: OnceFlagsInput) {
        const execution = Effect.gen(function* () {
          const timeouts = yield* decodeTimeoutPolicy(input.idleTimeout, input.invocationTimeout);
          const prepared = yield* workspace.prepareWorkInvocation({
            work: input.work,
            ralphDir: input.ralphDir,
            cwd: input.cwd,
            yolo: input.yolo,
            timeouts,
          });

          yield* hostTools.ensureCommandAvailable("codex", "Codex CLI");
          yield* writeOperatorOutput("=== Work ===\n");

          const startedAt = yield* Clock.currentTimeNanos;
          const invocation = yield* codexRunner.runInvocation(prepared).pipe(Effect.result);
          const endedAt = yield* Clock.currentTimeNanos;
          const elapsed = Duration.format(Duration.nanos(endedAt - startedAt));

          if (Result.isSuccess(invocation)) {
            const outcome = invocation.success;
            const label = outcome.workflowComplete ? "workflow complete" : "invocation complete";
            yield* writeOperatorOutput(`--- Work ${label} in ${elapsed} ---\n`);
            return outcome;
          }

          yield* writeOperatorOutput(
            `--- Work failed in ${elapsed}: ${invocation.failure.message} ---\n`,
          );
          return yield* invocation.failure;
        });
        const result = yield* execution.pipe(Effect.result);

        if (Result.isSuccess(result)) {
          const label = result.success.workflowComplete
            ? "workflow complete"
            : "invocation complete";
          yield* notifyBestEffort(`Ralph once succeeded: ${label}.`);
          return;
        }

        yield* notifyBestEffort(`Ralph once failed: ${result.failure.message}`);
        return yield* result.failure;
      });

      return RalphRunner.of({ runOnce });
    }),
  );
}
