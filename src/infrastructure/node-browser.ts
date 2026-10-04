// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { spawn } from 'node:child_process';
import type { Browser } from '../ports/browser.ts';

/**
 * What each platform calls to open a file with whatever is registered for it. The empty argument after `start`
 * is not a mistake: `cmd` reads the first quoted argument as the window title, so a path that needs quoting
 * would otherwise become one.
 */
function opener(platform: string): { readonly program: string; readonly leading: readonly string[] } {
  if (platform === 'darwin') return { program: 'open', leading: [] };
  if (platform === 'win32') return { program: 'cmd', leading: ['/c', 'start', ''] };
  return { program: 'xdg-open', leading: [] };
}

/**
 * Opens a file through the platform's own opener, detached and with its streams closed, so that whatever starts
 * does not hold this process open and cannot write over the report the terminal is printing.
 */
export class NodeBrowser implements Browser {
  readonly #platform: string;

  constructor(platform: string) {
    this.#platform = platform;
  }

  async open(path: string): Promise<boolean> {
    const { program, leading } = opener(this.#platform);

    return new Promise((resolve) => {
      try {
        const child = spawn(program, [...leading, path], { stdio: 'ignore', detached: true });
        child.once('error', () => resolve(false));
        child.once('spawn', () => {
          child.unref();
          resolve(true);
        });
      } catch {
        // A platform with no opener at all, or one that refuses to spawn: the file is still written.
        resolve(false);
      }
    });
  }
}
