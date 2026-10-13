// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { boundedReach, foundVariables, lineReach, handsListedNames, matchesName, printedNames, printsListedNames, namesEachItPrints, printsUnnamedFiles, reachOf, wordLoopNames } from '../../../src/core/access/search-reach.ts';

// worth-running-every-day R21a. The three commands below are the ones an agent ran, in this order, on the day a person
// had turned on "Stop the AI" and still saw `.env:2:SUPABASE_URL=…` in the reply.
test('the searches that reached .env through a folder are read as recursive searches starting there', () => {
  // A redirection's target stays a word, as a report reads it (`command-line.ts`): `2` and `/dev/null` are walked as
  // what they are on disk - nothing, and a device - so they reach no file.
  const [plain] = reachOf('ls -a && grep -rn "SUPABASE_URL" --exclude-dir=node_modules --exclude-dir=.next . 2>/dev/null').searches;
  // `at`: where in the line it runs, so a `cd` before it moves where it starts (FN17).
  assert.deepEqual(plain, {
    roots: ['.', '2', '/dev/null'], includes: [], excludes: [], excludeDirs: [{ glob: 'node_modules' }, { glob: '.next' }], hidden: true, at: 1,
  });

  const [narrowed] = reachOf(`grep -rn "SUPABASE_URL" --include='.env*' --include='*.ts' . 2>/dev/null | grep -v node_modules`).searches;
  assert.deepEqual(narrowed?.includes, [{ glob: '.env*' }, { glob: '*.ts' }]);
});

test('grep: a cluster, -d recurse and --recursive all recurse; the pattern is not a place to search', () => {
  for (const command of ['grep -Rin KEY apps', 'grep -d recurse KEY apps', 'grep --recursive KEY apps', 'grep -r -e KEY apps']) {
    assert.deepEqual(reachOf(command).searches.map((search) => search.roots), [['apps']], command);
  }
  assert.deepEqual(reachOf('grep -r KEY').searches[0]?.roots, ['.'], 'no place given starts at the working directory');
  assert.deepEqual(reachOf('grep -rA3 KEY src').searches[0]?.roots, ['src'], 'a value attached to a flag is not a word');
});

test('grep without recursion searches nothing; its file arguments are still globs to expand', () => {
  assert.deepEqual(reachOf('grep KEY .env*'), { searches: [], globs: ['.env*'] });
  assert.deepEqual(reachOf('grep "KEY.*" src/app.ts'), { searches: [], globs: [] }, 'the pattern is never expanded');
});

test('ripgrep always recurses, skips hidden files unless told, and -r is --replace', () => {
  assert.deepEqual(reachOf('rg KEY').searches[0], { roots: ['.'], includes: [], excludes: [], excludeDirs: [], hidden: false, at: 0 });
  assert.equal(reachOf('rg --hidden KEY').searches[0]?.hidden, true);
  assert.equal(reachOf('rg -uu KEY').searches[0]?.hidden, true);
  assert.equal(reachOf('rg -u KEY').searches[0]?.hidden, false, 'one -u lifts ignore files, not hidden ones');
  assert.deepEqual(reachOf('rg -r X KEY lib').searches[0]?.roots, ['lib']);
  assert.deepEqual(reachOf("rg -g '!.env*' -g '*.ts' KEY").searches[0]?.excludes, [{ glob: '.env*' }]);
  assert.deepEqual(reachOf('rg --files').searches, [], 'listing file names opens nothing');
});

