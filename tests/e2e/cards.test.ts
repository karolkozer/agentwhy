// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

// `specs/2026-11-24-talking-about-agentwhy.md` CVD12: the plugin's server, as an AI's app runs it.
const CLI = fileURLToPath(new URL('../../src/cli.ts', import.meta.url));

async function talk(messages: readonly object[], variables: Record<string, string> = {}): Promise<{ readonly lines: any[]; readonly raw: string; readonly code: number | null }> {
  const home = await mkdtemp(join(tmpdir(), 'agentwhy-cards-'));
  const project = join(home, 'shop');
  await mkdir(project);
  const child = spawn(process.execPath, [CLI, 'cards'], { cwd: project, env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, LANG: 'en_US.UTF-8', ...variables } as NodeJS.ProcessEnv });
  let raw = '';
  child.stdout.on('data', (part) => { raw += String(part); });
  child.stderr.on('data', (part) => { raw += String(part); });
  const ended = new Promise<number | null>((resolve) => child.on('close', resolve));
  for (const message of messages) child.stdin.write(JSON.stringify(message) + '\n');
  child.stdin.end();
  const code = await ended;
  await rm(home, { recursive: true, force: true });
  return { lines: raw.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line)), raw, code };
}

test('it starts, answers in lines, says a conversation it was not told of, and ends with its input', async () => {
  const { lines, raw, code } = await talk([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'x' } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'what_happened', arguments: { about: 'summary' } } },
  ], { CLAUDE_CODE_MESSAGING_TOKEN: 'CANARY-TOKEN-never-said', ANTHROPIC_API_KEY: 'CANARY-KEY-never-said' });
  const by = new Map(lines.map((line) => [line.id, line]));
  assert.equal(code, 0);
  assert.equal(by.get(1).result.serverInfo.name, 'agentwhy');
  assert.equal(by.get(2).result.tools[0].name, 'what_happened');
  assert.match(by.get(3).result.contents[0].text, /^<!doctype html>/);
  assert.ok(by.get(4).result.content[0].text.length > 0);
  assert.ok(!raw.includes('CANARY'), 'nothing of the environment is said');
});

test('every argument the AI makes up is refused before anything is read', async () => {
  const { lines } = await talk([{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'what_happened', arguments: { about: '$(cat ~/.ssh/id_rsa)' } } }]);
  assert.equal(lines[0].result.isError, true);
});
