import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { holdsCodePunctuation, pathShape, shapedLikePath } from '../../../src/core/access/path-shape.ts';

// The shapes measured on 2026-09-15, one example of each from the sessions that were counted.
test('each shape is named by the first rule that matches', () => {
  assert.equal(pathShape('apps/web/.env'), 'path');
  assert.equal(pathShape('/Users/someone/Client Name/app/apps/web/.env'), 'path-with-space');
  assert.equal(pathShape('check apps/web/.env'), 'words-before');
  assert.equal(pathShape('/Users/someone/.ssh/id_rsa in a result'), 'words-after');
  assert.equal(pathShape('{file_path:/a/app/.env}'), 'code-punctuation');
  assert.equal(pathShape('cd apps && cat web/.env'), 'command-text');
  // A semicolon is punctuation by R3.1, and `&&`, `||` and `|` are the operators of R3.2: both leave a path behind.
  assert.equal(pathShape('cat a/.env ; cat b/.env'), 'code-punctuation');
  assert.equal(pathShape('cat a/.env | tee b/.env'), 'command-text');
});

// spec criterion 2 and R3.1: what a framework names, against what a program prints around a path.
test('a square bracket is part of a path inside one segment and code across segments', () => {
  assert.ok(shapedLikePath('app/[locale]/secrets/key'));
  assert.ok(shapedLikePath('content/[...slug].env'));
  assert.ok(!shapedLikePath('[apps/web/.env,'));
  assert.ok(!shapedLikePath('[apps/web/.env]'));
  assert.ok(!shapedLikePath('apps/web].env'));
});

// R4 and lesson L011: the rule is about punctuation and about the ends, never about whitespace.
test('a path with a space is a path, wherever the space sits', () => {
  for (const path of ['/Users/someone/Client Name/app/.env', '~/Web Portal/app/.npmrc', './Client Name/app/.env']) {
    assert.ok(shapedLikePath(path), path);
  }
});

// The cost this rule has, and the reason R4 keeps it away from a quoted argument: a relative path whose first
// directory holds a space begins with a word that could be any word. `2026-09-15-findings-worth-reading.md` §5.2 held
// the rule back for it; it is asked now only of inline code and lines of output, where the fragments were measured.
test('a relative path whose first directory holds a space is not shaped like one', () => {
  assert.equal(pathShape('my project/.env'), 'words-before');
});

test('an arrow, a brace or a comma is punctuation of code, and a bracketed segment is not', () => {
  assert.ok(holdsCodePunctuation('/Users/someone/.ssh/id_rsa -> outside the project'));
  assert.ok(holdsCodePunctuation('{file_path:/a/app/.env}'));
  assert.ok(holdsCodePunctuation('apps/web/.env,'));
  assert.ok(!holdsCodePunctuation('app/[locale]/secrets/key'));
  assert.ok(!holdsCodePunctuation('apps/web/.env'));
});

test('nothing is not a path', () => {
  assert.ok(!shapedLikePath(''));
  assert.ok(!shapedLikePath('   '));
});
