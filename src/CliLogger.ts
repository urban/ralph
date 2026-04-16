import { Logger, Match } from "effect";

const cliLogger = Logger.make(({ logLevel, message }) => {
  Match.value(logLevel).pipe(
    Match.when("Info", () => {
      globalThis.console.info(`${message}`);
    }),
    Match.when("Error", () => {
      globalThis.console.error(`${message}`);
    }),
    Match.when("Warn", () => {
      globalThis.console.warn(`${message}`);
    }),
    Match.when("Fatal", () => {
      globalThis.console.error(`${message}`);
    }),
    Match.orElse(() => {
      globalThis.console.log(`[${logLevel}] ${message}`);
    }),
  );
});

export { cliLogger };
