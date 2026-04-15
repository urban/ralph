import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import * as BunServices from "@effect/platform-bun/BunServices"
import { Console, Effect, FileSystem, Option, Path, Runtime, Scope, Stream } from "effect"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as ChildProcess from "effect/unstable/process/ChildProcess"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"

const VERSION = "0.0.0"
const COMPLETE_MARKER = "<promise>COMPLETE</promise>"

interface BundledFiles {
  readonly checklist: string
  readonly instructions: string
  readonly progress: string
}

interface CommonInput {
  readonly checklist: Option.Option<string>
  readonly instructions: Option.Option<string>
  readonly progress: Option.Option<string>
  readonly yolo: boolean
}

interface PreparedRun {
  readonly workingDir: string
  readonly checklist: string
  readonly instructions: string
  readonly progress: string
  readonly yolo: boolean
}

class RalphExit extends Error {
  override readonly [Runtime.errorReported] = false
  override readonly [Runtime.errorExitCode]: number

  constructor(message: string, exitCode: number) {
    super(message)
    this.name = "RalphExit"
    this[Runtime.errorExitCode] = exitCode
  }
}

const failWithExitCode = (exitCode: number): Effect.Effect<never, RalphExit> =>
  Effect.fail(new RalphExit("", exitCode))

const failWithMessage = Effect.fn("failWithMessage")(function*(message: string): Effect.fn.Return<never, RalphExit> {
  yield* Console.error(message)
  return yield* Effect.fail(new RalphExit(message, 1))
})

const createCommonFlags = () => ({
  checklist: Flag.string("checklist").pipe(
    Flag.withAlias("c"),
    Flag.withDescription("Checklist file path (default: bundled CHECKLIST.md)"),
    Flag.optional
  ),
  instructions: Flag.string("instructions").pipe(
    Flag.withAlias("i"),
    Flag.withDescription("Instructions file path (default: bundled INSTRUCTIONS.md)"),
    Flag.optional
  ),
  progress: Flag.string("progress").pipe(
    Flag.withAlias("p"),
    Flag.withDescription("Progress log path (default: bundled PROGRESS.md)"),
    Flag.optional
  ),
  yolo: Flag.boolean("yolo").pipe(
    Flag.withDescription("Use --dangerously-bypass-approvals-and-sandbox")
  )
})

const iterationsFlag = Flag.integer("iterations").pipe(
  Flag.withAlias("n"),
  Flag.withDescription("Number of iterations to run"),
  Flag.filter((value) => value > 0, (value) => `Expected a positive integer, got ${value}`),
  Flag.withDefault(10)
)

const resolveBundledFiles = Effect.fn("resolveBundledFiles")(function*(): Effect.fn.Return<BundledFiles, RalphExit, Path.Path> {
  const path = yield* Path.Path
  const sourcePath = yield* path.fromFileUrl(new URL(import.meta.url)).pipe(
    Effect.catch(() => failWithMessage("Could not resolve CLI entrypoint path."))
  )
  const repoDir = path.dirname(path.dirname(sourcePath))

  return {
    checklist: path.join(repoDir, "CHECKLIST.md"),
    instructions: path.join(repoDir, "INSTRUCTIONS.md"),
    progress: path.join(repoDir, "PROGRESS.md")
  }
})

const resolveInputFile = Effect.fn("resolveInputFile")(function*(
  rawPath: Option.Option<string>,
  defaultPath: string
): Effect.fn.Return<string, never, Path.Path> {
  const path = yield* Path.Path

  return Option.match(rawPath, {
    onNone: () => defaultPath,
    onSome: (value) => path.isAbsolute(value) ? value : path.resolve(value)
  })
})

const commandExists = Effect.fn("commandExists")(function*(
  commandName: string
): Effect.fn.Return<boolean, never, ChildProcessSpawner.ChildProcessSpawner> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const exitCode = yield* spawner.exitCode(
    ChildProcess.make("which", [commandName], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore"
    })
  ).pipe(
    Effect.catch(() => Effect.succeed(ChildProcessSpawner.ExitCode(1)))
  )

  return exitCode === ChildProcessSpawner.ExitCode(0)
})

const ensureCommandAvailable = Effect.fn("ensureCommandAvailable")(function*(
  commandName: string,
  displayName: string
): Effect.fn.Return<void, RalphExit, ChildProcessSpawner.ChildProcessSpawner> {
  const exists = yield* commandExists(commandName)
  if (!exists) {
    return yield* failWithMessage(`${displayName} is required.`)
  }
})

const ensureFile = Effect.fn("ensureFile")(function*(
  filePath: string,
  displayName: string
): Effect.fn.Return<void, RalphExit, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem
  const info = yield* fs.stat(filePath).pipe(
    Effect.catch(() => failWithMessage(`${displayName} not found: ${filePath}`))
  )

  if (info.type !== "File") {
    return yield* failWithMessage(`${displayName} not found: ${filePath}`)
  }
})

