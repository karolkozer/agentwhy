// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { request } from 'node:http';
import type { PageProbe } from '../ports/page-server.ts';

/** The computer's own addresses: a record that named anything else was not written by `start`, and is not asked. */
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * Asks a page once (`2026-10-02-a-page-not-a-file.md` PF3): an answer of 200 is a server that is running and this page
 * is one it serves. Asking also brings a served page up to date (R75), so a conversation begun since the server started
 * has its report by the time it is opened - and that takes as long as reading it does. Found by review: 3 s took a
 * running server busy with a long conversation for a dead one, and started a second beside it.
 */
export class NodePageProbe implements PageProbe {
  readonly #timeoutMs: number;

  constructor(timeoutMs = 10_000) {
    this.#timeoutMs = timeoutMs;
  }

  answers(url: string): Promise<boolean> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return Promise.resolve(false);
    }
    if (parsed.protocol !== 'http:' || !LOOPBACK.has(parsed.hostname)) return Promise.resolve(false);

    return new Promise((resolve) => {
      const asking = request(parsed, { method: 'GET', timeout: this.#timeoutMs }, (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      });
      asking.on('error', () => resolve(false));
      asking.on('timeout', () => {
        asking.destroy();
        resolve(false);
      });
      asking.end();
    });
  }
}
