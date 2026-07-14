import * as BunServices from "@effect/platform-bun/BunServices";
import { assert, layer } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Ref, Result, Sink, Stdio, Stream } from "effect";
import { Command } from "effect/unstable/cli";

import {
  CodexExitError,
  type CodexInvocationError,
  type InvocationOutcome,
  type InvocationRequest,
} from "../domain/WorkInvocation";
import { CodexRunner } from "../services/CodexRunner";
import { HostTools } from "../services/HostTools";
import { RalphRunner } from "../services/RalphRunner";
import { RalphWorkspace } from "../services/RalphWorkspace";
import { commandOnce } from "./once";

const runOnce = Command.runWith(commandOnce, { version: "test" });
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const invocationComplete = (): Effect.Effect<InvocationOutcome> =>
  Effect.succeed({ invocationComplete: true, workflowComplete: false });

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
    runOnce(args).pipe(Effect.provide(orchestrationContext));

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

layer(BunServices.layer)("once three-phase workflow", (it) => {
  it.effect("runs explicit sources in order with precedence and snapshot isolation", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspace = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "ralph-once-explicit-",
      });
      const directorySources = path.join(workspace, ".ralph");
      const explicitSources = path.join(workspace, "explicit");

      yield* writePhaseFiles(directorySources, {
        before: "Directory before.\n",
        work: "Directory work.\n",
        after: "Directory after.\n",
      });
      yield* writePhaseFiles(explicitSources, {
        before: "Explicit before.\n",
        work: "Explicit work v1.\n",
        after: "Explicit after v1.\n",
      });
      const readInstructions = (request: InvocationRequest) =>
        fileSystem
          .readFileString(request.instructionsPath)
          .pipe(Effect.catch(() => Effect.die("Could not read fake Codex instructions")));
      const harness = yield* makeHarness((request) =>
        readInstructions(request).pipe(
          Effect.flatMap((instructions) =>
            instructions === "Explicit before.\n"
              ? fileSystem
                  .writeFileString(path.join(explicitSources, "WORK.md"), "Explicit work v2.\n")
                  .pipe(
                    Effect.andThen(
                      fileSystem.writeFileString(
                        path.join(explicitSources, "AFTER_WORK.md"),
                        "Explicit after v2.\n",
                      ),
                    ),
                    Effect.andThen(invocationComplete()),
                  )
              : invocationComplete(),
          ),
          Effect.catch(() => Effect.die("Could not mutate phase fixtures")),
        ),
      );
      const args = [
        "--cwd",
        workspace,
        "--ralph-dir",
        "./.ralph",
        "--before",
        "./explicit/BEFORE_WORK.md",
        "--work",
        "./explicit/WORK.md",
        "--after",
        "./explicit/AFTER_WORK.md",
      ];

      yield* harness.run(args);
      yield* harness.run(args);

      assert.deepStrictEqual(yield* Ref.get(harness.invocations), [
        "Explicit before.\n",
        "Explicit work v1.\n",
        "Explicit after v1.\n",
        "Explicit before.\n",
        "Explicit work v2.\n",
        "Explicit after v2.\n",
      ]);
      const output = yield* readOutput(harness.output);
      assert.strictEqual(output.match(/=== Before work ===/g)?.length, 2);
      assert.strictEqual(output.match(/=== Work ===/g)?.length, 2);
      assert.strictEqual(output.match(/=== After work ===/g)?.length, 2);
      assert.deepStrictEqual(
        (yield* fileSystem.readDirectory(workspace)).filter((name) =>
          name.startsWith(".ralph-snapshot-"),
        ),
        [],
      );
      assert.deepStrictEqual(yield* Ref.get(harness.notifications), [
        "Ralph once succeeded: invocation complete.",
        "Ralph once succeeded: invocation complete.",
      ]);
    }),
  );

  it.effect("runs directory phases equivalently and reports optional skips", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "ralph-once-dir-" });
      const phaseDirectory = path.join(workspace, ".ralph");

      yield* writePhaseFiles(phaseDirectory, {
        before: "Prepare.\n",
        work: "Work.\n",
        after: "Verify.\n",
      });
      const harness = yield* makeHarness(() => invocationComplete());
      const args = ["--cwd", workspace, "--ralph-dir", "./.ralph"];

      yield* harness.run(args);
      yield* fileSystem.remove(path.join(phaseDirectory, "BEFORE_WORK.md"));
      yield* fileSystem.writeFileString(path.join(phaseDirectory, "AFTER_WORK.md"), " \n");
      yield* harness.run(args);

      assert.deepStrictEqual(yield* Ref.get(harness.invocations), [
        "Prepare.\n",
        "Work.\n",
        "Verify.\n",
        "Work.\n",
      ]);
      const output = yield* readOutput(harness.output);
      assert.include(output, "--- Before work phase skipped (missing) ---");
      assert.include(output, "--- After work phase skipped (blank) ---");
    }),
  );

  it.effect("short-circuits composed completion and failure outcomes", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "ralph-once-stop-" });
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
      const completionHarness = yield* makeHarness((request) =>
        readInstructions(request).pipe(
          Effect.map((instructions) => ({
            invocationComplete: true,
            workflowComplete: instructions === "Prepare.\n",
          })),
        ),
      );
      const failureHarness = yield* makeHarness((request) =>
        readInstructions(request).pipe(
          Effect.flatMap((instructions) =>
            instructions === "Work.\n"
              ? Effect.fail(new CodexExitError({ exitCode: 17, message: "work failed" }))
              : invocationComplete(),
          ),
        ),
      );
      const args = ["--cwd", workspace, "--ralph-dir", "./.ralph"];

      yield* completionHarness.run(args);
      const failure = yield* failureHarness.run(args).pipe(Effect.result);

      assert.deepStrictEqual(yield* Ref.get(completionHarness.invocations), ["Prepare.\n"]);
      assert.deepStrictEqual(yield* Ref.get(failureHarness.invocations), ["Prepare.\n", "Work.\n"]);
      assert.isTrue(Result.isFailure(failure));
      assert.include(
        yield* readOutput(failureHarness.output),
        "--- Work failed in 0: work failed ---",
      );
      assert.deepStrictEqual(yield* Ref.get(completionHarness.notifications), [
        "Ralph once succeeded: workflow complete.",
      ]);
      assert.deepStrictEqual(yield* Ref.get(failureHarness.notifications), [
        "Ralph once failed: work failed",
      ]);
    }),
  );
});
