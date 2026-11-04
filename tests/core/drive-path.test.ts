// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { sameFolder, startsAtDrive, withSlashes } from '../../src/core/drive-path.ts';

// `2026-10-12-windows-paths.md` WPB1: how Claude Code on Windows wrote the file `Read` was handed.
test('a path at a drive is written with / and its drive letter in capitals', () => {
  assert.equal(withSlashes(String.raw`C:\Users\someone\lessons\spec.md`), 'C:/Users/someone/lessons/spec.md');
  assert.equal(withSlashes(String.raw`c:\Users\someone\lessons\spec.md`), 'C:/Users/someone/lessons/spec.md');
  assert.equal(withSlashes('C:/Users/someone/lessons/spec.md'), 'C:/Users/someone/lessons/spec.md');
  assert.equal(withSlashes(String.raw`C:/Users\someone/lessons\spec.md`), 'C:/Users/someone/lessons/spec.md', 'both separators in one path');
  assert.equal(withSlashes('S:\\'), 'S:/', 'a drive itself');
});

// A backslash anywhere else is a name's or an escape's: `grep '\.env'` names no file called `/.env`.
test('a path that does not start at a drive is left exactly as written', () => {
  for (const written of [String.raw`\.env`, String.raw`apps\web\.env`, String.raw`/Users/someone/odd\name`, String.raw`\\server\share\x`, 'C:', 'C:notes.md', 'notes.md']) {
    assert.equal(withSlashes(written), written, written);
  }
});

test('starting at a drive takes a letter, a colon and a separator', () => {
  assert.equal(startsAtDrive(String.raw`C:\x`), true);
  assert.equal(startsAtDrive('d:/x'), true);
  assert.equal(startsAtDrive('C:x'), false, 'relative to the drive’s own folder: not a place this can name');
  assert.equal(startsAtDrive('/c/Users/someone'), false, 'Git Bash’s form is a POSIX path');
  assert.equal(startsAtDrive('CC:/x'), false);
});

// WP2, WP5, WPB8: one folder at a drive whatever its separators and case; every other pair as written.
test('two folders at a drive are one in either case and with either separator; any other pair as written', () => {
  assert.equal(sameFolder(String.raw`c:\Users\someone\shop`, String.raw`C:\Users\someone\shop`), true);
  assert.equal(sameFolder(String.raw`C:\Users\someone\Projects\Shop`, 'c:/users/someone/projects/shop'), true);
  assert.equal(sameFolder(String.raw`C:\Users\someone\shop`, 'C:\\Users\\someone\\shop\\'), false, 'a trailing separator is no guess this makes');
  assert.equal(sameFolder(String.raw`C:\Users\someone\shop`, String.raw`D:\Users\someone\shop`), false);
  assert.equal(sameFolder('/Users/someone/Shop', '/Users/someone/shop'), false, 'a POSIX folder keeps its case');
  assert.equal(sameFolder('/Users/someone/shop', '/Users/someone/shop'), true);
});