// Found in review (2026-09-26), measured on ripgrep 14.1.1: `**/.env` took every `.env` below the search, `config/.env`
// only the one at that path, and `--iglob '*.ENV'` took `.env`. The walk meets names, so each glob is read as the name
// it matches - and where the path decides, as more than ripgrep would open, never less.
test('ripgrep: a glob is read as the names it matches, at any depth and in any case', () => {
  const rg = (command: string) => reachOf(command).searches[0];

  assert.deepEqual(rg("rg -g '**/.env' KEY")?.includes, [{ glob: '.env' }], '**/ in front is any depth, which a name already is');
  assert.deepEqual(rg("rg -g '**/**/.env*' KEY")?.includes, [{ glob: '.env*' }]);
  assert.deepEqual(rg("rg -g 'app/config/.env' KEY")?.includes, [{ glob: '.env' }], 'a path is read as its last part, wherever it is');
  assert.deepEqual(rg("rg -g 'app/' KEY")?.includes, [{ glob: '*' }], 'a directory is not worked out: every file');
  assert.deepEqual(rg("rg -g '{.env,config/.env}' KEY")?.includes, [{ glob: '*' }], 'a / inside an alternative: every file');

  assert.deepEqual(rg("rg -g '!**/.env*' KEY")?.excludes, [{ glob: '.env*' }], 'left out at any depth');
  assert.deepEqual(rg("rg -g '!**/node_modules' KEY")?.excludeDirs, [{ glob: 'node_modules' }]);
  assert.deepEqual(rg("rg -g '!config/.env' KEY")?.excludes, [{ glob: 'config/.env' }], 'a path is kept, and matches no name');

  assert.deepEqual(rg("rg --iglob '*.ENV' -g '*.ts' KEY")?.includes, [{ glob: '*.ENV', caseless: true }, { glob: '*.ts' }]);
  assert.deepEqual(rg("rg --glob-case-insensitive -g '*.TS' KEY")?.includes, [{ glob: '*.TS', caseless: true }]);
  assert.deepEqual(rg("rg --glob-case-insensitive --no-glob-case-insensitive -g '*.TS' KEY")?.includes, [{ glob: '*.TS' }]);
  assert.deepEqual(rg("grep -r --include='*.ENV' KEY .")?.includes, [{ glob: '*.ENV' }], 'grep minds case');
});

test('a word the shell expands is a glob; an option and an echo are not', () => {
  assert.deepEqual(reachOf('cat .env* | head -3').globs, ['.env*']);
  assert.deepEqual(reachOf('echo *').globs, []);
  assert.deepEqual(reachOf('ls -la').globs, []);
});

test('a shell glob leaves a hidden name out unless the glob starts with a dot; --include does not', () => {
  assert.equal(matchesName('.env', '*', { period: true }), false);
  assert.equal(matchesName('.env.local', '.env*', { period: true }), true);
  assert.equal(matchesName('.env', '*', { period: false }), true);
  assert.equal(matchesName('page.tsx', '*.{ts,tsx}', { period: false }), true);
  assert.equal(matchesName('key.pem', '[kK]ey.pem', { period: false }), true);
  assert.equal(matchesName('a.ts', '*.tsx', { period: false }), false);
  assert.equal(matchesName('.env', '*.ENV', { period: false }), false);
  assert.equal(matchesName('.env', '*.ENV', { period: false, caseless: true }), true);
  assert.equal(matchesName('Key.PEM', '[k]ey.pem', { period: false, caseless: true }), true);
});

// Found by measuring every command of real transcripts (2026-09-24): a sed script holding `[data-wz-next]` next to an
// out-of-order range threw while being read as a glob, which in a hook is a failed command.
test('a word no regular expression can hold is read as text, never thrown over', () => {
  assert.equal(matchesName('x', '[z-a]', { period: true }), false);
  assert.equal(matchesName('[z-a]', '[z-a]', { period: true }), true);
  assert.doesNotThrow(() => reachOf(`sed -i 's|d.querySelector("[data-wz-next]")|x|' page.html`));
});

// `2026-10-09-the-file-not-its-name.md` FN13, FNB27: ripgrep given no path searches what it is fed, and no folder -
// `echo x | rg notes` found nothing in a folder whose files hold `notes`. macOS's `grep -r` read the folder all the same.
test('FN13: rg fed by a pipe, a heredoc or a here-string searches no folder; grep -r and rg given a path still do', () => {
  assert.deepEqual(reachOf('rg --files | rg exercise').searches, [], 'the second rg reads the names the first prints');
  assert.deepEqual(reachOf('rg --files |& rg -i exercise').searches, []);
  assert.deepEqual(reachOf("rg KEY <<< 'one line'").searches, []);
  assert.deepEqual(reachOf(['rg KEY <<EOF', 'text', 'EOF'].join('\n')).searches, []);
  assert.deepEqual(reachOf('rg --files |\n  rg exercise').searches, [], 'a pipe whose next command is on the next line');

  assert.deepEqual(reachOf('rg exercise').searches.map((search) => search.roots), [['.']], 'not fed: the folder');
  assert.deepEqual(reachOf('cat list.txt | rg KEY src').searches.map((search) => search.roots), [['src']], 'a path is searched, fed or not');
  assert.deepEqual(reachOf('ls || rg KEY').searches.map((search) => search.roots), [['.']], '`||` feeds nothing');
  assert.deepEqual(reachOf('echo x | grep -r KEY').searches.map((search) => search.roots), [['.']], 'grep -r reads the folder, fed or not');
});

