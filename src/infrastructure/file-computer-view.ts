// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { COMPUTER_SCOPES, type ComputerScope, type ComputerView } from '../ports/computer-view.ts';

const VERSION = 1;

/**
 * GD21's choice, one small file in the person's own agentwhy folder. Never throws: a record that cannot be read is no
 * choice made, and one that cannot be written says so.
 */
export class FileComputerView implements ComputerView {
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  async read(): Promise<ComputerScope | undefined> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.#path, 'utf8'));
      if (parsed === null || typeof parsed !== 'object') return undefined;
      const record = parsed as Record<string, unknown>;
      return record.version === VERSION ? COMPUTER_SCOPES.find((scope) => scope === record.scope) : undefined;
    } catch {
      return undefined;
    }
  }

  async write(scope: ComputerScope): Promise<boolean> {
    try {
      await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
      await writeFile(this.#path, `${JSON.stringify({ version: VERSION, scope })}\n`, { encoding: 'utf8', mode: 0o600 });
      return true;
    } catch {
      return false;
    }
  }
}
