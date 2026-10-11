// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { neverStarted } from '../../../../src/adapter/codex/events/cell-parse.ts';

/** A cell's return as its text: Codex's header, then its words for the error that stopped the script (§2.15). */
const stopped = (message: string, state = 'failed') => `Script ${state}\nWall time 0.0 seconds\nOutput:\n\nScript error:\nSyntaxError: ${message}`;

// §2.15, measured 2026-10-10: the VS Code panel's agent wrote a cell one `)` short; Codex said so, and nothing in it ran.
test('a cell whose code compiles neither in Codex nor here never started', () => {
  const code = 'const r = await Promise.allSettled([\n  tools.exec_command({cmd:"cat notes.md"}),\n]); r.forEach((x,i)=>text(JSON.stringify({i,result:x}));';
  assert.equal(neverStarted(code, stopped('missing ) after argument list')), true);
});

test('a script that compiled and raised a SyntaxError while it ran started, and its commands are read as before', () => {
  // `JSON.parse` of what a command printed raises one after the command ran.
  const runs = 'const r = await tools.exec_command({cmd:"cat a.json"}); text(JSON.parse(r.output))';
  assert.equal(neverStarted(runs, stopped('Unexpected token \'x\', "x" is not valid JSON')), false);

  // Another engine's words for the fault: the two differ, and nothing is concluded.
  const code = 'tools.exec_command({cmd:"cat notes.md"}';
  assert.equal(neverStarted(code, stopped('Unexpected end of input, expected )')), false);
  // The header is the script's state: a script that completed started.
  assert.equal(neverStarted(code, stopped('missing ) after argument list', 'completed')), false);
  // No error at all.
  assert.equal(neverStarted(code, 'Script failed\nWall time 0.0 seconds\nOutput:\n'), false);
});

test('the code is compiled and never called', () => {
  const marker = '__agentwhyCellRan';
  assert.equal(neverStarted(`globalThis.${marker} = true;`, stopped('missing ) after argument list')), false);
  assert.equal((globalThis as Record<string, unknown>)[marker], undefined);
});