// FNB28: a `find` predicate's value is `find`'s own pattern. Read as a shell glob, `find docs -iname '*note*'` "expanded"
// to the root's blocked `note.md`, and an agent looking for a file's name was refused.
test('a find predicate\'s pattern is no word the shell expands; its starting points still are', () => {
  for (const command of ["find docs -iname '*note*'", 'find . -name "note*" -not -path "./.git/*"', "find . -path '*/docs/*' -o -regex '.*\\.md'"]) {
    assert.deepEqual(reachOf(command).globs, [], command);
  }
  assert.deepEqual(reachOf("find lessons/* -name '*.py'").globs, ['lessons/*'], 'a starting point the shell expands');
  assert.deepEqual(reachOf('cat *note*').globs, ['*note*'], 'any other program\'s word, as before');
});

// XD12, decided by the maintainer 2026-10-10: a line whose every program reaches only what the line names - or lists a
// folder it names, which only the output shows - could have opened nothing else, however far it ran.
test('a line reaches only its own words where every program does, and a folder search, a glob or a script reaches more', () => {
  assert.deepEqual(boundedReach(["if [ -f docs/note.md ]; then cat docs/note.md; else rg --files docs | rg '(^|/)note\\.md$'; fi"]), { lists: true });
  assert.deepEqual(boundedReach(['cat docs/note.md', 'wc -l main.py']), { lists: false });
  assert.deepEqual(boundedReach(['grep -n TODO main.py']), { lists: false }, 'a search of a file it names');
  for (const line of ['rg TOKEN docs', 'grep -rn TOKEN .', 'cat docs/*.md', 'python3 x.py', 'cat a | sh', "find . -name '*.env' -exec cat {} +"]) {
    assert.equal(boundedReach([line]), undefined, line);
  }
});

// `2026-10-13-each-command-its-own-result.md` EC4, EC5: one reading says of a line whether its words bound it, which code
// it runs where only code takes it further, or neither - so the row never names a line XD12 leaves out.
test('a line that reaches more only by code it runs says which code, and no other line does', () => {
  const code = (line: string) => lineReach([line]);
  assert.deepEqual(code("python3 -c 'print(1)'"), { kind: 'code', languages: ['python'] });
  assert.deepEqual(code('python3 show.py | head -5'), { kind: 'code', languages: ['python'] }, 'a filter on its output reaches nothing more');
  assert.deepEqual(code("node -e 'x' && /usr/bin/python3.12 y.py; ls docs"), { kind: 'code', languages: ['python', 'node'] }, 'each once, in the page\'s order');
  // ECB1: a quoted pattern in the code is the code's to open, not the shell's to expand.
  assert.deepEqual(code('python3 -c \'import pathlib; print(list(pathlib.Path("docs").glob("*.md")))\''), { kind: 'code', languages: ['python'] });
  for (const line of ['python3 x.py; cat *.txt', 'python3 x.py *.csv; ls *.csv', 'rg TOKEN docs; python3 x.py', 'python3 x.py && git status', 'bash x.sh', 'cat a | sh']) {
    assert.deepEqual(code(line), { kind: 'open' }, line);
  }
  assert.deepEqual(code('cat docs/note.md'), { kind: 'bounded', lists: false });
  assert.deepEqual(code('ls docs'), { kind: 'bounded', lists: true });
  // `boundedReach` is its first answer: a line of code is never one XD12 leaves out.
  for (const line of ["python3 -c 'print(1)'", 'python3 x.py *.csv', 'cat docs/note.md', 'ls docs']) {
    const reach = lineReach([line]);
    assert.deepEqual(boundedReach([line]), reach.kind === 'bounded' ? { lists: reach.lists } : undefined, line);
  }
});

