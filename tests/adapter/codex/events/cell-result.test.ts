// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { cellExitCode, cellResultOutputs, cellStrings } from '../../../../src/adapter/codex/events/cell-result.ts';

/** A cell's return as Codex writes it: the script header, then what the script returned (§2.8). */
const returned = (body: string, header = 'Script completed'): string => `${header}\nWall time 0.3 seconds\nOutput:\n\n${body}`;

/** One `tools.exec_command` result, as the cell returns it when the code lets the whole result be its return. */
const result = (exitCode: number, output: string): string =>
  JSON.stringify({ chunk_id: 'aed82c', wall_time_seconds: 0.0000064, exit_code: exitCode, original_token_count: 9, output });

test('XD4a: the command’s exit code is read from the one result the cell returned', () => {
  assert.equal(cellExitCode(returned(result(0, 'TOKEN=redacted\n'))), 0);
  assert.equal(cellExitCode(returned(result(1, ''))), 1);
  assert.equal(cellExitCode(returned(result(127, 'command not found\n'), 'Script failed')), 127);
});

test('XD4a: a negative exit, as an interrupted command records it, is read as itself', () => {
  assert.equal(cellExitCode(returned(result(-1, ''))), -1);
});

test('XD4a: a cell that returned no result object has no exit code', () => {
  // 113 of 147 single-command cells with no exit read `.output` off the result and returned that string alone.
  assert.equal(cellExitCode(returned('README.md\npackage.json\n')), undefined);
  assert.equal(cellExitCode(returned('')), undefined);
  assert.equal(cellExitCode('Script error:\nCommand blocked by PreToolUse hook: agentwhy refused this command'), undefined);
});

test('XD4a: a cell holding several results has no exit code, because none of them is any one command’s', () => {
  // L005: a cell runs its commands in the order its code names, but no id joins a result to one, so pairing is a guess.
  assert.equal(cellExitCode(returned(`${result(0, 'a\n')}\n${result(1, 'b\n')}`)), undefined);
});

test('XD4a: text that only looks like a result establishes nothing', () => {
  // A command whose own output holds braces, or names the key in a string, is not a result object.
  assert.equal(cellExitCode(returned('{"name":"app","exit_code":0}')), undefined);
  assert.equal(cellExitCode(returned('echo \'{"chunk_id": "x"}\' # exit_code 0')), undefined);
  // A result cut short by a cap on the cell's return never closes, so nothing is read from it.
  assert.equal(cellExitCode(returned('{"chunk_id":"aed82c","exit_code":0,"output":"half')), undefined);
  // The key must carry a whole number: a runtime that wrote null, a string or nothing leaves the end unrecorded.
  assert.equal(cellExitCode(returned('{"chunk_id":"aed82c","exit_code":null}')), undefined);
  assert.equal(cellExitCode(returned('{"chunk_id":"aed82c","exit_code":"0"}')), undefined);
  assert.equal(cellExitCode(returned('{"chunk_id":"aed82c","output":"x"}')), undefined);
});

test('XD4a: a result is found whole although its output holds braces and escaped quotes', () => {
  assert.equal(cellExitCode(returned(result(0, '{"a":"b\\"c"}\n'))), 0);
  assert.equal(cellExitCode(returned(result(0, 'trailing backslash \\\\'))), 0);
});

test('§2.16: the output of every whole result a cell returned is read, unescaped, in the order the cell holds them', () => {
  assert.deepEqual(cellResultOutputs(returned(result(0, 'docs/note.md\nnote.md\n'))), ['docs/note.md\nnote.md\n']);
  assert.deepEqual(cellResultOutputs(returned(`${result(0, 'a\n')}\n${result(1, 'b "quoted"\n')}`)), ['a\n', 'b "quoted"\n']);
});

test('§2.16: a cell with no whole result object returns no output of one', () => {
  assert.deepEqual(cellResultOutputs(returned('docs/note.md\nnote.md\n')), []);
  assert.deepEqual(cellResultOutputs(returned('{"chunk_id":"aed82c","exit_code":0,"output":"half')), [], 'cut short by a cap, it never closes');
  assert.deepEqual(cellResultOutputs(returned('{"name":"app","output":"x"}')), [], 'another object with an output key is no result');
  assert.deepEqual(cellResultOutputs(returned('{"chunk_id":"aed82c","exit_code":0,"output":7}')), [], 'an output that is not text is none');
});

test('CT9: every string of a JSON part is read through, whichever key holds it', () => {
  const lesson = 'first line of the lesson\nsecond line of the lesson\n';
  const strings = cellStrings(returned([
    JSON.stringify({ i: 0, result: lesson }),
    JSON.stringify({ status: 'done', value: { files: [{ name: 'notes.md', text: 'a nested "quoted" line' }] } }),
    result(0, 'what the one command printed\n'),
  ].join('\n')));
  assert.ok(strings.includes(lesson), 'an `{i, result}` part');
  assert.ok(strings.includes('a nested "quoted" line'), 'a string deep in objects and arrays, unescaped');
  assert.ok(strings.includes('what the one command printed\n'), 'a whole result, as before');
  assert.ok(strings.includes('notes.md'));
});

test('CT9: the cell’s own text stays, and a part that only opens like JSON adds nothing', () => {
  const text = returned('plain text a script printed\n{"i":0,"result":"cut short by a cap');
  assert.deepEqual(cellStrings(text), [text]);
  assert.deepEqual(cellStrings(returned('[1, 2]')), [returned('[1, 2]')], 'numbers are no text');
});
