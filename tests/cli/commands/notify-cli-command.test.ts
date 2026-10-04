// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { NotifyCliCommand } from '../../../src/cli/commands/notify-cli-command.ts';
import { NodeFileSystem } from '../../../src/infrastructure/node-file-system.ts';
import { NoticeSettings } from '../../../src/report/watch/notice-settings.ts';
import { writeSession } from '../../helpers/synthetic-session.ts';

const files = new NodeFileSystem();

async function commandIn(t: Parameters<typeof writeSession>[0], notices?: string) {
  const home = await writeSession(t, notices === undefined ? {} : { 'notices.json': notices });
  const path = join(home, 'notices.json');
  const workingDirectory = '/work/the-app';
  const command = new NotifyCliCommand({ settings: new NoticeSettings({ files, writer: files, path, workingDirectory }) });
  return { command, path, read: async (): Promise<string> => files.readText(path) };
}

const output = (result: { kind: string }): string => ('output' in result ? String(result.output) : '');

// R26: run with nothing, it answers rather than changes. What is set, and which of the three levels set it.
test('with nothing asked it says what is set and where each answer comes from', async (t) => {
  const { command } = await commandIn(t, JSON.stringify({ defaults: { clean: 'off' }, projects: { '/work/the-app': { on: 'refused' } } }));

  const result = await command.execute([]);

  assert.equal(result.kind, 'completed');
  assert.match(output(result), /Findings said {5}refused[^\n]*\(this project\)/);
  assert.match(output(result), /A quiet turn {6}off[^\n]*\(you, everywhere\)/);
  assert.match(output(result), /Shown in {10}chat[^\n]*\(agentwhy's own\)/);
});

/*
 * `effective` picks the project's answer by the longest ancestor match, because a session's working directory may
 * be a directory inside the project the choice was made for. `from` has to attribute it to that same project, not
 * fall back to "you, everywhere" or "agentwhy's own" for a directory the answer plainly governs.
 */
test('a choice made for a project still says "this project" from a directory inside it', async (t) => {
  const home = await writeSession(t, { 'notices.json': JSON.stringify({ defaults: { clean: 'off' }, projects: { '/work/the-app': { on: 'refused' } } }) });
  const path = join(home, 'notices.json');
  const command = new NotifyCliCommand({ settings: new NoticeSettings({ files, writer: files, path, workingDirectory: '/work/the-app/backend' }) });

  const result = await command.execute([]);

  assert.equal(result.kind, 'completed');
  assert.match(output(result), /Findings said {5}refused[^\n]*\(this project\)/);
});

test('a choice is written for this project, and --everywhere writes it for every project', async (t) => {
  const { command, read } = await commandIn(t);

  await command.execute(['--on', 'reached']);
  await command.execute(['--everywhere', '--clean', 'every-turn', '--notify', 'chat,os']);

  assert.deepEqual(JSON.parse(await read()), {
    defaults: { clean: 'every-turn', notify: ['chat', 'os'] },
    projects: { '/work/the-app': { on: 'reached' } },
  });
});

test('--reset takes this project out, and leaves what was chosen everywhere', async (t) => {
  const { command, read } = await commandIn(t, JSON.stringify({ defaults: { clean: 'off' }, projects: { '/work/the-app': { on: 'reached' } } }));

  const result = await command.execute(['--reset']);

  assert.equal(result.kind, 'completed');
  assert.deepEqual(JSON.parse(await read()), { defaults: { clean: 'off' }, projects: {} });
});

/*
 * A flag this version does not know is a person who believes they are being told something they are not, so it is
 * refused and the words say what it does take. Nothing is written by a run that refused.
 */
test('a value no version of this knows is refused, and nothing is written', async (t) => {
  const { command, path } = await commandIn(t);

  for (const args of [['--on', 'everything'], ['--clean', 'sometimes'], ['--notify', 'email'], ['--notify', '']]) {
    const result = await command.execute(args);
    assert.equal(result.kind, 'usage-error', args.join(' '));
    assert.match((result as { message: string }).message, /It takes: /);
  }
  await assert.rejects(files.readText(path), 'a refused run writes no file at all');
});

test('a choice and --reset in one run is refused rather than guessed at', async (t) => {
  const { command } = await commandIn(t);

  const result = await command.execute(['--reset', '--on', 'reached']);

  assert.equal(result.kind, 'usage-error');
  assert.match((result as { message: string }).message, /--reset takes answers out/);
});

// R24: a file nobody can read is not edited around, and the person is told that it was replaced.
test('an unreadable file is replaced, and the answer says so', async (t) => {
  const { command, read } = await commandIn(t, '{ not json');

  const result = await command.execute(['--on', 'refused']);

  assert.match(output(result), /The file could not be read, so it was replaced\./);
  assert.deepEqual(JSON.parse(await read()), { defaults: {}, projects: { '/work/the-app': { on: 'refused' } } });
});

// the-agent-tells-you R29: the line's language, chosen from a terminal as the page chooses it.
test('--lang writes the language of the line, and a language it has no words for is refused', async (t) => {
  const { command, read } = await commandIn(t);

  const written = await command.execute(['--everywhere', '--lang', 'pl']);
  const refused = await command.execute(['--lang', 'fr']);

  assert.match(output(written), /Written in {8}pl[^\n]*\(you, everywhere\)/);
  assert.deepEqual(JSON.parse(await read()), { defaults: { lang: 'pl' }, projects: {} });
  assert.equal(refused.kind, 'usage-error');
});
