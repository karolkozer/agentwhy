// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0

/**
 * Whether a command's recorded output is what the model was handed (XB5, `2026-09-27-what-codex-wrote.md` §7).
 *
 * In code mode the model never receives what a process printed: it receives the cell's return value, and the agent's
 * own JavaScript stands between the two and may keep any part of it. Measured 2026-10-05 over the 79 non-empty
 * `CommandExecution` outputs of Codex 0.160.0 `paginated`: 15 reached a cell whole, 36 left one long line in it, 11 only
 * a first token, and 17 nothing at all. An action item is therefore no evidence of delivery, which is why the adapter
 * records one at the execution stage.
 *
 * Where the output does occur whole in exactly one of the session's cell returns, that one return carried it, and the
 * stage is the model's. Two returns holding the same text name neither: of the 15, 13 were unique and 2 were not. The
 * join is by the text itself, not by an id - no id joins an item to a cell (§2.3) - so it is made only on an exact,
 * unique occurrence, and never on an empty output, which every cell would hold.
 */
export function deliveredWhole(output: string, cellReturns: readonly string[]): boolean {
  const text = output.trim();
  if (text === '') return false;
  let found = 0;
  for (const returned of cellReturns) {
    if (!returned.includes(text)) continue;
    found += 1;
    if (found > 1) return false;
  }
  return found === 1;
}
