import * as BunServices from "@effect/platform-bun/BunServices";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Option, Ref, Result } from "effect";
import { Command } from "effect/unstable/cli";

import type { LoopFlagsInput } from "../domain/WorkInvocation";
import { IterationLimit, LoopExhausted } from "../domain/WorkInvocation";
import { RalphExit } from "../errors/RalphExit";
import { RalphRunner } from "../services/RalphRunner";
import { commandLoop } from "./loop";

const runLoop = Command.runWith(commandLoop, { version: "test" });

const makeRunner = (captured: Ref.Ref<Array<LoopFlagsInput>>) =>
  RalphRunner.of({
    runOnce: () => Effect.die("once is not part of loop parsing"),
    runLoop: (input) => Ref.update(captured, (inputs) => [...inputs, input]),
  });

describe("loop command", () => {
  it.effect("uses ten iterations by default and shares the phase flags", () =>
    Effect.gen(function* () {
      const captured = yield* Ref.make<Array<LoopFlagsInput>>([]);

      yield* runLoop([
        "-b",
        "./BEFORE.md",
        "-w",
        "./WORK.md",
        "-a",
        "./AFTER.md",
        "-C",
        "./project",
        "--yolo",
      ]).pipe(
        Effect.provideService(RalphRunner, makeRunner(captured)),
        Effect.provide(BunServices.layer),
      );

      const inputs = yield* Ref.get(captured);
      assert.strictEqual(inputs.length, 1);
      const input = inputs[0];
      if (input === undefined) {
        return;
      }

      assert.strictEqual(input.iterations, 10);
      assert.deepStrictEqual(input.before, Option.some("./BEFORE.md"));
      assert.deepStrictEqual(input.work, Option.some("./WORK.md"));
      assert.deepStrictEqual(input.after, Option.some("./AFTER.md"));
      assert.deepStrictEqual(input.cwd, Option.some("./project"));
      assert.strictEqual(input.idleTimeout, "5m");
      assert.strictEqual(input.invocationTimeout, "30m");
      assert.isTrue(input.yolo);
    }),
  );

  it.effect("accepts a positive short iteration override", () =>
    Effect.gen(function* () {
      const captured = yield* Ref.make<Array<LoopFlagsInput>>([]);

      yield* runLoop(["--work", "./WORK.md", "-n", "3"]).pipe(
        Effect.provideService(RalphRunner, makeRunner(captured)),
        Effect.provide(BunServices.layer),
      );

      const inputs = yield* Ref.get(captured);
      assert.strictEqual(inputs.length, 1);
      assert.strictEqual(inputs[0]?.iterations, 3);
    }),
  );

  it.effect("maps typed loop exhaustion to a nonzero process exit", () =>
    Effect.gen(function* () {
      const exhausted = new LoopExhausted({
        iterations: IterationLimit.make(10),
        message: "Loop exhausted.",
      });
      const runner = RalphRunner.of({
        runOnce: () => Effect.die("once is not part of loop parsing"),
        runLoop: () => Effect.fail(exhausted),
      });

      const result = yield* runLoop(["--work", "./WORK.md"]).pipe(
        Effect.provideService(RalphRunner, runner),
        Effect.provide(BunServices.layer),
        Effect.result,
      );

      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.isTrue(result.failure instanceof RalphExit);
        if (result.failure instanceof RalphExit) {
          assert.strictEqual(result.failure.exitCode, 1);
        }
      }
    }),
  );

  it.effect("rejects zero, negative, and malformed iterations before delegation", () =>
    Effect.gen(function* () {
      const captured = yield* Ref.make<Array<LoopFlagsInput>>([]);
      const runner = makeRunner(captured);

      const results = yield* Effect.forEach(["0", "-2", "many"], (iterations) =>
        runLoop(["--work", "./WORK.md", "--iterations", iterations]).pipe(
          Effect.provideService(RalphRunner, runner),
          Effect.provide(BunServices.layer),
          Effect.result,
        ),
      );

      assert.isTrue(results.every(Result.isFailure));
      assert.deepStrictEqual(yield* Ref.get(captured), []);
    }),
  );
});
