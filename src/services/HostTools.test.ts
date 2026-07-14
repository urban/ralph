import { assert, describe, it } from "@effect/vitest";
import { Effect, Option, Ref, Sink, Stream } from "effect";
import * as PlatformError from "effect/PlatformError";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import { HostTools } from "./HostTools";

const makeExitCodeHarness = Effect.fnUntraced(function* (exitCode: number) {
  const capturedCommand = yield* Ref.make(Option.none<ChildProcess.Command>());
  const scopeClosed = yield* Ref.make(false);
  const handle = ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(123),
    stdin: Sink.drain,
    stdout: Stream.empty,
    stderr: Stream.empty,
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

  return { capturedCommand, scopeClosed, spawner };
});

const makeSpawnFailureHarness = Effect.fnUntraced(function* () {
  const capturedCommand = yield* Ref.make(Option.none<ChildProcess.Command>());
  const spawner = ChildProcessSpawner.make((command) =>
    Ref.set(capturedCommand, Option.some(command)).pipe(
      Effect.andThen(
        Effect.fail(
          PlatformError.systemError({
            _tag: "NotFound",
            module: "ChildProcess",
            method: "spawn",
            pathOrDescriptor: "tt",
            description: "spawn tt",
          }),
        ),
      ),
    ),
  );

  return { capturedCommand, spawner };
});

const runNotify = (spawner: ChildProcessSpawner.ChildProcessSpawner["Service"]) =>
  Effect.gen(function* () {
    const hostTools = yield* HostTools;
    yield* hostTools.notifyIfAvailable("workflow complete");
  }).pipe(
    Effect.provide(HostTools.layer),
    Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
  );

describe("HostTools.notifyIfAvailable", () => {
  it.effect("spawns tt notify directly and ignores exit status", () =>
    Effect.gen(function* () {
      const harness = yield* makeExitCodeHarness(1);

      yield* runNotify(harness.spawner);

      const command = yield* Ref.get(harness.capturedCommand);
      assert.isTrue(Option.isSome(command));
      if (Option.isNone(command)) {
        return;
      }
      assert.strictEqual(command.value._tag, "StandardCommand");
      if (command.value._tag !== "StandardCommand") {
        return;
      }
      assert.strictEqual(command.value.command, "tt");
      assert.deepStrictEqual(command.value.args, ["notify", "workflow complete"]);
      assert.deepStrictEqual(command.value.options, {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      });
      assert.isTrue(yield* Ref.get(harness.scopeClosed));
    }),
  );

  it.effect("swallows spawn failures", () =>
    Effect.gen(function* () {
      const harness = yield* makeSpawnFailureHarness();

      yield* runNotify(harness.spawner);

      const command = yield* Ref.get(harness.capturedCommand);
      assert.isTrue(Option.isSome(command));
      if (Option.isNone(command)) {
        return;
      }
      assert.strictEqual(command.value._tag, "StandardCommand");
      if (command.value._tag !== "StandardCommand") {
        return;
      }
      assert.strictEqual(command.value.command, "tt");
      assert.deepStrictEqual(command.value.args, ["notify", "workflow complete"]);
    }),
  );
});
