import * as BunServices from "@effect/platform-bun/BunServices";
import { assert, layer } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Ref, Result, Schema, Sink, Stdio, Stream } from "effect";
import { Command } from "effect/unstable/cli";

import {
  CodexExitError,
  type CodexInvocationError,
  type InvocationOutcome,
  type InvocationRequest,
} from "../domain/WorkInvocation";
import { RalphExit } from "../errors/RalphExit";
import { CodexRunner } from "../services/CodexRunner";
import { HostTools } from "../services/HostTools";
import { RalphRunner } from "../services/RalphRunner";
import { RalphWorkspace } from "../services/RalphWorkspace";
import { commandLoop } from "./loop";

const runLoop = Command.runWith(commandLoop, { version: "test" });
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const invocationOutcome = (workflowComplete: boolean): InvocationOutcome => ({
  invocationComplete: true,
  workflowComplete,
});

const makeHarness = Effect.fnUntraced(function* <E extends CodexInvocationError>(
  invoke: (request: InvocationRequest) => Effect.Effect<InvocationOutcome, E>,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const invocations = yield* Ref.make<Array<string>>([]);
  const notifications = yield* Ref.make<Array<string>>([]);
  const output = yield* Ref.make<Array<Uint8Array>>([]);
  const toBytes = (chunk: string | Uint8Array) =>
    typeof chunk === "string" ? encoder.encode(chunk) : chunk;
  const readInstructions = (request: InvocationRequest) =>
    fileSystem
      .readFileString(request.instructionsPath)
      .pipe(Effect.catch(() => Effect.die("Could not read fake Codex instructions")));
  const codexRunner = CodexRunner.of({
    runInvocation: (request) =>
      readInstructions(request).pipe(
        Effect.flatMap((instructions) =>
          Ref.update(invocations, (prompts) => [...prompts, instructions]),
        ),
        Effect.andThen(invoke(request)),
      ),
  });
  const hostTools = HostTools.of({
    notifyIfAvailable: (message) => Ref.update(notifications, (messages) => [...messages, message]),
  });
  const stdio = Stdio.make({
    args: Effect.succeed([]),
    stdin: Stream.empty,
    stdout: () =>
      Sink.forEach((chunk: string | Uint8Array) =>
        Ref.update(output, (chunks) => [...chunks, toBytes(chunk)]),
      ),
    stderr: () => Sink.drain,
  });
  const dependencies = Layer.mergeAll(
    Layer.succeed(CodexRunner, codexRunner),
    Layer.succeed(HostTools, hostTools),
    Layer.succeed(Stdio.Stdio, stdio),
  );
  const orchestrationLayer = RalphRunner.layer.pipe(
    Layer.provideMerge(RalphWorkspace.layer),
    Layer.provideMerge(dependencies),
  );
  const orchestrationContext = yield* Layer.build(orchestrationLayer);
  const run = (args: ReadonlyArray<string>) =>
    runLoop(args).pipe(Effect.provide(orchestrationContext));

  return { invocations, notifications, output, run };
});

const readOutput = Effect.fnUntraced(function* (output: Ref.Ref<Array<Uint8Array>>) {
  return (yield* Ref.get(output)).map((chunk) => decoder.decode(chunk)).join("");
});

const writePhaseFiles = Effect.fnUntraced(function* (
  directory: string,
  prompts: {
    readonly before: string;
    readonly work: string;
    readonly after: string;
  },
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fileSystem.makeDirectory(directory, { recursive: true });
  yield* fileSystem.writeFileString(path.join(directory, "BEFORE_WORK.md"), prompts.before);
  yield* fileSystem.writeFileString(path.join(directory, "WORK.md"), prompts.work);
  yield* fileSystem.writeFileString(path.join(directory, "AFTER_WORK.md"), prompts.after);
});

const assertNonzeroExit = <E>(result: Result.Result<void, E>): void => {
  assert.isTrue(Result.isFailure(result));
  if (Result.isFailure(result)) {
    assert.isTrue(Schema.is(RalphExit)(result.failure));
    if (Schema.is(RalphExit)(result.failure)) {
      assert.strictEqual(result.failure.exitCode, 1);
    }
  }
};

