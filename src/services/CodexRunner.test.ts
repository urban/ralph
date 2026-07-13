import { assert, describe, it } from "@effect/vitest";
import { Duration, Effect, Fiber, Option, Ref, Schedule, Sink, Stdio, Stream } from "effect";
import * as TestClock from "effect/testing/TestClock";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import { invocationCompletionMarker, workflowCompletionMarker } from "../domain/CompletionMarkers";
import type { InvocationRequest } from "../domain/WorkInvocation";
import { CodexRunner, genericCompletionProtocol } from "./CodexRunner";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const request = (yolo = false): InvocationRequest => ({
  workingDirectory: "/workspace",
  prompt: "Do one thing.",
  timeouts: {
    idle: Duration.minutes(5),
    invocation: Duration.minutes(30),
  },
  yolo,
});

const makeCustomHarness = Effect.fnUntraced(function* (
  stdout: Stream.Stream<Uint8Array>,
  stderr: Stream.Stream<Uint8Array>,
  exitCode: Effect.Effect<ChildProcessSpawner.ExitCode>,
  killBehavior: (options: ChildProcess.KillOptions | undefined) => Effect.Effect<void> = () =>
    Effect.void,
) {
  const stdoutOutput = yield* Ref.make<Array<Uint8Array>>([]);
  const stderrOutput = yield* Ref.make<Array<Uint8Array>>([]);
  const capturedCommand = yield* Ref.make(Option.none<ChildProcess.Command>());
  const scopeClosed = yield* Ref.make(false);
  const streamConsumersClosed = yield* Ref.make(0);
  const killRequests = yield* Ref.make<Array<ChildProcess.KillOptions | undefined>>([]);
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
  const closeConsumer = Ref.update(streamConsumersClosed, (count) => count + 1);
  const handle = ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(123),
    stdin: Sink.drain,
    stdout: stdout.pipe(Stream.ensuring(closeConsumer)),
    stderr: stderr.pipe(Stream.ensuring(closeConsumer)),
    all: Stream.empty,
    exitCode,
    isRunning: Effect.succeed(false),
    kill: (options) =>
      Ref.update(killRequests, (requests) => [...requests, options]).pipe(
        Effect.andThen(killBehavior(options)),
      ),
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
    killRequests,
    scopeClosed,
    spawner,
    stderrOutput,
    stdio,
    stdoutOutput,
    streamConsumersClosed,
  };
});

