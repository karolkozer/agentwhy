// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { codeReadsNamedFile, commandPathCandidates, commitsIn, inlineCode, printsContentBesideNames, printsContentOnly, programsIn } from '../../../src/core/access/command-line.ts';

/** A multi-line command, written the way a transcript carries it. */
const lines = (...parts: readonly string[]): string => parts.join('\n');

// Measured on a real session: the words of a script passed through a heredoc were read as commands, and its first
// words - `import`, `const`, `x` - were reported as programs that ran (findings-worth-reading §2). Amended 2026-10-07
// (R1 there): a body an interpreter runs as its program is the code `-c` would carry, and gives exactly what that
// gives - a literal shaped like a path, never a program, never a sentence about a file (paths-not-fragments R1).
test('a heredoc an interpreter runs is its code: no program comes out of it, and the candidates are the -c form\'s', () => {
  const body = ['x = {"file_path": "/a/app/.env"}', 'print("check apps/web/.env")'];
  const command = lines("python3 - <<'PY'", ...body, 'PY');

  assert.deepEqual(programsIn(command), ['python3'], 'the opening line still names what ran');
  assert.deepEqual(commandPathCandidates(command), commandPathCandidates(`python3 -c '${body.join('; ')}'`));
  assert.ok(commandPathCandidates(command).includes('/a/app/.env'), 'a literal that is a whole path');
  assert.ok(!commandPathCandidates(command).some((candidate) => candidate.includes('apps/web/.env')), 'a sentence about a file is none');
});

// findings-worth-reading R1 as amended 2026-10-07: standard input is code only for an interpreter reading its program
// from it. Seen by the maintainer in Codex: `python3 - <<'PY'` read a tracked file, and the record showed a name alone.
test('a heredoc or a here-string is code for an interpreter reading its program from standard input, and data for all else', () => {
  const python = lines("python3 - <<'PY'", "print(open('.env').read())", 'PY');
  const node = lines("node <<'JS'", "console.log(require('fs').readFileSync('.env', 'utf8'))", 'JS');
  const hereString = `python3 - <<< "print(open('.env').read())"`;
  for (const command of [python, node, hereString]) {
    assert.ok(commandPathCandidates(command).includes('.env'), command);
    assert.equal(codeReadsNamedFile([command], '.env'), true, 'its output is the file\'s, as after -c');
  }
  assert.deepEqual(inlineCode(python), ["print(open('.env').read())\n"], 'the body, as the code the program ran');

  // A script named on the line keeps a heredoc as its own data; `cat` and a shell keep theirs as data too.
  assert.deepEqual(commandPathCandidates(lines("python3 script.py <<'EOF'", '.env', 'EOF')), ['python3', 'script.py']);
  assert.deepEqual(commandPathCandidates(lines("cat > notes.md <<'EOF'", 'see .env for details', 'EOF')), ['cat', 'notes.md']);
  assert.deepEqual(commandPathCandidates(lines("bash <<'EOF'", 'cat .env', 'EOF')), ['bash'], 'a shell is no interpreter of this list');
  assert.equal(codeReadsNamedFile([lines("python3 script.py <<'EOF'", '.env', 'EOF')], '.env'), false);
  // Code after -c keeps a heredoc as the code's data.
  assert.ok(!commandPathCandidates(lines(`python3 -c "import sys; print(sys.stdin.read())" <<'EOF'`, 'apps/web/.env', 'EOF')).includes('apps/web/.env'));
});

test('after the terminator, a line is a command again', () => {
  const command = lines("cat > notes.md <<'EOF'", 'see apps/web/.env.production for details', 'EOF', 'cat apps/web/.env');

  assert.deepEqual(programsIn(command), ['cat', 'cat']);
  assert.ok(commandPathCandidates(command).includes('apps/web/.env'));
  assert.ok(!commandPathCandidates(command).some((candidate) => candidate.includes('.env.production')));
});

