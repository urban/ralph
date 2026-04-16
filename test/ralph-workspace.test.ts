import * as BunServices from "@effect/platform-bun/BunServices";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Effect, Layer, Option } from "effect";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SharedFlagsInput } from "../src/ralph/domain";
import { RalphWorkspace } from "../src/ralph/workspace";

const workspaceLayer = RalphWorkspace.layer.pipe(Layer.provideMerge(BunServices.layer));

const runWorkspace = <A>(effect: Effect.Effect<A, unknown, RalphWorkspace>) =>
  Effect.runPromise(effect.pipe(Effect.provide(workspaceLayer)));

const runWorkspaceResult = async <A>(effect: Effect.Effect<A, unknown, RalphWorkspace>) => {
  try {
    return {
      ok: true as const,
      value: await runWorkspace(effect),
    };
  } catch (error) {
    return {
      ok: false as const,
      error,
    };
  }
};

const makeSharedFlags = (overrides: Partial<SharedFlagsInput> = {}): SharedFlagsInput => ({
  checklist: Option.none(),
  instructions: Option.none(),
  progress: Option.none(),
  ralphDir: Option.none(),
  cwd: Option.none(),
  yolo: false,
  ...overrides,
});

describe("RalphWorkspace", () => {
  let originalCwd = "";
  let tempDirectory = "";

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDirectory = await mkdtemp(join(tmpdir(), "ralph-workspace-"));
    process.chdir(tempDirectory);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDirectory, { force: true, recursive: true });
  });

  test("init writes Ralph files into the launch directory", async () => {
    await runWorkspace(
      Effect.gen(function* () {
        const workspace = yield* RalphWorkspace;
        yield* workspace.init(Option.none());
      }),
    );

    expect((await readFile(join(tempDirectory, "CHECKLIST.md"), "utf8")).length).toBeGreaterThan(0);
    expect((await readFile(join(tempDirectory, "INSTRUCTIONS.md"), "utf8")).length).toBeGreaterThan(
      0,
    );
    expect((await readFile(join(tempDirectory, "PROGRESS.md"), "utf8")).length).toBeGreaterThan(0);
  });

  test("init creates backups before overwrite", async () => {
    const projectDirectory = join(tempDirectory, "project");
    await mkdir(projectDirectory, { recursive: true });
    await writeFile(join(projectDirectory, "CHECKLIST.md"), "old checklist\n");
    await writeFile(join(projectDirectory, "INSTRUCTIONS.md"), "old instructions\n");
    await writeFile(join(projectDirectory, "PROGRESS.md"), "old progress\n");

    await runWorkspace(
      Effect.gen(function* () {
        const workspace = yield* RalphWorkspace;
        yield* workspace.init(Option.some("./project"));
      }),
    );

    const files = await readdir(projectDirectory);
    const checklistBackup = files.find((fileName) => fileName.startsWith("CHECKLIST.md.bak."));
    const instructionsBackup = files.find((fileName) =>
      fileName.startsWith("INSTRUCTIONS.md.bak."),
    );
    const progressBackup = files.find((fileName) => fileName.startsWith("PROGRESS.md.bak."));

    expect(checklistBackup).toBeDefined();
    expect(instructionsBackup).toBeDefined();
    expect(progressBackup).toBeDefined();
    expect(await readFile(join(projectDirectory, checklistBackup!), "utf8")).toBe(
      "old checklist\n",
    );
    expect(await readFile(join(projectDirectory, instructionsBackup!), "utf8")).toBe(
      "old instructions\n",
    );
    expect(await readFile(join(projectDirectory, progressBackup!), "utf8")).toBe("old progress\n");
  });

  test("init rejects file targets", async () => {
    const targetFile = join(tempDirectory, "not-a-directory");
    await writeFile(targetFile, "nope\n");

    const result = await runWorkspaceResult(
      Effect.gen(function* () {
        const workspace = yield* RalphWorkspace;
        yield* workspace.init(Option.some("./not-a-directory"));
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as { message: string }).message).toBe(
        `Init target is a file: ${await realpath(targetFile)}`,
      );
    }
  });

  test("prepareRunContext uses --ralph-dir with per-file overrides and --cwd", async () => {
    const ralphDirectory = join(tempDirectory, ".ralph");
    const projectDirectory = join(tempDirectory, "project");
    const customInstructions = join(tempDirectory, "custom-instructions.md");

    await mkdir(ralphDirectory, { recursive: true });
    await mkdir(projectDirectory, { recursive: true });
    await writeFile(join(ralphDirectory, "CHECKLIST.md"), "checklist\n");
    await writeFile(join(ralphDirectory, "INSTRUCTIONS.md"), "instructions\n");
    await writeFile(join(ralphDirectory, "PROGRESS.md"), "progress\n");
    await writeFile(customInstructions, "custom instructions\n");

    const context = await runWorkspace(
      Effect.gen(function* () {
        const workspace = yield* RalphWorkspace;
        return yield* workspace.prepareRunContext(
          makeSharedFlags({
            instructions: Option.some("./custom-instructions.md"),
            ralphDir: Option.some("./.ralph"),
            cwd: Option.some("./project"),
          }),
        );
      }),
    );

    const resolvedRalphDirectory = await realpath(ralphDirectory);
    const resolvedProjectDirectory = await realpath(projectDirectory);
    const resolvedCustomInstructions = await realpath(customInstructions);

    expect(context.checklistPath).toBe(join(resolvedRalphDirectory, "CHECKLIST.md"));
    expect(context.instructionsPath).toBe(resolvedCustomInstructions);
    expect(context.progressPath).toBe(join(resolvedRalphDirectory, "PROGRESS.md"));
    expect(context.workingDirectory).toBe(resolvedProjectDirectory);
  });

  test("prepareRunContext fails closed when runtime inputs are missing", async () => {
    const result = await runWorkspaceResult(
      Effect.gen(function* () {
        const workspace = yield* RalphWorkspace;
        return yield* workspace.prepareRunContext(makeSharedFlags());
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as { message: string }).message).toBe(
        "Missing Ralph runtime inputs: --checklist, --instructions, --progress. Pass --ralph-dir or all of --checklist, --instructions, and --progress.",
      );
    }
  });
});
