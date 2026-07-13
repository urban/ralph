import { Clock, Context, Duration, Effect, Layer, Option, Ref, Stdio, Stream } from "effect";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import {
  initialMarkerScanState,
  invocationCompletionMarker,
  scanMarkerChunk,
} from "../domain/CompletionMarkers";
import type { PreparedRunContext } from "../domain/Ralph";
import {
  AbsoluteInvocationTimeout,
  CodexExitError,
  CodexExitStatusError,
  type CodexInvocationError,
  CodexSpawnError,
  CodexStreamError,
  CodexTerminationError,
  IdleInvocationTimeout,
  type InvocationOutcome,
  type InvocationRequest,
  MissingInvocationMarker,
} from "../domain/WorkInvocation";
import type { RalphExit } from "../errors/RalphExit";
import { failWithExitCode, failWithMessage } from "../errors/RalphExit";

const completionMarker = "<promise>COMPLETE</promise>";

type InvocationDecision =
  | { readonly _tag: "Completed"; readonly outcome: InvocationOutcome }
  | { readonly _tag: "TimedOut"; readonly kind: "Idle" | "Absolute" };

export const genericCompletionProtocol = `\n\nWhen you have successfully completed these instructions, emit exactly ${invocationCompletionMarker}. Do not emit this marker until the instructions are complete.`;

const isChecklistComplete = (output: string) => output.includes(completionMarker);

const renderCodexPrompt = (runContext: PreparedRunContext) => `<checklist>
@${runContext.checklistPath}
</checklist>

<progress_log>
@${runContext.progressPath}
</progress_log>

<instructions>
@${runContext.instructionsPath}
</instructions>`;

const makeWorkInvocationCommand = (request: InvocationRequest) =>
  ChildProcess.make(
    "codex",
    request.yolo
      ? [
          "exec",
          "--dangerously-bypass-approvals-and-sandbox",
          "-C",
          request.workingDirectory,
          `${request.prompt}${genericCompletionProtocol}`,
        ]
      : [
          "exec",
          "--full-auto",
          "--sandbox",
          "workspace-write",
          "-C",
          request.workingDirectory,
          `${request.prompt}${genericCompletionProtocol}`,
        ],
    {
      cwd: request.workingDirectory,
      stdin: "inherit",
      stdout: "pipe",
      stderr: "pipe",
      detached: true,
    },
  );

const makeCodexExecCommand = (runContext: PreparedRunContext, stdout: ChildProcess.CommandOutput) =>
  ChildProcess.make(
    "codex",
    runContext.yolo
      ? [
          "exec",
          "--dangerously-bypass-approvals-and-sandbox",
          "-C",
          runContext.workingDirectory,
          renderCodexPrompt(runContext),
        ]
      : [
          "exec",
          "--full-auto",
          "--sandbox",
          "workspace-write",
          "-C",
          runContext.workingDirectory,
          renderCodexPrompt(runContext),
        ],
    {
      cwd: runContext.workingDirectory,
      stdin: "inherit",
      stdout,
      stderr: "inherit",
    },
  );

const ensureSuccessfulExit = Effect.fn("ensureSuccessfulExit")(function* (
  exitCode: ChildProcessSpawner.ExitCode,
) {
  if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
    return yield* failWithExitCode(Number(exitCode));
  }
});

export class CodexRunner extends Context.Service<
  CodexRunner,
  {
    runInvocation(
      request: InvocationRequest,
    ): Effect.Effect<InvocationOutcome, CodexInvocationError>;
    run(runContext: PreparedRunContext): Effect.Effect<void, RalphExit>;
    runCapture(runContext: PreparedRunContext): Effect.Effect<string, RalphExit>;
    isChecklistComplete(output: string): boolean;
  }
