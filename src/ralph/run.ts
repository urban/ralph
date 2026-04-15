import { Console, Context, Effect, FileSystem, Layer, Option, Path } from "effect";

import { CodexRunner } from "./codex";
import type { LoopFlagsInput, SharedFlagsInput } from "./domain";
import type { RalphExit } from "./errors";
import { failWithMessage } from "./errors";
import { HostTools } from "./system";

export class RalphRunner extends Context.Service<
  RalphRunner,
  {
    runOnce(input: SharedFlagsInput): Effect.Effect<void, RalphExit>;
    runLoop(input: LoopFlagsInput): Effect.Effect<void, RalphExit>;
  }
>()("ralph-effect/ralph/RalphRunner") {
  static readonly layerNoDeps = Layer.effect(
    RalphRunner,
    Effect.gen(function* () {
      const codexRunner = yield* CodexRunner;
      const fileSystem = yield* FileSystem.FileSystem;
      const hostTools = yield* HostTools;
      const path = yield* Path.Path;

      const resolveBundledInputFiles = Effect.fn("RalphRunner.resolveBundledInputFiles")(
        function* () {
          const sourcePath = yield* path
            .fromFileUrl(new URL(import.meta.url))
            .pipe(Effect.catch(() => failWithMessage("Could not resolve Ralph repository root.")));
          const repoDirectory = path.dirname(path.dirname(path.dirname(sourcePath)));

          return {
            checklist: path.join(repoDirectory, "CHECKLIST.md"),
            instructions: path.join(repoDirectory, "INSTRUCTIONS.md"),
            progress: path.join(repoDirectory, "PROGRESS.md"),
          };
        },
      );

      const resolveInputFilePath = (rawPath: Option.Option<string>, defaultPath: string) =>
        Option.match(rawPath, {
          onNone: () => defaultPath,
          onSome: (value) => (path.isAbsolute(value) ? value : path.resolve(value)),
        });

      const ensureRegularFile = Effect.fn("RalphRunner.ensureRegularFile")(function* (
        filePath: string,
        fileLabel: string,
      ) {
        const info = yield* fileSystem
          .stat(filePath)
          .pipe(Effect.catch(() => failWithMessage(`${fileLabel} not found: ${filePath}`)));

        if (info.type !== "File") {
          return yield* failWithMessage(`${fileLabel} not found: ${filePath}`);
        }
      });

      const prepareRunContext = Effect.fn("RalphRunner.prepareRunContext")(function* (
        input: SharedFlagsInput,
      ) {
        yield* hostTools.ensureCommandAvailable("codex", "Codex CLI");

        const bundledFiles = yield* resolveBundledInputFiles();
        const checklistPath = resolveInputFilePath(input.checklist, bundledFiles.checklist);
        const instructionsPath = resolveInputFilePath(
          input.instructions,
          bundledFiles.instructions,
        );
        const progressPath = resolveInputFilePath(input.progress, bundledFiles.progress);

        yield* ensureRegularFile(checklistPath, "Checklist file");
        yield* ensureRegularFile(instructionsPath, "Instructions file");
        yield* ensureRegularFile(progressPath, "Progress file");

        return {
          workingDirectory: path.resolve("."),
          checklistPath,
          instructionsPath,
          progressPath,
          yolo: input.yolo,
        };
      });

      const runOnce = Effect.fn("RalphRunner.runOnce")(function* (input: SharedFlagsInput) {
        const runContext = yield* prepareRunContext(input);
        yield* codexRunner.run(runContext);
      });

      const runLoop = Effect.fn("RalphRunner.runLoop")(function* (input: LoopFlagsInput) {
        const runContext = yield* prepareRunContext(input);

        for (let iteration = 1; iteration <= input.iterations; iteration += 1) {
          yield* Console.log(`Iteration ${iteration}`);
          yield* Console.log("--------------------------------");

          const output = yield* codexRunner.runCapture(runContext);
          yield* Console.log(output);

          if (codexRunner.isChecklistComplete(output)) {
            yield* Console.log("Checklist complete, exiting.");
            yield* hostTools.notifyIfAvailable(`Checklist complete after ${iteration} iterations`);
            return;
          }
        }

        yield* hostTools.notifyIfAvailable(
          `Checklist not complete after ${input.iterations} iterations`,
        );
        return yield* failWithMessage(
          `Checklist not complete after ${input.iterations} iterations.`,
        );
      });

      return RalphRunner.of({
        runOnce,
        runLoop,
      });
    }),
  );

  static readonly layer = this.layerNoDeps.pipe(
    Layer.provideMerge(CodexRunner.layer),
    Layer.provideMerge(HostTools.layer),
  );
}
