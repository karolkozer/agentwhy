// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { hookRefusalsIn } from '../../../../src/adapter/codex/events/hook-refusals.ts';
import { refusalReason } from '../../../../src/refuse/render/refusal-words.ts';

/** A cell's output as Codex recorded a refusal (CKB7, CKB11): its words around agentwhy's reason, the newline dropped. */
const cellOutput = (reason: string, command: string) =>
  `Script failed\nWall time 0.2 seconds\nOutput:\nScript error:\nCommand blocked by PreToolUse hook: ${reason.trimEnd()}. Command: ${command}`;

// `codex-blocks-too` CK12: agentwhy's own sentences, read back - so a change to them that this stops reading fails here.
test('every route of refusalReason is read back: the path, the rule and the refused line', () => {
  const named = hookRefusalsIn(cellOutput(refusalReason('../../.env', '**/.env*', 0, { kind: 'named' }), 'cat ../../.env'));
  assert.deepEqual(named.map(({ path, pattern, command }) => [path, pattern, command]), [['../../.env', '**/.env*', 'cat ../../.env']]);

  const glob = hookRefusalsIn(cellOutput(refusalReason('.env', '**/.env*', 0, { kind: 'glob', word: '.env*' }), "rg --files --hidden -g '.env*' -g '!node_modules'"));
  assert.deepEqual(glob.map(({ path, command }) => [path, command]), [['.env', "rg --files --hidden -g '.env*' -g '!node_modules'"]]);

  // FND9: the sentence after the parsed one does not change what is read - the word, the rule, the line.
  const byName = hookRefusalsIn(cellOutput(refusalReason('exercise.py', '**/lessons/b/exercise.py', 0, { kind: 'byName' }), 'find lessons -name exercise.py -exec cat {} +'));
  assert.deepEqual(byName.map(({ path, pattern, command }) => [path, pattern, command]), [['exercise.py', '**/lessons/b/exercise.py', 'find lessons -name exercise.py -exec cat {} +']]);

  const search = hookRefusalsIn(cellOutput(refusalReason('apps/web/.env.local', '**/.env*', 2, { kind: 'search' }), 'grep -rn KEY .'));
  assert.deepEqual(search.map(({ path, pattern }) => [path, pattern]), [['apps/web/.env.local', '**/.env*']]);
  assert.match(search[0]?.reason ?? '', /^agentwhy refused this command: this search would read apps\/web\/\.env\.local, .+Do not ask them to paste this file or a secret value into the chat; they can inspect it in their IDE\.$/);

  // `2026-10-11-a-folder-found-while-it-runs.md` FW1: said as a search, with its sentence after the parsed one.
  const line = 'd=$(find . -type d -name secrets | head -1); cat "$d"/*';
  const found = hookRefusalsIn(cellOutput(refusalReason('docs/secrets/key.txt', '**/secrets/**', 0, { kind: 'found', word: '$d' }), line));
  assert.deepEqual(found.map(({ path, pattern, command }) => [path, pattern, command]), [['docs/secrets/key.txt', '**/secrets/**', line]]);
});

/*
 * `2026-10-05-protected-everywhere.md` G16: a rule written outside every project says so in its own words, since
 * there may be no project to name. Codex reads the sentence back by its words, so both are read here - this test is
 * what keeps the two from drifting apart when either side is reworded.
 */
test('a computer-wide rule\'s reason is read back the same way a project\'s is', () => {
  const everywhere = hookRefusalsIn(cellOutput(refusalReason('books/ledger.csv', '**/ledger.csv', 0, { kind: 'named' }, true), 'cat books/ledger.csv'));
  assert.deepEqual(everywhere.map(({ path, pattern }) => [path, pattern]), [['books/ledger.csv', '**/ledger.csv']]);
  assert.match(everywhere[0]?.reason ?? '', /which the computer-wide policy protects \(\*\*\/ledger\.csv\)/);

  const project = hookRefusalsIn(cellOutput(refusalReason('books/ledger.csv', '**/ledger.csv', 0, { kind: 'named' }, false), 'cat books/ledger.csv'));
  assert.match(project[0]?.reason ?? '', /which this project's policy protects \(\*\*\/ledger\.csv\)/);
});

test('two refusals in one cell are two, in order', () => {
  const text = [
    cellOutput(refusalReason('.env', '**/.env*', 0, { kind: 'named' }), 'cat .env'),
    `Command blocked by PreToolUse hook: ${refusalReason('secrets/key.pem', '**/secrets/**', 0, { kind: 'named' }).trimEnd()}. Command: cat secrets/key.pem`,
  ].join('\n');
  assert.deepEqual(hookRefusalsIn(text).map(({ path }) => path), ['.env', 'secrets/key.pem']);
});

// XB1: no field types a refusal; a reason nobody here wrote is not guessed at.
test('another hook\'s refusal, and agentwhy\'s words anywhere but after Codex\'s, are no refusal', () => {
  assert.deepEqual(hookRefusalsIn('Command blocked by PreToolUse hook: policy says no. Command: cat .env'), []);
  assert.deepEqual(hookRefusalsIn(`echo "${refusalReason('.env', '**/.env*', 0, { kind: 'named' }).trimEnd()}"`), []);
});

// CK12 as amended 2026-10-10 (`what-codex-wrote` §2.15): a script that settles its calls together returns each rejection
// as a JSON string (4 of 118 refusals measured). Its line is read decoded - quotes and all - and never runs on into the
// `"}}` closing the JSON, which had named `exercise.py}}`, a file that is not there.
test('a refusal the script returned as a JSON string is read decoded, its line whole and nothing after it', () => {
  const reason = (path: string) => `Command blocked by PreToolUse hook: ${refusalReason(path, `**/${path}`, 0, { kind: 'named' }).trimEnd()}`;
  const rejected = (at: number, path: string, line: string) => JSON.stringify({ i: at, result: { status: 'rejected', reason: `${reason(path)}. Command: ${line}` } });
  const text = [
    'Script completed\nWall time 0.3 seconds\nOutput:\n',
    rejected(0, 'lessons/b/exercise.py', "sed -n '1,240p' lessons/b/exercise.py"),
    rejected(1, 'notes/a b.md', 'cat "notes/a b.md" | tr -d \'\\\\\''),
  ].join('\n');
  assert.deepEqual(hookRefusalsIn(text).map(({ path, command }) => [path, command]), [
    ['lessons/b/exercise.py', "sed -n '1,240p' lessons/b/exercise.py"],
    ['notes/a b.md', 'cat "notes/a b.md" | tr -d \'\\\\\''],
  ]);

  // A line the script stopped on, after one it settled: both, in order.
  const both = `${rejected(0, '.env', 'cat .env')}\nScript error:\n${reason('secrets/key.pem')}. Command: cat secrets/key.pem`;
  assert.deepEqual(hookRefusalsIn(both).map(({ command }) => command), ['cat .env', 'cat secrets/key.pem']);

  // A string cut short decodes to nothing, and is read as it stands, as before.
  const cut = `{"i":0,"result":{"status":"rejected","reason":"${reason('.env')}. Command: cat .env`;
  assert.deepEqual(hookRefusalsIn(cut).map(({ path, command }) => [path, command]), [['.env', 'cat .env']]);
});