test('every way of opening a heredoc is recognised', () => {
  for (const opener of ['<<EOF', "<<'EOF'", '<<"EOF"', '<< EOF', 'cat<<EOF']) {
    const command = lines(opener.startsWith('cat') ? opener : `cat ${opener}`, 'apps/web/.env', 'EOF', 'ls');
    assert.deepEqual(programsIn(command), ['cat', 'ls'], opener);
  }
});

// `<<-` is the one form whose terminator may be indented, and only with tabs.
test('<<- ends at a tab-indented terminator', () => {
  assert.deepEqual(programsIn(lines('cat <<-EOF', '\tapps/web/.env', '\tEOF', 'ls')), ['cat', 'ls']);
});

// A shell reads to the end when the terminator never comes, and so does the rule.
test('a heredoc with no terminator runs to the end of the command', () => {
  assert.deepEqual(programsIn(lines("python3 - <<'PY'", 'print("x")', 'cat apps/web/.env')), ['python3']);
});

test('two heredocs opened on one line end at their own terminators, in order', () => {
  const command = lines('diff <<A <<B', 'apps/web/.env', 'A', 'apps/web/.env.local', 'B', 'ls');

  assert.deepEqual(programsIn(command), ['diff', 'ls']);
});

test('<<< opens no body, and its operand is not a candidate', () => {
  assert.deepEqual(commandPathCandidates('grep x <<< "apps/web/.env.local"'), ['grep', 'x']);
  assert.deepEqual(programsIn(lines('grep x <<< apps', 'cat apps/web/.env')), ['grep', 'cat']);
});

// Measured on a real session: `SP=/…/root-demo && mkdir` reported `root-demo` as a program.
test('a leading assignment is not the program, and its value is still a candidate', () => {
  assert.deepEqual(programsIn('SP=/tmp/x/root-demo && mkdir -p out'), ['mkdir']);
  assert.deepEqual(programsIn('A=1 B=2 node script.js'), ['node']);
  assert.ok(commandPathCandidates('ENV_FILE=apps/web/.env node run.js').includes('apps/web/.env'));
});

// R4: one reading of a command, for every question asked of it.
test('whether a command only prints content is read from the same structure', () => {
  assert.equal(printsContentOnly([lines("cat <<'EOF'", 'grep -rn x apps', 'EOF')]), true, 'a body is not a second command');
  assert.equal(printsContentOnly(['FOO=1 cat apps/web/.env']), true, 'an assignment is not the program');
});

// said-where-the-person-is SWO1, on SWB4: `cd` prints nothing, and `ls` beside a content program is both at once.
test('cd prints nothing, and ls beside cat prints names beside a file', () => {
  assert.equal(printsContentOnly(['cd apps/web && cat .env']), true, 'cd says nothing of the output');
  assert.equal(printsContentOnly(['cd apps/web']), false, 'a line that prints nothing prints no content');
  assert.equal(printsContentOnly(['cd apps/web && ls -la && cat .env']), false, 'ls lists');
  assert.equal(printsContentBesideNames(['cd apps/web && ls -la && cat .env']), true);
  assert.equal(printsContentBesideNames(['ls -la; cat .env | head -5']), true);
  assert.equal(printsContentBesideNames(['ls -la apps/web']), false, 'names alone');
  assert.equal(printsContentBesideNames(['cat .env']), false, 'content alone');
  assert.equal(printsContentBesideNames(['cat fake-key.txt 2>/dev/null || find . -name fake-key.txt']), true, 'find prints names, as ls does');
  assert.equal(printsContentBesideNames(['ls -la && grep -r KEY .']), false, 'a search is read as a search');
  assert.equal(printsContentBesideNames(['ls && cat .env && node run.js']), false, 'a program that may print anything');
});

