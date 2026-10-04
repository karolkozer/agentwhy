// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { TextInput } from '../ports/text-input.ts';

/** Reads a stream to its end, and gives up past a size rather than holding whatever arrives. */
export class NodeTextInput implements TextInput {
  readonly #stream: NodeJS.ReadableStream;

  constructor(stream: NodeJS.ReadableStream) {
    this.#stream = stream;
  }

  async readAll(maxBytes: number): Promise<string | undefined> {
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of this.#stream) {
        const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        size += buffer.length;
        if (size > maxBytes) return undefined;
        chunks.push(buffer);
      }
    } catch {
      // A stream reports its failures as plain errors, and the port's promise is an answer, not an exception: a hook
      // whose input broke off is told it was not checked (`specs/2026-09-16-when-an-agent-finishes.md` R8).
      return undefined;
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}
