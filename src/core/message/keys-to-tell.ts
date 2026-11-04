// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { keysInMessage } from '../redaction/redactor.ts';

/** The lines of a message an app wrapped as a paste, one-based and inclusive, the tags around them left out. */
export interface PastedLines {
  readonly first: number;
  readonly last: number;
}

/**
 * A person's message as a check before it is sent reads it (`2026-11-01-a-key-in-your-message.md` PK1): its text, the
 * folder it was written in, and which of its lines the app says were pasted. An adapter fills it from its own input.
 */
export interface MessageToCheck {
  readonly text: string;
  readonly workingDirectory?: string;
  /** The conversation it was written in: where a refusal is remembered, to be told by the AI on the next message (PK10). */
  readonly sessionId?: string;
  readonly pastes: readonly PastedLines[];
}

/**
 * A key the person is told about: what it is, on which line, and of what - a paste's own lines where the app wrapped one
 * (PK3 as amended: "line 6 of what you pasted"), the message's otherwise - and the configuration name the code gave it.
 */
export interface KeyToTell {
  readonly kind: string;
  readonly line: number;
  /** One-based, of `pastes`; absent where the key is on a line the person typed. */
  readonly paste?: number;
  readonly name?: string;
}

/**
 * The keys a message is stopped for (PK1): a known format or a URL's password whose value does not read as a sample or as
 * already cut out (PKD4), in the order they stand. None, and the message goes.
 */
export function keysToTell(message: MessageToCheck): readonly KeyToTell[] {
  const lineStarts = [0];
  for (let at = message.text.indexOf('\n'); at !== -1; at = message.text.indexOf('\n', at + 1)) lineStarts.push(at + 1);
  const lineOf = (offset: number): number => {
    let line = 0;
    while (line + 1 < lineStarts.length && (lineStarts[line + 1] as number) <= offset) line += 1;
    return line + 1;
  };
  return keysInMessage(message.text)
    .filter((key) => !key.sample)
    .map((key) => {
      const line = lineOf(key.start);
      const paste = message.pastes.findIndex((span) => span.first <= line && line <= span.last);
      const inPaste = paste === -1 ? { line } : { line: line - (message.pastes[paste] as PastedLines).first + 1, paste: paste + 1 };
      return { kind: key.kind, ...inPaste, ...(key.name === undefined ? {} : { name: key.name }) };
    });
}
