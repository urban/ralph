import * as BunServices from "@effect/platform-bun/BunServices";
import { expect, layer } from "@effect/vitest";
import { Cause, Effect, Exit, FileSystem, Layer, Option } from "effect";
import { join } from "node:path";

import type { SharedFlagsInput } from "../domain/Ralph";
import { RalphWorkspace } from "./RalphWorkspace";

const workspaceLayer = RalphWorkspace.layer.pipe(Layer.provideMerge(BunServices.layer));

const makeTempDirectory = Effect.fn("RalphWorkspace.test.makeTempDirectory")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({ prefix: "ralph-workspace-" });
});

const withWorkingDirectory = <A, E, R>(directory: string, self: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const originalCwd = process.cwd();
      process.chdir(directory);
      return originalCwd;
    }),
    () => self,
    (originalCwd) =>
      Effect.sync(() => {
        process.chdir(originalCwd);
      }),
  );

const makeSharedFlags = (overrides: Partial<SharedFlagsInput> = {}): SharedFlagsInput => ({
  checklist: Option.none(),
  instructions: Option.none(),
  progress: Option.none(),
  ralphDir: Option.none(),
  cwd: Option.none(),
  yolo: false,
  ...overrides,
});

const expectFailureMessage = (result: Exit.Exit<unknown, unknown>, message: string) => {
  expect(Exit.isFailure(result)).toBe(true);

  if (!Exit.isFailure(result)) {
    return;
  }

  const error = Cause.findErrorOption(result.cause);
  expect(Option.isSome(error)).toBe(true);

  if (Option.isSome(error)) {
    expect(error.value).toHaveProperty("message", message);
    expect(error.value).toHaveProperty("exitCode", 1);
  }
};

layer(workspaceLayer)("RalphWorkspace", (it) => {
  it.effect("init writes Ralph files into the launch directory", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDirectory = yield* makeTempDirectory();

      yield* withWorkingDirectory(tempDirectory, workspace.init(Option.none()));

      const checklist = yield* fileSystem.readFileString(join(tempDirectory, "CHECKLIST.md"));
      const instructions = yield* fileSystem.readFileString(join(tempDirectory, "INSTRUCTIONS.md"));
      const progress = yield* fileSystem.readFileString(join(tempDirectory, "PROGRESS.md"));

      expect(checklist.length).toBeGreaterThan(0);
      expect(instructions.length).toBeGreaterThan(0);
      expect(progress.length).toBeGreaterThan(0);
    }),
  );

  it.effect("init creates backups before overwrite", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDirectory = yield* makeTempDirectory();
      const projectDirectory = join(tempDirectory, "project");

      yield* fileSystem.makeDirectory(projectDirectory, { recursive: true });
      yield* fileSystem.writeFileString(join(projectDirectory, "CHECKLIST.md"), "old checklist\n");
      yield* fileSystem.writeFileString(
        join(projectDirectory, "INSTRUCTIONS.md"),
        "old instructions\n",
      );
      yield* fileSystem.writeFileString(join(projectDirectory, "PROGRESS.md"), "old progress\n");

      yield* withWorkingDirectory(tempDirectory, workspace.init(Option.some("./project")));

      const files = yield* fileSystem.readDirectory(projectDirectory);
      const checklistBackup = files.find((fileName) => fileName.startsWith("CHECKLIST.md.bak."));
      const instructionsBackup = files.find((fileName) =>
        fileName.startsWith("INSTRUCTIONS.md.bak."),
      );
      const progressBackup = files.find((fileName) => fileName.startsWith("PROGRESS.md.bak."));

      expect(checklistBackup).toBeDefined();
      expect(instructionsBackup).toBeDefined();
      expect(progressBackup).toBeDefined();

      if (
        checklistBackup === undefined ||
        instructionsBackup === undefined ||
        progressBackup === undefined
      ) {
        return;
      }

      expect(yield* fileSystem.readFileString(join(projectDirectory, checklistBackup))).toBe(
        "old checklist\n",
      );
      expect(yield* fileSystem.readFileString(join(projectDirectory, instructionsBackup))).toBe(
        "old instructions\n",
      );
      expect(yield* fileSystem.readFileString(join(projectDirectory, progressBackup))).toBe(
        "old progress\n",
      );
    }),
  );

  it.effect("init rejects file targets", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDirectory = yield* makeTempDirectory();
      const targetFile = join(tempDirectory, "not-a-directory");

      yield* fileSystem.writeFileString(targetFile, "nope\n");

      const result = yield* withWorkingDirectory(
        tempDirectory,
        workspace.init(Option.some("./not-a-directory")).pipe(Effect.exit),
      );
      const resolvedTargetFile = yield* fileSystem.realPath(targetFile);

      expectFailureMessage(result, `Init target is a file: ${resolvedTargetFile}`);
    }),
  );

  it.effect("prepareRunContext uses --ralph-dir with per-file overrides and --cwd", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDirectory = yield* makeTempDirectory();
      const ralphDirectory = join(tempDirectory, ".ralph");
      const projectDirectory = join(tempDirectory, "project");
      const customInstructions = join(tempDirectory, "custom-instructions.md");

      yield* fileSystem.makeDirectory(ralphDirectory, { recursive: true });
      yield* fileSystem.makeDirectory(projectDirectory, { recursive: true });
      yield* fileSystem.writeFileString(join(ralphDirectory, "CHECKLIST.md"), "checklist\n");
      yield* fileSystem.writeFileString(join(ralphDirectory, "INSTRUCTIONS.md"), "instructions\n");
      yield* fileSystem.writeFileString(join(ralphDirectory, "PROGRESS.md"), "progress\n");
      yield* fileSystem.writeFileString(customInstructions, "custom instructions\n");

      const context = yield* withWorkingDirectory(
        tempDirectory,
        workspace.prepareRunContext(
          makeSharedFlags({
            instructions: Option.some("./custom-instructions.md"),
            ralphDir: Option.some("./.ralph"),
            cwd: Option.some("./project"),
          }),
        ),
      );

      const resolvedRalphDirectory = yield* fileSystem.realPath(ralphDirectory);
      const resolvedProjectDirectory = yield* fileSystem.realPath(projectDirectory);
      const resolvedCustomInstructions = yield* fileSystem.realPath(customInstructions);

      expect(context.checklistPath).toBe(join(resolvedRalphDirectory, "CHECKLIST.md"));
      expect(context.instructionsPath).toBe(resolvedCustomInstructions);
      expect(context.progressPath).toBe(join(resolvedRalphDirectory, "PROGRESS.md"));
      expect(context.workingDirectory).toBe(resolvedProjectDirectory);
    }),
  );

  it.effect("prepareRunContext fails closed when runtime inputs are missing", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const tempDirectory = yield* makeTempDirectory();

      const result = yield* withWorkingDirectory(
        tempDirectory,
        workspace.prepareRunContext(makeSharedFlags()).pipe(Effect.exit),
      );

      expectFailureMessage(
        result,
        "Missing Ralph runtime inputs: --checklist, --instructions, --progress. Pass --ralph-dir or all of --checklist, --instructions, and --progress.",
      );
    }),
  );
});
