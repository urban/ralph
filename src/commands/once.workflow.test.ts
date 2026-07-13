import * as BunServices from "@effect/platform-bun/BunServices";
import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Ref, Result, Sink, Stdio, Stream } from "effect";
import { join } from "node:path";
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
  const invocations = yield* Ref.make<Array<string>>([]);
  const notifications = yield* Ref.make<Array<string>>([]);
  const output = yield* Ref.make<Array<Uint8Array>>([]);
  const toBytes = (chunk: string | Uint8Array) =>
    typeof chunk === "string" ? encoder.encode(chunk) : chunk;
  const codexRunner = CodexRunner.of({
    runInvocation: (request) =>
      Ref.update(invocations, (prompts) => [...prompts, request.prompt]).pipe(
        Effect.andThen(invoke(request)),
      ),
  });
  const hostTools = HostTools.of({
    commandExists: () => Effect.succeed(true),
    ensureCommandAvailable: () => Effect.void,
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
  const orchestrationLayer = RalphRunner.layer.pipe(Layer.provideMerge(RalphWorkspace.layer));
  const run = (args: ReadonlyArray<string>) =>
    runOnce(args).pipe(
      Effect.provide(orchestrationLayer),
      Effect.provideService(CodexRunner, codexRunner),
      Effect.provideService(HostTools, hostTools),
      Effect.provideService(Stdio.Stdio, stdio),
    );

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
  yield* fileSystem.makeDirectory(directory, { recursive: true });
  yield* fileSystem.writeFileString(join(directory, "BEFORE_WORK.md"), prompts.before);
  yield* fileSystem.writeFileString(join(directory, "WORK.md"), prompts.work);
  yield* fileSystem.writeFileString(join(directory, "AFTER_WORK.md"), prompts.after);
});

describe("once three-phase workflow", () => {
  it.effect("runs explicit sources in order with precedence and snapshot isolation", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const workspace = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "ralph-once-explicit-",
      });
      const directorySources = join(workspace, ".ralph");
      const explicitSources = join(workspace, "explicit");

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
      const harness = yield* makeHarness((request) =>
        request.prompt === "Explicit before.\n"
          ? fileSystem
              .writeFileString(join(explicitSources, "WORK.md"), "Explicit work v2.\n")
              .pipe(
                Effect.andThen(
                  fileSystem.writeFileString(
                    join(explicitSources, "AFTER_WORK.md"),
                    "Explicit after v2.\n",
                  ),
                ),
                Effect.andThen(invocationComplete()),
                Effect.catch(() => Effect.die("Could not mutate phase fixtures")),
              )
          : invocationComplete(),
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
      assert.deepStrictEqual(yield* Ref.get(harness.notifications), [
        "Ralph once succeeded: invocation complete.",
        "Ralph once succeeded: invocation complete.",
      ]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect("runs directory phases equivalently and reports optional skips", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "ralph-once-dir-" });
      const phaseDirectory = join(workspace, ".ralph");

      yield* writePhaseFiles(phaseDirectory, {
        before: "Prepare.\n",
        work: "Work.\n",
        after: "Verify.\n",
      });
      const harness = yield* makeHarness(() => invocationComplete());
      const args = ["--cwd", workspace, "--ralph-dir", "./.ralph"];

      yield* harness.run(args);
      yield* fileSystem.remove(join(phaseDirectory, "BEFORE_WORK.md"));
      yield* fileSystem.writeFileString(join(phaseDirectory, "AFTER_WORK.md"), " \n");
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
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect("short-circuits composed completion and failure outcomes", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "ralph-once-stop-" });
      const phaseDirectory = join(workspace, ".ralph");

      yield* writePhaseFiles(phaseDirectory, {
        before: "Prepare.\n",
        work: "Work.\n",
        after: "Verify.\n",
      });
      const completionHarness = yield* makeHarness((request) =>
        Effect.succeed({
          invocationComplete: true,
          workflowComplete: request.prompt === "Prepare.\n",
        }),
      );
      const failureHarness = yield* makeHarness((request) =>
        request.prompt === "Work.\n"
          ? Effect.fail(new CodexExitError({ exitCode: 17, message: "work failed" }))
          : invocationComplete(),
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
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
