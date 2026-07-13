import { assert, describe, it } from "@effect/vitest";
import { Duration, Effect, Option, Ref, Result, Sink, Stdio, Stream } from "effect";

import {
  AbsoluteInvocationTimeout,
  CodexExitError,
  type CodexInvocationError,
  IdleInvocationTimeout,
  type InvocationOutcome,
  type InvocationRequest,
  type IterationSnapshot,
  IterationLimit,
  type LoopFlagsInput,
  MissingInvocationMarker,
  type OnceFlagsInput,
  type PreparedWorkflow,
} from "../domain/WorkInvocation";
import { CodexRunner } from "./CodexRunner";
import { HostTools } from "./HostTools";
import { RalphRunner } from "./RalphRunner";
import { RalphWorkspace } from "./RalphWorkspace";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const input = (overrides: Partial<OnceFlagsInput> = {}): OnceFlagsInput => ({
  before: Option.none(),
  work: Option.some("./WORK.md"),
  after: Option.none(),
  ralphDir: Option.none(),
  cwd: Option.none(),
  idleTimeout: "5m",
  invocationTimeout: "30m",
  yolo: false,
  ...overrides,
});

const loopInput = (overrides: Partial<LoopFlagsInput> = {}): LoopFlagsInput => ({
  ...input(),
  iterations: IterationLimit.make(3),
  ...overrides,
});

const prepared: PreparedWorkflow = {
  workingDirectory: "/workspace",
  sources: {
    before: Option.none(),
    work: { origin: "Explicit", role: "Work", path: "/workspace/WORK.md" },
    after: Option.none(),
  },
  timeouts: { idle: Duration.minutes(5), invocation: Duration.minutes(30) },
  yolo: false,
};

const defaultSnapshot: IterationSnapshot = {
  before: { _tag: "Skipped", role: "BeforeWork", reason: "Missing" },
  work: { _tag: "Ready", role: "Work", prompt: "Do one thing." },
  after: { _tag: "Skipped", role: "AfterWork", reason: "Missing" },
};

const explicitThreePhaseSnapshot: IterationSnapshot = {
  before: { _tag: "Ready", role: "BeforeWork", prompt: "Prepare the work." },
  work: { _tag: "Ready", role: "Work", prompt: "Do the work." },
  after: { _tag: "Ready", role: "AfterWork", prompt: "Verify the work." },
};

const makeHarness = Effect.fnUntraced(function* <E extends CodexInvocationError>(
  invocation: (
    request: InvocationRequest,
  ) => Effect.Effect<{ readonly invocationComplete: true; readonly workflowComplete: boolean }, E>,
  options: {
    readonly notificationDefects?: boolean;
    readonly snapshot?: IterationSnapshot;
    readonly snapshotForCall?: (call: number) => IterationSnapshot;
  } = {},
) {
  const output = yield* Ref.make<Array<Uint8Array>>([]);
  const notifications = yield* Ref.make<Array<string>>([]);
  const workspaceCalls = yield* Ref.make(0);
  const snapshotCalls = yield* Ref.make(0);
  const invocationCalls = yield* Ref.make<Array<string>>([]);
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
    runInvocation: (request) =>
      Ref.update(invocationCalls, (prompts) => [...prompts, request.prompt]).pipe(
        Effect.andThen(invocation(request)),
      ),
    run: () => Effect.die("legacy run is not part of once"),
    runCapture: () => Effect.die("legacy capture is not part of once"),
    isChecklistComplete: () => false,
  });
  const workspace = RalphWorkspace.of({
    init: () => Effect.die("init is not part of once"),
    prepareRunContext: () => Effect.die("legacy runtime is not part of once"),
    prepareWorkflow: () =>
      Ref.update(workspaceCalls, (count) => count + 1).pipe(Effect.as(prepared)),
    snapshotIteration: () =>
      Ref.modify(snapshotCalls, (call) => [
        options.snapshotForCall === undefined
          ? (options.snapshot ?? defaultSnapshot)
          : options.snapshotForCall(call),
        call + 1,
      ]),
  });
  const hostTools = HostTools.of({
    commandExists: () => Effect.succeed(true),
    ensureCommandAvailable: () => Ref.update(codexChecks, (count) => count + 1),
    notifyIfAvailable: (message) =>
      Ref.update(notifications, (messages) => [...messages, message]).pipe(
        Effect.andThen(
          options.notificationDefects === true
            ? Effect.die("notification unavailable")
            : Effect.void,
        ),
      ),
  });
  const provideRunner = <A, E>(effect: Effect.Effect<A, E, RalphRunner>) =>
    effect.pipe(
      Effect.provide(RalphRunner.layer),
      Effect.provideService(CodexRunner, codexRunner),
      Effect.provideService(RalphWorkspace, workspace),
      Effect.provideService(HostTools, hostTools),
      Effect.provideService(Stdio.Stdio, stdio),
    );
  const run = (onceInput: OnceFlagsInput) =>
    Effect.gen(function* () {
      const runner = yield* RalphRunner;
      return yield* runner.runOnce(onceInput);
    }).pipe(provideRunner);
  const runLoop = (loop: LoopFlagsInput) =>
    Effect.gen(function* () {
      const runner = yield* RalphRunner;
      return yield* runner.runLoop(loop);
    }).pipe(provideRunner);

  return {
    codexChecks,
    invocationCalls,
    notifications,
    output,
    run,
    runLoop,
    snapshotCalls,
    workspaceCalls,
  };
});

