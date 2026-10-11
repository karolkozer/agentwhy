// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { foldersUnknown, listedFolder, listingSections, patternWords, placeBefore, placedListed, placedWords, placesIn, sectionFolder } from '../../../src/core/access/shell-place.ts';
import { simpleCommandsIn } from '../../../src/core/access/command-line.ts';

const START = { workingDirectory: '/Users/someone/course', home: '/Users/someone' };
const folders = (command: string): readonly string[] => placesIn(command, START).map((place) => place.workingDirectory);

// Found by the review of 2026-10-09: `-` was skipped as an option, so `cd -` was read as `cd` alone, and the words after it
// were tried in the home folder. It goes back to a folder nobody here knows; the words stay where the line was.
test('cd - is no move to the home, and cd alone is', () => {
  assert.deepEqual(folders('cd lessons && cd - && cat .env'), ['/Users/someone/course', '/Users/someone/course/lessons']);
  assert.deepEqual(folders('cd && cat .env'), ['/Users/someone/course', '/Users/someone']);
  assert.equal(foldersUnknown('cd - && cat exercise.py'), true, 'the folder it goes back to is not known');
});

// `2026-10-09-the-file-not-its-name.md` FN6, and the review of 2026-10-09: code a shell is handed is read wherever it moves -
// by `-c` alone or among other options, by a program that runs the shell, or by `eval`.
test('a line hides its folder when a shell is handed code, however the shell is started', () => {
  for (const command of ['bash -c "cat x"', 'bash -lc "cat x"', 'sh -ec "cat x"', 'env bash -c "cat x"', 'nohup sh -c "cat x"',
    'timeout 5 bash -c "cat x"', 'sudo sh -c "cat x"', '/bin/zsh -c "cat x"', 'eval "cat x"']) {
    assert.equal(foldersUnknown(command), true, command);
  }
  for (const command of ['bash script.sh', 'sh -e script.sh', 'cat lessons/a/exercise.py', 'cd lessons && cat exercise.py', 'grep -c x file']) {
    assert.equal(foldersUnknown(command), false, command);
  }
});

// `2026-10-09-the-file-not-its-name.md` FN11, from FNB21: Claude Code records the folder a line was in after it ran, so
// only the line's own absolute `cd` says where a word was read. There a relative word is the file it names in that
// folder; everywhere the folder is less than certain, the word stays as written.
test('a word after a line has run its own absolute cd is the file it names there', () => {
  const placed = (commands: readonly string[]): Record<string, string> => Object.fromEntries(placedWords(commands, '/Users/someone'));
  assert.deepEqual(placed(['cd "/Users/someone/course/lessons/stage_02" && cat 02_tuples/exercise.py']),
    { '02_tuples/exercise.py': '/Users/someone/course/lessons/stage_02/02_tuples/exercise.py' });
  assert.deepEqual(placed(['cd /Users/someone/course && cd lessons && cat exercise.py']),
    { 'exercise.py': '/Users/someone/course/lessons/exercise.py' }, 'a relative cd after the absolute one is followed');
  assert.deepEqual(placed(['cat a.py && cd /Users/someone/course && cat b.py']),
    { 'b.py': '/Users/someone/course/b.py' }, 'a word before the cd is read in a folder the record does not hold');
});

test('a word stays as written where the folder is less than certain', () => {
  const placed = (commands: readonly string[]): Record<string, string> => Object.fromEntries(placedWords(commands, '/Users/someone'));
  assert.deepEqual(placed(['cd lessons && cat exercise.py']), {}, 'a relative cd resolves against a folder nobody knows');
  assert.deepEqual(placed(['cd /Users/someone/course && cat f.py || echo no']), {}, 'not one sequence');
  assert.deepEqual(placed(['(cd /Users/someone/course && cat f.py)']), {}, 'a subshell');
  assert.deepEqual(placed(['for d in a b; do cat f.py; done']), {}, 'a loop');
  assert.deepEqual(placed(['cd /Users/someone/course && find . -name f.py']), {}, 'a find\'s words are what it matches, not files placed');
  assert.deepEqual(placed(['cd /Users/someone/course && find . -name f.py -exec cat {} +']), {}, 'a find that opens what it finds hides the folder');
  assert.deepEqual(placed(['cd /Users/someone/x && cat f.py && cd && cat g.py']),
    { 'f.py': '/Users/someone/x/f.py' }, 'cd alone leaves the folder uncertain here');
  assert.deepEqual(placed(['cd /Users/someone/x && cat f.py && cd /Users/someone/y && cat f.py']), {},
    'one word in two folders names no one file');
  assert.deepEqual(placed(['cd /Users/someone/x && cat f.py', 'cat f.py']), {},
    'the same word unplaced in a second line drops the first');
});

// FNB29: Codex listed files with `rg --files -g 'note.md'` and was refused for naming the root's blocked `note.md`. A
// program's own pattern names no file; a `find` that reads what it found keeps its pattern a word met by name.
test('a search\'s pattern and globs, and a listing find\'s -name, are patterns and no file the line names', () => {
  assert.deepEqual([...patternWords("rg --files -g 'AGENTS.md' -g 'note.md'")], ['AGENTS.md', 'note.md']);
  assert.deepEqual([...patternWords('rg --files | rg note.md')], ['note.md']);
  assert.deepEqual([...patternWords('grep -rn --include=*.md KEY .')], ['*.md', 'KEY']);
  assert.deepEqual([...patternWords('grep -f patterns.txt notes.md')], [], 'a file of patterns is read');
  assert.deepEqual([...patternWords('find . -name note.md')], ['note.md']);
  assert.deepEqual([...patternWords('find . -name note.md -exec cat {} +')], [], 'it reads what it finds: met by name, as before');
  assert.deepEqual([...patternWords('cat note.md')], []);
});

