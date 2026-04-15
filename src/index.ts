import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import { Effect, Layer } from "effect";
import * as Command from "effect/unstable/cli/Command";

import { cliVersion, ralphCommand } from "./cli/app";
import { RalphRunner } from "./ralph/run";

const appLayer = RalphRunner.layer.pipe(Layer.provideMerge(BunServices.layer));

const program = Command.run(ralphCommand, {
  version: cliVersion,
}).pipe(Effect.provide(appLayer));

BunRuntime.runMain(program);