// `2026-10-13-a-printing-sed-reaches-its-file.md` PS1-PS2, PSB1: Codex read two files with two `sed`s on one line - joined
// by `&&` in the terminal, by `;` in the VS Code panel - and with `nl -ba <file> | sed -n '…p'`. A `sed` whose script
// only selects lines reaches its files and no other; one whose script may open, write or run something reaches more.
test('a sed that only selects lines reaches its files, and one whose script may open or run something reaches more', () => {
  for (const line of [
    "sed -n '1,200p' src/index.ts && sed -n '1,200p' src/utils/greet.ts",
    "sed -n '1,200p' src/index.ts; sed -n '1,200p' src/utils/greet.ts",
    "nl -ba src/index.ts | sed -n '1,120p'",
    "sed -n '1,80p;200,240p' main.py",
    "sed -n -e '1,5p' -e '$p' main.py",
    "sed '10q' main.py",
    "sed -n '$=' main.py",
    "sed -n '1,20p\n40,60p' main.py",
  ]) {
    assert.deepEqual(boundedReach([line]), { lists: false }, line);
  }
  for (const line of [
    "sed '1r other.txt' main.py",
    "sed -n '1,5w copy.txt' main.py",
    "sed -n '/TOKEN/p' main.py",
    "sed 's/a/b/' main.py",
    "sed '1e cat other.txt' main.py",
    "sed -i '' '1d' main.py",
    'sed -f script.sed main.py',
    "sed -n '1,200p' docs/*.md",
    "sed -n '1,200p' main.py && python3 x.py",
  ]) {
    assert.equal(boundedReach([line]), undefined, line);
  }
});

// `2026-10-09-the-file-not-its-name.md` FN17, found 2026-10-10: eleven shapes handed a listing's names to a program that
// opened them, and `refuse` saw none - one printed a blocked file whole in the Claude desktop app. Each is now a search of
// what its listing could list: `find`'s roots below every level, `ls`'s folder one level, from where the line runs.
test('a listing whose names a program opens is a search of what it lists', () => {
  const roots = (command: string) => reachOf(command).searches.map((search) => [search.roots, search.shallow === true, search.at] as const);
  assert.deepEqual(roots('for f in $(find docs -type f); do cat "$f"; done'), [[['docs'], false, 0]]);
  assert.deepEqual(roots('find docs -type f -exec cat {} +'), [[['docs'], false, 0]]);
  assert.deepEqual(roots('find docs -type f | grep -v pyc | sort | xargs head -5'), [[['docs'], false, 0]], 'past what filters the names');
  assert.deepEqual(roots('find docs -type f | while read f; do cat "$f"; done'), [[['docs'], false, 0]]);
  assert.deepEqual(roots('files=$(find docs); cat $files'), [[['docs'], false, 0]]);
  assert.deepEqual(roots('cd docs && for f in $(ls); do cat "$f"; done'), [[['.'], true, 1]], 'after the cd, one level');
  assert.deepEqual(roots('cat $(rg --files lib)'), [[['lib'], false, 0]]);
  assert.equal(reachOf('for f in $(ls -a docs); do cat docs/$f; done').searches[0]?.hidden, true, '-a lists what is hidden');
  assert.equal(reachOf('for f in $(ls docs); do cat docs/$f; done').searches[0]?.hidden, false);
  assert.deepEqual(reachOf("find docs -name '*.md' -exec cat {} \\;").searches[0]?.includes, [{ glob: '*.md' }]);
  assert.deepEqual(reachOf("find docs ! -name '*.md' -exec cat {} \\;").searches[0]?.includes, [], 'a name test turned around narrows nothing');

  for (const command of ['for f in $(find docs); do echo "$f"; done', 'find docs -exec ls -l {} \\;', 'find docs | head', 'find docs | xargs basename', 'ls docs']) {
    assert.deepEqual(reachOf(command).searches, [], command);
  }
  assert.equal(handsListedNames('for f in $(find docs); do wc -l "$f"; done'), true);
  assert.equal(printsListedNames('for f in $(find docs); do wc -l "$f"; done'), false, 'a count is no text of the file');
  assert.equal(printsListedNames('find docs -exec sed -n 1,5p {} \\;'), true);
  assert.equal(boundedReach(['for f in $(find docs); do cat "$f"; done']), undefined, 'XD12 never takes it for a bounded line');
});

