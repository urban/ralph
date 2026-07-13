import * as BunServices from "@effect/platform-bun/BunServices";
import { expect, layer } from "@effect/vitest";
import { Cause, Duration, Effect, Exit, FileSystem, Layer, Option } from "effect";
import { join } from "node:path";

import type { SharedFlagsInput } from "../domain/Ralph";
import type { WorkInvocationInput } from "../domain/WorkInvocation";
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

const makeWorkInput = (overrides: Partial<WorkInvocationInput> = {}): WorkInvocationInput => ({
  work: Option.none(),
  ralphDir: Option.none(),
  cwd: Option.none(),
  yolo: false,
  timeouts: {
    idle: Duration.minutes(5),
    invocation: Duration.minutes(30),
  },
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

  it.effect("prepares a contained immutable work snapshot relative to resolved cwd", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDirectory = yield* makeTempDirectory();
      const projectDirectory = join(tempDirectory, "project");
      const workPath = join(projectDirectory, "WORK.md");

      yield* fileSystem.makeDirectory(projectDirectory);
      yield* fileSystem.writeFileString(workPath, "Do the approved work.\n");

      const prepared = yield* withWorkingDirectory(
        tempDirectory,
        workspace.prepareWorkInvocation(
          makeWorkInput({
            cwd: Option.some("./project"),
            work: Option.some("./WORK.md"),
            yolo: true,
          }),
        ),
      );
      yield* fileSystem.writeFileString(workPath, "Changed after preparation.\n");

      expect(prepared.workingDirectory).toBe(yield* fileSystem.realPath(projectDirectory));
      expect(prepared.work).toEqual({
        _tag: "Ready",
        role: "Work",
        prompt: "Do the approved work.\n",
      });
      expect(prepared.yolo).toBe(true);
    }),
  );

  it.effect("accepts WORK.md from a valid runtime directory source", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDirectory = yield* makeTempDirectory();
      const ralphDirectory = join(tempDirectory, ".ralph");

      yield* fileSystem.makeDirectory(ralphDirectory);
      yield* fileSystem.writeFileString(join(ralphDirectory, "WORK.md"), "Run from directory.\n");

      const prepared = yield* withWorkingDirectory(
        tempDirectory,
        workspace.prepareWorkInvocation(makeWorkInput({ ralphDir: Option.some("./.ralph") })),
      );

      expect(prepared.work.prompt).toBe("Run from directory.\n");
    }),
  );

  it.effect("rejects missing and invalid runtime work sources", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const tempDirectory = yield* makeTempDirectory();
      const missing = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(workspace.prepareWorkInvocation(makeWorkInput())),
      );
      const invalidDirectory = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(
          workspace.prepareWorkInvocation(
            makeWorkInput({ ralphDir: Option.some("./missing-ralph") }),
          ),
        ),
      );

      expect(missing._tag).toBe("MissingWorkSource");
      expect(invalidDirectory._tag).toBe("InvalidRalphDirectory");
    }),
  );

  it.effect("rejects an invalid cwd before resolving work", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const tempDirectory = yield* makeTempDirectory();
      const error = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(
          workspace.prepareWorkInvocation(
            makeWorkInput({ cwd: Option.some("./missing"), work: Option.some("WORK.md") }),
          ),
        ),
      );

      expect(error._tag).toBe("InvalidWorkingDirectory");
    }),
  );

  it.effect("rejects missing and non-file work paths", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDirectory = yield* makeTempDirectory();
      const directoryPath = join(tempDirectory, "work-directory");

      yield* fileSystem.makeDirectory(directoryPath);

      const missing = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(
          workspace.prepareWorkInvocation(makeWorkInput({ work: Option.some("./missing.md") })),
        ),
      );
      const nonFile = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(
          workspace.prepareWorkInvocation(makeWorkInput({ work: Option.some("./work-directory") })),
        ),
      );

      expect(missing._tag).toBe("MissingWorkFile");
      expect(nonFile._tag).toBe("WorkPathNotFile");
    }),
  );

  it.effect("rejects unreadable UTF-8 and blank work", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDirectory = yield* makeTempDirectory();

      yield* fileSystem.writeFile(join(tempDirectory, "invalid.md"), new Uint8Array([255]));
      yield* fileSystem.writeFileString(join(tempDirectory, "blank.md"), " \n\t");

      const unreadable = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(
          workspace.prepareWorkInvocation(makeWorkInput({ work: Option.some("./invalid.md") })),
        ),
      );
      const blank = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(
          workspace.prepareWorkInvocation(makeWorkInput({ work: Option.some("./blank.md") })),
        ),
      );

      expect(unreadable._tag).toBe("WorkFileUnreadable");
      expect(blank._tag).toBe("BlankWork");
    }),
  );

  it.effect("rejects outside-cwd and sibling-prefix work paths", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDirectory = yield* makeTempDirectory();
      const projectDirectory = join(tempDirectory, "project");
      const siblingDirectory = join(tempDirectory, "project-sibling");

      yield* fileSystem.makeDirectory(projectDirectory);
      yield* fileSystem.makeDirectory(siblingDirectory);
      yield* fileSystem.writeFileString(join(tempDirectory, "outside.md"), "outside\n");
      yield* fileSystem.writeFileString(join(siblingDirectory, "WORK.md"), "sibling\n");

      const outside = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(
          workspace.prepareWorkInvocation(
            makeWorkInput({
              cwd: Option.some("./project"),
              work: Option.some("../outside.md"),
            }),
          ),
        ),
      );
      const sibling = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(
          workspace.prepareWorkInvocation(
            makeWorkInput({
              cwd: Option.some("./project"),
              work: Option.some("../project-sibling/WORK.md"),
            }),
          ),
        ),
      );

      expect(outside._tag).toBe("WorkOutsideWorkingDirectory");
      expect(sibling._tag).toBe("WorkOutsideWorkingDirectory");
    }),
  );

  it.effect("rejects a symlink escape from cwd", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDirectory = yield* makeTempDirectory();
      const projectDirectory = join(tempDirectory, "project");
      const outsideWorkPath = join(tempDirectory, "outside.md");

      yield* fileSystem.makeDirectory(projectDirectory);
      yield* fileSystem.writeFileString(outsideWorkPath, "outside\n");
      yield* fileSystem.symlink(outsideWorkPath, join(projectDirectory, "WORK.md"));

      const error = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(
          workspace.prepareWorkInvocation(
            makeWorkInput({ cwd: Option.some("./project"), work: Option.some("./WORK.md") }),
          ),
        ),
      );

      expect(error._tag).toBe("WorkOutsideWorkingDirectory");
    }),
  );
});
