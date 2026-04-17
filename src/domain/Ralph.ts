import { Option } from "effect";

export const ralphFileNames = {
  checklist: "CHECKLIST.md",
  instructions: "INSTRUCTIONS.md",
  progress: "PROGRESS.md",
} as const;

export type RalphFileRole = keyof typeof ralphFileNames;

export interface RalphFilePaths {
  readonly checklist: string;
  readonly instructions: string;
  readonly progress: string;
}

export interface InitInput {
  readonly targetDirectory: Option.Option<string>;
}

export interface SharedFlagsInput {
  readonly checklist: Option.Option<string>;
  readonly instructions: Option.Option<string>;
  readonly progress: Option.Option<string>;
  readonly ralphDir: Option.Option<string>;
  readonly cwd: Option.Option<string>;
  readonly yolo: boolean;
}

export interface LoopFlagsInput extends SharedFlagsInput {
  readonly iterations: number;
}

export interface PreparedRunContext {
  readonly workingDirectory: string;
  readonly checklistPath: string;
  readonly instructionsPath: string;
  readonly progressPath: string;
  readonly yolo: boolean;
}
