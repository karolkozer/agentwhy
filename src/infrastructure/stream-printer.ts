// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Printer } from '../ports/printer.ts';

/** Writes to a stream the shell owns. The shell decides which one; nothing here reads `process`. */
export class StreamPrinter implements Printer {
  readonly #output: NodeJS.WritableStream;

  constructor(output: NodeJS.WritableStream) {
    this.#output = output;
  }

  write(text: string): void {
    if (text !== '') this.#output.write(text);
  }
}
