// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { execFile } from 'node:child_process';
import type { Notifier } from '../ports/notifier.ts';

/**
 * A system notification (`specs/2026-09-16-when-an-agent-finishes.md` R15). On macOS through `osascript`, which showed
 * in the terminal interface and, once notifications were allowed, outside it (B4f); on another platform the answer is
 * `false`, and the terminal notice is what remains.
 *
 * The words travel as arguments to the script, never inside its source, so nothing in them can be read as AppleScript.
 */
export class OsNotifier implements Notifier {
  readonly #platform: string;

  constructor(platform: string) {
    this.#platform = platform;
  }

  notify(title: string, text: string): Promise<boolean> {
    if (this.#platform !== 'darwin') return Promise.resolve(false);

    return new Promise((resolve) => {
      execFile(
        'osascript',
        ['-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title (item 1 of argv)', '-e', 'end run', title, text],
        (error) => resolve(error === null),
      );
    });
  }
}
