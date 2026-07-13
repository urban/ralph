import { Context, Effect, FileSystem, Layer, Option, Path } from "effect";

import {
  type IterationSnapshot,
  type OnceSequenceInput,
  type OptionalPhaseRole,
  type OptionalPhaseSnapshot,
  phaseFileNames,
  type PhaseRole,
  type PhaseSource,
  type PreparedWorkflow,
  type ReadyPhaseSnapshot,
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
  SnapshotDirectoryUnavailable,
  SnapshotWriteFailed,
} from "../domain/WorkInputError";
import type { RalphExit } from "../errors/RalphExit";
import { failWithMessage } from "../errors/RalphExit";

const initFileNames = Object.values(phaseFileNames);

const formatBackupTimestamp = () => new Date().toISOString().replace(/[-:.]/g, "");

interface PendingReadyPhaseSnapshot<Role extends PhaseRole = PhaseRole> {
  readonly _tag: "Ready";
  readonly role: Role;
  readonly contents: string;
}

type PendingOptionalPhaseSnapshot<Role extends OptionalPhaseRole> =
  | PendingReadyPhaseSnapshot<Role>
  | { readonly _tag: "Skipped"; readonly role: Role; readonly reason: "Missing" | "Blank" };

export class RalphWorkspace extends Context.Service<
  RalphWorkspace,
  {
    init(targetDirectory: Option.Option<string>): Effect.Effect<void, RalphExit>;
    prepareWorkflow(input: OnceSequenceInput): Effect.Effect<PreparedWorkflow, PhaseInputError>;
    snapshotIteration(
      workflow: PreparedWorkflow,
    ): Effect.Effect<IterationSnapshot, PhaseInputError>;
    cleanupIterationSnapshot(snapshot: IterationSnapshot): Effect.Effect<void>;
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

        return yield* Effect.forEach(initFileNames, (fileName) =>
          fileSystem.readFileString(path.join(templateDirectory, fileName)).pipe(
            Effect.map((content) => ({ fileName, content })),
            Effect.catch(() => failWithMessage(`Missing bundled template: ${fileName}`)),
          ),
        );
      });

      const init = Effect.fn("RalphWorkspace.init")(function* (
        targetDirectory: Option.Option<string>,
      ) {
        const targetPath = Option.match(targetDirectory, {
          onNone: () => path.resolve("."),
          onSome: resolveFromLaunchDirectory,
        });

        yield* validateInitTarget(targetPath);

        const templates = yield* readTemplateFiles();
        const targetFiles = templates.map(({ fileName, content }) => ({
          content,
          path: path.join(targetPath, fileName),
        }));

        yield* Effect.forEach(targetFiles, ({ path }) => validateWritableTargetFile(path), {
          discard: true,
        });
        yield* Effect.forEach(targetFiles, ({ path }) => backupExistingFile(path), {
          discard: true,
        });
        yield* Effect.forEach(
          targetFiles,
          ({ content, path }) =>
            fileSystem
              .writeFileString(path, content)
              .pipe(Effect.catch(() => failWithMessage(`Could not write file: ${path}`))),
          { discard: true },
        );
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
                  path: path.join(ralphDirectory, phaseFileNames[role]),
                }),
          onSome: (rawPath) =>
            Option.some({
              origin: "Explicit",
              role,
              path: path.resolve(workingDirectory, rawPath),
            }),
        });

      const readPhaseContents = Effect.fnUntraced(function* <Role extends PhaseRole>(
        source: PhaseSource<Role>,
        workingDirectory: string,
      ): Effect.fn.Return<
        { readonly canonicalPath: string; readonly contents: string },
        PhaseInputError
      > {
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
          try: () => ({
            canonicalPath,
            contents: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          }),
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
      ): Effect.fn.Return<PendingOptionalPhaseSnapshot<Role>, PhaseInputError> {
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

        const phase = yield* readPhaseContents(source, workingDirectory);
        return phase.contents.trim().length === 0
          ? { _tag: "Skipped", role, reason: "Blank" }
          : { _tag: "Ready", role, contents: phase.contents };
      });

      const snapshotWorkPhase = Effect.fnUntraced(function* (
        source: PhaseSource<"Work">,
        workingDirectory: string,
      ): Effect.fn.Return<PendingReadyPhaseSnapshot<"Work">, PhaseInputError> {
        const phase = yield* readPhaseContents(source, workingDirectory);
        if (phase.contents.trim().length === 0) {
          return yield* new BlankWork({
            path: phase.canonicalPath,
            message: `Work instructions are required; work file is blank: ${phase.canonicalPath}`,
          });
        }

        return { _tag: "Ready", role: "Work", contents: phase.contents };
      });

      const createSnapshotDirectory = Effect.fnUntraced(function* (workingDirectory: string) {
        return yield* fileSystem
          .makeTempDirectory({
            directory: workingDirectory,
            prefix: ".ralph-snapshot-",
          })
          .pipe(
            Effect.mapError(
              () =>
                new SnapshotDirectoryUnavailable({
                  path: workingDirectory,
                  message: `Could not create iteration snapshot directory in ${workingDirectory}`,
                }),
            ),
          );
      });

      const writeSnapshotPhase = Effect.fnUntraced(function* <Role extends PhaseRole>(
        snapshotDirectory: string,
        phase: PendingReadyPhaseSnapshot<Role>,
      ): Effect.fn.Return<ReadyPhaseSnapshot<Role>, SnapshotWriteFailed> {
        const snapshotPath = path.join(snapshotDirectory, phaseFileNames[phase.role]);
        yield* fileSystem.writeFileString(snapshotPath, phase.contents).pipe(
          Effect.mapError(
            () =>
              new SnapshotWriteFailed({
                role: phase.role,
                path: snapshotPath,
                message: `Could not write ${phaseInputLabel(phase.role)} snapshot: ${snapshotPath}`,
              }),
          ),
        );

        return { _tag: "Ready", role: phase.role, snapshotPath };
      });

      const materializeOptionalSnapshot = Effect.fnUntraced(function* <
        Role extends OptionalPhaseRole,
      >(
        snapshotDirectory: string,
        phase: PendingOptionalPhaseSnapshot<Role>,
      ): Effect.fn.Return<OptionalPhaseSnapshot<Role>, SnapshotWriteFailed> {
        if (phase._tag === "Skipped") {
          return phase;
        }

        return yield* writeSnapshotPhase(snapshotDirectory, phase);
      });

      const prepareWorkflow = Effect.fnUntraced(function* (input: OnceSequenceInput) {
        const workingDirectory = yield* canonicalWorkingDirectory(input.cwd);
        const ralphDirectory = yield* resolveRalphDirectory(input.ralphDir, workingDirectory);
        const before = resolvePhaseSource(
          "BeforeWork",
          input.before,
          ralphDirectory,
          workingDirectory,
        );
        const workOption = resolvePhaseSource("Work", input.work, ralphDirectory, workingDirectory);
        const after = resolvePhaseSource(
          "AfterWork",
          input.after,
          ralphDirectory,
          workingDirectory,
        );

        if (Option.isNone(workOption)) {
          return yield* new MissingWorkSource({
            message:
              "Work instructions are required. Pass --work/-w or --ralph-dir containing WORK.md.",
          });
        }

        return {
          workingDirectory,
          sources: { before, work: workOption.value, after },
          timeouts: input.timeouts,
          yolo: input.yolo,
        } satisfies PreparedWorkflow;
      });

      const snapshotIteration = Effect.fnUntraced(function* (workflow: PreparedWorkflow) {
        const pendingBefore = yield* snapshotOptionalPhase(
          "BeforeWork",
          workflow.sources.before,
          workflow.workingDirectory,
        );
        const pendingWork = yield* snapshotWorkPhase(
          workflow.sources.work,
          workflow.workingDirectory,
        );
        const pendingAfter = yield* snapshotOptionalPhase(
          "AfterWork",
          workflow.sources.after,
          workflow.workingDirectory,
        );
        const snapshotDirectory = yield* createSnapshotDirectory(workflow.workingDirectory);
        const before = yield* materializeOptionalSnapshot(snapshotDirectory, pendingBefore);
        const work = yield* writeSnapshotPhase(snapshotDirectory, pendingWork);
        const after = yield* materializeOptionalSnapshot(snapshotDirectory, pendingAfter);

        return { snapshotDirectory, before, work, after } satisfies IterationSnapshot;
      });

      const cleanupIterationSnapshot = Effect.fnUntraced(function* (snapshot: IterationSnapshot) {
        yield* fileSystem
          .remove(snapshot.snapshotDirectory, { recursive: true })
          .pipe(Effect.catch(() => Effect.void));
      });

      return RalphWorkspace.of({
        cleanupIterationSnapshot,
        init,
        prepareWorkflow,
        snapshotIteration,
      });
    }),
  );
}
