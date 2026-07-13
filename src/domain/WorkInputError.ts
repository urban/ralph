import { Schema } from "effect";

const PathField = { path: Schema.String, message: Schema.String };

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

export class MissingWorkFile extends Schema.TaggedErrorClass<MissingWorkFile>()(
  "MissingWorkFile",
  PathField,
) {}

export class WorkPathNotFile extends Schema.TaggedErrorClass<WorkPathNotFile>()(
  "WorkPathNotFile",
  PathField,
) {}

export class WorkFileUnreadable extends Schema.TaggedErrorClass<WorkFileUnreadable>()(
  "WorkFileUnreadable",
  PathField,
) {}

export class BlankWork extends Schema.TaggedErrorClass<BlankWork>()("BlankWork", PathField) {}

export class WorkOutsideWorkingDirectory extends Schema.TaggedErrorClass<WorkOutsideWorkingDirectory>()(
  "WorkOutsideWorkingDirectory",
  {
    path: Schema.String,
    workingDirectory: Schema.String,
    message: Schema.String,
  },
) {}

export type WorkInputError =
  | MissingWorkSource
  | InvalidWorkingDirectory
  | InvalidRalphDirectory
  | MissingWorkFile
  | WorkPathNotFile
  | WorkFileUnreadable
  | BlankWork
  | WorkOutsideWorkingDirectory;
