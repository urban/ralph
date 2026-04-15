import { Console, Effect, Runtime, Schema } from "effect";

export class RalphExit extends Schema.TaggedErrorClass<RalphExit>()("RalphExit", {
  message: Schema.String,
  exitCode: Schema.Number,
}) {
  override readonly [Runtime.errorReported] = false;
  override get [Runtime.errorExitCode](): number {
    return this.exitCode;
  }
}

export const failWithExitCode = (exitCode: number) =>
  Effect.fail(new RalphExit({ message: "", exitCode }));

export const failWithMessage = Effect.fn("failWithMessage")(function* (message: string) {
  yield* Console.error(message);
  return yield* new RalphExit({ message, exitCode: 1 });
});
