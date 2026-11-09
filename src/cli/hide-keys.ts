// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { homedir } from 'node:os';
import { answerCodexToolResult, answerToolResult } from '../key-swap/key-swap-hook.ts';
import { DEFAULT_LANG, langOfLocale, type NoticeLang } from '../report/watch/notice-choices.ts';

export interface HideKeysIo {
  readonly input: AsyncIterable<Uint8Array | string>;
  readonly output: { write(text: string): unknown };
  readonly inputIsTerminal: boolean;
  /** What follows `hide-keys` on the command line: `--codex` where Codex runs it (`2026-11-09-codex-hides-keys.md` CH1). */
  readonly args: readonly string[];
  readonly locale: string | undefined;
  /** A file of the person's own, as text. Given by `cli.ts`, since nothing linked from here opens a file (KR1). */
  readonly readText: (path: string) => Promise<string>;
}

const AT_A_TERMINAL = 'agentwhy hide-keys runs as a Claude Code hook, after each call of a person who turned it on in Settings,\n' +
  'and with --codex as a Codex hook, after each shell command in a project where it is on.\n' +
  'To turn it on: agentwhy init --hide-keys. To turn it off: agentwhy init --remove --hide-keys.\n';

/**
 * KR6, KR7: the language chosen on a page or with `notify --lang`, then the system's, then English, as `watch` reads it (R29). Loaded
 * and read only where there is a line to write, so a call with no key costs no more (KRB11). Whatever goes wrong here costs the
 * language and never the swap (KR8): an answer lost to it would hand the AI the key.
 */
async function lineLanguage(io: HideKeysIo, directory: string | undefined): Promise<NoticeLang> {
  const chosen = await import('./chosen-language.ts')
    .then(({ chosenLanguage }) => chosenLanguage(io.readText, directory))
    .catch(() => undefined);
  return chosen ?? langOfLocale(io.locale) ?? DEFAULT_LANG;
}

/**
 * CH2: whether the project of the folder Codex runs in has the switch on - read only where a key was found, so a call with none
 * opens no file. Whatever goes wrong is no: Codex then goes on with the result it has, as with no hook (KR8).
 */
async function keysHiddenIn(io: HideKeysIo, directory: string | undefined): Promise<boolean> {
  if (directory === undefined) return false;
  return import('../adapter/claude-code/settings/key-swap-project.ts')
    .then(({ keysHiddenAt }) => keysHiddenAt(io.readText, directory, homedir()))
    .catch(() => false);
}

/**
 * `agentwhy hide-keys`, loaded by `cli.ts` before the shell and linked to nothing beyond the scanner, so that it starts in about
 * 35 ms where the shell takes 140 (KRB11). Whatever goes wrong is nothing written and exit 0 (KR8): the call goes on, as it would
 * have with no hook at all, and never with an error on every call.
 */
export async function runHideKeys(io: HideKeysIo): Promise<void> {
  if (io.inputIsTerminal) {
    io.output.write(AT_A_TERMINAL);
    return;
  }
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of io.input) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
    const input = Buffer.concat(chunks).toString('utf8');
    const answer = io.args.includes('--codex')
      ? await answerCodexToolResult(input, (directory) => keysHiddenIn(io, directory))
      : await answerToolResult(input, (directory) => lineLanguage(io, directory));
    if (answer !== '') io.output.write(answer);
  } catch {
    // KR8: nothing written. A hook that fails lets the call go on, and this one says nothing about it either.
  }
}
