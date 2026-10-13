// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { ToolEvent } from '../event.ts';

/**
 * What a call printed, as the text its lines are read from (`2026-10-13-each-command-its-own-result.md` EC9): the text its
 * result wraps, where it wraps one - a Codex cell that returned `text(r)` holds the command's output escaped inside a JSON
 * object (XD11), so not one of the result's lines is a line the command printed; else what the process printed, where the
 * record keeps it apart from Codex's header (XD4c-R4); else the result as written. The one answer every reader of a call's
 * printed lines asks (lesson L018) - a listing's names, a search's hits, a file's keys and values. What the model was
 * handed is the result as written, and is read as such.
 *
 * Found 2026-10-13: FNB44 had taught the values' reader this, and three other readers still asked the result as written,
 * so a listing a cell returned as `text(r)` named none of its files - `.env` among them - and the row said *Nothing private*.
 */
export function printedOutput(event: Pick<ToolEvent, 'result' | 'execution'> | undefined): string | undefined {
  return event?.result?.printedText ?? event?.execution?.printed ?? event?.result?.content;
}
