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

it.effect("once parses aliases, yolo, and compact timeout defaults before delegating", () =>
  Effect.gen(function* () {
    const captured = yield* Ref.make(Option.none<OnceFlagsInput>());
    const runner = RalphRunner.of({
      runOnce: (input) => Ref.set(captured, Option.some(input)),
    });

    yield* runOnce(["-w", "./WORK.md", "-C", "./project", "--yolo"]).pipe(
      Effect.provideService(RalphRunner, runner),
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
    assert.strictEqual(input.value.idleTimeout, "5m");
    assert.strictEqual(input.value.invocationTimeout, "30m");
  }),
);

it.effect("once passes explicit timeout overrides to the runner", () =>
  Effect.gen(function* () {
    const captured = yield* Ref.make(Option.none<OnceFlagsInput>());
    const runner = RalphRunner.of({
      runOnce: (input) => Ref.set(captured, Option.some(input)),
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
      run: () => Effect.die("legacy run is not part of once"),
      runCapture: () => Effect.die("legacy capture is not part of once"),
      isChecklistComplete: () => false,
    });
    const workspace = RalphWorkspace.of({
      init: () => Effect.die("init is not part of once"),
      prepareRunContext: () => Effect.die("legacy runtime is not part of once"),
      prepareWorkInvocation: (input) =>
        Effect.succeed({
          workingDirectory: "/workspace",
          work: { _tag: "Ready", role: "Work", prompt: "Do one thing." },
          timeouts: input.timeouts,
          yolo: input.yolo,
        }),
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
