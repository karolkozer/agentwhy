// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { request } from 'node:http';
import type { AnswerSource } from '../ports/answer-source.ts';
import { isLoopback } from './node-page-probe.ts';

/** An answer is a few kilobytes; past this it is not one. */
const MAX_BYTES = 1_000_000;

/** One GET of a page server's answer, read whole, from this computer alone. */
export class NodeAnswerSource implements AnswerSource {
  readonly #timeoutMs: number;

  constructor(timeoutMs = 10_000) {
    this.#timeoutMs = timeoutMs;
  }

  ask(url: string): Promise<unknown> {
    if (!isLoopback(url)) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const asking = request(url, { method: 'GET', timeout: this.#timeoutMs }, (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          resolve(undefined);
          return;
        }
        const parts: Buffer[] = [];
        let size = 0;
        response.on('data', (part: Buffer) => {
          size += part.length;
          if (size > MAX_BYTES) asking.destroy();
          else parts.push(part);
        });
        response.on('error', () => resolve(undefined));
        response.on('close', () => resolve(undefined));
        response.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(parts).toString('utf8')));
          } catch {
            resolve(undefined);
          }
        });
      });
      asking.on('error', () => resolve(undefined));
      asking.on('timeout', () => {
        asking.destroy();
        resolve(undefined);
      });
      asking.end();
    });
  }
}
