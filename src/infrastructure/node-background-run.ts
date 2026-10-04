// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { spawn } from 'node:child_process';
import type { BackgroundRun } from '../ports/page-server.ts';

/**
 * agentwhy started again as a process of its own (`2026-10-02-a-page-not-a-file.md` PF3): detached, its streams closed,
 * not waited for - so the command that started it returns at once, and the page server it runs outlives it. Measured on
 * 2026-10-02 (PFB1): such a process outlived its command in Claude Code in VS Code and in the desktop app, and in Codex
 * when the command ran outside its sandbox.
 */
export class NodeBackgroundRun implements BackgroundRun {
  readonly #node: string;
  readonly #script: string | undefined;
  /**
   * The processes this started that have ended, as Node says when it reaps one: an ended child's id may be given to
   * another process, so asking the system by id would not tell them apart.
   */
  readonly #ended = new Set<number>();

  constructor(node: string, script: string | undefined) {
    this.#node = node;
    this.#script = script;
  }

  start(args: readonly string[]): Promise<number | undefined> {
    if (this.#script === undefined) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      try {
        const child = spawn(this.#node, [this.#script as string, ...args], { detached: true, stdio: 'ignore' });
        child.once('error', () => resolve(undefined));
        child.once('spawn', () => {
          const { pid } = child;
          if (pid !== undefined) child.once('exit', () => this.#ended.add(pid));
          child.unref();
          resolve(pid);
        });
      } catch {
        resolve(undefined);
      }
    });
  }

  running(pid: number): boolean {
    return !this.#ended.has(pid);
  }
}
