import { Duration, Effect, Option, Schema } from "effect";

const TimeoutField = Schema.Literals(["Idle", "Invocation"]);
export type TimeoutField = typeof TimeoutField.Type;

export class MalformedTimeout extends Schema.TaggedErrorClass<MalformedTimeout>()(
  "MalformedTimeout",
  {
    field: TimeoutField,
    input: Schema.String,
    message: Schema.String,
  },
) {}

export class NonPositiveTimeout extends Schema.TaggedErrorClass<NonPositiveTimeout>()(
  "NonPositiveTimeout",
  {
    field: TimeoutField,
    input: Schema.String,
    message: Schema.String,
  },
) {}

export class InvalidTimeoutOrder extends Schema.TaggedErrorClass<InvalidTimeoutOrder>()(
  "InvalidTimeoutOrder",
  {
    message: Schema.String,
  },
) {}

export type TimeoutInputError = MalformedTimeout | NonPositiveTimeout | InvalidTimeoutOrder;

export interface TimeoutPolicy {
  readonly idle: Duration.Duration;
  readonly invocation: Duration.Duration;
}

export interface OnceFlagsInput {
  readonly before: Option.Option<string>;
  readonly work: Option.Option<string>;
  readonly after: Option.Option<string>;
  readonly ralphDir: Option.Option<string>;
  readonly cwd: Option.Option<string>;
  readonly idleTimeout: string;
  readonly invocationTimeout: string;
  readonly yolo: boolean;
}

export const IterationLimit = Schema.Int.check(Schema.isGreaterThan(0)).pipe(
  Schema.brand("IterationLimit"),
  Schema.annotate({ identifier: "IterationLimit" }),
);
export type IterationLimit = typeof IterationLimit.Type;

export interface LoopFlagsInput extends OnceFlagsInput {
  readonly iterations: IterationLimit;
}

export class LoopExhausted extends Schema.TaggedErrorClass<LoopExhausted>()("LoopExhausted", {
  iterations: IterationLimit,
  message: Schema.String,
}) {}

export interface OnceSequenceInput {
  readonly before: Option.Option<string>;
  readonly work: Option.Option<string>;
  readonly after: Option.Option<string>;
  readonly ralphDir: Option.Option<string>;
  readonly cwd: Option.Option<string>;
  readonly yolo: boolean;
  readonly timeouts: TimeoutPolicy;
}

export const PhaseRole = Schema.Literals(["BeforeWork", "Work", "AfterWork"]).annotate({
  identifier: "PhaseRole",
});
export type PhaseRole = typeof PhaseRole.Type;
export type OptionalPhaseRole = Exclude<PhaseRole, "Work">;

export const phaseFileNames: Readonly<Record<PhaseRole, string>> = {
  BeforeWork: "BEFORE_WORK.md",
  Work: "WORK.md",
  AfterWork: "AFTER_WORK.md",
};

export type PhaseSource<Role extends PhaseRole = PhaseRole> =
  | { readonly origin: "Explicit"; readonly role: Role; readonly path: string }
  | { readonly origin: "RalphDirectory"; readonly role: Role; readonly path: string };

export interface ReadyPhaseSnapshot<Role extends PhaseRole = PhaseRole> {
  readonly _tag: "Ready";
  readonly role: Role;
  readonly prompt: string;
}

export interface SkippedPhaseSnapshot<Role extends OptionalPhaseRole = OptionalPhaseRole> {
  readonly _tag: "Skipped";
  readonly role: Role;
  readonly reason: "Missing" | "Blank";
}

export type OptionalPhaseSnapshot<Role extends OptionalPhaseRole> =
  | ReadyPhaseSnapshot<Role>
  | SkippedPhaseSnapshot<Role>;

export type PhaseSnapshot = ReadyPhaseSnapshot | SkippedPhaseSnapshot;

export interface IterationSnapshot {
  readonly before: OptionalPhaseSnapshot<"BeforeWork">;
  readonly work: ReadyPhaseSnapshot<"Work">;
  readonly after: OptionalPhaseSnapshot<"AfterWork">;
}

export interface ResolvedPhaseSources {
  readonly before: Option.Option<PhaseSource<"BeforeWork">>;
  readonly work: PhaseSource<"Work">;
  readonly after: Option.Option<PhaseSource<"AfterWork">>;
}

export interface PreparedWorkflow {
  readonly workingDirectory: string;
  readonly sources: ResolvedPhaseSources;
  readonly timeouts: TimeoutPolicy;
  readonly yolo: boolean;
}