// FN17 as amended 2026-10-11: the names a loop over a listing printed are where its own `echo`, `printf` or a `head` header
// puts them - on the maintainer's round of that day, `=== ./exercise.py` - and only in the form its listing writes a name,
// so a line of a file that looks like the `echo` names nothing.
test('the names a loop printed are where its own echo puts them, in the form its listing writes one', () => {
  const output = '=== ./teoria.md\n# Lesson\n=== ./exercise.py\nx = 1\n=== ./notes/a b.txt\nhello\n';
  const names = (command: string, text = output) => printedNames(command, [text]);
  for (const command of [
    'cd lessons/01 && for f in $(find . -type f); do echo "=== $f"; cat "$f"; done',
    'find . -type f | sort | while IFS= read -r f; do echo "=== ${f}"; cat "$f"; done',
    `find . -type f -exec sh -c 'for f; do echo "=== $f"; cat "$f"; done' sh {} +`,
    `for f in $(find . -type f); do printf '=== %s\\n' "$f"; cat "$f"; done`,
  ]) assert.deepEqual(names(command), { names: ['./teoria.md', './exercise.py', './notes/a b.txt'], prints: true, unprinted: [] }, command);
  assert.deepEqual(names(`find . -type f -exec sh -c 'echo "--- $1"; cat "$1"' sh {} \\;`, '--- ./teoria.md\nx\n')?.names, ['./teoria.md'], 'the script\'s own $1');
  assert.deepEqual(names('find . -type f -exec head -n 50 {} +', '==> ./teoria.md <==\n# L\n\n==> ./exercise.py <==\nx\n')?.names, ['./teoria.md', './exercise.py'], 'head\'s header over each of several files');
  assert.deepEqual(names('find . -type f | xargs head -q -n 5', '==> ./teoria.md <==\n')?.names, [], '-q writes none');
  assert.deepEqual(names('for f in $(ls); do echo "## $f"; cat "$f"; done', '## teoria.md\nx\n## ../up.md\n')?.names, ['teoria.md'], 'ls writes a bare name');
  assert.deepEqual(names('for f in $(find docs -name "*.md"); do echo "=== $f"; cat "$f"; done', '=== docs/a.md\n=== ./other.md\n=== docs/\n')?.names, ['docs/a.md'], 'under the root it was given');
  assert.deepEqual(names('for f in $(find . -type f); do echo "=== $f $HOME"; cat "$f"; done', '=== ./a /Users/someone\n')?.names, [], 'an echo of two variables places no name');
  assert.deepEqual(names('for f in $(find . -type f); do echo "$f"; cat "$f"; done', './a\nx\n')?.names, [], 'a name alone on its line has nothing of the echo\'s own to be told by');
  assert.deepEqual(names('for f in $(find . -type f); do echo "=== $f"; cat "$f"; done', '=== ./a\ncat: ./a: Permission denied\n')?.unprinted, ['./a'], 'said, and its text not printed');
  assert.equal(names('for f in $(find . -type f); do echo "=== $f"; wc -l "$f"; done', '=== ./a\n1 ./a\n')?.prints, false, 'a count is no text of the file');
  assert.equal(names('cat notes.md'), undefined, 'no listing handed on');

  assert.equal(printsUnnamedFiles('for f in $(find . -type f); do cat "$f"; done', ['# notes\n']), true);
  assert.equal(printsUnnamedFiles('for f in $(find . -type f); do echo "=== $f"; cat "$f"; done', [output]), false);
  assert.equal(printsUnnamedFiles('find . -type f | sort && for f in $(find . -type f); do cat "$f"; done', ['./notes.md\n# notes\n']), false, 'the first find printed the names itself');
  assert.equal(printsUnnamedFiles('for f in $(find . -type f); do wc -l "$f"; done', ['1\n']), false, 'nothing of a file\'s text');
});

