import { Effect, Path } from "effect";

import type { SharedFlagsInput } from "./domain.js";
import { ensureRegularFile, resolveBundledInputFiles, resolveInputFilePath } from "./files.js";
import { ensureCommandAvailable } from "./system.js";

export const prepareRunContext = Effect.fn("prepareRunContext")(function* (
  input: SharedFlagsInput,
) {
  const path = yield* Path.Path;

  yield* ensureCommandAvailable("codex", "Codex CLI");

  const bundledFiles = yield* resolveBundledInputFiles();
  const checklistPath = yield* resolveInputFilePath(input.checklist, bundledFiles.checklist);
  const instructionsPath = yield* resolveInputFilePath(
    input.instructions,
    bundledFiles.instructions,
  );
  const progressPath = yield* resolveInputFilePath(input.progress, bundledFiles.progress);

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