const readOutput = Effect.fnUntraced(function* (output: Ref.Ref<Array<Uint8Array>>) {
  return (yield* Ref.get(output)).map((chunk) => decoder.decode(chunk)).join("");
});

const invocationComplete = (): Effect.Effect<InvocationOutcome> =>
  Effect.succeed({ invocationComplete: true, workflowComplete: false });

describe("RalphRunner.runOnce", () => {
  it.effect("runs every ready phase in before, work, after order", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness(invocationComplete, {
        snapshot: explicitThreePhaseSnapshot,
      });

      yield* harness.run(input());

      assert.deepStrictEqual(yield* Ref.get(harness.invocationCalls), [
        "Prepare the work.",
        "Do the work.",
        "Verify the work.",
      ]);
      assert.strictEqual(
        yield* readOutput(harness.output),
        "=== Before work ===\n" +
          "--- Before work invocation complete in 0 ---\n" +
          "=== Work ===\n" +
          "--- Work invocation complete in 0 ---\n" +
          "=== After work ===\n" +
          "--- After work invocation complete in 0 ---\n",
      );
      assert.deepStrictEqual(yield* Ref.get(harness.notifications), [
        "Ralph once succeeded: invocation complete.",
      ]);
      assert.strictEqual(yield* Ref.get(harness.codexChecks), 1);
    }),
  );

  it.effect("keeps non-phase coordination state live between invocations", () =>
    Effect.gen(function* () {
      const sharedState = yield* Ref.make("initial");
      const observedByWork = yield* Ref.make<Array<string>>([]);
      const harness = yield* makeHarness(
        (request) => {
          const coordinate =
            request.prompt === "Prepare the work."
              ? Ref.set(sharedState, "prepared")
              : request.prompt === "Do the work."
                ? Ref.get(sharedState).pipe(
                    Effect.flatMap((value) =>
                      Ref.update(observedByWork, (observed) => [...observed, value]),
                    ),
                  )
                : Effect.void;
          return coordinate.pipe(Effect.andThen(invocationComplete()));
        },
        { snapshot: explicitThreePhaseSnapshot },
      );

      yield* harness.run(input());

      assert.deepStrictEqual(yield* Ref.get(observedByWork), ["prepared"]);
    }),
  );

  it.effect("does not invoke skipped optional phases", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness(invocationComplete, {
        snapshot: {
          before: { _tag: "Skipped", role: "BeforeWork", reason: "Blank" },
          work: defaultSnapshot.work,
          after: { _tag: "Skipped", role: "AfterWork", reason: "Missing" },
        },
      });

      yield* harness.run(input());

      assert.deepStrictEqual(yield* Ref.get(harness.invocationCalls), ["Do one thing."]);
      assert.strictEqual(
        yield* readOutput(harness.output),
        "--- Before work phase skipped (blank) ---\n" +
          "=== Work ===\n" +
          "--- Work invocation complete in 0 ---\n" +
          "--- After work phase skipped (missing) ---\n",
      );
    }),
  );

  it.effect("stops successfully when any phase completes the workflow", () =>
    Effect.gen(function* () {
      const scenarios: ReadonlyArray<{
        readonly completingPrompt: string;
        readonly expectedPrompts: ReadonlyArray<string>;
      }> = [
        {
          completingPrompt: "Prepare the work.",
          expectedPrompts: ["Prepare the work."],
        },
        {
          completingPrompt: "Do the work.",
          expectedPrompts: ["Prepare the work.", "Do the work."],
        },
        {
          completingPrompt: "Verify the work.",
          expectedPrompts: ["Prepare the work.", "Do the work.", "Verify the work."],
        },
      ];

      yield* Effect.forEach(
        scenarios,
        (scenario) =>
          Effect.gen(function* () {
            const harness = yield* makeHarness(
              (request) =>
                Effect.succeed({
                  invocationComplete: true,
                  workflowComplete: request.prompt === scenario.completingPrompt,
                }),
              { snapshot: explicitThreePhaseSnapshot },
            );

            yield* harness.run(input());

            assert.deepStrictEqual(
              yield* Ref.get(harness.invocationCalls),
              scenario.expectedPrompts,
            );
            assert.deepStrictEqual(yield* Ref.get(harness.notifications), [
              "Ralph once succeeded: workflow complete.",
            ]);
          }),
        { discard: true },
      );
    }),
  );

  it.effect("prevents later phases after a phase failure", () =>
    Effect.gen(function* () {
      const failure = new CodexExitError({ exitCode: 17, message: "work failed" });
      const harness = yield* makeHarness(
        (request) =>
          request.prompt === "Do the work." ? Effect.fail(failure) : invocationComplete(),
        { snapshot: explicitThreePhaseSnapshot },
      );

      const result = yield* harness.run(input()).pipe(Effect.result);

      assert.isTrue(Result.isFailure(result));
      assert.deepStrictEqual(yield* Ref.get(harness.invocationCalls), [
        "Prepare the work.",
        "Do the work.",
      ]);
      assert.notInclude(yield* readOutput(harness.output), "After work");
      assert.deepStrictEqual(yield* Ref.get(harness.notifications), [
        "Ralph once failed: work failed",
      ]);
    }),
  );

  it.effect("succeeds on invocation completion without overall completion", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness(invocationComplete);

      yield* harness.run(input());

      assert.deepStrictEqual(yield* Ref.get(harness.invocationCalls), ["Do one thing."]);
      assert.deepStrictEqual(yield* Ref.get(harness.notifications), [
        "Ralph once succeeded: invocation complete.",
      ]);
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
            const harness = yield* makeHarness(() => Effect.fail(failure));
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
      const successHarness = yield* makeHarness(invocationComplete, {
        notificationDefects: true,
      });
      const failure = new MissingInvocationMarker({ message: "missing marker" });
      const failureHarness = yield* makeHarness(() => Effect.fail(failure), {
        notificationDefects: true,
      });

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
      const harness = yield* makeHarness(invocationComplete);
      const result = yield* harness
        .run(input({ idleTimeout: "30m", invocationTimeout: "5m" }))
        .pipe(Effect.result);

      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.strictEqual(result.failure._tag, "InvalidTimeoutOrder");
      }
      assert.strictEqual(yield* Ref.get(harness.workspaceCalls), 0);
      assert.deepStrictEqual(yield* Ref.get(harness.invocationCalls), []);
      assert.strictEqual((yield* Ref.get(harness.notifications)).length, 1);
    }),
  );
});

