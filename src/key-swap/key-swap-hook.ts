// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { chatNotice, resultSwapped } from '../adapter/claude-code/hooks/hook-output.ts';
import { parseToolResultInput } from '../adapter/claude-code/hooks/tool-result-input.ts';
import { parseCodexToolResult, resultReplaced } from '../adapter/codex/hooks/tool-result-input.ts';
import { codexKeySwapNotice, keySwapNotice, swapKeys } from '../core/redaction/swap-keys.ts';
import type { NoticeLang } from '../report/watch/notice-choices.ts';
import { keyInFailureLine, keyNotHiddenLine, keysHiddenLine } from './render/key-swap-words.ts';

/**
 * What the hook of a person who turned the switch on answers for a call (`2026-11-05-a-key-in-what-it-read.md` KR3, KR5, KR7),
 * and the empty text where there is nothing to say - nearly always, since it acts on about one call in 600 (KRB6). It opens no
 * file and keeps nothing of a key.
 */
export async function answerToolResult(input: string, languageIn: (directory: string | undefined) => Promise<NoticeLang>): Promise<string> {
  const call = parseToolResultInput(input);
  if (call === undefined) return '';
  if (call.kind === 'failure') return swapKeys(call.error).count === 0 ? '' : chatNotice(keyInFailureLine(await languageIn(call.directory)));
  const { value, count } = swapKeys(call.result);
  if (count === 0) return '';
  const lang = await languageIn(call.directory);
  // KR3: an answer of a bare string is ignored on `Bash` and `Read` with no word (KRB2). A result that is one was seen on one MCP server's
  // successful calls alone, and whether a replacement holds there is not measured, so nothing is claimed for it (§2.16).
  if (typeof call.result === 'string') return chatNotice(keyNotHiddenLine(lang));
  return resultSwapped(value, keySwapNotice(count), keysHiddenLine(count, lang));
}

/**
 * `2026-11-09-codex-hides-keys.md` CH1, CH3: Codex's answer for a shell command - the whole result with each key swapped and the
 * notice after it, in the hook's words, which is the one answer that keeps a key from Codex's model (§1). Codex runs the hook in
 * every folder on the computer (CH2), so it acts only where `switchOn` says the session's project has the switch on, and that is
 * asked only once a key is found: a result with none costs the scanner alone, as Claude Code's does (KRB11). After a command
 * that failed too, which Codex hands a hook as it hands any other (§1).
 */
export async function answerCodexToolResult(input: string, switchOn: (directory: string | undefined) => Promise<boolean>): Promise<string> {
  const call = parseCodexToolResult(input);
  if (call === undefined) return '';
  const { value, count } = swapKeys(call.printed);
  if (count === 0 || typeof value !== 'string') return '';
  if (!(await switchOn(call.directory))) return '';
  return resultReplaced(`${value}\n\n${codexKeySwapNotice(count)}`);
}
