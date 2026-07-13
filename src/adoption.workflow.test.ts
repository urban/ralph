import * as BunServices from "@effect/platform-bun/BunServices";
import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem, Path, Stream } from "effect";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

interface ProcessResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

const runCommand = Effect.fnUntraced(function* (command: ChildProcess.Command) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const handle = yield* spawner.spawn(command);
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [
      handle.stdout.pipe(Stream.decodeText(), Stream.mkString),
      handle.stderr.pipe(Stream.decodeText(), Stream.mkString),
      handle.exitCode,
    ],
    { concurrency: "unbounded" },
  );

  return { exitCode: Number(exitCode), stderr, stdout } satisfies ProcessResult;
});

const writeExecutable = Effect.fnUntraced(function* (filePath: string, content: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  yield* fileSystem.writeFileString(filePath, content);
  yield* fileSystem.chmod(filePath, 0o755);
});

const fakeCodex = `#!/bin/sh
prompt=""
for argument do
  prompt="$argument"
done

case "$prompt" in
  *"Complete exactly one checklist item"*)
    awk 'BEGIN { completed = 0 } !completed && /^- \\[ \\]/ { sub(/\\[ \\]/, "[x]"); completed = 1 } { print }' CHECKLIST.md > CHECKLIST.md.next
    mv CHECKLIST.md.next CHECKLIST.md
    printf '%s\\n' 'Completed one checklist item.' >> PROGRESS.md
    printf '%s\\n' '<promise>INVOCATION_COMPLETE</promise>'
    ;;
  *"Validate workflow completion"*)
    if grep -Eq '^- \\[( |/)\\]' CHECKLIST.md; then
      printf '%s\\n' '<promise>INVOCATION_COMPLETE</promise>'
    else
      printf '%s\\n' '<promise>COMPLETE</promise>' '<promise>INVOCATION_COMPLETE</promise>'
    fi
    ;;
  *)
    printf '%s\\n' 'Unexpected fake Codex prompt.' >&2
    exit 64
    ;;
esac
`;

const fakeTt = `#!/bin/sh
printf '%s\\n' "$*" >> "$RALPH_NOTIFICATION_LOG"
`;

const hangingCodex = `#!/bin/sh
trap '' TERM
sh -c 'trap "" TERM; while :; do sleep 1; done' &
printf '%s\\n' "$!" > "$RALPH_DESCENDANT_PID_FILE"
while :; do sleep 1; done
`;

const makeCliRunner = Effect.fnUntraced(function* (
  repositoryRoot: string,
  fakeBin: string,
  environment: Readonly<Record<string, string>>,
) {
  const path = yield* Path.Path;
  const inheritedPath = process.env.PATH ?? "";
  const cliPath = path.join(repositoryRoot, "src", "cli.ts");

  return (args: ReadonlyArray<string>) =>
    runCommand(
      ChildProcess.make("bun", [cliPath, ...args], {
        cwd: repositoryRoot,
        env: { PATH: `${fakeBin}:${inheritedPath}`, ...environment },
        extendEnv: true,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      }),
    );
});