// Found 2026-10-05 in a Codex session: a helper printed a tracked CSV's header and first row through `head | cut`, beside
// `ls` and `file`. Neither of those two was known, so the line was read as a listing and its rows taken for names.
test('cut prints the lines it is given, file prints names, and a count is no file’s text', () => {
  assert.equal(printsContentOnly(['head -n 2 customers.csv | cut -c1-80']), true, 'cut filters what head printed');
  assert.equal(printsContentOnly(['cut -d, -f2 customers.csv']), true, 'or the file it is pointed at');
  assert.equal(printsContentBesideNames(['ls -la customers.csv && file customers.csv && head -n 2 customers.csv | cut -c1-80']), true);
  assert.equal(printsContentOnly(['file customers.csv']), false, 'file says what a file is, never what it holds');
  assert.equal(printsContentBesideNames(['file customers.csv']), false, 'and alone it prints no text at all');
  assert.equal(printsContentOnly(['wc -l < customers.csv']), false, 'a count is not the file’s text');
});

// Measured after R1-R4 on a real session: the artefacts left came from one-line scripts, whose own
// semicolons cut them apart before quoting was considered (findings-worth-reading R4a).
test('a semicolon inside quotes does not end a command', () => {
  const command = `node --input-type=module -e "import { x } from './a.ts'; const r = ['check apps/web/.env']; console.log(r)"`;

  assert.deepEqual(programsIn(command), ['node'], 'const is part of the script, not a program');
  assert.ok(!commandPathCandidates(command).some((candidate) => candidate.includes('[check')), 'no fragment of a cut script');
});

test('operators outside quotes still separate commands, and those inside do not', () => {
  assert.deepEqual(programsIn('cd apps && grep -rn "a;b|c&d" . ; cat web/.env | head'), ['cd', 'grep', 'cat', 'head']);
});

// Measured on the same copy after cutting at operators outside quotes, line by line: that lost no protected path, and
// lost the programs of 18 commands - after a quote spanning lines, inside a quoted `$(...)`, past an escaped quote
// (findings-worth-reading R4a, R4b).
test('a quoted argument may span lines, and the command after it is still read', () => {
  const command = lines('python3 -c "', 'import os; print(os.getcwd())', '" 2>&1 | tail -3');

  assert.deepEqual(programsIn(command), ['python3', 'tail']);
});

test('a command inside $(...) or backticks is read as a command, inside double quotes too', () => {
  const quoted = 'echo "count: $(grep -rn SECRET apps | wc -l)"';
  assert.deepEqual(programsIn(quoted).sort(), ['echo', 'grep', 'wc']);
  assert.ok(commandPathCandidates(quoted).includes('apps'));
  assert.equal(printsContentOnly([quoted]), false, 'grep lists what it reached, so the output is not content only');

  const backticked = 'echo `cat apps/web/.env`';
  assert.deepEqual(programsIn(backticked).sort(), ['cat', 'echo']);
  assert.ok(commandPathCandidates(backticked).includes('apps/web/.env'));
});

test('arithmetic is not a command, and a substitution adds no word to the command around it', () => {
  assert.deepEqual(programsIn('echo $((count + 1))'), ['echo']);
  assert.ok(!commandPathCandidates('ls "$(cat apps/web/.env)"').some((candidate) => candidate.includes(' ')));
});

test('an escaped quote does not close a quote', () => {
  assert.deepEqual(programsIn('node -e "console.log(\\"a;b\\")" ; ls'), ['node', 'ls']);
});

test('a backslash at the end of a line continues it', () => {
  const command = lines('grep -rn SECRET \\', '  apps');

  assert.deepEqual(programsIn(command), ['grep']);
  assert.ok(commandPathCandidates(command).includes('apps'));
});

test('a comment is not read, even when it holds a quote', () => {
  const command = lines("# don't print the value", 'cat apps/web/.env');

  assert.deepEqual(programsIn(command), ['cat']);
  assert.ok(commandPathCandidates(command).includes('apps/web/.env'));
});

test('a << inside quotes opens no heredoc', () => {
  assert.deepEqual(programsIn(lines('echo "use <<EOF here"', 'cat apps/web/.env')), ['echo', 'cat']);
});

test('a redirection ends a word and no command, and a subshell is commands', () => {
  assert.ok(commandPathCandidates('cat <apps/web/.env').includes('apps/web/.env'));
  assert.deepEqual(programsIn('npm test 2>&1 | tail -3'), ['npm', 'tail']);
  assert.deepEqual(programsIn('(cd apps && ls)'), ['cd', 'ls']);
});

