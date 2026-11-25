// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { resolve } from 'node:path';
import { parseFileWriteInput } from '../adapter/claude-code/hooks/file-write-input.js';
import { chatNotice, resultSwapped } from '../adapter/claude-code/hooks/hook-output.js';
import { parseToolResultInput } from '../adapter/claude-code/hooks/tool-result-input.js';
import { parseCodexToolResult, resultReplaced } from '../adapter/codex/hooks/tool-result-input.js';
import { addsPlaceholder, writesOverKey } from '../core/redaction/placeholder-write.js';
import { codexKeySwapNotice, KEY_PLACEHOLDER, keySwapNotice, swapKeys } from '../core/redaction/swap-keys.js';
import { keyInFailureLine, keyNotHiddenLine, keysHiddenLine, placeholderWriteRefusal } from './render/key-swap-words.js';
/**
 * What the hook of a person who turned the switch on answers for a call (`2026-11-05-a-key-in-what-it-read.md` KR3, KR5, KR7),
 * and the empty text where there is nothing to say - nearly always, since it acts on about one call in 600 (KRB6). It opens no
 * file and keeps nothing of a key.
 */
export async function answerToolResult(input, languageIn) {
    const call = parseToolResultInput(input);
    if (call === undefined)
        return '';
    if (call.kind === 'failure')
        return swapKeys(call.error).count === 0 ? '' : chatNotice(keyInFailureLine(await languageIn(call.directory)));
    const { value, count } = swapKeys(call.result);
    if (count === 0)
        return '';
    const lang = await languageIn(call.directory);
    // KR3: an answer of a bare string is ignored on `Bash` and `Read` with no word (KRB2). A result that is one was seen on one MCP server's
    // successful calls alone, and whether a replacement holds there is not measured, so nothing is claimed for it (§2.16).
    if (typeof call.result === 'string')
        return chatNotice(keyNotHiddenLine(lang));
    return resultSwapped(value, keySwapNotice(count), keysHiddenLine(count, lang));
}
/**
 * `2026-11-09-codex-hides-keys.md` CH1, CH3: Codex's answer for a shell command - the whole result with each key swapped and the
 * notice after it, in the hook's words, which is the one answer that keeps a key from Codex's model (§1). Codex runs the hook in
 * every folder on the computer (CH2), so it acts only where `switchOn` says the session's project has the switch on, and that is
 * asked only once a key is found: a result with none costs the scanner alone, as Claude Code's does (KRB11). After a command
 * that failed too, which Codex hands a hook as it hands any other (§1).
 */
export async function answerCodexToolResult(input, switchOn) {
    const call = parseCodexToolResult(input);
    if (call === undefined)
        return '';
    const { value, count } = swapKeys(call.printed);
    if (count === 0 || typeof value !== 'string')
        return '';
    if (!(await switchOn(call.directory)))
        return '';
    return resultReplaced(`${value}\n\n${codexKeySwapNotice(count)}`);
}
/**
 * `2026-11-23-a-write-over-the-key.md` WK2, WK3: the refusal of a `Write` or an `Edit` that would put the placeholder over a key the
 * file holds, or `undefined` where the write goes on - nearly always. The file is opened only where the new text adds the
 * placeholder, so a write without it costs the parse alone (KRB11); a file that cannot be read is no key to lose, and the write
 * goes on (WK4).
 *
 * The raw input is looked at first, so the `PostToolUse` calls this command answers far more often are not parsed twice: JSON
 * needs no escape for any of the placeholder's characters, and an input that spelled one with `\u` anyway is a write let
 * through, as every other failure of this check is (WK4). Whether Claude Code ever writes one so is not measured.
 */
export async function answerFileWrite(input, readText, languageIn) {
    if (!input.includes(KEY_PLACEHOLDER))
        return undefined;
    const write = parseFileWriteInput(input);
    if (write === undefined || !write.newText.includes(KEY_PLACEHOLDER))
        return undefined;
    // An `Edit` that keeps the count of placeholders cannot add one, whatever the file holds.
    if (write.replaced !== undefined && !addsPlaceholder(write.newText, write.replaced))
        return undefined;
    const fileText = await readText(resolve(write.directory ?? '', write.path)).catch(() => undefined);
    if (!writesOverKey(write, fileText))
        return undefined;
    return placeholderWriteRefusal(write.path, await languageIn(write.directory), write.replaced === undefined ? 'write' : 'edit');
}
