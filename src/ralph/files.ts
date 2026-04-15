import { Effect, FileSystem, Option, Path } from "effect";

import { failWithMessage } from "./errors";

export const resolveBundledInputFiles = Effect.fn("resolveBundledInputFiles")(
  function* () {
    const path = yield* Path.Path;
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

export const resolveInputFilePath = Effect.fn("resolveInputFilePath")(function* (
  rawPath: Option.Option<string>,
  defaultPath: string,
) {
  const path = yield* Path.Path;

  return Option.match(rawPath, {
    onNone: () => defaultPath,
    onSome: (value) => (path.isAbsolute(value) ? value : path.resolve(value)),
  });
});

export const ensureRegularFile = Effect.fn("ensureRegularFile")(function* (
  filePath: string,
  fileLabel: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const info = yield* fileSystem
    .stat(filePath)
    .pipe(Effect.catch(() => failWithMessage(`${fileLabel} not found: ${filePath}`)));

  if (info.type !== "File") {
    return yield* failWithMessage(`${fileLabel} not found: ${filePath}`);
  }
});
