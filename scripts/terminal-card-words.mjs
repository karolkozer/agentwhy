// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
// The terminal card's copy of the words the page and the chat are written in (`.ai/specs/2026-11-24-talking-about-agentwhy.md` CV13).
// A plugin's module holds no part of `dist/`, so it carries them itself; `tests/hooks/terminal-card.test.ts` fails where the copy is
// not these. Run after a change of a word: node scripts/terminal-card-words.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ANSWER_WORDS } from '../src/report/answers/answer-words.ts';
import { CHAT_WORDS } from '../src/report/render/chat/chat-words.ts';
import { APP_WORDS } from '../src/report/render/ui/words/app-words.ts';
import { REPORT_WORDS } from '../src/report/render/ui/words/report-words.ts';

const FILE = fileURLToPath(new URL('../hooks/terminal/repository-words.ts', import.meta.url));
const COPIED = [
  [ANSWER_WORDS, /^an\.(where|days|since|okay|empty|reading|g|checked|again|covers|titles|rows|untitled|today|yesterday|more|often|o|sum|n|steps|files|helpers?|todo|unchecked|tab\.(todo|often|files)|col|row)(\.|$)/],
  [CHAT_WORDS, /^ch\.(ai|access|outside|elsewhere|count|diagram\.others|strip\.(cut|per|one|few|many|other))(\.|$)/],
  [APP_WORDS, /^(look|held)\./],
  [REPORT_WORDS, /^st\.helper$/],
];

/** The file's whole text, as the words stand now. */
export function repositoryWords() {
  const quoted = (text) => "'" + text.replaceAll('\\', '\\\\').replaceAll("'", "\\'") + "'";
  const table = (lang) => COPIED.flatMap(([words, wanted]) => Object.entries(words[lang]).filter(([key]) => wanted.test(key)))
    .map(([key, said]) => `    ${quoted(key)}: ${quoted(said)},`).join('\n');
  return [
    '// Copyright 2026 Nessprim Karol Kozer', '// SPDX-License-Identifier: Apache-2.0',
    '// Written by scripts/terminal-card-words.mjs from the words under src/: change them there.',
    "import type { Lang } from './answer.js';", '',
    'export type Table = Readonly<Record<string, string>>;', '',
    'export const REPOSITORY_WORDS: Readonly<Record<Lang, Table>> = {',
    ...['en', 'pl', 'de'].map((lang) => `  ${lang}: {\n${table(lang)}\n  },`),
    '};', '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(FILE, repositoryWords());
  console.log(FILE);
}