describe("RalphRunner.runLoop", () => {
  it.effect(
    "takes a fresh snapshot for each bounded iteration and keeps coordination state live",
    () =>
      Effect.gen(function* () {
        const sharedState = yield* Ref.make("initial");
        const observedByWork = yield* Ref.make<Array<string>>([]);
        const snapshotForCall = (call: number): IterationSnapshot => ({
          before: {
            _tag: "Ready",
            role: "BeforeWork",
            prompt: `Prepare iteration ${call + 1}.`,
          },
          work: {
            _tag: "Ready",
            role: "Work",
            prompt: `Work iteration ${call + 1}.`,
          },
          after: { _tag: "Skipped", role: "AfterWork", reason: "Missing" },
        });
        const harness = yield* makeHarness(
          (request) => {
            const coordinate = request.prompt.startsWith("Prepare")
              ? Ref.set(sharedState, request.prompt)
              : Ref.get(sharedState).pipe(
                  Effect.flatMap((value) =>
                    Ref.update(observedByWork, (observed) => [...observed, value]),
                  ),
                );
            return coordinate.pipe(
              Effect.as({
                invocationComplete: true,
                workflowComplete: request.prompt === "Work iteration 3.",
              }),
            );
          },
          { snapshotForCall },
        );

        yield* harness.runLoop(loopInput());

        assert.strictEqual(yield* Ref.get(harness.snapshotCalls), 3);
        assert.strictEqual(yield* Ref.get(harness.codexChecks), 1);
        assert.deepStrictEqual(yield* Ref.get(harness.invocationCalls), [
          "Prepare iteration 1.",
          "Work iteration 1.",
          "Prepare iteration 2.",
          "Work iteration 2.",
          "Prepare iteration 3.",
          "Work iteration 3.",
        ]);
        assert.deepStrictEqual(yield* Ref.get(observedByWork), [
          "Prepare iteration 1.",
          "Prepare iteration 2.",
          "Prepare iteration 3.",
        ]);
        assert.deepStrictEqual(
          (yield* readOutput(harness.output)).match(/=== Iteration \d+ ===/g),
          ["=== Iteration 1 ===", "=== Iteration 2 ===", "=== Iteration 3 ==="],
        );
        assert.deepStrictEqual(yield* Ref.get(harness.notifications), [
          "Ralph loop succeeded: workflow complete after 3 iterations.",
        ]);
      }),
  );

  it.effect("stops remaining phases and iterations when any phase completes the workflow", () =>
    Effect.gen(function* () {
      const scenarios: ReadonlyArray<{
        readonly completingPrompt: string;
        readonly expectedPrompts: ReadonlyArray<string>;
      }> = [
        {
          completingPrompt: "Prepare the work.",
          expectedPrompts: ["Prepare the work."],
        },
        {
          completingPrompt: "Do the work.",
          expectedPrompts: ["Prepare the work.", "Do the work."],
        },
        {
          completingPrompt: "Verify the work.",
          expectedPrompts: ["Prepare the work.", "Do the work.", "Verify the work."],
        },
      ];

      yield* Effect.forEach(
        scenarios,
        (scenario) =>
          Effect.gen(function* () {
            const harness = yield* makeHarness(
              (request) =>
                Effect.succeed({
                  invocationComplete: true,
                  workflowComplete: request.prompt === scenario.completingPrompt,
                }),
              { snapshot: explicitThreePhaseSnapshot },
            );

            yield* harness.runLoop(loopInput());

            assert.strictEqual(yield* Ref.get(harness.snapshotCalls), 1);
            assert.deepStrictEqual(
              yield* Ref.get(harness.invocationCalls),
              scenario.expectedPrompts,
            );
            assert.deepStrictEqual(yield* Ref.get(harness.notifications), [
              "Ralph loop succeeded: workflow complete after 1 iteration.",
            ]);
          }),
        { discard: true },
      );
    }),
  );

  it.effect("short-circuits all later work when the shared phase sequence fails", () =>
    Effect.gen(function* () {
      const failure = new IdleInvocationTimeout({ message: "idle timeout" });
      const harness = yield* makeHarness(
        (request) =>
          request.prompt === "Do the work." ? Effect.fail(failure) : invocationComplete(),
        { snapshot: explicitThreePhaseSnapshot },
      );

      const result = yield* harness.runLoop(loopInput()).pipe(Effect.result);

      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.strictEqual(result.failure._tag, "IdleInvocationTimeout");
      }
      assert.strictEqual(yield* Ref.get(harness.snapshotCalls), 1);
      assert.deepStrictEqual(yield* Ref.get(harness.invocationCalls), [
        "Prepare the work.",
        "Do the work.",
      ]);
      assert.deepStrictEqual(yield* Ref.get(harness.notifications), [
        "Ralph loop failed: idle timeout",
      ]);
    }),
  );

  it.effect("returns a distinct typed failure when the iteration limit is exhausted", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness(invocationComplete);

      const result = yield* harness.runLoop(loopInput()).pipe(Effect.result);

      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.strictEqual(result.failure._tag, "LoopExhausted");
        if (result.failure._tag === "LoopExhausted") {
          assert.strictEqual(result.failure.iterations, 3);
        }
      }
      assert.strictEqual(yield* Ref.get(harness.snapshotCalls), 3);
      assert.deepStrictEqual(yield* Ref.get(harness.notifications), [
        "Ralph loop failed: Ralph loop exhausted after 3 iterations without workflow completion.",
      ]);
    }),
  );

  it.effect("notifies once when loop input validation fails before execution", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness(invocationComplete);

      const result = yield* harness
        .runLoop(loopInput({ idleTimeout: "30m", invocationTimeout: "5m" }))
        .pipe(Effect.result);

      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.strictEqual(result.failure._tag, "InvalidTimeoutOrder");
      }
      assert.strictEqual(yield* Ref.get(harness.workspaceCalls), 0);
      assert.strictEqual(yield* Ref.get(harness.snapshotCalls), 0);
      assert.deepStrictEqual(yield* Ref.get(harness.invocationCalls), []);
      assert.strictEqual((yield* Ref.get(harness.notifications)).length, 1);
    }),
  );

  it.effect("preserves loop completion and exhaustion when notification defects", () =>
    Effect.gen(function* () {
      const successHarness = yield* makeHarness(
        () => Effect.succeed({ invocationComplete: true, workflowComplete: true }),
        { notificationDefects: true },
      );
      const exhaustedHarness = yield* makeHarness(invocationComplete, {
        notificationDefects: true,
      });

      const success = yield* successHarness.runLoop(loopInput()).pipe(Effect.result);
      const exhausted = yield* exhaustedHarness
        .runLoop(loopInput({ iterations: IterationLimit.make(1) }))
        .pipe(Effect.result);

      assert.isTrue(Result.isSuccess(success));
      assert.isTrue(Result.isFailure(exhausted));
      if (Result.isFailure(exhausted)) {
        assert.strictEqual(exhausted.failure._tag, "LoopExhausted");
      }
      assert.strictEqual((yield* Ref.get(successHarness.notifications)).length, 1);
      assert.strictEqual((yield* Ref.get(exhaustedHarness.notifications)).length, 1);
    }),
  );
});
