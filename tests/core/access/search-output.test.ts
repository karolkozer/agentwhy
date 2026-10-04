// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { hitLines } from '../../../src/core/access/search-output.ts';
import { printedSearch } from '../../../src/core/access/search-reach.ts';

// search-hits-are-reads H1. The row is invented; the shape is the one a real session printed on 2026-09-24.
const ROW = 'customers.csv:6:5,Ada,Lovelace,ada@example.test,+48 500 000 000,Poznan,PL';

test('a search that prints what it matched is told apart from one that prints names, counts or nothing', () => {
  assert.deepEqual(printedSearch('ls -la && grep -rniI --exclude-dir=node_modules -e "Ada" . | head -50'), { context: false, names: 'maybe', numbered: true });
  assert.deepEqual(printedSearch('grep -rn -C2 SUPABASE .'), { context: true, names: 'maybe', numbered: true });
  assert.deepEqual(printedSearch('git grep -n KEY'), { context: false, names: 'always', numbered: true });
  assert.deepEqual(printedSearch('rg -f patterns.txt src'), { context: false, names: 'maybe' }, "rg's -f is a file of patterns, and still prints lines");
  assert.deepEqual(printedSearch('grep -f patterns.txt -r .'), { context: false, names: 'maybe' }, "and so is grep's");
  for (const command of ['grep -rl KEY .', 'grep -rc KEY .', 'grep -rq KEY .', 'grep --files-with-matches KEY -r .', 'rg --files', 'rg -l KEY', 'ag -g env', 'ack -f', 'ls -la', 'cat .env']) {
    assert.equal(printedSearch(command), undefined, command);
  }
});

// H3: whether a line starts with a file's name is the command's to say, and a recursive search of one operand cannot.
test('a search says whether its lines carry a file’s name: always, never, or only the lines can tell', () => {
  const names = (command: string) => printedSearch(command)?.names;
  assert.equal(names('grep KEY .env'), 'never', 'one file, no recursion');
  assert.equal(names('cat .env | grep KEY'), 'never', 'what was piped to it');
  assert.equal(names('grep -h KEY -r .'), 'never');
  assert.equal(names('rg -I KEY src'), 'never', "ripgrep's own -I");
  assert.equal(names('grep KEY .env .env.local'), 'always', 'two files');
  assert.equal(names('grep -H KEY .env'), 'always');
  assert.equal(names('grep -r KEY'), 'always', 'a recursive grep with no file searches its directory');
  assert.equal(names('rg KEY'), 'always');
  assert.equal(names('git grep KEY .env'), 'always', 'git grep names the file on every line');
  assert.equal(names('grep -rn KEY src lib | grep -v test'), 'always', 'the first search’s names are still on the lines');
  assert.equal(names('grep KEY .env | grep -v PUBLIC'), 'never');
  assert.equal(names('rg KEY .env'), 'maybe', 'a file or a directory: only the lines can tell');
  assert.equal(names('grep -d recurse KEY src'), 'maybe');
});

test('each hit line is the text of the file it names, with or without a line number', () => {
  assert.deepEqual(hitLines(ROW + '\nsrc/app.ts:12:const a = 1;\napps/web/.env:KEY=x', false), [
    { path: 'customers.csv', kind: 'hit', text: '5,Ada,Lovelace,ada@example.test,+48 500 000 000,Poznan,PL' },
    { path: 'src/app.ts', kind: 'hit', text: 'const a = 1;' },
    { path: 'apps/web/.env', kind: 'hit', text: 'KEY=x' },
  ]);
  assert.deepEqual(hitLines('12:no path here\nplain words, no colon\n--', false), [], 'a line with no path names no file');
});

test('a context line counts only beside a hit of the same file, so a dash in a name never splits it', () => {
  const output = ['my-app.env-1-# payments', 'my-app.env:2:STRIPE_KEY=sk_x', 'my-app.env-3-STRIPE_HOOK=whsec_y', '--', 'other-file-4-not a context line'].join('\n');
  assert.deepEqual(hitLines(output, true).map((line) => [line.path, line.kind, line.text]), [
    ['my-app.env', 'hit', 'STRIPE_KEY=sk_x'],
    ['my-app.env', 'context', '# payments'],
    ['my-app.env', 'context', 'STRIPE_HOOK=whsec_y'],
  ]);
  assert.equal(hitLines(output, false).length, 1, 'without -A/-B/-C, only hits');
});

// A context line's text can hold a colon; what comes before it is then another hit's line, not a path of its own.
test('a context line with a colon in it is still the context of the file beside it', () => {
  const output = ['./.env-1-# payments', './.env:2:STRIPE_KEY=sk_x', './.env-3-SUPABASE_URL=https://project.example.test'].join('\n');
  assert.deepEqual(hitLines(output, true).map((line) => [line.path, line.kind, line.text]), [
    ['./.env', 'hit', 'STRIPE_KEY=sk_x'],
    ['./.env', 'context', '# payments'],
    ['./.env', 'context', 'SUPABASE_URL=https://project.example.test'],
  ]);
});
