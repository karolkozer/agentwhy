#!/usr/bin/env node
// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { homedir, tmpdir } from 'node:os';
import type { CommandResult } from './cli/cli-command.ts';
import { EXIT_CODE, HOOK_BLOCK_EXIT_CODE, type ExitCode } from './cli/exit-codes.ts';
import { runSwitching, type SwitchSeams } from './cli/project-switches.ts';
import { createCommandRouter, processServer } from './composition-root.ts';
import { colourWanted } from './shared/colour.ts';

// The shell: the only module that touches `process`.
async function main(argv: readonly string[]): Promise<ExitCode> {
  // One folder's environment: the one `agentwhy` was typed in, or one a page switched to (which-project V14), with the
  // seams that let its run start the next.
  const environmentAt = (workingDirectory: string, seams: SwitchSeams) => ({
    workingDirectory,
    ...seams,
    home: homedir(),
    platform: process.platform,
    temporaryDirectory: tmpdir(),
    // Who this process is, for the one store that keeps a file in the shared temporary directory and has to know
    // whether the directory it found there is this person's. Undefined on a platform with no such notion.
    user: process.getuid?.(),
    // A command that behaves differently when it is being watched is not scriptable, so this is asked once,
    // here, and every command is told rather than looking for itself.
    interactive: process.stdin.isTTY === true && process.stdout.isTTY === true,
    // Asked apart from `interactive`: a hook's stdout is never a terminal, but its stdin is a pipe either way.
    inputIsTerminal: process.stdin.isTTY === true,
    // Decided here and once, like `interactive`: a renderer that looked at a stream would colour a piped report.
    colour: colourWanted(process.stdout.isTTY === true, process.env.NO_COLOR),
    // Whether anyone is looking at the output. The wordmark is drawn for a person and not for a pipe, and it is
    // asked apart from `colour`, which NO_COLOR turns off without making the terminal any less of a terminal.
    terminal: process.stdout.isTTY === true,
    // How wide the report may be drawn. Undefined when stdout is not a terminal: a piped report keeps one width,
    // so what a script reads does not depend on the window someone happened to run it in.
    columns: process.stdout.isTTY === true ? process.stdout.columns : undefined,
    input: process.stdin,
    output: process.stdout,
    // Read once per run: every range and every age on a page is measured from the moment its command began - for a run
    // a page switched to, the moment of the switch.
    now: Date.now(),
    // Which way into Claude Code ran this, when a hook did: `cli` and `claude-vscode` have a person reading, and
    // `sdk-cli` is `claude -p` (`the-agent-tells-you.md` B9e2). The hook input says nothing about it; this does.
    entryPoint: process.env.CLAUDE_CODE_ENTRYPOINT,
    // The system's language, in the order POSIX reads it, for a line nobody chose a language for
    // (`the-agent-tells-you.md` R29). An empty variable says nothing, so it is passed over like a missing one.
    locale: process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || undefined,
    // The project a hook runs for, the variable its own `--settings "$CLAUDE_PROJECT_DIR/…"` is expanded with: whose
    // settings say how the hook runs agentwhy, and so how the agent is asked to (`the-agent-tells-you.md` R18).
    projectDirectory: process.env.CLAUDE_PROJECT_DIR || undefined,
    // How this agentwhy runs, which decides the command a hook written now runs (`a-hook-runs-what-you-ran.md` J2):
    // the script as it was started, and the `PATH` a hook's shell would look it up on.
    script: process.argv[1],
    path: process.env.PATH,
    // The shell and environment the check written into `~/.codex` is tried in once, as Codex runs it
    // (`2026-10-02-codex-approves-its-own-hook.md` AO14).
    shell: process.env.SHELL,
    variables: process.env,
    // A page server is remembered under the process that runs it, and agentwhy is started again in the background by
    // the Node running it now (`2026-10-02-a-page-not-a-file.md` PF2, PF3).
    pid: process.pid,
    node: process.execPath,
  });
  // which-project V14, amended: one page server for the process, so a switched-from project's pages still reach it.
  const server = processServer();
  const result = await runSwitching(
    (workingDirectory, args, seams) => createCommandRouter({ ...environmentAt(workingDirectory, seams), server }).route(args),
    process.cwd(),
    argv,
    write,
  );
  return write(result);
}

/** A result, written where it belongs: the output to stdout, a refusal to stderr. The exit code it carries is returned. */
function write(result: CommandResult): ExitCode {
  switch (result.kind) {
    case 'help':
      process.stdout.write(result.usage);
      return EXIT_CODE.ok;
    case 'usage-error':
      process.stderr.write(`agentwhy: ${result.message}\n\n${result.usage}`);
      return EXIT_CODE.usage;
    case 'completed':
      process.stdout.write(result.output);
      return result.exitCode;
    case 'hook-block':
      process.stderr.write(result.reason);
      return HOOK_BLOCK_EXIT_CODE;
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`agentwhy: unexpected error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = EXIT_CODE.unexpected;
}
