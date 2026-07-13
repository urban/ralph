import { assert, describe, it } from "@effect/vitest";
import { Duration, Effect, Option, Ref, Result, Sink, Stdio, Stream } from "effect";

import {
  AbsoluteInvocationTimeout,
  CodexExitError,
  type CodexInvocationError,
  IdleInvocationTimeout,
  MissingInvocationMarker,
  type OnceFlagsInput,
  type PreparedWorkInvocation,
} from "../domain/WorkInvocation";
import { CodexRunner } from "./CodexRunner";
import { HostTools } from "./HostTools";
import { RalphRunner } from "./RalphRunner";
import { RalphWorkspace } from "./RalphWorkspace";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const input = (overrides: Partial<OnceFlagsInput> = {}): OnceFlagsInput => ({
  work: Option.some("./WORK.md"),
  ralphDir: Option.none(),
  cwd: Option.none(),
  idleTimeout: "5m",
  invocationTimeout: "30m",
  yolo: false,
  ...overrides,
});

const prepared: PreparedWorkInvocation = {
  workingDirectory: "/workspace",
  work: { _tag: "Ready", role: "Work", prompt: "Do one thing." },
  timeouts: { idle: Duration.minutes(5), invocation: Duration.minutes(30) },
  yolo: false,
};

const makeHarness = Effect.fnUntraced(function* <E extends CodexInvocationError>(
  invocation: Effect.Effect<
    { readonly invocationComplete: true; readonly workflowComplete: boolean },
    E
  >,
  notificationDefects = false,
) {
  const output = yield* Ref.make<Array<Uint8Array>>([]);
  const notifications = yield* Ref.make<Array<string>>([]);
  const workspaceCalls = yield* Ref.make(0);
  const invocationCalls = yield* Ref.make(0);
  const codexChecks = yield* Ref.make(0);
  const toBytes = (chunk: string | Uint8Array) =>
    typeof chunk === "string" ? encoder.encode(chunk) : chunk;
  const stdio = Stdio.make({
    args: Effect.succeed([]),
    stdin: Stream.empty,
    stdout: () =>
      Sink.forEach((chunk: string | Uint8Array) =>
        Ref.update(output, (chunks) => [...chunks, toBytes(chunk)]),
      ),
    stderr: () => Sink.drain,
  });
  const codexRunner = CodexRunner.of({
    runInvocation: () =>
      Ref.update(invocationCalls, (count) => count + 1).pipe(Effect.andThen(invocation)),
    run: () => Effect.die("legacy run is not part of once"),
    runCapture: () => Effect.die("legacy capture is not part of once"),
    isChecklistComplete: () => false,
  });
  const workspace = RalphWorkspace.of({
    init: () => Effect.die("init is not part of once"),
    prepareRunContext: () => Effect.die("legacy runtime is not part of once"),
    prepareWorkInvocation: () =>
      Ref.update(workspaceCalls, (count) => count + 1).pipe(Effect.as(prepared)),
  });
  const hostTools = HostTools.of({
    commandExists: () => Effect.succeed(true),
    ensureCommandAvailable: () => Ref.update(codexChecks, (count) => count + 1),
    notifyIfAvailable: (message) =>
      Ref.update(notifications, (messages) => [...messages, message]).pipe(
        Effect.andThen(notificationDefects ? Effect.die("notification unavailable") : Effect.void),
      ),
  });
  const run = (onceInput: OnceFlagsInput) =>
    Effect.gen(function* () {
      const runner = yield* RalphRunner;
      return yield* runner.runOnce(onceInput);
    }).pipe(
      Effect.provide(RalphRunner.layer),
      Effect.provideService(CodexRunner, codexRunner),
      Effect.provideService(RalphWorkspace, workspace),
      Effect.provideService(HostTools, hostTools),
      Effect.provideService(Stdio.Stdio, stdio),
    );

  return { codexChecks, invocationCalls, notifications, output, run, workspaceCalls };
});

const readOutput = Effect.fnUntraced(function* (output: Ref.Ref<Array<Uint8Array>>) {
  return (yield* Ref.get(output)).map((chunk) => decoder.decode(chunk)).join("");
});

describe("RalphRunner.runOnce", () => {
  it.effect("succeeds on invocation completion without overall completion", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness(
        Effect.succeed({ invocationComplete: true, workflowComplete: false }),
      );

      yield* harness.run(input());

      assert.strictEqual(
        yield* readOutput(harness.output),
        "=== Work ===\n--- Work invocation complete in 0 ---\n",
      );
      assert.deepStrictEqual(yield* Ref.get(harness.notifications), [
        "Ralph once succeeded: invocation complete.",
      ]);
      assert.strictEqual(yield* Ref.get(harness.codexChecks), 1);
      assert.strictEqual(yield* Ref.get(harness.invocationCalls), 1);
    }),
  );

  it.effect("reports every marker, exit, and timeout failure once", () =>
    Effect.gen(function* () {
      const failures = [
        new MissingInvocationMarker({ message: "missing marker" }),
        new CodexExitError({ exitCode: 17, message: "nonzero exit" }),
        new IdleInvocationTimeout({ message: "idle timeout" }),
        new AbsoluteInvocationTimeout({ message: "absolute timeout" }),
      ];

      yield* Effect.forEach(
        failures,
        (failure) =>
          Effect.gen(function* () {
            const harness = yield* makeHarness(Effect.fail(failure));
            const result = yield* harness.run(input()).pipe(Effect.result);

            assert.isTrue(Result.isFailure(result));
            if (Result.isSuccess(result)) {
              return;
            }
            assert.strictEqual(result.failure._tag, failure._tag);
            assert.include(
              yield* readOutput(harness.output),
              `--- Work failed in 0: ${failure.message}`,
            );
            assert.deepStrictEqual(yield* Ref.get(harness.notifications), [
              `Ralph once failed: ${failure.message}`,
            ]);
          }),
        { discard: true },
      );
    }),
  );

  it.effect("preserves success and failure when notification defects", () =>
    Effect.gen(function* () {
      const successHarness = yield* makeHarness(
        Effect.succeed({ invocationComplete: true, workflowComplete: false }),
        true,
      );
      const failure = new MissingInvocationMarker({ message: "missing marker" });
      const failureHarness = yield* makeHarness(Effect.fail(failure), true);

      const success = yield* successHarness.run(input()).pipe(Effect.result);
      const failed = yield* failureHarness.run(input()).pipe(Effect.result);

      assert.isTrue(Result.isSuccess(success));
      assert.isTrue(Result.isFailure(failed));
      if (Result.isFailure(failed)) {
        assert.strictEqual(failed.failure._tag, "MissingInvocationMarker");
      }
      assert.strictEqual((yield* Ref.get(successHarness.notifications)).length, 1);
      assert.strictEqual((yield* Ref.get(failureHarness.notifications)).length, 1);
    }),
  );

  it.effect("rejects invalid timeouts before workspace and process work and still notifies", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness(
        Effect.succeed({ invocationComplete: true, workflowComplete: false }),
      );
      const result = yield* harness
        .run(input({ idleTimeout: "30m", invocationTimeout: "5m" }))
        .pipe(Effect.result);

      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.strictEqual(result.failure._tag, "InvalidTimeoutOrder");
      }
      assert.strictEqual(yield* Ref.get(harness.workspaceCalls), 0);
      assert.strictEqual(yield* Ref.get(harness.invocationCalls), 0);
      assert.strictEqual((yield* Ref.get(harness.notifications)).length, 1);
    }),
  );
});