// FN17 as amended 2026-10-11, the second round of that day: each agent wrote the loop its own way, and three of the shapes
// named nothing. Codex wrote `for file do` with no `;`; Claude Code in VS Code handed `xargs -I{}` a script naming `{}`;
// the Claude desktop app looped over a glob.
test('a loop\'s names are found whichever way it hands them on: for name do, xargs -I, a loop over a glob', () => {
  const codex = `find lessons/01 -type f -exec sh -c 'for file do printf "\\n===== %s =====\\n" "$file"; cat "$file"; done' sh {} +`;
  assert.deepEqual(printedNames(codex, ['\n===== lessons/01/notes.md =====\n# notes\n===== lessons/01/exercise.py =====\nx = 1\n']),
    { names: ['lessons/01/notes.md', 'lessons/01/exercise.py'], prints: true, unprinted: [] });
  const xargs = `find . -type f -print0 | sort -z | xargs -0 -I{} sh -c 'printf "\\n===== %s =====\\n" "{}"; cat "{}"'`;
  assert.deepEqual(printedNames(xargs, ['===== ./exercise.py =====\nx = 1\n===== ./notes.md =====\n']),
    { names: ['./exercise.py', './notes.md'], prints: true, unprinted: [] });
  assert.deepEqual(printedNames('find . -type f | xargs -I % sh -c \'echo "--- %"; cat "%"\'', ['--- ./a.md\n'])?.names, ['./a.md'], '-I and its text apart');

  const globbed = 'for f in lessons/01/*; do echo "===== $f ====="; cat "$f"; echo; done';
  const printed = ['===== lessons/01/exercise.py =====\nx = 1\n\n===== lessons/02/other.py =====\n'];
  assert.deepEqual(wordLoopNames(globbed, printed), { names: ['lessons/01/exercise.py'], prints: true, unprinted: [], at: 0 }, 'a name its glob cannot become names nothing');
  assert.deepEqual(wordLoopNames('cd /p/lessons/01 && for f in *; do echo "== $f =="; cat "$f"; done', ['== exercise.py ==\n'])?.at, 1, 'its place in the line, after the cd');
  assert.equal(wordLoopNames('for f in $(find .); do cat "$f"; done', []), undefined, 'a substitution is a listing\'s, not a word list');
  assert.equal(printsUnnamedFiles(globbed, ['x = 1\n']), true, 'a glob loop that names none of what it printed (SK1)');
});

// `what-codex-wrote` X11 as amended 2026-10-11 (FNB44, FND17): a loop that says each name and prints that file, and does
// nothing else, establishes what it opened. Anything more in it - another program, another file, a variable, an action
// of `find`'s own, a count in place of the text - and it is a line no profile reads.
test('a loop that only says each name and prints that file is one whose effect its record establishes', () => {
  for (const command of [
    `find lessons/01 -type f -exec sh -c 'for file do printf "\\n===== %s =====\\n" "$file"; cat "$file"; done' sh {} +`,
    `cd /p/lessons/01 && find . -type f -print0 | sort -z | xargs -0 -I{} sh -c 'printf "\\n===== %s =====\\n" "{}"; cat "{}"'`,
    'for f in lessons/01/*; do echo "===== $f ====="; cat "$f"; echo; done',
    'cd /p/lessons/01 && find . -type f | sort && for f in $(find . -type f | sort); do echo "=== $f"; cat "$f"; done',
    'for f in $(find . -type f); do echo "=== $f"; head -n 50 "$f"; done',
    'find . -type f | while read f; do echo "=== $f"; cat "$f"; done',
  ]) assert.equal(namesEachItPrints(command), true, command);
  for (const command of [
    'for f in $(find . -type f); do cat "$f"; done',
    'for f in $(find . -type f); do echo "=== $f"; cat "$f"; python3 x.py; done',
    'for f in $(find . -type f); do echo "=== $f"; cat "$f" .env; done',
    'for f in $(find . -type f); do echo "=== $f $HOME"; cat "$f"; done',
    `find . -type f -delete -exec sh -c 'for f; do echo "== $f"; cat "$f"; done' sh {} +`,
    'for f in *; do echo "== $f"; wc -l "$f"; done',
    'for f in *; do echo "== $f"; cat "$f"; done; cat .env',
    `find . -type f -exec sh -c 'for f; do echo "== $f"; cat "$f"; python3 x.py; done' sh {} +`,
    'for f in *; do echo "== $f"; echo "$HOME"; cat "$f"; done',
    'cat notes.md',
  ]) assert.equal(namesEachItPrints(command), false, command);
});

