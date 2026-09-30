import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const CLI = fileURLToPath(new URL('../../src/cli.ts', import.meta.url));

const execFileAsync = promisify(execFile);

export interface CliResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Where a child runs, and what it finds in its environment on top of this process's. A command that reads the home
 * directory and the working directory can only be tested end to end by being given both.
 */
export interface RunOptions {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  /** Written to the child's standard input, which is then closed - the way a hook hands a command its input. */
  readonly input?: string;
}

/** Runs the agentwhy CLI in a child process, the way a user runs it. */
export async function runCli(args: readonly string[], options: RunOptions = {}): Promise<CliResult> {
  return runNode(CLI, args, options);
}

/**
 * What Claude Code puts in the environment of everything it runs. A test suite run from inside a Claude Code
 * session inherits it, and `watch` reads the entry point to decide whether a person is there to be spoken to - so
 * the same test passed in CI and failed in a session. Taken out of every child, so a test that wants one says so.
 */
const INHERITED_FROM_CLAUDE_CODE = /^(CLAUDECODE|CLAUDE_CODE_.*)$/;

function childEnvironment(extra: Readonly<Record<string, string>> | undefined): NodeJS.ProcessEnv {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !INHERITED_FROM_CLAUDE_CODE.test(name)));
  return { ...inherited, ...extra };
}

/** Runs any script of this project in a child process. */
export async function runNode(script: string, args: readonly string[], options: RunOptions = {}): Promise<CliResult> {
  try {
    const running = execFileAsync(process.execPath, [script, ...args], {
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      env: childEnvironment(options.env),
    });
    if (options.input !== undefined) {
      // A child that exits before reading - a usage error, say - leaves a closed pipe, and the EPIPE that write
      // raises arrives as an unhandled `error` on the stream, which would take down the test runner rather than
      // fail one test. What the child did is read from its exit code and its output, never from this write.
      running.child.stdin?.on('error', () => {});
      running.child.stdin?.end(options.input);
    }
    const { stdout, stderr } = await running;
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: unknown; stdout?: unknown; stderr?: unknown };
    return {
      code: typeof failure.code === 'number' ? failure.code : -1,
      stdout: typeof failure.stdout === 'string' ? failure.stdout : '',
      stderr: typeof failure.stderr === 'string' ? failure.stderr : '',
    };
  }
}