layer(BunServices.layer)("loop phase workflow", (it) => {
  it.effect("advances checklist state across fresh phase snapshots until completion", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "ralph-loop-state-" });
      const phaseDirectory = path.join(workspace, ".ralph");
      const checklistPath = path.join(workspace, "CHECKLIST.md");
      const progressPath = path.join(workspace, "PROGRESS.md");
      const stateObservedByAfter = yield* Ref.make<Array<string>>([]);

      yield* writePhaseFiles(phaseDirectory, {
        before: "Before v1.\n",
        work: "Work v1.\n",
        after: "After v1.\n",
      });
      yield* fileSystem.writeFileString(checklistPath, "- [ ] alpha\n- [ ] beta\n");
      yield* fileSystem.writeFileString(progressPath, "");
      const readInstructions = (request: InvocationRequest) =>
        fileSystem
          .readFileString(request.instructionsPath)
          .pipe(Effect.catch(() => Effect.die("Could not read fake Codex instructions")));

      const invoke = Effect.fnUntraced(
        function* (request: InvocationRequest) {
          const instructions = yield* readInstructions(request);

          switch (instructions) {
            case "Before v1.\n":
              yield* fileSystem.writeFileString(
                path.join(phaseDirectory, "BEFORE_WORK.md"),
                "Before v2.\n",
              );
              yield* fileSystem.writeFileString(path.join(phaseDirectory, "WORK.md"), "Work v2.\n");
              yield* fileSystem.writeFileString(
                path.join(phaseDirectory, "AFTER_WORK.md"),
                "After v2.\n",
              );
              return invocationOutcome(false);
            case "Work v1.\n":
              yield* fileSystem.writeFileString(checklistPath, "- [x] alpha\n- [ ] beta\n");
              yield* fileSystem.writeFileString(progressPath, "completed alpha\n");
              return invocationOutcome(false);
            case "After v1.\n": {
              const checklist = yield* fileSystem.readFileString(checklistPath);
              const progress = yield* fileSystem.readFileString(progressPath);
              yield* Ref.update(stateObservedByAfter, (states) => [
                ...states,
                `${checklist}|${progress}`,
              ]);
              return invocationOutcome(false);
            }
            case "Before v2.\n":
              return invocationOutcome(false);
            case "Work v2.\n":
              yield* fileSystem.writeFileString(checklistPath, "- [x] alpha\n- [x] beta\n");
              yield* fileSystem.writeFileString(progressPath, "completed alpha\ncompleted beta\n");
              return invocationOutcome(false);
            case "After v2.\n": {
              const checklist = yield* fileSystem.readFileString(checklistPath);
              const progress = yield* fileSystem.readFileString(progressPath);
              yield* Ref.update(stateObservedByAfter, (states) => [
                ...states,
                `${checklist}|${progress}`,
              ]);
              return invocationOutcome(true);
            }
            default:
              return yield* Effect.die(`Unexpected prompt: ${instructions}`);
          }
        },
        Effect.catch(() => Effect.die("Could not advance loop workflow fixtures")),
      );
      const harness = yield* makeHarness(invoke);

      yield* harness.run(["--cwd", workspace, "--ralph-dir", "./.ralph"]);

      assert.deepStrictEqual(yield* Ref.get(harness.invocations), [
        "Before v1.\n",
        "Work v1.\n",
        "After v1.\n",
        "Before v2.\n",
        "Work v2.\n",
        "After v2.\n",
      ]);
      assert.deepStrictEqual(yield* Ref.get(stateObservedByAfter), [
        "- [x] alpha\n- [ ] beta\n|completed alpha\n",
        "- [x] alpha\n- [x] beta\n|completed alpha\ncompleted beta\n",
      ]);
      assert.strictEqual(
        yield* fileSystem.readFileString(checklistPath),
        "- [x] alpha\n- [x] beta\n",
      );
      assert.deepStrictEqual(yield* Ref.get(harness.notifications), [
        "Ralph loop succeeded: workflow complete after 2 iterations.",
      ]);
      assert.deepStrictEqual(
        (yield* fileSystem.readDirectory(workspace)).filter((name) =>
          name.startsWith(".ralph-snapshot-"),
        ),
        [],
      );
      assert.deepStrictEqual((yield* readOutput(harness.output)).match(/=== Iteration \d+ ===/g), [
        "=== Iteration 1 ===",
        "=== Iteration 2 ===",
      ]);
    }),
  );

  it.effect("honors completion from every phase through the public command", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspace = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "ralph-loop-complete-",
      });
      const phaseDirectory = path.join(workspace, ".ralph");
      yield* writePhaseFiles(phaseDirectory, {
        before: "Prepare.\n",
        work: "Work.\n",
        after: "Verify.\n",
      });
      const readInstructions = (request: InvocationRequest) =>
        fileSystem
          .readFileString(request.instructionsPath)
          .pipe(Effect.catch(() => Effect.die("Could not read fake Codex instructions")));
      const scenarios: ReadonlyArray<{
        readonly completingPrompt: string;
        readonly expectedPrompts: ReadonlyArray<string>;
      }> = [
        { completingPrompt: "Prepare.\n", expectedPrompts: ["Prepare.\n"] },
        { completingPrompt: "Work.\n", expectedPrompts: ["Prepare.\n", "Work.\n"] },
        {
          completingPrompt: "Verify.\n",
          expectedPrompts: ["Prepare.\n", "Work.\n", "Verify.\n"],
        },
      ];

      yield* Effect.forEach(
        scenarios,
        (scenario) =>
          Effect.gen(function* () {
            const harness = yield* makeHarness((request) =>
              readInstructions(request).pipe(
                Effect.map((instructions) =>
                  invocationOutcome(instructions === scenario.completingPrompt),
                ),
              ),
            );

            yield* harness.run([
              "--cwd",
              workspace,
              "--ralph-dir",
              "./.ralph",
              "--iterations",
              "3",
            ]);

            assert.deepStrictEqual(yield* Ref.get(harness.invocations), scenario.expectedPrompts);
            assert.deepStrictEqual(yield* Ref.get(harness.notifications), [
              "Ralph loop succeeded: workflow complete after 1 iteration.",
            ]);
          }),
        { discard: true },
      );
    }),
  );

  it.effect("uses default and explicit limits and reports typed nonzero exhaustion", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspace = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "ralph-loop-limits-",
      });
      yield* fileSystem.writeFileString(path.join(workspace, "WORK.md"), "Keep working.\n");
      const scenarios: ReadonlyArray<{
        readonly args: ReadonlyArray<string>;
        readonly expectedIterations: number;
      }> = [
        {
          args: ["--cwd", workspace, "--work", "./WORK.md"],
          expectedIterations: 10,
        },
        {
          args: ["--cwd", workspace, "--work", "./WORK.md", "-n", "2"],
          expectedIterations: 2,
        },
      ];

      yield* Effect.forEach(
        scenarios,
        (scenario) =>
          Effect.gen(function* () {
            const harness = yield* makeHarness(() => Effect.succeed(invocationOutcome(false)));
            const result = yield* harness.run(scenario.args).pipe(Effect.result);

            assertNonzeroExit(result);
            assert.strictEqual(
              (yield* Ref.get(harness.invocations)).length,
              scenario.expectedIterations,
            );
            assert.deepStrictEqual(yield* Ref.get(harness.notifications), [
              `Ralph loop failed: Ralph loop exhausted after ${scenario.expectedIterations} iterations without workflow completion.`,
            ]);
          }),
        { discard: true },
      );
    }),
  );

  it.effect("stops after a phase failure and notifies exactly once", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "ralph-loop-fail-" });
      const phaseDirectory = path.join(workspace, ".ralph");
      yield* writePhaseFiles(phaseDirectory, {
        before: "Prepare.\n",
        work: "Work.\n",
        after: "Verify.\n",
      });
      const readInstructions = (request: InvocationRequest) =>
        fileSystem
          .readFileString(request.instructionsPath)
          .pipe(Effect.catch(() => Effect.die("Could not read fake Codex instructions")));
      const harness = yield* makeHarness((request) =>
        readInstructions(request).pipe(
          Effect.flatMap((instructions) =>
            instructions === "Work.\n"
              ? Effect.fail(new CodexExitError({ exitCode: 17, message: "work failed" }))
              : Effect.succeed(invocationOutcome(false)),
          ),
        ),
      );

      const result = yield* harness
        .run(["--cwd", workspace, "--ralph-dir", "./.ralph", "-n", "3"])
        .pipe(Effect.result);

      assertNonzeroExit(result);
      assert.deepStrictEqual(yield* Ref.get(harness.invocations), ["Prepare.\n", "Work.\n"]);
      assert.deepStrictEqual(yield* Ref.get(harness.notifications), [
        "Ralph loop failed: work failed",
      ]);
    }),
  );
});
