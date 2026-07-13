import * as BunServices from "@effect/platform-bun/BunServices";
import { expect, layer } from "@effect/vitest";
import { Cause, Duration, Effect, Exit, FileSystem, Layer, Option } from "effect";
import { join } from "node:path";

import type { SharedFlagsInput } from "../domain/Ralph";
import type { OnceSequenceInput } from "../domain/WorkInvocation";
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

const makeOnceSequenceInput = (overrides: Partial<OnceSequenceInput> = {}): OnceSequenceInput => ({
  before: Option.none(),
  work: Option.none(),
  after: Option.none(),
  ralphDir: Option.none(),
  cwd: Option.none(),
  yolo: false,
  timeouts: {
    idle: Duration.minutes(5),
    invocation: Duration.minutes(30),
  },
  ...overrides,
});

const prepareSnapshot = Effect.fnUntraced(function* (
  workspace: RalphWorkspace["Service"],
  input: OnceSequenceInput,
) {
  const workflow = yield* workspace.prepareWorkflow(input);
  const phases = yield* workspace.snapshotIteration(workflow);
  return { ...workflow, phases };
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
  it.effect("init creates exactly three empty phase files from the launch directory", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDirectory = yield* makeTempDirectory();
      const projectDirectory = join(tempDirectory, "project");

      yield* withWorkingDirectory(tempDirectory, workspace.init(Option.some("./project")));

      expect([...(yield* fileSystem.readDirectory(projectDirectory))].sort()).toEqual([
        "AFTER_WORK.md",
        "BEFORE_WORK.md",
        "WORK.md",
      ]);
      expect(yield* fileSystem.readFileString(join(projectDirectory, "BEFORE_WORK.md"))).toBe("");
      expect(yield* fileSystem.readFileString(join(projectDirectory, "WORK.md"))).toBe("");
      expect(yield* fileSystem.readFileString(join(projectDirectory, "AFTER_WORK.md"))).toBe("");

      const blankWork = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(
          prepareSnapshot(
            workspace,
            makeOnceSequenceInput({
              cwd: Option.some("./project"),
              ralphDir: Option.some("."),
            }),
          ),
        ),
      );

      const canonicalProjectDirectory = yield* fileSystem.realPath(projectDirectory);
      expect(blankWork._tag).toBe("BlankWork");
      expect(blankWork.message).toBe(
        `Work instructions are required; work file is blank: ${join(canonicalProjectDirectory, "WORK.md")}`,
      );
    }),
  );

  it.effect("init backs up every phase file before replacing it with an empty file", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDirectory = yield* makeTempDirectory();
      const projectDirectory = join(tempDirectory, "project");
      const originals: ReadonlyArray<readonly [string, string]> = [
        ["BEFORE_WORK.md", "old before\n"],
        ["WORK.md", "old work\n"],
        ["AFTER_WORK.md", "old after\n"],
      ];

      yield* fileSystem.makeDirectory(projectDirectory, { recursive: true });
      yield* Effect.forEach(
        originals,
        ([fileName, content]) =>
          fileSystem.writeFileString(join(projectDirectory, fileName), content),
        { discard: true },
      );

      yield* withWorkingDirectory(tempDirectory, workspace.init(Option.some("./project")));

      const files = yield* fileSystem.readDirectory(projectDirectory);
      yield* Effect.forEach(
        originals,
        ([fileName, content]) =>
          Effect.gen(function* () {
            const backup = files.find((candidate) => candidate.startsWith(`${fileName}.bak.`));
            expect(backup).toBeDefined();
            expect(yield* fileSystem.readFileString(join(projectDirectory, fileName))).toBe("");

            if (backup !== undefined) {
              expect(yield* fileSystem.readFileString(join(projectDirectory, backup))).toBe(
                content,
              );
            }
          }),
        { discard: true },
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

  it.effect("keeps stable sources while refreshing immutable snapshots", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDirectory = yield* makeTempDirectory();
      const projectDirectory = join(tempDirectory, "project");
      const workPath = join(projectDirectory, "WORK.md");

      yield* fileSystem.makeDirectory(projectDirectory);
      yield* fileSystem.writeFileString(workPath, "Do the approved work.\n");

      const workflow = yield* withWorkingDirectory(
        tempDirectory,
        workspace.prepareWorkflow(
          makeOnceSequenceInput({
            cwd: Option.some("./project"),
            work: Option.some("./WORK.md"),
            yolo: true,
          }),
        ),
      );
      const firstSnapshot = yield* workspace.snapshotIteration(workflow);
      yield* fileSystem.writeFileString(workPath, "Changed after snapshot.\n");
      const nextSnapshot = yield* workspace.snapshotIteration(workflow);

      expect(workflow.workingDirectory).toBe(yield* fileSystem.realPath(projectDirectory));
      expect(workflow.sources.work).toEqual({
        origin: "Explicit",
        role: "Work",
        path: join(workflow.workingDirectory, "WORK.md"),
      });
      expect(firstSnapshot.work.prompt).toBe("Do the approved work.\n");
      expect(nextSnapshot.work.prompt).toBe("Changed after snapshot.\n");
      expect(workflow.yolo).toBe(true);
    }),
  );

  it.effect("isolates later phase prompts from same-sequence edits", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDirectory = yield* makeTempDirectory();
      const beforePath = join(tempDirectory, "BEFORE.md");
      const workPath = join(tempDirectory, "WORK.md");
      const afterPath = join(tempDirectory, "AFTER.md");

      yield* fileSystem.writeFileString(beforePath, "Prepare.\n");
      yield* fileSystem.writeFileString(workPath, "Work.\n");
      yield* fileSystem.writeFileString(afterPath, "Verify original work.\n");
      const workflow = yield* withWorkingDirectory(
        tempDirectory,
        workspace.prepareWorkflow(
          makeOnceSequenceInput({
            before: Option.some("./BEFORE.md"),
            work: Option.some("./WORK.md"),
            after: Option.some("./AFTER.md"),
          }),
        ),
      );

      const currentSequence = yield* workspace.snapshotIteration(workflow);
      yield* fileSystem.writeFileString(afterPath, "Verify changed work.\n");
      const nextSequence = yield* workspace.snapshotIteration(workflow);

      expect(currentSequence.after).toEqual({
        _tag: "Ready",
        role: "AfterWork",
        prompt: "Verify original work.\n",
      });
      expect(nextSequence.after).toEqual({
        _tag: "Ready",
        role: "AfterWork",
        prompt: "Verify changed work.\n",
      });
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
        prepareSnapshot(workspace, makeOnceSequenceInput({ ralphDir: Option.some("./.ralph") })),
      );

      expect(prepared.phases).toEqual({
        before: { _tag: "Skipped", role: "BeforeWork", reason: "Missing" },
        work: { _tag: "Ready", role: "Work", prompt: "Run from directory.\n" },
        after: { _tag: "Skipped", role: "AfterWork", reason: "Missing" },
      });
    }),
  );

  it.effect("uses cwd-relative explicit phases over directory phases", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDirectory = yield* makeTempDirectory();
      const projectDirectory = join(tempDirectory, "project");
      const ralphDirectory = join(projectDirectory, ".ralph");

      yield* fileSystem.makeDirectory(ralphDirectory, { recursive: true });
      yield* fileSystem.writeFileString(
        join(ralphDirectory, "BEFORE_WORK.md"),
        "Directory before.\n",
      );
      yield* fileSystem.writeFileString(join(ralphDirectory, "WORK.md"), "Directory work.\n");
      yield* fileSystem.writeFileString(
        join(ralphDirectory, "AFTER_WORK.md"),
        "Directory after.\n",
      );
      yield* fileSystem.writeFileString(join(projectDirectory, "DISABLED_BEFORE.md"), " \n");
      yield* fileSystem.writeFileString(join(projectDirectory, "CUSTOM_WORK.md"), "Custom work.\n");

      const prepared = yield* withWorkingDirectory(
        tempDirectory,
        prepareSnapshot(
          workspace,
          makeOnceSequenceInput({
            before: Option.some("./DISABLED_BEFORE.md"),
            work: Option.some("./CUSTOM_WORK.md"),
            ralphDir: Option.some("./.ralph"),
            cwd: Option.some("./project"),
          }),
        ),
      );

      expect(prepared.phases).toEqual({
        before: { _tag: "Skipped", role: "BeforeWork", reason: "Blank" },
        work: { _tag: "Ready", role: "Work", prompt: "Custom work.\n" },
        after: { _tag: "Ready", role: "AfterWork", prompt: "Directory after.\n" },
      });
    }),
  );

  it.effect("fails when an explicit optional phase is missing", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDirectory = yield* makeTempDirectory();

      yield* fileSystem.writeFileString(join(tempDirectory, "WORK.md"), "Required work.\n");
      const error = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(
          prepareSnapshot(
            workspace,
            makeOnceSequenceInput({
              before: Option.some("./missing-before.md"),
              work: Option.some("./WORK.md"),
            }),
          ),
        ),
      );

      expect(error._tag).toBe("MissingPhaseFile");
      if (error._tag === "MissingPhaseFile") {
        expect(error.role).toBe("BeforeWork");
      }
    }),
  );

  it.effect("keeps explicit and directory phase paths inside cwd", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDirectory = yield* makeTempDirectory();
      const projectDirectory = join(tempDirectory, "project");
      const ralphDirectory = join(projectDirectory, ".ralph");
      const outsideBefore = join(tempDirectory, "outside-before.md");
      const outsideAfter = join(tempDirectory, "outside-after.md");

      yield* fileSystem.makeDirectory(ralphDirectory, { recursive: true });
      yield* fileSystem.writeFileString(join(ralphDirectory, "WORK.md"), "Required work.\n");
      yield* fileSystem.writeFileString(outsideBefore, "Outside before.\n");
      yield* fileSystem.writeFileString(outsideAfter, "Outside after.\n");
      yield* fileSystem.symlink(outsideBefore, join(ralphDirectory, "BEFORE_WORK.md"));

      const inferred = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(
          prepareSnapshot(
            workspace,
            makeOnceSequenceInput({
              cwd: Option.some("./project"),
              ralphDir: Option.some("./.ralph"),
            }),
          ),
        ),
      );
      const explicit = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(
          prepareSnapshot(
            workspace,
            makeOnceSequenceInput({
              cwd: Option.some("./project"),
              work: Option.some("./.ralph/WORK.md"),
              after: Option.some("../outside-after.md"),
            }),
          ),
        ),
      );

      expect(inferred._tag).toBe("PhaseOutsideWorkingDirectory");
      if (inferred._tag === "PhaseOutsideWorkingDirectory") {
        expect(inferred.role).toBe("BeforeWork");
      }
      expect(explicit._tag).toBe("PhaseOutsideWorkingDirectory");
      if (explicit._tag === "PhaseOutsideWorkingDirectory") {
        expect(explicit.role).toBe("AfterWork");
      }
    }),
  );

  it.effect("revalidates a ready source when snapshotting", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDirectory = yield* makeTempDirectory();
      const projectDirectory = join(tempDirectory, "project");
      const workPath = join(projectDirectory, "WORK.md");
      const afterPath = join(projectDirectory, "AFTER.md");
      const outsideAfter = join(tempDirectory, "outside-after.md");

      yield* fileSystem.makeDirectory(projectDirectory);
      yield* fileSystem.writeFileString(workPath, "Required work.\n");
      yield* fileSystem.writeFileString(afterPath, "Original after.\n");
      yield* fileSystem.writeFileString(outsideAfter, "Outside after.\n");
      const workflow = yield* withWorkingDirectory(
        tempDirectory,
        workspace.prepareWorkflow(
          makeOnceSequenceInput({
            cwd: Option.some("./project"),
            work: Option.some("./WORK.md"),
            after: Option.some("./AFTER.md"),
          }),
        ),
      );
      yield* fileSystem.remove(afterPath);
      yield* fileSystem.symlink(outsideAfter, afterPath);

      const error = yield* Effect.flip(workspace.snapshotIteration(workflow));

      expect(error._tag).toBe("PhaseOutsideWorkingDirectory");
      if (error._tag === "PhaseOutsideWorkingDirectory") {
        expect(error.role).toBe("AfterWork");
      }
    }),
  );

  it.effect("rejects missing and blank inferred work", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const fileSystem = yield* FileSystem.FileSystem;
      const tempDirectory = yield* makeTempDirectory();
      const ralphDirectory = join(tempDirectory, ".ralph");

      yield* fileSystem.makeDirectory(ralphDirectory);
      const missing = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(
          prepareSnapshot(workspace, makeOnceSequenceInput({ ralphDir: Option.some("./.ralph") })),
        ),
      );
      yield* fileSystem.writeFileString(join(ralphDirectory, "WORK.md"), " \n");
      const blank = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(
          prepareSnapshot(workspace, makeOnceSequenceInput({ ralphDir: Option.some("./.ralph") })),
        ),
      );

      expect(missing._tag).toBe("MissingPhaseFile");
      expect(blank._tag).toBe("BlankWork");
    }),
  );

  it.effect("rejects missing and invalid runtime work sources", () =>
    Effect.gen(function* () {
      const workspace = yield* RalphWorkspace;
      const tempDirectory = yield* makeTempDirectory();
      const missing = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(prepareSnapshot(workspace, makeOnceSequenceInput())),
      );
      const invalidDirectory = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(
          prepareSnapshot(
            workspace,
            makeOnceSequenceInput({ ralphDir: Option.some("./missing-ralph") }),
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
          prepareSnapshot(
            workspace,
            makeOnceSequenceInput({ cwd: Option.some("./missing"), work: Option.some("WORK.md") }),
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
          prepareSnapshot(workspace, makeOnceSequenceInput({ work: Option.some("./missing.md") })),
        ),
      );
      const nonFile = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(
          prepareSnapshot(
            workspace,
            makeOnceSequenceInput({ work: Option.some("./work-directory") }),
          ),
        ),
      );

      expect(missing._tag).toBe("MissingPhaseFile");
      expect(nonFile._tag).toBe("PhasePathNotFile");
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
          prepareSnapshot(workspace, makeOnceSequenceInput({ work: Option.some("./invalid.md") })),
        ),
      );
      const blank = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(
          prepareSnapshot(workspace, makeOnceSequenceInput({ work: Option.some("./blank.md") })),
        ),
      );

      expect(unreadable._tag).toBe("PhaseFileUnreadable");
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
          prepareSnapshot(
            workspace,
            makeOnceSequenceInput({
              cwd: Option.some("./project"),
              work: Option.some("../outside.md"),
            }),
          ),
        ),
      );
      const sibling = yield* withWorkingDirectory(
        tempDirectory,
        Effect.flip(
          prepareSnapshot(
            workspace,
            makeOnceSequenceInput({
              cwd: Option.some("./project"),
              work: Option.some("../project-sibling/WORK.md"),
            }),
          ),
        ),
      );

      expect(outside._tag).toBe("PhaseOutsideWorkingDirectory");
      expect(sibling._tag).toBe("PhaseOutsideWorkingDirectory");
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
          prepareSnapshot(
            workspace,
            makeOnceSequenceInput({
              cwd: Option.some("./project"),
              work: Option.some("./WORK.md"),
            }),
          ),
        ),
      );

      expect(error._tag).toBe("PhaseOutsideWorkingDirectory");
    }),
  );
});