// where-the-value-went R7: a commit is git's subcommand, read past git's own options - never a word that says so.
test('a command commits when git runs commit, whatever options come first, and not when a word only says it', () => {
  assert.equal(commitsIn('git commit -am "fix the webhook"'), true);
  assert.equal(commitsIn('git -C apps/web -c user.name=someone commit --amend'), true);
  assert.equal(commitsIn('git add . && git commit -m wip'), true);
  assert.equal(commitsIn('git log --grep commit'), false);
  assert.equal(commitsIn('echo git commit'), false);
  assert.equal(commitsIn('git status # then commit'), false);
});

// 2026-09-15-paths-not-fragments.md R1, criteria 1 and 2: a string literal inside a script is not a file it opened.
test('code handed to an interpreter gives only a candidate shaped like a whole path', () => {
  const opened = commandPathCandidates(`python3 -c "print(open('apps/web/.env').read())"`);
  const spaced = commandPathCandidates(`node -e "require('fs').readFileSync('/work/Client Name/app/.env')"`);

  assert.ok(opened.includes('apps/web/.env'), 'a path a script opens is still found');
  assert.ok(spaced.includes('/work/Client Name/app/.env'), 'a path with a space inside code is still a path');
  for (const command of [
    `node -e "log('check apps/web/.env')"`,
    'node -e "x({file_path:/a/app/.env})"',
    `python3 -c "run('cd apps && cat web/.env')"`,
  ]) {
    assert.deepEqual(commandPathCandidates(command).filter((candidate) => candidate.includes('.env')), [], command);
  }
});

test('the search for code passes over options and stops at a script', () => {
  assert.deepEqual(inlineCode(`node --input-type=module -e "open('a/.env')"`), [`open('a/.env')`]);
  assert.deepEqual(inlineCode(`deno eval "open('a/.env')"`), [`open('a/.env')`]);
  assert.deepEqual(inlineCode(`node --eval="log('check apps/web/.env')"`), [`--eval=log('check apps/web/.env')`]);
  assert.deepEqual(inlineCode(`node script.js -e "check apps/web/.env"`), [], 'past a script the words are its own');
  assert.deepEqual(inlineCode('php -c php.ini app.php'), [], 'php -c names a configuration file, not code');
  assert.ok(commandPathCandidates(`node script.js -e "check apps/web/.env"`).includes('check apps/web/.env'));
  assert.ok(commandPathCandidates('php -c php.ini app.php').includes('php.ini'));
});

// R4 and criterion 5: where the measurement found no fragment, nothing changes.
test('a quoted argument, brace expansion and a script handed to a shell keep their candidates', () => {
  assert.ok(commandPathCandidates('cat "my project/.env"').includes('my project/.env'));
  assert.ok(commandPathCandidates('cat apps/{web,api}/.env').includes('apps/{web,api}/.env'));
  assert.ok(commandPathCandidates('bash -c "cat apps/web/.env"').includes('cat apps/web/.env'));
});

// docs/detection.md `python-open`: an interpreter's output is the file's only where its own code names the file.
test('an interpreter whose own code names the file reads it; a script, another path or another program does not', () => {
  assert.equal(codeReadsNamedFile([`python3 -c "print(open('.env').read())"`], '.env'), true);
  assert.equal(codeReadsNamedFile([`node -e "console.log(require('fs').readFileSync('.env', 'utf8'))" | head -5`], '.env'), true);

  assert.equal(codeReadsNamedFile(['python3 read.py .env'], '.env'), false, 'a script of its own, handed the path as an argument');
  assert.equal(codeReadsNamedFile([`python3 -c "print(open('config.json').read())"`], '.env'), false, 'the code names another file');
  assert.equal(codeReadsNamedFile([`python3 -c "print(open('.env').read())" | grep KEY`], '.env'), false, 'a program that prints more than it was given');
  assert.equal(codeReadsNamedFile(['cat .env'], '.env'), false, 'no interpreter: the content-only rule covers it');
});
