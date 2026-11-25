// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, open, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DetachedAnswer, DetachedRun } from '../ports/detached-run.ts';

/**
 * agentwhy run again as a process of its own, whose output is read while it lasts
 * (`2026-11-24-open-agentwhy-from-the-chat.md` RO6). What it prints goes to a file only its owner can read - the address
 * holds the page's token - and not to a pipe, which would break under a run that outlives its starter. The file is taken
 * away when the waiting is over; a run still going keeps printing into a file nobody can open again.
 */
export class NodeDetachedRun implements DetachedRun {
  readonly #node: string;
  readonly #script: string | undefined;
  readonly #temporary: string;

  constructor(node: string, script: string | undefined, temporary: string = tmpdir()) {
    this.#node = node;
    this.#script = script;
    this.#temporary = temporary;
  }

  async run(args: readonly string[], folder: string, waitMs: number): Promise<DetachedAnswer | undefined> {
    if (this.#script === undefined) return undefined;
    // `mkdtemp` makes a folder its owner alone can open.
    const place = await mkdtemp(join(this.#temporary, 'agentwhy-run-')).catch(() => undefined);
    if (place === undefined) return undefined;
    const path = join(place, 'output');
    try {
      const output = await open(path, 'wx', 0o600);
      let ended: number | undefined;
      try {
        const child = spawn(this.#node, [this.#script, ...args], { cwd: folder, detached: true, stdio: ['ignore', output.fd, 'ignore'] });
        ended = await exitWithin(child, waitMs);
      } finally {
        await output.close();
      }
      return ended === undefined ? { ended: false } : { ended: true, exitCode: ended, output: await readFile(path, 'utf8') };
    } catch {
      return undefined;
    } finally {
      // Windows keeps a file another process has open: left in the system's temporary folder then.
      await rm(place, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

/** The exit code, or `undefined` where it is still going after `waitMs`. Rejects where it could not be started. */
function exitWithin(child: ChildProcess, waitMs: number): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => settle(undefined), waitMs);
    function settle(code: number | undefined): void {
      clearTimeout(timer);
      child.unref();
      resolve(code);
    }
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    // Ended by a signal, it has no code of its own: a failure all the same.
    child.once('exit', (code) => settle(code ?? 1));
  });
}