// `2026-10-09-the-file-not-its-name.md` FN16, closing FNO9's second kind: found 2026-10-10 on three conversations, `ls -la
// lessons/01_lists` listed a tracked `exercise.py` as the project root's. A listing's names lie in the folder it listed,
// where the line says which: one `ls` operand, or an absolute `cd` before it. A relative `cd` is not followed (FNB21).
test('a listing\'s names lie in the folder it listed, where the line says which', () => {
  const home = '/Users/someone';
  assert.equal(listedFolder('ls -la "./lessons/01_lists"', home), 'lessons/01_lists');
  assert.equal(listedFolder('ls /Users/someone/course/docs', home), '/Users/someone/course/docs');
  assert.equal(listedFolder('cd /Users/someone/course/docs && find . -type f | sort && for f in $(find . -type f); do cat "$f"; done', home), '/Users/someone/course/docs', 'both listings list there');
  assert.equal(listedFolder('cd ~/course && ls', home), '/Users/someone/course');
  assert.equal(listedFolder('find docs -type f', home), undefined, 'find prints its root itself');
  assert.equal(listedFolder('cd docs && ls', home), undefined, 'a relative cd is not placed');
  assert.equal(listedFolder('ls docs lib', home), undefined, 'two folders head their names; not read here');
  assert.equal(listedFolder('ls -d docs', home), undefined);
  assert.equal(listedFolder('cd /a && ls && cd /b && ls', home), undefined, 'two folders');
  assert.equal(listedFolder('cat README.md', home), undefined);

  assert.equal(placedListed('exercise.py', 'lessons/01_lists'), 'lessons/01_lists/exercise.py');
  assert.equal(placedListed('./exercise.py', '/p/docs'), '/p/docs/exercise.py');
  assert.equal(placedListed('lessons/01_lists', 'lessons/01_lists'), 'lessons/01_lists', 'ls of a file prints the operand itself');
  assert.equal(placedListed('..', 'docs'), '..');
  assert.equal(placedListed('/etc/hosts', 'docs'), '/etc/hosts');
  assert.equal(placedListed('note.md', undefined), 'note.md');

  const parsed = simpleCommandsIn('cd docs && cd sub && find . -exec cat {} \\;');
  assert.equal(placeBefore(parsed, 2, START).workingDirectory, '/Users/someone/course/docs/sub');
  assert.equal(placeBefore(parsed, 0, START).workingDirectory, START.workingDirectory);
});

// FN16 as amended 2026-10-11: a relative `cd` is placed from where the record says the line ran. Claude Code records that
// folder sometimes before the line's `cd` and sometimes after it (FNB21); one that already ends in the `cd`'s folders was
// recorded after it. Found on the maintainer's round of that day, where five of six loops moved into their lesson so.
test('a relative cd places a listing from where the record says the line ran, before its cd or after it', () => {
  const home = '/Users/someone';
  const line = 'cd lessons/01 && for f in $(find . -type f); do echo "=== $f"; cat "$f"; done';
  assert.equal(listedFolder(line, home, '/Users/someone/course'), '/Users/someone/course/lessons/01', 'recorded before the cd');
  assert.equal(listedFolder(line, home, '/Users/someone/course/lessons/01'), '/Users/someone/course/lessons/01', 'recorded after it');
  assert.equal(listedFolder('cd lessons && cd 01 && ls', home, '/Users/someone/course'), '/Users/someone/course/lessons/01');
  assert.equal(listedFolder('cd ../02 && ls', home, '/Users/someone/course/lessons/01'), '/Users/someone/course/lessons/02');
  assert.equal(listedFolder('cd /Users/someone/other && cd docs && ls', home, '/Users/someone/course'), '/Users/someone/other/docs', 'from the absolute cd before it');
  assert.equal(listedFolder(line, home), undefined, 'with no folder recorded, still not placed');
});

// FN16 as amended 2026-10-11: an `ls` that writes a section per folder - `-R`, several operands - names each section's
// folder on a line of its own, written from where `ls` ran (measured on macOS: `./sub:` after a `cd`, `docs/a b:` under an
// operand, `docs:` for several). Found on the maintainer's round: `cd <stage> && ls -laR` put four lessons' files in one.
test('an ls that writes a section per folder says where it ran, and each heading names its folder from there', () => {
  const home = '/Users/someone';
  assert.deepEqual(listingSections('cd /Users/someone/course/stage && ls -laR', home), { ranIn: '/Users/someone/course/stage' });
  assert.deepEqual(listingSections('ls -R docs', home), { ranIn: undefined });
  assert.deepEqual(listingSections('ls docs lib', home), { ranIn: undefined });
  assert.deepEqual(listingSections('cd stage && ls --recursive', home, '/Users/someone/course'), { ranIn: '/Users/someone/course/stage' });
  assert.equal(listingSections('ls -la docs', home), undefined, 'one folder, no sections');
  assert.equal(listingSections('ls -dR docs lib', home), undefined, '-d lists the operands themselves');
  assert.equal(listingSections('ls -R docs && find lib', home), undefined, 'not the line\'s one listing');
  assert.equal(listingSections('cd stage && ls -R', home), undefined, 'a relative cd with no folder recorded');

  assert.equal(sectionFolder('./01_lists', '/Users/someone/course/stage'), '/Users/someone/course/stage/01_lists');
  assert.equal(sectionFolder('.', '/Users/someone/course/stage'), '/Users/someone/course/stage', 'GNU heads its first section .:');
  assert.equal(sectionFolder('docs/a b', undefined), 'docs/a b');
  assert.equal(sectionFolder('.', undefined), undefined);
  assert.equal(sectionFolder('/etc/ssh', '/Users/someone'), '/etc/ssh');
});
