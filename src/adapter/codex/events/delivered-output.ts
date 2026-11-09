// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { keysSwappedIn, swapKeys } from '../../../core/redaction/swap-keys.ts';
import { cellResultOutputs } from './cell-result.ts';

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
 *
 * §2.16, measured 2026-10-10: a cell that returns the call's whole result (`text(r)`) hands the model the output as the
 * `output` of a JSON object, escaped, so its lines never occur in the return as printed. Such a return carries it whole
 * where that `output` is the recorded output exactly: 331 outputs over 448 rollouts were read as not delivered before,
 * while the VS Code panel's same cell - its command read from the code - was already the model's.
 */
export function deliveredWhole(output: string, cellReturns: readonly string[]): boolean {
  const text = output.trim();
  if (text === '') return false;
  let found = 0;
  for (const returned of cellReturns) {
    if (!returned.includes(text) && !cellResultOutputs(returned).some((one) => one.trim() === text)) continue;
    found += 1;
    if (found > 1) return false;
  }
  return found === 1;
}

/**
 * `2026-11-09-codex-hides-keys.md` CH6: what the model was handed of a command's output where agentwhy's hook swapped its keys -
 * the output with each key swapped as the hook swaps it - where that text stands whole in one of `swappedReturns`, the returns that
 * hold agentwhy's notice, as written or escaped in a result's JSON, and none of the agent's `returns` holds one of its keys;
 * `undefined` otherwise, and where it holds no key. Not XB5's unique join: a file printed three times in one conversation stood in
 * three returns (CHB2), and the question here is not which return carried it but whether any key of it reached the model.
 */
export function hiddenWhole(output: string, swappedReturns: readonly string[], returns: readonly string[]): string | undefined {
  const { value, count } = swapKeys(output);
  if (count === 0 || typeof value !== 'string') return undefined;
  const text = value.trim();
  if (text === '') return undefined;
  const escaped = JSON.stringify(text).slice(1, -1);
  if (!swappedReturns.some((returned) => returned.includes(text) || returned.includes(escaped))) return undefined;
  const keys = keysSwappedIn(output).flatMap((key) => [key, JSON.stringify(key).slice(1, -1)]);
  return returns.some((returned) => keys.some((key) => returned.includes(key))) ? undefined : value;
}
