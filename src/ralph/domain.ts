import { Option } from "effect";

export interface BundledInputFiles {
  readonly checklist: string;
  readonly instructions: string;
  readonly progress: string;
}

export interface SharedFlagsInput {
  readonly checklist: Option.Option<string>;
  readonly instructions: Option.Option<string>;
  readonly progress: Option.Option<string>;
  readonly yolo: boolean;
}

export interface PreparedRunContext {
  readonly workingDirectory: string;
  readonly checklistPath: string;
  readonly instructionsPath: string;
  readonly progressPath: string;
  readonly yolo: boolean;
}
