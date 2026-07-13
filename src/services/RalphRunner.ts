import { Clock, Context, Duration, Effect, Layer, Result, Stdio, Stream } from "effect";

import type {
  InvocationOutcome,
  InvocationRequest,
  IterationSnapshot,
  LoopFlagsInput,
  OnceFlagsInput,
  PhaseRole,
  PhaseSnapshot,
  PreparedWorkflow,
  TimeoutInputError,
} from "../domain/WorkInvocation";
import {
  type CodexInvocationError,
  decodeTimeoutPolicy,
  LoopExhausted,
  OperatorOutputError,
} from "../domain/WorkInvocation";
import type { PhaseInputError } from "../domain/WorkInputError";
import type { RalphExit } from "../errors/RalphExit";
import { CodexRunner } from "./CodexRunner";
import { HostTools } from "./HostTools";
import { RalphWorkspace } from "./RalphWorkspace";

export type RunOnceError =
  | TimeoutInputError
  | PhaseInputError
  | RalphExit
  | CodexInvocationError
  | OperatorOutputError;

export type RunLoopError = RunOnceError | LoopExhausted;

export class RalphRunner extends Context.Service<
  RalphRunner,
  {
    runOnce(input: OnceFlagsInput): Effect.Effect<void, RunOnceError>;
    runLoop(input: LoopFlagsInput): Effect.Effect<void, RunLoopError>;
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

      const phaseLabel = (role: PhaseRole): string => {
        switch (role) {
          case "BeforeWork":
            return "Before work";
          case "Work":
            return "Work";
          case "AfterWork":
            return "After work";
        }
      };

      const invocationRequest = (
        prepared: PreparedWorkflow,
        phase: Extract<PhaseSnapshot, { readonly _tag: "Ready" }>,
      ): InvocationRequest => ({
        workingDirectory: prepared.workingDirectory,
        instructionsPath: phase.snapshotPath,
        timeouts: prepared.timeouts,
        yolo: prepared.yolo,
      });

      const runPhase = Effect.fnUntraced(function* (
        prepared: PreparedWorkflow,
        phase: PhaseSnapshot,
      ) {
        const label = phaseLabel(phase.role);
        if (phase._tag === "Skipped") {
          yield* writeOperatorOutput(
            `--- ${label} phase skipped (${phase.reason.toLowerCase()}) ---\n`,
          );
          return false;
        }

        yield* writeOperatorOutput(`=== ${label} ===\n`);

        const startedAt = yield* Clock.currentTimeNanos;
        const invocation = yield* codexRunner
          .runInvocation(invocationRequest(prepared, phase))
          .pipe(Effect.result);
        const endedAt = yield* Clock.currentTimeNanos;
        const elapsed = Duration.format(Duration.nanos(endedAt - startedAt));

        if (Result.isSuccess(invocation)) {
          const outcome = invocation.success;
          const outcomeLabel = outcome.workflowComplete
            ? "workflow complete"
            : "invocation complete";
          yield* writeOperatorOutput(`--- ${label} ${outcomeLabel} in ${elapsed} ---\n`);
          return outcome.workflowComplete;
        }

        yield* writeOperatorOutput(
          `--- ${label} failed in ${elapsed}: ${invocation.failure.message} ---\n`,
        );
        return yield* invocation.failure;
      });

      const runSequence = Effect.fnUntraced(function* (
        prepared: PreparedWorkflow,
        snapshot: IterationSnapshot,
      ) {
        const beforeComplete = yield* runPhase(prepared, snapshot.before);
        if (beforeComplete) {
          return true;
        }

        const workComplete = yield* runPhase(prepared, snapshot.work);
        if (workComplete) {
          return true;
        }

        return yield* runPhase(prepared, snapshot.after);
      });

      const prepareWorkflow = Effect.fnUntraced(function* (input: OnceFlagsInput) {
        const timeouts = yield* decodeTimeoutPolicy(input.idleTimeout, input.invocationTimeout);
        const prepared = yield* workspace.prepareWorkflow({
          before: input.before,
          work: input.work,
          after: input.after,
          ralphDir: input.ralphDir,
          cwd: input.cwd,
          yolo: input.yolo,
          timeouts,
        });

        yield* hostTools.ensureCommandAvailable("codex", "Codex CLI");
        return prepared;
      });

      const runIteration = Effect.fnUntraced(function* (prepared: PreparedWorkflow) {
        return yield* Effect.acquireUseRelease(
          workspace.snapshotIteration(prepared),
          (snapshot) => runSequence(prepared, snapshot),
          (snapshot) => workspace.cleanupIterationSnapshot(snapshot),
        );
      });

      const runOnce = Effect.fn("RalphRunner.runOnce")(function* (input: OnceFlagsInput) {
        const execution = Effect.gen(function* () {
          const prepared = yield* prepareWorkflow(input);
          const workflowComplete = yield* runIteration(prepared);

          return {
            invocationComplete: true,
            workflowComplete,
          } satisfies InvocationOutcome;
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

      const iterationCountLabel = (count: number): string =>
        `${count} ${count === 1 ? "iteration" : "iterations"}`;

      const runLoop = Effect.fn("RalphRunner.runLoop")(function* (input: LoopFlagsInput) {
        const execution = Effect.gen(function* () {
          const prepared = yield* prepareWorkflow(input);

          for (let iteration = 1; iteration <= input.iterations; iteration += 1) {
            yield* writeOperatorOutput(`=== Iteration ${iteration} ===\n`);
            const workflowComplete = yield* runIteration(prepared);
            if (workflowComplete) {
              return iteration;
            }
          }

          return yield* new LoopExhausted({
            iterations: input.iterations,
            message: `Ralph loop exhausted after ${iterationCountLabel(input.iterations)} without workflow completion.`,
          });
        });
        const result = yield* execution.pipe(Effect.result);

        if (Result.isSuccess(result)) {
          yield* notifyBestEffort(
            `Ralph loop succeeded: workflow complete after ${iterationCountLabel(result.success)}.`,
          );
          return;
        }

        yield* notifyBestEffort(`Ralph loop failed: ${result.failure.message}`);
        return yield* result.failure;
      });

      return RalphRunner.of({ runLoop, runOnce });
    }),
  );
}
