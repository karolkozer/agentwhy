// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { homedir } from 'node:os';
import type { NoticeLang } from '../report/watch/notice-choices.ts';
import { preferencesFile, preferencesFor, readPreferences } from '../report/watch/preferences.ts';

/**
 * The language a person chose for the folder a hook runs in, read as `watch` reads it (`the-agent-tells-you.md` R29);
 * `undefined` where none is chosen. A file that is not there throws, and the caller goes on to the system's language.
 * Apart from `hide-keys.ts`, which loads it only where there is a line to write (`2026-11-05-a-key-in-what-it-read.md` KRB11).
 */
export async function chosenLanguage(readText: (path: string) => Promise<string>, directory: string | undefined): Promise<NoticeLang | undefined> {
  const read = readPreferences(await readText(preferencesFile(homedir())));
  return read.kind === 'read' ? preferencesFor(read.preferences, directory).lang : undefined;
}