describe("breaking-release adoption", () => {
  it.effect("walks from blank init through once and loop completion with notifications", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const repositoryRoot = path.resolve(".");
      const workspace = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "ralph-adoption-workspace-",
      });
      const fakeBin = yield* fileSystem.makeTempDirectoryScoped({ prefix: "ralph-adoption-bin-" });
      const notificationLog = path.join(workspace, "notifications.log");

      yield* writeExecutable(path.join(fakeBin, "codex"), fakeCodex);
      yield* writeExecutable(path.join(fakeBin, "tt"), fakeTt);
      const runCli = yield* makeCliRunner(repositoryRoot, fakeBin, {
        RALPH_NOTIFICATION_LOG: notificationLog,
      });

      const initialized = yield* runCli(["init", workspace]);
      assert.strictEqual(initialized.exitCode, 0);
      assert.deepStrictEqual([...(yield* fileSystem.readDirectory(workspace))].sort(), [
        "AFTER_WORK.md",
        "BEFORE_WORK.md",
        "WORK.md",
      ]);

      const blank = yield* runCli(["once", "-C", workspace, "--ralph-dir", "."]);
      assert.notStrictEqual(blank.exitCode, 0);
      assert.include(
        `${blank.stdout}${blank.stderr}`,
        "Work instructions are required; work file is blank:",
      );

      yield* Effect.forEach(
        ["BEFORE_WORK.md", "CHECKLIST.md", "WORK.md", "AFTER_WORK.md", "PROGRESS.md"],
        (fileName) =>
          fileSystem.copyFile(
            path.join(repositoryRoot, "examples", "checklist-workflow", fileName),
            path.join(workspace, fileName),
          ),
        { discard: true },
      );

      const once = yield* runCli(["once", "-C", workspace, "--ralph-dir", "."]);
      assert.strictEqual(once.exitCode, 0);
      assert.include(once.stdout, "=== Work ===");
      assert.include(once.stdout, "=== After work ===");
      assert.include(once.stdout, "--- After work invocation complete");
      assert.include(
        yield* fileSystem.readFileString(path.join(workspace, "CHECKLIST.md")),
        "- [x] Add validation for the primary user input",
      );

      const loop = yield* runCli(["loop", "-C", workspace, "--ralph-dir", "."]);
      assert.strictEqual(loop.exitCode, 0);
      assert.include(loop.stdout, "=== Iteration 1 ===");
      assert.include(loop.stdout, "=== Iteration 2 ===");
      assert.include(loop.stdout, "--- After work workflow complete");
      const checklist = yield* fileSystem.readFileString(path.join(workspace, "CHECKLIST.md"));
      assert.notInclude(checklist, "- [ ]");
      assert.strictEqual(
        (yield* fileSystem.readFileString(path.join(workspace, "PROGRESS.md"))).match(
          /Completed one checklist item\./g,
        )?.length,
        3,
      );

      const notifications = yield* fileSystem.readFileString(notificationLog);
      assert.include(notifications, "notify Ralph once failed: Work instructions are required;");
      assert.include(notifications, "notify Ralph once succeeded: invocation complete.");
      assert.include(
        notifications,
        "notify Ralph loop succeeded: workflow complete after 2 iterations.",
      );
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect(
    "kills a signal-resistant Codex descendant after timeout escalation",
    () =>
      Effect.gen(function* () {
        if (process.platform === "win32") {
          return;
        }

        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const repositoryRoot = path.resolve(".");
        const workspace = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "ralph-timeout-workspace-",
        });
        const fakeBin = yield* fileSystem.makeTempDirectoryScoped({ prefix: "ralph-timeout-bin-" });
        const notificationLog = path.join(workspace, "notifications.log");
        const descendantPidFile = path.join(workspace, "descendant.pid");

        yield* fileSystem.writeFileString(path.join(workspace, "WORK.md"), "Do blocked work.\n");
        yield* writeExecutable(path.join(fakeBin, "codex"), hangingCodex);
        yield* writeExecutable(path.join(fakeBin, "tt"), fakeTt);
        const runCli = yield* makeCliRunner(repositoryRoot, fakeBin, {
          RALPH_DESCENDANT_PID_FILE: descendantPidFile,
          RALPH_NOTIFICATION_LOG: notificationLog,
        });

        const result = yield* runCli([
          "once",
          "-C",
          workspace,
          "--work",
          "./WORK.md",
          "--idle-timeout",
          "1s",
          "--invocation-timeout",
          "3s",
        ]);
        assert.notStrictEqual(result.exitCode, 0);
        assert.include(`${result.stdout}${result.stderr}`, "idle timeout");

        const descendantPid = (yield* fileSystem.readFileString(descendantPidFile)).trim();
        const probe = yield* spawner.exitCode(
          ChildProcess.make("/bin/kill", ["-0", descendantPid], {
            stdin: "ignore",
            stdout: "ignore",
            stderr: "ignore",
          }),
        );
        if (probe === ChildProcessSpawner.ExitCode(0)) {
          yield* spawner.exitCode(
            ChildProcess.make("/bin/kill", ["-KILL", descendantPid], {
              stdin: "ignore",
              stdout: "ignore",
              stderr: "ignore",
            }),
          );
        }

        assert.notStrictEqual(probe, ChildProcessSpawner.ExitCode(0));
      }).pipe(Effect.provide(BunServices.layer)),
    { timeout: 10_000 },
  );
});
