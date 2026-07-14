import { assert, describe, it } from "@effect/vitest";
import { Duration, Effect } from "effect";

import { decodeCompactDuration, decodeTimeoutPolicy } from "./WorkInvocation";

describe("work invocation timeout policy", () => {
  it.effect("decodes the compact default durations", () =>
    Effect.gen(function* () {
      const policy = yield* decodeTimeoutPolicy("5m", "30m");

      assert.strictEqual(Duration.toMillis(policy.idle), Duration.toMillis(Duration.minutes(5)));
      assert.strictEqual(
        Duration.toMillis(policy.invocation),
        Duration.toMillis(Duration.minutes(30)),
      );
    }),
  );

  it.effect("rejects malformed compact durations", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(decodeCompactDuration("Idle", "five minutes"));

      assert.strictEqual(error._tag, "MalformedTimeout");
    }),
  );

  it.effect("rejects nonpositive compact durations", () =>
    Effect.gen(function* () {
      const zero = yield* Effect.flip(decodeCompactDuration("Idle", "0m"));
      const negative = yield* Effect.flip(decodeCompactDuration("Invocation", "-1s"));

      assert.strictEqual(zero._tag, "NonPositiveTimeout");
      assert.strictEqual(negative._tag, "NonPositiveTimeout");
    }),
  );

  it.effect("rejects equal and inverted timeout policies", () =>
    Effect.gen(function* () {
      const equal = yield* Effect.flip(decodeTimeoutPolicy("5m", "5m"));
      const inverted = yield* Effect.flip(decodeTimeoutPolicy("30m", "5m"));

      assert.strictEqual(equal._tag, "InvalidTimeoutOrder");
      assert.strictEqual(inverted._tag, "InvalidTimeoutOrder");
    }),
  );
});
