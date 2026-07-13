import { Context, Effect, FileSystem, Layer, Option, Path } from "effect";

import {
  type PreparedRunContext,
  ralphFileNames,
  type RalphFileRole,
  type RalphFilePaths,
  type SharedFlagsInput,
} from "../domain/Ralph";
import type {
  OnceSequenceInput,
  OptionalPhaseRole,
  OptionalPhaseSnapshot,
  PhaseRole,
  PhaseSource,
  PreparedOnceSequence,
  ReadyPhaseSnapshot,
} from "../domain/WorkInvocation";
import {
  BlankWork,
  InvalidRalphDirectory,
  InvalidWorkingDirectory,
  MissingPhaseFile,
  MissingWorkSource,
  type PhaseInputError,
  PhaseFileUnreadable,
  phaseInputLabel,
  PhaseOutsideWorkingDirectory,
  PhasePathNotFile,
} from "../domain/WorkInputError";
import type { RalphExit } from "../errors/RalphExit";
import { failWithMessage } from "../errors/RalphExit";

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
    prepareOnceSequence(
      input: OnceSequenceInput,
    ): Effect.Effect<PreparedOnceSequence, PhaseInputError>;
  }
>()("ralph-effect/services/RalphWorkspace") {
  static readonly layer = Layer.effect(
    RalphWorkspace,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const resolveFromLaunchDirectory = (rawPath: string) =>
        path.isAbsolute(rawPath) ? rawPath : path.resolve(rawPath);

      const resolveTemplateDirectory = Effect.fn("RalphWorkspace.resolveTemplateDirectory")(
        function* () {
          return yield* path
            .fromFileUrl(new URL("../templates", import.meta.url))
            .pipe(
              Effect.catch(() => failWithMessage("Could not resolve Ralph template directory.")),
            );
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

      const canonicalWorkingDirectory = Effect.fnUntraced(function* (input: Option.Option<string>) {
        const requestedPath = Option.match(input, {
          onNone: () => path.resolve("."),
          onSome: resolveFromLaunchDirectory,
        });
        const info = yield* fileSystem.stat(requestedPath).pipe(
          Effect.mapError(
            () =>
              new InvalidWorkingDirectory({
                path: requestedPath,
                message: `Working directory not found or inaccessible: ${requestedPath}`,
              }),
          ),
        );

        if (info.type !== "Directory") {
          return yield* new InvalidWorkingDirectory({
            path: requestedPath,
            message: `Working directory is not a directory: ${requestedPath}`,
          });
        }

        return yield* fileSystem.realPath(requestedPath).pipe(
          Effect.mapError(
            () =>
              new InvalidWorkingDirectory({
                path: requestedPath,
                message: `Working directory could not be resolved: ${requestedPath}`,
              }),
          ),
        );
      });

      const phaseFileName = (role: PhaseRole): string => {
        switch (role) {
          case "BeforeWork":
            return "BEFORE_WORK.md";
          case "Work":
            return "WORK.md";
          case "AfterWork":
            return "AFTER_WORK.md";
        }
      };

      const resolveRalphDirectory = Effect.fnUntraced(function* (
        input: Option.Option<string>,
        workingDirectory: string,
      ) {
        if (Option.isNone(input)) {
          return undefined;
        }

        const requestedPath = path.resolve(workingDirectory, input.value);
        const info = yield* fileSystem.stat(requestedPath).pipe(
          Effect.mapError(
            () =>
              new InvalidRalphDirectory({
                path: requestedPath,
                message: `Ralph directory not found or inaccessible: ${requestedPath}`,
              }),
          ),
        );

        if (info.type !== "Directory") {
          return yield* new InvalidRalphDirectory({
            path: requestedPath,
            message: `Ralph directory is not a directory: ${requestedPath}`,
          });
        }

        return requestedPath;
      });

      const resolvePhaseSource = <Role extends PhaseRole>(
        role: Role,
        explicitPath: Option.Option<string>,
        ralphDirectory: string | undefined,
        workingDirectory: string,
      ): Option.Option<PhaseSource<Role>> =>
        Option.match(explicitPath, {
          onNone: () =>
            ralphDirectory === undefined
              ? Option.none()
              : Option.some({
                  origin: "RalphDirectory",
                  role,
                  path: path.join(ralphDirectory, phaseFileName(role)),
                }),
          onSome: (rawPath) =>
            Option.some({
              origin: "Explicit",
              role,
              path: path.resolve(workingDirectory, rawPath),
            }),
        });

      const readPhasePrompt = Effect.fnUntraced(function* (
        source: PhaseSource,
        workingDirectory: string,
      ) {
        const label = phaseInputLabel(source.role);
        const info = yield* fileSystem.stat(source.path).pipe(
          Effect.mapError(
            () =>
              new MissingPhaseFile({
                role: source.role,
                path: source.path,
                message: `${label} file not found: ${source.path}`,
              }),
          ),
        );

        if (info.type !== "File") {
          return yield* new PhasePathNotFile({
            role: source.role,
            path: source.path,
            message: `${label} path is not a regular file: ${source.path}`,
          });
        }

        const canonicalPath = yield* fileSystem.realPath(source.path).pipe(
          Effect.mapError(
            () =>
              new PhaseFileUnreadable({
                role: source.role,
                path: source.path,
                message: `${label} file could not be resolved: ${source.path}`,
              }),
          ),
        );
        const relativePath = path.relative(workingDirectory, canonicalPath);
        const isContained =
          relativePath !== ".." &&
          !relativePath.startsWith(`..${path.sep}`) &&
          !path.isAbsolute(relativePath);

        if (!isContained) {
          return yield* new PhaseOutsideWorkingDirectory({
            role: source.role,
            path: canonicalPath,
            workingDirectory,
            message: `${label} file must be contained by working directory ${workingDirectory}: ${canonicalPath}`,
          });
        }

        const bytes = yield* fileSystem.readFile(canonicalPath).pipe(
          Effect.mapError(
            () =>
              new PhaseFileUnreadable({
                role: source.role,
                path: canonicalPath,
                message: `${label} file is not readable: ${canonicalPath}`,
              }),
          ),
        );

        return yield* Effect.try({
          try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          catch: () =>
            new PhaseFileUnreadable({
              role: source.role,
              path: canonicalPath,
              message: `${label} file is not readable UTF-8: ${canonicalPath}`,
            }),
        });
      });

      const snapshotOptionalPhase = Effect.fnUntraced(function* <Role extends OptionalPhaseRole>(
        role: Role,
        sourceOption: Option.Option<PhaseSource<Role>>,
        workingDirectory: string,
      ): Effect.fn.Return<OptionalPhaseSnapshot<Role>, PhaseInputError> {
        if (Option.isNone(sourceOption)) {
          return { _tag: "Skipped", role, reason: "Missing" };
        }

        const source = sourceOption.value;
        if (source.origin === "RalphDirectory") {
          const exists = yield* fileSystem.exists(source.path).pipe(
            Effect.mapError(
              () =>
                new PhaseFileUnreadable({
                  role,
                  path: source.path,
                  message: `${phaseInputLabel(role)} file could not be accessed: ${source.path}`,
                }),
            ),
          );
          if (!exists) {
            return { _tag: "Skipped", role, reason: "Missing" };
          }
        }

        const prompt = yield* readPhasePrompt(source, workingDirectory);
        return prompt.trim().length === 0
          ? { _tag: "Skipped", role, reason: "Blank" }
          : { _tag: "Ready", role, prompt };
      });

      const snapshotWorkPhase = Effect.fnUntraced(function* (
        sourceOption: Option.Option<PhaseSource<"Work">>,
        workingDirectory: string,
      ): Effect.fn.Return<ReadyPhaseSnapshot<"Work">, PhaseInputError> {
        if (Option.isNone(sourceOption)) {
          return yield* new MissingWorkSource({
            message:
              "Work instructions are required. Pass --work/-w or --ralph-dir containing WORK.md.",
          });
        }

        const prompt = yield* readPhasePrompt(sourceOption.value, workingDirectory);
        if (prompt.trim().length === 0) {
          return yield* new BlankWork({
            path: sourceOption.value.path,
            message: `Work instructions are required; work file is blank: ${sourceOption.value.path}`,
          });
        }

        return { _tag: "Ready", role: "Work", prompt };
      });

      const prepareOnceSequence = Effect.fnUntraced(function* (input: OnceSequenceInput) {
        const workingDirectory = yield* canonicalWorkingDirectory(input.cwd);
        const ralphDirectory = yield* resolveRalphDirectory(input.ralphDir, workingDirectory);
        const beforeSource = resolvePhaseSource(
          "BeforeWork",
          input.before,
          ralphDirectory,
          workingDirectory,
        );
        const workSource = resolvePhaseSource("Work", input.work, ralphDirectory, workingDirectory);
        const afterSource = resolvePhaseSource(
          "AfterWork",
          input.after,
          ralphDirectory,
          workingDirectory,
        );
        const before = yield* snapshotOptionalPhase("BeforeWork", beforeSource, workingDirectory);
        const work = yield* snapshotWorkPhase(workSource, workingDirectory);
        const after = yield* snapshotOptionalPhase("AfterWork", afterSource, workingDirectory);

        return {
          workingDirectory,
          phases: { before, work, after },
          timeouts: input.timeouts,
          yolo: input.yolo,
        } satisfies PreparedOnceSequence;
      });

      return RalphWorkspace.of({
        init,
        prepareRunContext,
        prepareOnceSequence,
      });
    }),
  );
}