const prepareRun = Effect.fn("prepareRun")(function*(input: CommonInput): Effect.fn.Return<PreparedRun, RalphExit, Command.Environment> {
  const path = yield* Path.Path

  yield* ensureCommandAvailable("codex", "Codex CLI")

  const bundledFiles = yield* resolveBundledFiles()
  const checklist = yield* resolveInputFile(input.checklist, bundledFiles.checklist)
  const instructions = yield* resolveInputFile(input.instructions, bundledFiles.instructions)
  const progress = yield* resolveInputFile(input.progress, bundledFiles.progress)

  yield* ensureFile(checklist, "Input file")
  yield* ensureFile(instructions, "Prompt file")
  yield* ensureFile(progress, "Progress file")

  return {
    workingDir: path.resolve("."),
    checklist,
    instructions,
    progress,
    yolo: input.yolo
  }
})

const buildCodexPrompt = (run: PreparedRun): string => `<checklist>
@${run.checklist}
</checklist>

<progress_log>
@${run.progress}
</progress_log>

<instructions>
@${run.instructions}
</instructions>`

const makeCodexCommand = (
  run: PreparedRun,
  stdout: ChildProcess.CommandOutput
) => ChildProcess.make(
  "codex",
  run.yolo
    ? [
      "exec",
      "--dangerously-bypass-approvals-and-sandbox",
      "-C",
      run.workingDir,
      buildCodexPrompt(run)
    ]
    : [
      "exec",
      "--full-auto",
      "--sandbox",
      "workspace-write",
      "-C",
      run.workingDir,
      buildCodexPrompt(run)
    ],
  {
    cwd: run.workingDir,
    stdin: "inherit",
    stdout,
    stderr: "inherit"
  }
)

const runCodexPass = Effect.fn("runCodexPass")(function*(
  run: PreparedRun
): Effect.fn.Return<void, RalphExit, ChildProcessSpawner.ChildProcessSpawner> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const exitCode = yield* spawner.exitCode(makeCodexCommand(run, "inherit")).pipe(
    Effect.catch((error) => failWithMessage(error.message))
  )

  if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
    return yield* failWithExitCode(Number(exitCode))
  }
})

const runCodexPassCapture = Effect.fn("runCodexPassCapture")(function*(
  run: PreparedRun
): Effect.fn.Return<string, RalphExit, ChildProcessSpawner.ChildProcessSpawner | Scope.Scope> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const handle = yield* spawner.spawn(makeCodexCommand(run, "pipe")).pipe(
    Effect.catch((error) => failWithMessage(error.message))
  )
  const output = yield* handle.stdout.pipe(
    Stream.decodeText(),
    Stream.mkString,
    Effect.catch((error) => failWithMessage(error.message))
  )
  const exitCode = yield* handle.exitCode.pipe(
    Effect.catch((error) => failWithMessage(error.message))
  )

  if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
    return yield* failWithExitCode(Number(exitCode))
  }

  return output
})

const notify = Effect.fn("notify")(function*(
  message: string
): Effect.fn.Return<void, never, ChildProcessSpawner.ChildProcessSpawner> {
  const exists = yield* commandExists("tt")
  if (!exists) {
    return
  }

  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  yield* spawner.exitCode(
    ChildProcess.make("tt", ["notify", message], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore"
    })
  ).pipe(
    Effect.catch(() => Effect.succeed(ChildProcessSpawner.ExitCode(0)))
  )
})

const once = Command.make(
  "once",
  createCommonFlags(),
  Effect.fn("once")(function*(input: CommonInput): Effect.fn.Return<void, RalphExit, Command.Environment> {
    const run = yield* prepareRun(input)
    yield* runCodexPass(run)
  })
).pipe(
  Command.withDescription("Run one Codex pass")
)

const loop = Command.make(
  "loop",
  {
    ...createCommonFlags(),
    iterations: iterationsFlag
  },
  Effect.fn("loop")(function*(input): Effect.fn.Return<void, RalphExit, Command.Environment> {
    const run = yield* prepareRun(input)

    for (let iteration = 1; iteration <= input.iterations; iteration += 1) {
      yield* Console.log(`Iteration ${iteration}`)
      yield* Console.log("--------------------------------")

      const result = yield* Effect.scoped(runCodexPassCapture(run))
      yield* Console.log(result)

      if (result.includes(COMPLETE_MARKER)) {
        yield* Console.log("Checklist complete, exiting.")
        yield* notify(`Checklist complete after ${iteration} iterations`)
        return
      }
    }

    yield* notify(`Checklist not complete after ${input.iterations} iterations`)
    return yield* failWithMessage(`Checklist not complete after ${input.iterations} iterations.`)
  })
).pipe(
  Command.withDescription("Run repeated Codex passes until complete or exhausted")
)

const root = Command.make("ralph").pipe(
  Command.withDescription("Run Codex against a checklist, progress log, and instructions file"),
  Command.withSubcommands([once, loop])
)

const program = Command.run(root, {
  version: VERSION
}).pipe(
  Effect.provide(BunServices.layer)
)

BunRuntime.runMain(program)
