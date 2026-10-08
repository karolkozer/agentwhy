import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { outcomeOfExecution, type RecordedCall } from '../../../src/core/access/recorded-effect.ts';
import type { Execution } from '../../../src/core/event.ts';

const call = (...commands: string[]): RecordedCall => ({ commands, toolKnown: true });
const FILE = 'PROJECT_NAME=demo\nDEBUG=true\n';

/** What the rule says of `command`, run to the end with no exit code recorded, having printed `printed`. */
function printedBy(command: string, printed: string, execution: Partial<Execution> = {}): string {
  return outcomeOfExecution(call(command), { status: 'completed', printed, ...execution });
}

// `2026-10-08-what-it-printed-is-the-file.md` XD4c: a program that prints the file it is given prints that file or a
// diagnostic about it and nothing else, so text that is no diagnostic came from the file.
test('XD4c: a printing program given one file, with no exit recorded, read it where what it printed is no diagnostic', () => {
  for (const command of [
    'cat .env', 'cat -n .env', 'head .env', 'head -5 .env', 'head -n 5 .env', 'head --lines=5 .env', 'head --lines 5 .env',
    'tail -n +2 .env', 'tail -c 100 .env', 'nl -ba .env', 'nl -w 3 .env', "sed -n '1,5p' .env", 'cat < .env',
  ]) {
    assert.equal(printedBy(command, FILE), 'succeeded', command);
  }
});

test('XD4c-R3: two files, none, standard input, a redirection or an option that opens nothing, and nothing is said', () => {
  for (const command of [
    'cat .env .env.local', 'head -n 5 .env .env.local', 'cat', 'cat -', 'cat .env 2>/dev/null', 'cat .env > copy.txt',
    'cat .env &>/dev/null', 'head --help .env', 'cat --version', "sed -i '' s/a/b/ .env", 'grep DEBUG .env', 'cat .env | head',
  ]) {
    assert.equal(printedBy(command, FILE), 'unknown', command);
  }
});

test('XD4c-R5, R6: diagnostics alone establish nothing, and are never a failure either', () => {
  for (const printed of [
    'cat: .env: No such file or directory\n', 'head: .env: Is a directory\n', 'cat: .env: Permission denied\n',
    'zsh:1: permission denied: .env\n', 'bash: line 1: .env: Permission denied\n',
    // §2.4: a log whose every line is shaped like a diagnostic is withheld - the error that claims nothing.
    'note: this line looks like a diagnostic\nwarn: so does this one\n',
  ]) {
    assert.equal(printedBy('cat .env', printed), 'unknown', printed);
  }
});

test('XD4c-D2: an empty file prints nothing and is read; a line of the file beside a diagnostic-shaped one is the file', () => {
  assert.equal(printedBy('cat .env', ''), 'succeeded');
  assert.equal(printedBy('cat .env', '\n\n'), 'succeeded');
  assert.equal(printedBy('cat app.log', 'started\nwarn: slow disk\n'), 'succeeded');
});

test('XD4c-D3: a recorded exit decides, and what was printed never overrides it', () => {
  assert.equal(printedBy('cat .env', FILE, { exitCode: 1 }), 'unknown', 'a failure recorded is not read away');
  assert.equal(printedBy('cat .env', 'cat: .env: No such file or directory\n', { exitCode: 0 }), 'succeeded', 'exit 0 is the read it always was');
  assert.equal(printedBy('cat .env .env.local', FILE, { exitCode: 0 }), 'succeeded', 'and of every operand, as before');
});

test('XD4c: only a run that completed, with its printed text known, as one command line', () => {
  for (const status of ['failed', 'interrupted', 'unrecognised'] as const) {
    assert.equal(printedBy('cat .env', FILE, { status }), 'unknown', status);
  }
  assert.equal(outcomeOfExecution(call('cat .env'), { status: 'completed' }), 'unknown', 'no text known: nothing to read it from');
  assert.equal(outcomeOfExecution(call('cat .env', 'cat .env.local'), { status: 'completed', printed: FILE }), 'unknown');
  assert.equal(outcomeOfExecution({ commands: ['cat .env'], toolKnown: false }, { status: 'completed', printed: FILE }), 'unknown');
});

test('XD4c: a program named like an inherited property is no printing program, and nothing throws', () => {
  for (const program of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.equal(printedBy(`${program} .env`, FILE), 'unknown', program);
  }
});
