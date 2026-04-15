import { Effect, Stream } from "effect";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import type { PreparedRunContext } from "./domain";
import { failWithExitCode, failWithMessage } from "./errors";

const completionMarker = "<promise>COMPLETE</promise>";

export const isChecklistComplete = (output: string) => output.includes(completionMarker);

export const renderCodexPrompt = (runContext: PreparedRunContext) => `<checklist>
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

export const runCodexPass = Effect.fn("runCodexPass")(function* (
  runContext: PreparedRunContext,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const exitCode = yield* spawner
    .exitCode(makeCodexExecCommand(runContext, "inherit"))
    .pipe(Effect.catch((error) => failWithMessage(error.message)));

  yield* ensureSuccessfulExit(exitCode);
});

export const runCodexPassCapture = Effect.fn("runCodexPassCapture")(function* (
  runContext: PreparedRunContext,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
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
