import { Logger, Match } from "effect";

const cliLogger = Logger.make(({ logLevel, message }) =>
  Match.value(logLevel).pipe(
    Match.whenOr("Info", "Error", "Warn", "Fatal", () => `${message}`),
    Match.orElse(() => `[${logLevel}] ${message}`),
  ),
).pipe(Logger.withLeveledConsole);

export { cliLogger };
