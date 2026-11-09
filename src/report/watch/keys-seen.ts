// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { keysHiddenIn, swapKeys } from '../../core/redaction/swap-keys.ts';
import type { SessionModel } from '../../core/session-model.ts';
import type { KeysSeen } from './watch-notice.ts';

/**
 * `2026-11-05-a-key-in-what-it-read.md` KR11: the keys in what the conversation's tools returned, every agent's. A result the
 * record says agentwhy's hook swapped counts its placeholders, one for each key hidden; any other result counts the keys the
 * hook would have hidden there, by the same function, so a key that reached the AI is one the switch would have hidden had the
 * call not failed (KR7). Nothing where neither: the line is then what it was (KR10). Only what the model was handed: Codex records
 * what a command printed too, which its model may never have read (`2026-11-09-codex-hides-keys.md` CHO4); Claude Code's results
 * are all the model's.
 */
export function keysSeenIn(model: SessionModel): KeysSeen | undefined {
  let hidden = 0;
  let read = 0;
  for (const event of model.events) {
    const content = event.result?.content;
    if (content === undefined || event.result?.stage !== 'model') continue;
    if (event.result.keysHidden === true) hidden += keysHiddenIn(content);
    else read += swapKeys(content).count;
  }
  return hidden === 0 && read === 0 ? undefined : { hidden, read };
}
