import { Flag } from "effect/unstable/cli";

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

export { makePhaseFlags };
