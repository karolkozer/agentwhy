// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { createInterface } from 'node:readline';
import type { LineStream } from '../ports/line-stream.ts';

export class NodeLineStream implements LineStream {
  readonly #input: NodeJS.ReadableStream;
  readonly #output: NodeJS.WritableStream;

  constructor(input: NodeJS.ReadableStream, output: NodeJS.WritableStream) {
    this.#input = input;
    this.#output = output;
  }

  lines(): AsyncIterable<string> {
    return createInterface({ input: this.#input, crlfDelay: Infinity });
  }

  write(line: string): void {
    this.#output.write(line + '\n');
  }
}
