import { Flag } from "effect/unstable/cli";

import { IterationLimit } from "../domain/WorkInvocation";

const makePhaseFlags = () => ({
  before: Flag.string("before").pipe(
    Flag.withAlias("b"),
    Flag.withDescription("Optional before-work instruction file"),
    Flag.optional,
  ),
  work: Flag.string("work").pipe(
    Flag.withAlias("w"),
    Flag.withDescription("Required work instruction file"),
    Flag.optional,
  ),
  after: Flag.string("after").pipe(
    Flag.withAlias("a"),
    Flag.withDescription("Optional after-work instruction file"),
    Flag.optional,
  ),
  ralphDir: Flag.string("ralph-dir").pipe(
    Flag.withAlias("d"),
    Flag.withDescription("Directory containing phase instruction files"),
    Flag.optional,
  ),
  cwd: Flag.string("cwd").pipe(
    Flag.withAlias("C"),
    Flag.withDescription("Working directory for codex exec"),
    Flag.optional,
  ),
  idleTimeout: Flag.string("idle-timeout").pipe(
    Flag.withDescription("Maximum inactivity duration"),
    Flag.withDefault("5m"),
  ),
  invocationTimeout: Flag.string("invocation-timeout").pipe(
    Flag.withDescription("Maximum invocation duration"),
    Flag.withDefault("30m"),
  ),
  yolo: Flag.boolean("yolo").pipe(
    Flag.withDescription("Use --dangerously-bypass-approvals-and-sandbox"),
  ),
});

const iterationsFlag = Flag.integer("iterations").pipe(
  Flag.withAlias("n"),
  Flag.withDescription("Number of iterations to run"),
  Flag.filter(
    (value) => value > 0,
    (value) => `Expected a positive integer, got ${value}`,
  ),
  Flag.map(IterationLimit.make),
  Flag.withDefault(IterationLimit.make(10)),
);

export { iterationsFlag, makePhaseFlags };
