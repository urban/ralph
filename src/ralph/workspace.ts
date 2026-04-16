import { Context, Effect, FileSystem, Layer, Option, Path } from "effect";

import {
  type PreparedRunContext,
  ralphFileNames,
  type RalphFileRole,
  type RalphFilePaths,
  type SharedFlagsInput,
} from "./domain";
import type { RalphExit } from "./errors";
import { failWithMessage } from "./errors";

const ralphFileRoles = Object.keys(ralphFileNames) as ReadonlyArray<RalphFileRole>;

const ralphFileFlags: Record<RalphFileRole, string> = {
  checklist: "--checklist",
  instructions: "--instructions",
  progress: "--progress",
};

const ralphFileLabels: Record<RalphFileRole, string> = {
  checklist: "Checklist file",
  instructions: "Instructions file",
  progress: "Progress file",
};

const formatBackupTimestamp = () => new Date().toISOString().replace(/[-:.]/g, "");

export class RalphWorkspace extends Context.Service<
  RalphWorkspace,
  {
    init(targetDirectory: Option.Option<string>): Effect.Effect<void, RalphExit>;
    prepareRunContext(input: SharedFlagsInput): Effect.Effect<PreparedRunContext, RalphExit>;
  }
>()("ralph-effect/ralph/RalphWorkspace") {
  static readonly layer = Layer.effect(
    RalphWorkspace,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const resolveFromLaunchDirectory = (rawPath: string) =>
        path.isAbsolute(rawPath) ? rawPath : path.resolve(rawPath);

      const resolveTemplateDirectory = Effect.fn("RalphWorkspace.resolveTemplateDirectory")(
        function* () {
          const sourcePath = yield* path
            .fromFileUrl(new URL(import.meta.url))
            .pipe(Effect.catch(() => failWithMessage("Could not resolve Ralph package root.")));

          const packageRoot = path.dirname(path.dirname(path.dirname(sourcePath)));
          return path.join(packageRoot, "src", "templates");
        },
      );

      const ensureDirectory = Effect.fn("RalphWorkspace.ensureDirectory")(function* (
        directoryPath: string,
        directoryLabel: string,
      ) {
        const info = yield* fileSystem
          .stat(directoryPath)
          .pipe(
            Effect.catch(() => failWithMessage(`${directoryLabel} not found: ${directoryPath}`)),
          );

        if (info.type !== "Directory") {
          return yield* failWithMessage(`${directoryLabel} is not a directory: ${directoryPath}`);
        }
      });

      const ensureRegularFile = Effect.fn("RalphWorkspace.ensureRegularFile")(function* (
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

      const validateInitTarget = Effect.fn("RalphWorkspace.validateInitTarget")(function* (
        targetPath: string,
      ) {
        const exists = yield* fileSystem
          .exists(targetPath)
          .pipe(Effect.catch(() => failWithMessage(`Could not access init target: ${targetPath}`)));

        if (!exists) {
          yield* fileSystem
            .makeDirectory(targetPath, { recursive: true })
            .pipe(Effect.catch(() => failWithMessage(`Could not create directory: ${targetPath}`)));
          return;
        }

        const info = yield* fileSystem
          .stat(targetPath)
          .pipe(Effect.catch(() => failWithMessage(`Could not access init target: ${targetPath}`)));

        if (info.type === "File") {
          return yield* failWithMessage(`Init target is a file: ${targetPath}`);
        }

        if (info.type !== "Directory") {
          return yield* failWithMessage(`Init target is not a directory: ${targetPath}`);
        }
      });

      const validateWritableTargetFile = Effect.fn("RalphWorkspace.validateWritableTargetFile")(
        function* (targetFilePath: string) {
          const exists = yield* fileSystem
            .exists(targetFilePath)
            .pipe(
              Effect.catch(() =>
                failWithMessage(`Could not access target file: ${targetFilePath}`),
              ),
            );

          if (!exists) {
            return;
          }

          const info = yield* fileSystem
            .stat(targetFilePath)
            .pipe(
              Effect.catch(() =>
                failWithMessage(`Could not access target file: ${targetFilePath}`),
              ),
            );

          if (info.type !== "File") {
            return yield* failWithMessage(`Target path is not a file: ${targetFilePath}`);
          }
        },
      );

      const backupExistingFile = Effect.fn("RalphWorkspace.backupExistingFile")(function* (
        targetFilePath: string,
      ) {
        const exists = yield* fileSystem
          .exists(targetFilePath)
          .pipe(
            Effect.catch(() => failWithMessage(`Could not access target file: ${targetFilePath}`)),
          );

        if (!exists) {
          return;
        }

        const backupPath = `${targetFilePath}.bak.${formatBackupTimestamp()}`;
        yield* fileSystem
          .copyFile(targetFilePath, backupPath)
          .pipe(Effect.catch(() => failWithMessage(`Could not create backup: ${backupPath}`)));
      });

      const readTemplateFiles = Effect.fn("RalphWorkspace.readTemplateFiles")(function* () {
        const templateDirectory = yield* resolveTemplateDirectory();

        const checklist = yield* fileSystem
          .readFileString(path.join(templateDirectory, ralphFileNames.checklist))
          .pipe(
            Effect.catch(() =>
              failWithMessage(`Missing bundled template: ${ralphFileNames.checklist}`),
            ),
          );
        const instructions = yield* fileSystem
          .readFileString(path.join(templateDirectory, ralphFileNames.instructions))
          .pipe(
            Effect.catch(() =>
              failWithMessage(`Missing bundled template: ${ralphFileNames.instructions}`),
            ),
          );
        const progress = yield* fileSystem
          .readFileString(path.join(templateDirectory, ralphFileNames.progress))
          .pipe(
            Effect.catch(() =>
              failWithMessage(`Missing bundled template: ${ralphFileNames.progress}`),
            ),
          );

        return {
          checklist,
          instructions,
          progress,
        } satisfies Record<RalphFileRole, string>;
      });

      const resolveRuntimePath = (
        explicitPath: Option.Option<string>,
        sharedDirectory: string | undefined,
        role: RalphFileRole,
      ) =>
        Option.match(explicitPath, {
          onNone: () =>
            sharedDirectory === undefined
              ? undefined
              : path.join(sharedDirectory, ralphFileNames[role]),
          onSome: resolveFromLaunchDirectory,
        });

      const failForMissingRuntimeInputs = Effect.fn("RalphWorkspace.failForMissingRuntimeInputs")(
        function* (missingRoles: ReadonlyArray<RalphFileRole>) {
          const missingFlags = missingRoles.map((role) => ralphFileFlags[role]).join(", ");
          return yield* failWithMessage(
            `Missing Ralph runtime inputs: ${missingFlags}. Pass --ralph-dir or all of --checklist, --instructions, and --progress.`,
          );
        },
      );

      const init = Effect.fn("RalphWorkspace.init")(function* (
        targetDirectory: Option.Option<string>,
      ) {
        const targetPath = Option.match(targetDirectory, {
          onNone: () => path.resolve("."),
          onSome: resolveFromLaunchDirectory,
        });

        yield* validateInitTarget(targetPath);

        const templates = yield* readTemplateFiles();
        const targetFiles = {
          checklist: path.join(targetPath, ralphFileNames.checklist),
          instructions: path.join(targetPath, ralphFileNames.instructions),
          progress: path.join(targetPath, ralphFileNames.progress),
        } satisfies RalphFilePaths;

        yield* Effect.forEach(
          ralphFileRoles,
          (role) => validateWritableTargetFile(targetFiles[role]),
          {
            discard: true,
          },
        );
        yield* Effect.forEach(ralphFileRoles, (role) => backupExistingFile(targetFiles[role]), {
          discard: true,
        });
        yield* Effect.forEach(
          ralphFileRoles,
          (role) =>
            fileSystem
              .writeFileString(targetFiles[role], templates[role])
              .pipe(
                Effect.catch(() => failWithMessage(`Could not write file: ${targetFiles[role]}`)),
              ),
          {
            discard: true,
          },
        );
      });

      const prepareRunContext = Effect.fn("RalphWorkspace.prepareRunContext")(function* (
        input: SharedFlagsInput,
      ) {
        const sharedDirectory = Option.match(input.ralphDir, {
          onNone: () => undefined,
          onSome: resolveFromLaunchDirectory,
        });

        if (sharedDirectory !== undefined) {
          yield* ensureDirectory(sharedDirectory, "Ralph directory");
        }

        const checklistPath = resolveRuntimePath(input.checklist, sharedDirectory, "checklist");
        const instructionsPath = resolveRuntimePath(
          input.instructions,
          sharedDirectory,
          "instructions",
        );
        const progressPath = resolveRuntimePath(input.progress, sharedDirectory, "progress");

        const missingRoles = ralphFileRoles.filter((role) => {
          switch (role) {
            case "checklist": {
              return checklistPath === undefined;
            }
            case "instructions": {
              return instructionsPath === undefined;
            }
            case "progress": {
              return progressPath === undefined;
            }
          }
        });

        if (missingRoles.length > 0) {
          return yield* failForMissingRuntimeInputs(missingRoles);
        }

        const resolvedChecklistPath = checklistPath;
        const resolvedInstructionsPath = instructionsPath;
        const resolvedProgressPath = progressPath;

        if (
          resolvedChecklistPath === undefined ||
          resolvedInstructionsPath === undefined ||
          resolvedProgressPath === undefined
        ) {
          return yield* failForMissingRuntimeInputs(ralphFileRoles);
        }

        const workingDirectory = Option.match(input.cwd, {
          onNone: () => path.resolve("."),
          onSome: resolveFromLaunchDirectory,
        });

        yield* ensureRegularFile(resolvedChecklistPath, ralphFileLabels.checklist);
        yield* ensureRegularFile(resolvedInstructionsPath, ralphFileLabels.instructions);
        yield* ensureRegularFile(resolvedProgressPath, ralphFileLabels.progress);

        if (Option.isSome(input.cwd)) {
          yield* ensureDirectory(workingDirectory, "Codex working directory");
        }

        return {
          workingDirectory,
          checklistPath: resolvedChecklistPath,
          instructionsPath: resolvedInstructionsPath,
          progressPath: resolvedProgressPath,
          yolo: input.yolo,
        } satisfies PreparedRunContext;
      });

      return RalphWorkspace.of({
        init,
        prepareRunContext,
      });
    }),
  );
}
