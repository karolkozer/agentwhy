// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { answerFileWrite } from '../../src/key-swap/key-swap-hook.ts';
import { placeholderWriteRefusal } from '../../src/key-swap/render/key-swap-words.ts';
import { PLACEHOLDER_WRITE_OPENS } from '../../src/core/redaction/swap-keys.ts';
import type { NoticeLang } from '../../src/report/watch/notice-choices.ts';

// `2026-11-23-a-write-over-the-key.md` WK2-WK4. Values joined at run time (the export's P9).
const GITHUB = ['ghp', 'Q7mZp2Lx9TaV4cBn8RwE3yKu1SdF6gHj0PoI'].join('_');
const PLACEHOLDER = '[redacted by agentwhy]';
const FILE = '/Users/someone/fictional-shop/config.yml';

const write = (content: string, path = FILE, cwd: string | undefined = '/Users/someone/fictional-shop'): string =>
  JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: path, content }, cwd });
const edit = (oldString: string, newString: string): string =>
  JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: FILE, old_string: oldString, new_string: newString, replace_all: false }, cwd: '/Users/someone/fictional-shop' });

function spy(files: Readonly<Record<string, string>>): { readonly readText: (path: string) => Promise<string>; readonly reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    readText: async (path) => {
      reads.push(path);
      const text = files[path];
      if (text === undefined) throw new Error('ENOENT');
      return text;
    },
  };
}
const english = async (): Promise<NoticeLang> => 'en';

test('KRB11: a write whose new text holds no placeholder opens no file', async () => {
  const files = spy({ [FILE]: `token: ${GITHUB}\n` });
  assert.equal(await answerFileWrite(write('token: changed\n'), files.readText, english), undefined);
  assert.equal(await answerFileWrite(edit('mode: dev', 'mode: prod'), files.readText, english), undefined);
  assert.deepEqual(files.reads, []);
});

test('KR8: input that is not a write opens no file and refuses nothing', async () => {
  const files = spy({ [FILE]: `token: ${GITHUB}\n` });
  for (const input of ['', 'not json', '[]', JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_response: { content: PLACEHOLDER } })]) {
    assert.equal(await answerFileWrite(input, files.readText, english), undefined, input);
  }
  assert.deepEqual(files.reads, []);
});

test('WK2: a Write that puts the placeholder over a key is refused, naming the file and never the key', async () => {
  const files = spy({ [FILE]: `token: ${GITHUB}\n` });
  const refusal = (await answerFileWrite(write(`token: ${PLACEHOLDER}\n`), files.readText, english)) ?? '';
  assert.ok(refusal.startsWith(PLACEHOLDER_WRITE_OPENS), refusal);
  assert.ok(refusal.includes(FILE));
  assert.ok(!refusal.includes(GITHUB) && !refusal.includes('ghp'));
  assert.deepEqual(files.reads, [FILE]);
});

test('WK2: a new file holding the placeholder passes - no file, no key to lose', async () => {
  const files = spy({});
  assert.equal(await answerFileWrite(write(`token: ${PLACEHOLDER}\n`), files.readText, english), undefined);
});

test('WK2: a file holding the placeholder as text and no key passes, as does a rewrite keeping its count', async () => {
  const own = spy({ [FILE]: `const shown = '${PLACEHOLDER}';\n` });
  assert.equal(await answerFileWrite(write(`const shown = '${PLACEHOLDER}';\nconst more = '${PLACEHOLDER}';\n`), own.readText, english), undefined);
  const keyed = spy({ [FILE]: `token: ${GITHUB}\nnote: ${PLACEHOLDER}\n` });
  assert.equal(await answerFileWrite(write(`token: ${GITHUB}\nnote: ${PLACEHOLDER} kept\n`), keyed.readText, english), undefined);
});

test('WKD3: an Edit adding the placeholder to a file with a key is refused; one keeping the count opens no file', async () => {
  const files = spy({ [FILE]: `token: ${GITHUB}\nother: x\n` });
  const refusal = await answerFileWrite(edit('other: x', `other: ${PLACEHOLDER}`), files.readText, english);
  assert.ok(refusal?.startsWith(PLACEHOLDER_WRITE_OPENS), refusal);
  const keeping = spy({ [FILE]: `token: ${GITHUB}\n` });
  assert.equal(await answerFileWrite(edit(`a ${PLACEHOLDER}`, `b ${PLACEHOLDER}`), keeping.readText, english), undefined);
  assert.deepEqual(keeping.reads, []);
});

test('WK2: a relative path is read where the call runs', async () => {
  const files = spy({ [FILE]: `token: ${GITHUB}\n` });
  const refusal = await answerFileWrite(write(`token: ${PLACEHOLDER}\n`, 'config.yml'), files.readText, english);
  assert.deepEqual(files.reads, [FILE]);
  assert.ok(refusal?.includes('config.yml'));
});

test('WK3: the language is asked only for a refusal, and the opening stays English', async () => {
  const asked: (string | undefined)[] = [];
  const polish = async (directory: string | undefined): Promise<NoticeLang> => {
    asked.push(directory);
    return 'pl';
  };
  assert.equal(await answerFileWrite(write('token: changed\n'), spy({}).readText, polish), undefined);
  assert.deepEqual(asked, []);
  const refusal = (await answerFileWrite(write(`token: ${PLACEHOLDER}\n`), spy({ [FILE]: `token: ${GITHUB}\n` }).readText, polish)) ?? '';
  assert.ok(refusal.startsWith(PLACEHOLDER_WRITE_OPENS), refusal);
  assert.match(refusal, /prawdziwy klucz/);
  assert.deepEqual(asked, ['/Users/someone/fictional-shop']);
});

// M3 of the final review: a `Write` keeps its measured words, and an `Edit` is said as the edit it is, in each language.
test('WK3: a Write is refused in the measured words, an Edit in its own, each opening in English', async () => {
  for (const lang of ['en', 'pl', 'de'] as const) {
    const asks = async (): Promise<NoticeLang> => lang;
    const wrote = (await answerFileWrite(write(`token: ${PLACEHOLDER}\n`), spy({ [FILE]: `token: ${GITHUB}\n` }).readText, asks)) ?? '';
    const edited = (await answerFileWrite(edit('other: x', `other: ${PLACEHOLDER}`), spy({ [FILE]: `token: ${GITHUB}\nother: x\n` }).readText, asks)) ?? '';
    assert.equal(wrote, placeholderWriteRefusal(FILE, lang));
    assert.equal(edited, placeholderWriteRefusal(FILE, lang, 'edit'));
    assert.notEqual(wrote, edited, lang);
    for (const refusal of [wrote, edited]) {
      assert.ok(refusal.startsWith(PLACEHOLDER_WRITE_OPENS), refusal);
      assert.ok(refusal.includes(FILE) && refusal.includes(PLACEHOLDER) && !refusal.includes(GITHUB), refusal);
    }
  }
  assert.equal(placeholderWriteRefusal(FILE, 'en'), `${PLACEHOLDER_WRITE_OPENS}${FILE} holds a real key you were not shown, and this write would replace it with ${PLACEHOLDER}. Change the file around that line, or ask the person for the value.`);
  assert.match(placeholderWriteRefusal(FILE, 'en', 'edit'), /this edit would put \[redacted by agentwhy\] into .*config\.yml, which holds a real key/);
  assert.match(placeholderWriteRefusal(FILE, 'pl', 'edit'), /ta edycja wstawiłaby/);
  assert.match(placeholderWriteRefusal(FILE, 'de', 'edit'), /diese Bearbeitung würde/);
});
