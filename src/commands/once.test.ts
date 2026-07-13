import * as BunServices from "@effect/platform-bun/BunServices";
import { assert, it } from "@effect/vitest";
import { Duration, Effect, Option, Ref } from "effect";
import { Command } from "effect/unstable/cli";

import type { WorkInvocationInput } from "../domain/WorkInvocation";
import { HostTools } from "../services/HostTools";
import { RalphWorkspace } from "../services/RalphWorkspace";
import { commandOnce } from "./once";

const runOnce = Command.runWith(commandOnce, { version: "test" });

it.effect("once parses -w, -C, --yolo, and compact timeout defaults", () =>
  Effect.gen(function* () {
    const captured = yield* Ref.make(Option.none<WorkInvocationInput>());
    const codexChecks = yield* Ref.make(0);
    const workspace = RalphWorkspace.of({
      init: () => Effect.die("init is not part of once parsing"),
      prepareRunContext: () => Effect.die("legacy runtime is not part of once parsing"),
      prepareWorkInvocation: (input) =>
        Ref.set(captured, Option.some(input)).pipe(
          Effect.as({
            workingDirectory: "/project",
            work: { _tag: "Ready", role: "Work", prompt: "work" },
            timeouts: input.timeouts,
            yolo: input.yolo,
          }),
        ),
    });
    const hostTools = HostTools.of({
      commandExists: () => Effect.succeed(true),
      ensureCommandAvailable: () => Ref.update(codexChecks, (count) => count + 1),
      notifyIfAvailable: () => Effect.void,
    });

    yield* runOnce(["-w", "./WORK.md", "-C", "./project", "--yolo"]).pipe(
      Effect.provideService(RalphWorkspace, workspace),
      Effect.provideService(HostTools, hostTools),
      Effect.provide(BunServices.layer),
    );

    const input = yield* Ref.get(captured);
    assert.isTrue(Option.isSome(input));
    if (Option.isNone(input)) {
      return;
    }

    assert.deepStrictEqual(input.value.work, Option.some("./WORK.md"));
    assert.deepStrictEqual(input.value.cwd, Option.some("./project"));
    assert.isTrue(input.value.yolo);
    assert.strictEqual(
      Duration.toMillis(input.value.timeouts.idle),
      Duration.toMillis(Duration.minutes(5)),
    );
    assert.strictEqual(
      Duration.toMillis(input.value.timeouts.invocation),
      Duration.toMillis(Duration.minutes(30)),
    );
    assert.strictEqual(yield* Ref.get(codexChecks), 1);
  }),
);

it.effect("once rejects invalid timeout order before workspace or process work", () =>
  Effect.gen(function* () {
    const workspaceCalls = yield* Ref.make(0);
    const codexChecks = yield* Ref.make(0);
    const workspace = RalphWorkspace.of({
      init: () => Effect.die("init is not part of once parsing"),
      prepareRunContext: () => Effect.die("legacy runtime is not part of once parsing"),
      prepareWorkInvocation: () =>
        Ref.update(workspaceCalls, (count) => count + 1).pipe(
          Effect.andThen(Effect.die("workspace must not run for invalid timeouts")),
        ),
    });
    const hostTools = HostTools.of({
      commandExists: () => Effect.succeed(true),
      ensureCommandAvailable: () => Ref.update(codexChecks, (count) => count + 1),
      notifyIfAvailable: () => Effect.void,
    });

    const exit = yield* runOnce([
      "--work",
      "./WORK.md",
      "--idle-timeout",
      "30m",
      "--invocation-timeout",
      "5m",
    ]).pipe(
      Effect.provideService(RalphWorkspace, workspace),
      Effect.provideService(HostTools, hostTools),
      Effect.provide(BunServices.layer),
      Effect.exit,
    );

    assert.isTrue(exit._tag === "Failure");
    assert.strictEqual(yield* Ref.get(workspaceCalls), 0);
    assert.strictEqual(yield* Ref.get(codexChecks), 0);
  }),
);
