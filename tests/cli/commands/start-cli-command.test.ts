// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { StartCliCommand } from '../../../src/cli/commands/start-cli-command.ts';
import type { StartOptions, StartOutcome } from '../../../src/report/start/session-start.ts';

const NOW = Date.parse('2026-09-14T12:00:00Z');
const DAY = 86_400_000;

function commandReturning(outcome: StartOutcome) {
  const ran: StartOptions[] = [];
  const command = new StartCliCommand({
    start: {
      run: async (options) => {
        ran.push(options);
        return { outcome, output: 'done\n' };
      },
    },
    now: NOW,
  });
  return { command, ran };
}

test('with nothing given, the range is the last seven days and the index is opened', async () => {
  const { command, ran } = commandReturning('written');

  const result = await command.execute([]);

  assert.deepEqual(ran, [{ since: { since: NOW - 7 * DAY, asked: '7d' }, open: true, share: false }]);
  assert.deepEqual(result, { kind: 'completed', output: 'done\n', exitCode: 0 });
});

test('the flags arrive as the use case expects them', async () => {
  const { command, ran } = commandReturning('written');

  await command.execute(['--since', '30d', '--out', '/somewhere', '--no-open', '--share']);

  assert.deepEqual(ran, [{ since: { since: NOW - 30 * DAY, asked: '30d' }, out: '/somewhere', open: false, share: true }]);
});

test('a policy and a settings file arrive as paths, untouched', async () => {
  const { command, ran } = commandReturning('written');

  await command.execute(['--policy', 'policy.json', '--settings', '.claude/settings.json']);

  assert.deepEqual(ran, [
    { since: { since: NOW - 7 * DAY, asked: '7d' }, policyPath: 'policy.json', settingsPath: '.claude/settings.json', open: true, share: false },
  ]);
});

test('a range that is not one is a usage error, and nothing runs', async () => {
  const { command, ran } = commandReturning('written');

  const result = await command.execute(['--since', 'last tuesday']);

  assert.equal(result.kind, 'usage-error');
  assert.deepEqual(ran, []);
});

test('a refused directory exits as a usage error, and no sessions exits as an answer', async () => {
  assert.deepEqual(await commandReturning('refused').command.execute([]), { kind: 'completed', output: 'done\n', exitCode: 2 });
  assert.deepEqual(await commandReturning('no-sessions').command.execute([]), { kind: 'completed', output: 'done\n', exitCode: 0 });
});

test('--help prints the usage and runs nothing', async () => {
  const { command, ran } = commandReturning('written');

  assert.equal((await command.execute(['--help'])).kind, 'help');
  assert.deepEqual(ran, []);
});

// worth-running-every-day R50: serving follows opening unless named either way.
test('--serve and --no-serve say whether the page is served, and not both at once', async () => {
  const { command, ran } = commandReturning('written');

  await command.execute(['--no-open', '--serve']);
  await command.execute(['--no-serve']);
  const both = await command.execute(['--serve', '--no-serve']);

  assert.deepEqual(ran.map((options) => [options.open, options.serve]), [[false, true], [true, false]]);
  assert.equal(both.kind, 'usage-error');
});

// `2026-10-02-said-where-the-person-is` SW10, SW11: what the agent runs when the person says yes to its report.
test('--session and --quiet arrive as the use case expects them, and a shared page has no session to open', async () => {
  const { command, ran } = commandReturning('written');

  await command.execute(['--no-serve', '--session', 'sess-1', '--quiet']);
  const shared = await command.execute(['--share', '--session', 'sess-1']);
  const empty = await command.execute(['--session', '']);

  assert.deepEqual(ran, [{ since: { since: NOW - 7 * DAY, asked: '7d' }, open: true, share: false, serve: false, session: 'sess-1', quiet: true }]);
  assert.deepEqual([shared.kind, empty.kind], ['usage-error', 'usage-error']);
});

// `2026-10-02-a-page-not-a-file.md` PF3: --detach runs the background start, and a page served from the background is
// never a shared or an unserved one. A bare `agentwhy` off a terminal stays a usage error (R73): a script is not a person.
test('--detach runs the background start, and only with what can be served', async () => {
  const ran: string[] = [];
  const use = (name: string) => ({ run: async (options: StartOptions) => (ran.push(`${name} ${options.quiet === true ? 'quiet' : 'loud'}`), { outcome: 'written' as const, output: '' }) });
  const typed = new StartCliCommand({ start: use('start'), detached: use('detached'), now: NOW });

  await typed.execute(['--detach', '--quiet']);
  await typed.execute([]);
  assert.deepEqual(ran, ['detached quiet', 'start loud']);

  for (const args of [['--detach', '--share'], ['--detach', '--no-serve'], ['--detach', '--serve']]) {
    assert.equal((await typed.execute(args)).kind, 'usage-error', args.join(' '));
  }
  assert.equal((await new StartCliCommand({ start: use('start'), now: NOW }).execute(['--detach'])).kind, 'usage-error', 'no background start, no flag');
});
