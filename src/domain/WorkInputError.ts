import { Schema } from "effect";

import { PhaseRole } from "./WorkInvocation";

const PathField = { path: Schema.String, message: Schema.String };
const PhasePathField = { role: PhaseRole, ...PathField };

export class MissingWorkSource extends Schema.TaggedErrorClass<MissingWorkSource>()(
  "MissingWorkSource",
  { message: Schema.String },
) {}

export class InvalidWorkingDirectory extends Schema.TaggedErrorClass<InvalidWorkingDirectory>()(
  "InvalidWorkingDirectory",
  PathField,
) {}

export class InvalidRalphDirectory extends Schema.TaggedErrorClass<InvalidRalphDirectory>()(
  "InvalidRalphDirectory",
  PathField,
) {}

export class MissingPhaseFile extends Schema.TaggedErrorClass<MissingPhaseFile>()(
  "MissingPhaseFile",
  PhasePathField,
) {}

export class PhasePathNotFile extends Schema.TaggedErrorClass<PhasePathNotFile>()(
  "PhasePathNotFile",
  PhasePathField,
) {}

export class PhaseFileUnreadable extends Schema.TaggedErrorClass<PhaseFileUnreadable>()(
  "PhaseFileUnreadable",
  PhasePathField,
) {}

export class BlankWork extends Schema.TaggedErrorClass<BlankWork>()("BlankWork", PathField) {}

export class PhaseOutsideWorkingDirectory extends Schema.TaggedErrorClass<PhaseOutsideWorkingDirectory>()(
  "PhaseOutsideWorkingDirectory",
  {
    role: PhaseRole,
    path: Schema.String,
    workingDirectory: Schema.String,
    message: Schema.String,
  },
) {}

export type PhaseInputError =
  | MissingWorkSource
  | InvalidWorkingDirectory
  | InvalidRalphDirectory
  | MissingPhaseFile
  | PhasePathNotFile
  | PhaseFileUnreadable
  | BlankWork
  | PhaseOutsideWorkingDirectory;

export const phaseInputLabel = (role: PhaseRole): string => {
  switch (role) {
    case "BeforeWork":
      return "Before-work";
    case "Work":
      return "Work";
    case "AfterWork":
      return "After-work";
  }
};
