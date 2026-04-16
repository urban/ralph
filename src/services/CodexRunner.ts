import { Context, Effect, Layer, Stream } from "effect";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import type { PreparedRunContext } from "../domain/Ralph";
import type { RalphExit } from "../errors/RalphExit";
import { failWithExitCode, failWithMessage } from "../errors/RalphExit";

const completionMarker = "<promise>COMPLETE</promise>";

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
    run(runContext: PreparedRunContext): Effect.Effect<void, RalphExit>;
    runCapture(runContext: PreparedRunContext): Effect.Effect<string, RalphExit>;
    isChecklistComplete(output: string): boolean;
  }
>()("ralph-effect/services/CodexRunner") {
  static readonly layer = Layer.effect(
    CodexRunner,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

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
        run,
        runCapture: (runContext) => Effect.scoped(runCaptureScoped(runContext)),
        isChecklistComplete,
      });
    }),
  );
}
