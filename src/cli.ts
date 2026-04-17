#!/usr/bin/env bun

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, Layer, Logger } from "effect";
import { Command } from "effect/unstable/cli";
import pkg from "../package.json" with { type: "json" };

import { cliLogger } from "./CliLogger";
import { commandInit } from "./commands/init";
import { commandLoop } from "./commands/loop";
import { commandOnce } from "./commands/once";
import { CodexRunner } from "./services/CodexRunner";
import { HostTools } from "./services/HostTools";
import { RalphWorkspace } from "./services/RalphWorkspace";

const cli = Command.make("ralph").pipe(
  Command.withDescription("Initialize Ralph files or run Codex against Ralph inputs"),
  Command.withSubcommands([commandInit, commandOnce, commandLoop]),
);

const MainLayer = Layer.mergeAll(
  CodexRunner.layer,
  HostTools.layer,
  RalphWorkspace.layer,
  Logger.layer([cliLogger]),
).pipe(Layer.provideMerge(BunServices.layer));

const program = cli.pipe(Command.run({ version: pkg.version }), Effect.provide(MainLayer));

const runCli = () => BunRuntime.runMain(program);

if (import.meta.main) {
  runCli();
}

export { MainLayer, cli, program, runCli };
