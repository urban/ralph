import { Option } from "effect";

export interface InitInput {
  readonly targetDirectory: Option.Option<string>;
}
