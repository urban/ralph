import * as BunServices from "@effect/platform-bun/BunServices";
import { assert, it } from "@effect/vitest";
import { Effect, Option, Ref, Sink, Stdio, Stream } from "effect";
import { Command } from "effect/unstable/cli";

import type { OnceFlagsInput } from "../domain/WorkInvocation";
import { CodexRunner } from "../services/CodexRunner";
import { HostTools } from "../services/HostTools";
import { RalphRunner } from "../services/RalphRunner";
import { RalphWorkspace } from "../services/RalphWorkspace";
import { commandOnce } from "./once";

const runOnce = Command.runWith(commandOnce, { version: "test" });

it.effect("rejects removed legacy flags as ordinary unrecognized options", () =>
  Effect.gen(function* () {
    const runner = RalphRunner.of({
      runOnce: () => Effect.die("removed flags must fail before delegation"),
      runLoop: () => Effect.die("loop is not part of once parsing"),
    });

    yield* Effect.forEach(
      ["--checklist", "--instructions", "--progress"],
      (flag) =>
        Effect.gen(function* () {
          const error = yield* runOnce([flag, "./legacy.md"]).pipe(
            Effect.provideService(RalphRunner, runner),
            Effect.provide(BunServices.layer),
            Effect.flip,
          );

          assert.strictEqual(error._tag, "ShowHelp");
          if (error._tag === "ShowHelp") {
            assert.strictEqual(error.errors.length, 1);
            const unrecognized = error.errors.filter(
              (candidate) => candidate._tag === "UnrecognizedOption",
            );
            assert.deepStrictEqual(
              unrecognized.map((candidate) => candidate.option),
              [flag],
            );
          }
        }),
      { discard: true },
    );
  }),
);

it.effect("once parses aliases, yolo, and compact timeout defaults before delegating", () =>
  Effect.gen(function* () {
    const captured = yield* Ref.make(Option.none<OnceFlagsInput>());
    const runner = RalphRunner.of({
      runOnce: (input) => Ref.set(captured, Option.some(input)),
      runLoop: () => Effect.die("loop is not part of once parsing"),
    });

    yield* runOnce([
      "-b",
      "./BEFORE.md",
      "-w",
      "./WORK.md",
      "-a",
      "./AFTER.md",
      "-C",
      "./project",
      "--yolo",
    ]).pipe(Effect.provideService(RalphRunner, runner), Effect.provide(BunServices.layer));

    const input = yield* Ref.get(captured);
    assert.isTrue(Option.isSome(input));
    if (Option.isNone(input)) {
      return;
    }

    assert.deepStrictEqual(input.value.before, Option.some("./BEFORE.md"));
    assert.deepStrictEqual(input.value.work, Option.some("./WORK.md"));
    assert.deepStrictEqual(input.value.after, Option.some("./AFTER.md"));
    assert.deepStrictEqual(input.value.cwd, Option.some("./project"));
    assert.isTrue(input.value.yolo);
    assert.strictEqual(input.value.idleTimeout, "5m");
    assert.strictEqual(input.value.invocationTimeout, "30m");
  }),
);

it.effect("once passes explicit timeout overrides to the runner", () =>
  Effect.gen(function* () {
    const captured = yield* Ref.make(Option.none<OnceFlagsInput>());
    const runner = RalphRunner.of({
      runOnce: (input) => Ref.set(captured, Option.some(input)),
      runLoop: () => Effect.die("loop is not part of once parsing"),
    });

    yield* runOnce([
      "--ralph-dir",
      "./.ralph",
      "--idle-timeout",
      "45s",
      "--invocation-timeout",
      "20m",
    ]).pipe(Effect.provideService(RalphRunner, runner), Effect.provide(BunServices.layer));

    const input = yield* Ref.get(captured);
    assert.isTrue(Option.isSome(input));
    if (Option.isNone(input)) {
      return;
    }

    assert.deepStrictEqual(input.value.ralphDir, Option.some("./.ralph"));
    assert.strictEqual(input.value.idleTimeout, "45s");
    assert.strictEqual(input.value.invocationTimeout, "20m");
  }),
);

it.effect("once composes parsed input through the fake Codex boundary", () =>
  Effect.gen(function* () {
    const invocations = yield* Ref.make(0);
    const notifications = yield* Ref.make(0);
    const codexRunner = CodexRunner.of({
      runInvocation: () =>
        Ref.update(invocations, (count) => count + 1).pipe(
          Effect.as({ invocationComplete: true, workflowComplete: false }),
        ),
    });
    const workspace = RalphWorkspace.of({
      init: () => Effect.die("init is not part of once"),
      prepareWorkflow: (input) =>
        Effect.succeed({
          workingDirectory: "/workspace",
          sources: {
            before: Option.none(),
            work: { origin: "Explicit", role: "Work", path: "/workspace/WORK.md" },
            after: Option.none(),
          },
          timeouts: input.timeouts,
          yolo: input.yolo,
        }),
      snapshotIteration: () =>
        Effect.succeed({
          snapshotDirectory: "/workspace/.ralph-snapshot-test",
          before: { _tag: "Skipped", role: "BeforeWork", reason: "Missing" },
          work: {
            _tag: "Ready",
            role: "Work",
            snapshotPath: "/workspace/.ralph-snapshot-test/WORK.md",
          },
          after: { _tag: "Skipped", role: "AfterWork", reason: "Missing" },
        }),
      cleanupIterationSnapshot: () => Effect.void,
    });
    const hostTools = HostTools.of({
      commandExists: () => Effect.succeed(true),
      ensureCommandAvailable: () => Effect.void,
      notifyIfAvailable: () => Ref.update(notifications, (count) => count + 1),
    });
    const stdio = Stdio.make({
      args: Effect.succeed([]),
      stdin: Stream.empty,
      stdout: () => Sink.drain,
      stderr: () => Sink.drain,
    });

    yield* runOnce(["--work", "./WORK.md"]).pipe(
      Effect.provide(RalphRunner.layer),
      Effect.provideService(CodexRunner, codexRunner),
      Effect.provideService(RalphWorkspace, workspace),
      Effect.provideService(HostTools, hostTools),
      Effect.provideService(Stdio.Stdio, stdio),
      Effect.provide(BunServices.layer),
    );

    assert.strictEqual(yield* Ref.get(invocations), 1);
    assert.strictEqual(yield* Ref.get(notifications), 1);
  }),
);
