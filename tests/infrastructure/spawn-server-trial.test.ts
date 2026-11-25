// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { SpawnServerTrial } from '../../src/infrastructure/spawn-server-trial.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

// `.ai/specs/2026-11-25-the-card-in-codex.md` CCX2, on the real operating system.
const trial = new SpawnServerTrial(process.env);
const node = (code: string) => [process.execPath, '-e', code];
const answers = 'process.stdin.once("data",(d)=>{const m=JSON.parse(String(d).trim());process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:m.id,result:{serverInfo:{name:"agentwhy"}}})+"\\n")});setInterval(()=>{},1000)';

test('a server that answers who it is is stopped at once, whatever else it would do', async (t) => {
  const folder = await writeSession(t, {});
  assert.deepEqual(await trial.run({ run: node(answers), folder, timeoutMs: 10_000 }), { kind: 'answered', name: 'agentwhy' });
});

test('a greeting first, silence, an end and a program that is not there are each said', async (t) => {
  const folder = await writeSession(t, {});
  assert.deepEqual(await trial.run({ run: node('console.log("Welcome");' + answers), folder, timeoutMs: 10_000 }), { kind: 'other' });
  assert.deepEqual(await trial.run({ run: node('setInterval(()=>{},1000)'), folder, timeoutMs: 400 }), { kind: 'timed-out' });
  const ended = await trial.run({ run: node('console.error("Error: no such thing");process.exit(3)'), folder, timeoutMs: 10_000 });
  assert.equal(ended.kind, 'not-started');
  assert.match(ended.kind === 'not-started' ? ended.reason : '', /no such thing/);
  assert.equal((await trial.run({ run: ['agentwhy-no-such-program', 'cards'], folder, timeoutMs: 10_000 })).kind, 'not-started');
});

test('agentwhy\'s own card server answers as agentwhy', async (t) => {
  const folder = await writeSession(t, {});
  const cli = fileURLToPath(new URL('../../src/cli.ts', import.meta.url));
  assert.deepEqual(await trial.run({ run: [process.execPath, cli, 'cards'], folder, timeoutMs: 20_000 }), { kind: 'answered', name: 'agentwhy' });
});