>()("ralph-effect/services/CodexRunner") {
  static readonly layer = Layer.effect(
    CodexRunner,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const stdio = yield* Stdio.Stdio;

      const runInvocationScoped = Effect.fnUntraced(function* (request: InvocationRequest) {
        const handle = yield* spawner
          .spawn(makeWorkInvocationCommand(request))
          .pipe(
            Effect.mapError(
              (error) =>
                new CodexSpawnError({ message: `Could not start Codex: ${error.message}` }),
            ),
          );
        const startedAt = yield* Clock.currentTimeNanos;
        const lastActivity = yield* Ref.make(startedAt);
        const markerState = yield* Ref.make(initialMarkerScanState());
        const recordActivity = Clock.currentTimeNanos.pipe(
          Effect.flatMap((now) => Ref.set(lastActivity, now)),
        );
        const stdout = handle.stdout.pipe(
          Stream.tap((chunk) =>
            Ref.update(markerState, (state) => scanMarkerChunk(state, chunk)).pipe(
              Effect.andThen(recordActivity),
            ),
          ),
          Stream.run(stdio.stdout({ endOnDone: false })),
          Effect.mapError(
            (error) =>
              new CodexStreamError({
                stream: "Stdout",
                message: `Could not read or forward Codex stdout: ${error.message}`,
              }),
          ),
        );
        const stderr = handle.stderr.pipe(
          Stream.tap(() => recordActivity),
          Stream.run(stdio.stderr({ endOnDone: false })),
          Effect.mapError(
            (error) =>
              new CodexStreamError({
                stream: "Stderr",
                message: `Could not read or forward Codex stderr: ${error.message}`,
              }),
          ),
        );
        const exitCode = handle.exitCode.pipe(
          Effect.mapError(
            (error) =>
              new CodexExitStatusError({
                message: `Could not read Codex exit status: ${error.message}`,
              }),
          ),
        );
        const operation = Effect.gen(function* () {
          const [, , completedExitCode] = yield* Effect.all([stdout, stderr, exitCode], {
            concurrency: "unbounded",
          });

          if (completedExitCode !== ChildProcessSpawner.ExitCode(0)) {
            return yield* new CodexExitError({
              exitCode: Number(completedExitCode),
              message: `Codex exited with status ${completedExitCode}.`,
            });
          }

          const markers = yield* Ref.get(markerState);
          if (!markers.invocationComplete) {
            return yield* new MissingInvocationMarker({
              message: `Codex exited successfully without ${invocationCompletionMarker}.`,
            });
          }

          return {
            invocationComplete: true,
            workflowComplete: markers.workflowComplete,
          } satisfies InvocationOutcome;
        });
        const idleNanos = yield* Option.match(Duration.toNanos(request.timeouts.idle), {
          onNone: () => Effect.die("Validated idle timeout must be finite"),
          onSome: Effect.succeed,
        });
        const invocationNanos = yield* Option.match(Duration.toNanos(request.timeouts.invocation), {
          onNone: () => Effect.die("Validated invocation timeout must be finite"),
          onSome: Effect.succeed,
        });
        const terminate = handle.kill({ killSignal: "SIGTERM", forceKillAfter: "5 seconds" }).pipe(
          Effect.mapError(
            (error) =>
              new CodexTerminationError({
                message: `Could not terminate timed-out Codex process: ${error.message}`,
              }),
          ),
        );
        const timeoutSupervisor = Effect.gen(function* () {
          while (true) {
            const now = yield* Clock.currentTimeNanos;
            const latestActivity = yield* Ref.get(lastActivity);
            const absoluteRemaining = invocationNanos - (now - startedAt);
            const idleRemaining = idleNanos - (now - latestActivity);

            if (absoluteRemaining <= 0n) {
              return {
                _tag: "TimedOut",
                kind: "Absolute",
              } satisfies InvocationDecision;
            }
            if (idleRemaining <= 0n) {
              return {
                _tag: "TimedOut",
                kind: "Idle",
              } satisfies InvocationDecision;
            }

            yield* Effect.sleep(
              absoluteRemaining < idleRemaining ? absoluteRemaining : idleRemaining,
            );
          }
        });
        const decision = yield* Effect.raceFirst(
          operation.pipe(
            Effect.map((outcome) => ({ _tag: "Completed", outcome }) satisfies InvocationDecision),
          ),
          timeoutSupervisor,
        );

        if (decision._tag === "Completed") {
          return decision.outcome;
        }

        yield* terminate;
        return decision.kind === "Absolute"
          ? yield* new AbsoluteInvocationTimeout({
              message: "Codex exceeded the absolute invocation timeout.",
            })
          : yield* new IdleInvocationTimeout({
              message: "Codex produced no output before the idle timeout.",
            });
      });

      const run = Effect.fn("CodexRunner.run")(function* (runContext: PreparedRunContext) {
        const exitCode = yield* spawner
          .exitCode(makeCodexExecCommand(runContext, "inherit"))
          .pipe(Effect.catch((error) => failWithMessage(error.message)));

        yield* ensureSuccessfulExit(exitCode);
      });

      const runCaptureScoped = Effect.fn("CodexRunner.runCapture")(function* (
        runContext: PreparedRunContext,
      ) {
        const handle = yield* spawner
          .spawn(makeCodexExecCommand(runContext, "pipe"))
          .pipe(Effect.catch((error) => failWithMessage(error.message)));
        const output = yield* handle.stdout.pipe(
          Stream.decodeText(),
          Stream.mkString,
          Effect.catch((error) => failWithMessage(error.message)),
        );
        const exitCode = yield* handle.exitCode.pipe(
          Effect.catch((error) => failWithMessage(error.message)),
        );

        yield* ensureSuccessfulExit(exitCode);

        return output;
      });

      return CodexRunner.of({
        runInvocation: (request) => Effect.scoped(runInvocationScoped(request)),
        run,
        runCapture: (runContext) => Effect.scoped(runCaptureScoped(runContext)),
        isChecklistComplete,
      });
    }),
  );
}