const makeHarness = Effect.fnUntraced(function* (
  stdoutChunks: ReadonlyArray<string>,
  stderrChunks: ReadonlyArray<string>,
  exitCode: number,
) {
  const streamsDrained = yield* Ref.make(false);
  const stdout = Stream.fromIterable(stdoutChunks.map((chunk) => encoder.encode(chunk))).pipe(
    Stream.concat(
      Stream.fromEffect(Ref.set(streamsDrained, true).pipe(Effect.as(encoder.encode("")))),
    ),
  );
  const harness = yield* makeCustomHarness(
    stdout,
    Stream.fromIterable(stderrChunks.map((chunk) => encoder.encode(chunk))),
    Effect.succeed(ChildProcessSpawner.ExitCode(exitCode)),
  );

  return { ...harness, streamsDrained };
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
        detached: true,
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

  it.effect("resets idle time from either output stream then terminates after inactivity", () =>
    Effect.gen(function* () {
      const stdout = Stream.fromEffect(
        Effect.sleep(Duration.seconds(4)).pipe(Effect.as(encoder.encode("stdout activity"))),
      ).pipe(Stream.concat(Stream.never));
      const stderr = Stream.fromEffect(
        Effect.sleep(Duration.seconds(8)).pipe(Effect.as(encoder.encode("stderr activity"))),
      ).pipe(Stream.concat(Stream.never));
      const harness = yield* makeCustomHarness(stdout, stderr, Effect.never);
      const invocation = provideHarness(
        Effect.gen(function* () {
          const runner = yield* CodexRunner;
          return yield* runner.runInvocation({
            ...request(),
            timeouts: { idle: Duration.seconds(5), invocation: Duration.seconds(30) },
          });
        }),
        harness.spawner,
        harness.stdio,
      );
      const fiber = yield* invocation.pipe(Effect.forkChild({ startImmediately: true }));

      yield* TestClock.adjust(Duration.seconds(12));
      assert.isUndefined(fiber.pollUnsafe());
      yield* TestClock.adjust(Duration.seconds(1));
      const error = yield* Effect.flip(Fiber.join(fiber));

      assert.strictEqual(error._tag, "IdleInvocationTimeout");
      assert.deepStrictEqual(yield* Ref.get(harness.killRequests), [{ killSignal: "SIGTERM" }]);
      assert.strictEqual(yield* Ref.get(harness.streamConsumersClosed), 2);
      assert.isTrue(yield* Ref.get(harness.scopeClosed));
    }),
  );

  it.effect("enforces the absolute deadline despite continuing output", () =>
    Effect.gen(function* () {
      const noisyStdout = Stream.fromEffect(
        Effect.sleep(Duration.seconds(2)).pipe(Effect.as(encoder.encode("activity"))),
      ).pipe(Stream.repeat(Schedule.forever));
      const harness = yield* makeCustomHarness(noisyStdout, Stream.never, Effect.never);
      const invocation = provideHarness(
        Effect.gen(function* () {
          const runner = yield* CodexRunner;
          return yield* runner.runInvocation({
            ...request(),
            timeouts: { idle: Duration.seconds(5), invocation: Duration.seconds(10) },
          });
        }),
        harness.spawner,
        harness.stdio,
      );
      const fiber = yield* invocation.pipe(Effect.forkChild({ startImmediately: true }));

      yield* TestClock.adjust(Duration.seconds(10));
      const error = yield* Effect.flip(Fiber.join(fiber));

      assert.strictEqual(error._tag, "AbsoluteInvocationTimeout");
      assert.deepStrictEqual(yield* Ref.get(harness.killRequests), [{ killSignal: "SIGTERM" }]);
      assert.strictEqual(yield* Ref.get(harness.streamConsumersClosed), 2);
      assert.isTrue(yield* Ref.get(harness.scopeClosed));
    }),
  );

  it.effect("escalates from graceful to forced process-group termination", () =>
    Effect.gen(function* () {
      const harness = yield* makeCustomHarness(
        Stream.never,
        Stream.never,
        Effect.never,
        (options) => (options?.killSignal === "SIGTERM" ? Effect.never : Effect.void),
      );
      const invocation = provideHarness(
        Effect.gen(function* () {
          const runner = yield* CodexRunner;
          return yield* runner.runInvocation({
            ...request(),
            timeouts: { idle: Duration.seconds(1), invocation: Duration.seconds(30) },
          });
        }),
        harness.spawner,
        harness.stdio,
      );
      const fiber = yield* invocation.pipe(Effect.forkChild({ startImmediately: true }));

      yield* TestClock.adjust(Duration.seconds(1));
      assert.isUndefined(fiber.pollUnsafe());
      yield* TestClock.adjust(Duration.seconds(5));
      const error = yield* Effect.flip(Fiber.join(fiber));

      assert.strictEqual(error._tag, "IdleInvocationTimeout");
      assert.deepStrictEqual(yield* Ref.get(harness.killRequests), [
        { killSignal: "SIGTERM" },
        { killSignal: "SIGKILL" },
      ]);
    }),
  );

  it.effect("chooses the absolute timeout deterministically when both deadlines coincide", () =>
    Effect.gen(function* () {
      const stdout = Stream.fromEffect(
        Effect.sleep(Duration.seconds(4)).pipe(Effect.as(encoder.encode("activity"))),
      ).pipe(Stream.concat(Stream.never));
      const harness = yield* makeCustomHarness(stdout, Stream.never, Effect.never);
      const invocation = provideHarness(
        Effect.gen(function* () {
          const runner = yield* CodexRunner;
          return yield* runner.runInvocation({
            ...request(),
            timeouts: { idle: Duration.seconds(6), invocation: Duration.seconds(10) },
          });
        }),
        harness.spawner,
        harness.stdio,
      );
      const fiber = yield* invocation.pipe(Effect.forkChild({ startImmediately: true }));

      yield* TestClock.adjust(Duration.seconds(10));
      const error = yield* Effect.flip(Fiber.join(fiber));

      assert.strictEqual(error._tag, "AbsoluteInvocationTimeout");
    }),
  );
});
