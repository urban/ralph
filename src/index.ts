import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import { Effect } from "effect";
import * as Command from "effect/unstable/cli/Command";

import { cliVersion, ralphCommand } from "./cli/app";

const program = Command.run(ralphCommand, {
  version: cliVersion,
}).pipe(Effect.provide(BunServices.layer));

BunRuntime.runMain(program);