export interface InvocationRequest {
  readonly workingDirectory: string;
  readonly prompt: string;
  readonly timeouts: TimeoutPolicy;
  readonly yolo: boolean;
}

export interface InvocationOutcome {
  readonly invocationComplete: true;
  readonly workflowComplete: boolean;
}

export class CodexSpawnError extends Schema.TaggedErrorClass<CodexSpawnError>()("CodexSpawnError", {
  message: Schema.String,
}) {}

export class CodexStreamError extends Schema.TaggedErrorClass<CodexStreamError>()(
  "CodexStreamError",
  {
    stream: Schema.Literals(["Stdout", "Stderr"]),
    message: Schema.String,
  },
) {}

export class CodexExitStatusError extends Schema.TaggedErrorClass<CodexExitStatusError>()(
  "CodexExitStatusError",
  { message: Schema.String },
) {}

export class CodexExitError extends Schema.TaggedErrorClass<CodexExitError>()("CodexExitError", {
  exitCode: Schema.Number,
  message: Schema.String,
}) {}

export class MissingInvocationMarker extends Schema.TaggedErrorClass<MissingInvocationMarker>()(
  "MissingInvocationMarker",
  { message: Schema.String },
) {}

export class IdleInvocationTimeout extends Schema.TaggedErrorClass<IdleInvocationTimeout>()(
  "IdleInvocationTimeout",
  { message: Schema.String },
) {}

export class AbsoluteInvocationTimeout extends Schema.TaggedErrorClass<AbsoluteInvocationTimeout>()(
  "AbsoluteInvocationTimeout",
  { message: Schema.String },
) {}

export class CodexTerminationError extends Schema.TaggedErrorClass<CodexTerminationError>()(
  "CodexTerminationError",
  { message: Schema.String },
) {}

export class OperatorOutputError extends Schema.TaggedErrorClass<OperatorOutputError>()(
  "OperatorOutputError",
  { message: Schema.String },
) {}

export type CodexInvocationError =
  | CodexSpawnError
  | CodexStreamError
  | CodexExitStatusError
  | CodexExitError
  | MissingInvocationMarker
  | IdleInvocationTimeout
  | AbsoluteInvocationTimeout
  | CodexTerminationError;

const CompactDuration = Schema.TemplateLiteralParser([
  Schema.Int,
  Schema.Literals(["ms", "s", "m", "h"]),
]).annotate({ identifier: "CompactDuration" });

const decodeCompactDurationParts = Schema.decodeUnknownEffect(CompactDuration);

const timeoutLabel = (field: TimeoutField): string =>
  field === "Idle" ? "Idle timeout" : "Invocation timeout";

const durationFromParts = (value: number, unit: "ms" | "s" | "m" | "h"): Duration.Duration => {
  switch (unit) {
    case "ms":
      return Duration.millis(value);
    case "s":
      return Duration.seconds(value);
    case "m":
      return Duration.minutes(value);
    case "h":
      return Duration.hours(value);
  }
};

export const decodeCompactDuration = Effect.fnUntraced(function* (
  field: TimeoutField,
  input: string,
): Effect.fn.Return<Duration.Duration, MalformedTimeout | NonPositiveTimeout> {
  const parts = yield* decodeCompactDurationParts(input).pipe(
    Effect.mapError(
      () =>
        new MalformedTimeout({
          field,
          input,
          message: `${timeoutLabel(field)} must be a positive integer followed by ms, s, m, or h; received ${input}.`,
        }),
    ),
  );
  const [value, unit] = parts;

  if (value <= 0) {
    return yield* new NonPositiveTimeout({
      field,
      input,
      message: `${timeoutLabel(field)} must be positive; received ${input}.`,
    });
  }

  const duration = durationFromParts(value, unit);
  if (!Number.isFinite(Duration.toMillis(duration))) {
    return yield* new MalformedTimeout({
      field,
      input,
      message: `${timeoutLabel(field)} is too large; received ${input}.`,
    });
  }

  return duration;
});

export const decodeTimeoutPolicy = Effect.fnUntraced(function* (
  idleInput: string,
  invocationInput: string,
): Effect.fn.Return<TimeoutPolicy, TimeoutInputError> {
  const idle = yield* decodeCompactDuration("Idle", idleInput);
  const invocation = yield* decodeCompactDuration("Invocation", invocationInput);

  if (Duration.toMillis(idle) >= Duration.toMillis(invocation)) {
    return yield* new InvalidTimeoutOrder({
      message: "Idle timeout must be strictly less than invocation timeout.",
    });
  }

  return { idle, invocation };
});