// `2026-10-11-says-only-what-it-knows.md` SK1-SK5: a line that prints files whose names it does not write, and whose output
// names none of them, is said as one the record does not establish - whatever its shape. Measured on 278 conversations
// (SKB1), read so: a folder as a variable with the name written, a variable the line sets to a literal, and a `sed` script
// are no unknown name, and no conversation of the maintainer's changed.
test('a line that prints files it does not name, and names none of them, is one the record does not establish', () => {
  const text = ['# a heading\nsome text\n'];
  for (const command of [
    'cat *.md',
    "find . -name '*.py' | xargs cat",
    'find . -type f -exec cat {} +',
    'cat $(find docs -type f)',
    'for f in *.md; do cat "$f"; done',
    'f=$(ls | head -1); cat "$f"',
    'p=.e; cat "${p}nv"',
    `find . -type f -print0 | xargs -0 -I{} sh -c 'cat "{}"'`,
    'find . -type f | while read f; do sed -n 1,5p "$f"; done',
  ]) assert.equal(printsUnnamedFiles(command, text), true, command);
  for (const command of [
    'cat "$S/report.html"',
    'f=docs/a.md; cat "$f"',
    'export F=docs/a.md; cat $F',
    'for f in a.md b.md; do cat "$f"; done',
    "sed 's#$HOME#~#' notes.md",
    "sed -n '/== x/,$p' notes.md",
    'head -n "$N" notes.md',
    'cat notes.md',
    'ls *.md',
    'git show HEAD:notes.md | head -5',
    'sed -n "$(grep -n x notes.md | cut -d: -f1),+3p" notes.md',
  ]) assert.equal(printsUnnamedFiles(command, text), false, command);
  assert.equal(printsUnnamedFiles('head -n 3 *.md', ['==> a.md <==\nx\n']), false, 'a header names what it printed');
  assert.equal(printsUnnamedFiles('cat *.md', ['see notes.md\n']), true, 'a line of a file that ends like a name names nothing');
  assert.equal(printsUnnamedFiles('for f in *.md; do echo "== $f"; cat "$f"; done', ['== a.md\nx\n']), false, 'its own echo names it');
  assert.equal(printsUnnamedFiles('find docs -type f | sort && for f in $(find docs -type f); do cat "$f"; done', ['docs/a.md\nx\n']), false, 'the first find named it');
});

// `2026-10-11-a-folder-found-while-it-runs.md` FW1: what a line fills from a program that finds paths, and where it looked.
test('FW1: a variable filled from paths a program found, with where and how deep that program looked', () => {
  const found = (command: string) => foundVariables(command).map(({ name, from }) => [name, from.map(({ offset: _offset, ...rest }) => rest)]);
  assert.deepEqual(found('d=$(find . -type d -name lessons | head -1); cat "$d"/*'), [['d', [{ roots: ['.'], hidden: true, relative: false }]]]);
  assert.deepEqual(found('export D=`find lib src -name x`; grep -r . ${D}'), [['D', [{ roots: ['lib', 'src'], hidden: true, relative: false }]]]);
  assert.deepEqual(found('for d in $(find docs -maxdepth 1 -type d); do ls "$d"; done'), [['d', [{ roots: ['docs'], depth: 1, hidden: true, relative: false }]]]);
  assert.deepEqual(found('for f in $(ls docs); do cat docs/$f; done'), [['f', [{ roots: ['docs'], depth: 1, hidden: false, relative: true }]]]);
  assert.deepEqual(found('d=$(ls -d lessons/*/ | head -1); cat "$d"/a.md'), [['d', [{ roots: ['lessons'], depth: 0, hidden: false, relative: false }]]]);
  assert.deepEqual(found('d=$(ls -aR); cat $d'), [['d', [{ roots: ['.'], hidden: true, relative: true }]]]);
  assert.deepEqual(found('d=$(find "$HOME" -name x); cat "$d"'), [['d', [{ roots: ['.'], hidden: true, relative: false }]]], 'a place a variable writes is anywhere');
  // Where it is filled, so the folder its program runs in is the one the line moved to before it.
  assert.deepEqual(foundVariables('cd lessons && for f in $(find . -type f); do cat "$f"; done').map(({ from }) => from.map((one) => one.offset)), [[13]], 'just after `cd lessons &&`');
  // Not a found path: a count, a commit's folder, a new temporary folder, a variable never used, another of a longer name.
  for (const command of ['n=$(wc -l < a); head -n "$n" b', 'root=$(git rev-parse --show-toplevel); cat "$root/README.md"',
    't=$(mktemp -d); cat "$t"/x', 'd=$(find . -name x)', 'd=$(find . -name x); echo $d2']) {
    assert.deepEqual(found(command), [], command);
  }
});
