// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { spawn } from 'node:child_process';
import type { CommandTrial, Trial, TrialOutcome } from '../ports/command-trial.ts';

/** How much of standard error is read to find why a trial failed, and how much of the line found is kept. */
const STDERR_READ = 8 * 1024;
const STDERR_KEPT = 300;

/** An error's own message as Node writes one: `SyntaxError: …`, `Error [ERR_MODULE_NOT_FOUND]: …`. */
const NAMED_ERROR = /^(?:Uncaught )?[A-Za-z]*Error\b[^:]*:\s*\S/;

/**
 * `2026-10-13-the-node-a-hook-finds.md` NF5 (amends AO14): the line of what a command wrote that says why it failed.
 * Node says first where it failed - a file, the source line, a caret - and only then what was wrong, so the first line
 * of a command that could not be loaded named a file of `npx`'s cache and nothing else (NFB2). The first line that is
 * an error's own message; where there is none - a shell's "not found", npm's own lines - the first that is not blank.
 */
export function tellingLine(stderr: string): string {
  const lines = stderr.split('\n').map((line) => line.trimEnd());
  const named = lines.find((line) => NAMED_ERROR.test(line));
  const said = named === undefined ? lines.find((line) => line.trim() !== '') : named;
  return (said === undefined ? '' : said).slice(0, STDERR_KEPT);
}

export interface ShellCommandTrialOptions {
  /** The platform the shell gave: the trial is run where Codex's way of running a hook was measured, and nowhere else. */
  readonly platform: string;
  /** The person's shell, `$SHELL`, as Codex picks it; absent or empty, `/bin/sh`. */
  readonly shell?: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
}

/**
 * `2026-10-02-codex-approves-its-own-hook.md` AO14, AOB8: a command line run as Codex runs a hook on macOS and Linux -
 * `$SHELL -lc "<command>"`, else `/bin/sh` - with its input on standard input, from the given folder. On Windows
 * Codex's way is not measured, so nothing is tried. The environment is this process's, not Codex's: what passes here
 * is what can be promised, and no more. A timeout ends the shell; a process it started may outlive it briefly, which
 * a trial accepts - the answer is already "timed out".
 */
export class ShellCommandTrial implements CommandTrial {
  readonly #options: ShellCommandTrialOptions;

  constructor(options: ShellCommandTrialOptions) {
    this.#options = options;
  }

  run(trial: Trial): Promise<TrialOutcome> {
    if (this.#options.platform === 'win32') return Promise.resolve({ kind: 'not-tried' });
    const shell = this.#options.shell === undefined || this.#options.shell === '' ? '/bin/sh' : this.#options.shell;
    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = (outcome: TrialOutcome): void => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        resolve(outcome);
      };
      const child = spawn(shell, ['-lc', trial.commandLine], {
        cwd: trial.folder,
        env: { ...this.#options.environment },
        stdio: ['pipe', 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderr.length < STDERR_READ) stderr += chunk.toString('utf8');
      });
      timer = setTimeout(() => {
        if (settled) return;
        child.kill('SIGKILL');
        done({ kind: 'timed-out' });
      }, trial.timeoutMs);
      child.on('error', (error) => done({ kind: 'not-started', reason: error.message }));
      child.on('close', (code, signal) => {
        if (code === null) return done({ kind: 'not-started', reason: `ended by ${signal ?? 'a signal'}` });
        done({ kind: 'ran', exitCode: code, stderr: tellingLine(stderr.slice(0, STDERR_READ)) });
      });
      // A command that exits before reading leaves a closed pipe; what it did is read from its exit, never this write.
      child.stdin?.on('error', () => {});
      child.stdin?.end(trial.input);
    });
  }
}
