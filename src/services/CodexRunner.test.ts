import { assert, describe, it } from "@effect/vitest";
import { Duration, Effect, Option, Ref, Sink, Stdio, Stream } from "effect";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import { invocationCompletionMarker, workflowCompletionMarker } from "../domain/CompletionMarkers";
import type { PreparedWorkInvocation } from "../domain/WorkInvocation";
import { CodexRunner, genericCompletionProtocol } from "./CodexRunner";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const request = (yolo = false): PreparedWorkInvocation => ({
  workingDirectory: "/workspace",
  work: { _tag: "Ready", role: "Work", prompt: "Do one thing." },
  timeouts: {
    idle: Duration.minutes(5),
    invocation: Duration.minutes(30),
  },
  yolo,
});

const makeHarness = Effect.fnUntraced(function* (
  stdoutChunks: ReadonlyArray<string>,
  stderrChunks: ReadonlyArray<string>,
  exitCode: number,
) {
  const stdoutOutput = yield* Ref.make<Array<Uint8Array>>([]);
  const stderrOutput = yield* Ref.make<Array<Uint8Array>>([]);
  const capturedCommand = yield* Ref.make(Option.none<ChildProcess.Command>());
  const streamsDrained = yield* Ref.make(false);
  const scopeClosed = yield* Ref.make(false);
  const toBytes = (chunk: string | Uint8Array) =>
    typeof chunk === "string" ? encoder.encode(chunk) : chunk;
  const stdio = Stdio.make({
    args: Effect.succeed([]),
    stdin: Stream.empty,
    stdout: () =>
      Sink.forEach((chunk: string | Uint8Array) =>
        Ref.update(stdoutOutput, (chunks) => [...chunks, toBytes(chunk)]),
      ),
    stderr: () =>
      Sink.forEach((chunk: string | Uint8Array) =>
        Ref.update(stderrOutput, (chunks) => [...chunks, toBytes(chunk)]),
      ),
  });
  const stdout = Stream.fromIterable(stdoutChunks.map((chunk) => encoder.encode(chunk))).pipe(
    Stream.concat(
      Stream.fromEffect(Ref.set(streamsDrained, true).pipe(Effect.as(encoder.encode("")))),
    ),
  );
  const stderr = Stream.fromIterable(stderrChunks.map((chunk) => encoder.encode(chunk)));
  const handle = ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(123),
    stdin: Sink.drain,
    stdout,
    stderr,
    all: Stream.empty,
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(exitCode)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    unref: Effect.succeed(Effect.void),
  });
  const spawner = ChildProcessSpawner.make((command) =>
    Effect.acquireRelease(
      Ref.set(capturedCommand, Option.some(command)).pipe(Effect.as(handle)),
      () => Ref.set(scopeClosed, true),
    ),
  );

  return {
    capturedCommand,
    scopeClosed,
    spawner,
    stderrOutput,
    stdio,
    stdoutOutput,
    streamsDrained,
  };
});

const provideHarness = <A, E>(
  effect: Effect.Effect<A, E, CodexRunner>,
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  stdio: Stdio.Stdio,
) =>
  effect.pipe(
    Effect.provide(CodexRunner.layer),
    Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    Effect.provideService(Stdio.Stdio, stdio),
  );

const decodeChunks = (chunks: ReadonlyArray<Uint8Array>): string =>
  chunks.map((chunk) => decoder.decode(chunk)).join("");

describe("CodexRunner.runInvocation", () => {
  it.effect("streams matching channels and returns exact markers after exit and drain", () =>
    Effect.gen(function* () {
      const split = Math.floor(invocationCompletionMarker.length / 2);
      const harness = yield* makeHarness(
        [
          `native stdout ${invocationCompletionMarker.slice(0, split)}`,
          `${invocationCompletionMarker.slice(split)} ${workflowCompletionMarker}`,
        ],
        ["native stderr"],
        0,
      );
      const outcome = yield* provideHarness(
        Effect.gen(function* () {
          const runner = yield* CodexRunner;
          return yield* runner.runInvocation(request(true));
        }),
        harness.spawner,
        harness.stdio,
      );

      assert.deepStrictEqual(outcome, {
        invocationComplete: true,
        workflowComplete: true,
      });
      assert.strictEqual(
        decodeChunks(yield* Ref.get(harness.stdoutOutput)),
        `native stdout ${invocationCompletionMarker} ${workflowCompletionMarker}`,
      );
      assert.strictEqual(decodeChunks(yield* Ref.get(harness.stderrOutput)), "native stderr");
      assert.isTrue(yield* Ref.get(harness.streamsDrained));
      assert.isTrue(yield* Ref.get(harness.scopeClosed));

      const command = yield* Ref.get(harness.capturedCommand);
      assert.isTrue(Option.isSome(command));
      if (Option.isNone(command)) {
        return;
      }
      assert.strictEqual(command.value._tag, "StandardCommand");
      if (command.value._tag !== "StandardCommand") {
        return;
      }
      assert.strictEqual(command.value.command, "codex");
      assert.deepStrictEqual(command.value.options, {
        cwd: "/workspace",
        stdin: "inherit",
        stdout: "pipe",
        stderr: "pipe",
      });
      assert.deepStrictEqual(command.value.args.slice(0, 4), [
        "exec",
        "--dangerously-bypass-approvals-and-sandbox",
        "-C",
        "/workspace",
      ]);
      assert.strictEqual(command.value.args.at(-1), `Do one thing.${genericCompletionProtocol}`);
    }),
  );

  it.effect("rejects complete-only and marker variants", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness(
        [workflowCompletionMarker, "<promise>invocation_complete</promise>"],
        [],
        0,
      );
      const error = yield* provideHarness(
        Effect.gen(function* () {
          const runner = yield* CodexRunner;
          return yield* Effect.flip(runner.runInvocation(request()));
        }),
        harness.spawner,
        harness.stdio,
      );

      assert.strictEqual(error._tag, "MissingInvocationMarker");
      assert.isTrue(yield* Ref.get(harness.scopeClosed));
    }),
  );

  it.effect("rejects nonzero exit even when both markers were streamed", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness(
        [`${invocationCompletionMarker}${workflowCompletionMarker}`],
        [],
        17,
      );
      const error = yield* provideHarness(
        Effect.gen(function* () {
          const runner = yield* CodexRunner;
          return yield* Effect.flip(runner.runInvocation(request()));
        }),
        harness.spawner,
        harness.stdio,
      );

      assert.strictEqual(error._tag, "CodexExitError");
      if (error._tag === "CodexExitError") {
        assert.strictEqual(error.exitCode, 17);
      }
    }),
  );
});
