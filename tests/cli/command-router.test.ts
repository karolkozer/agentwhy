// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { CliCommand } from '../../src/cli/cli-command.ts';
import { CommandRouter } from '../../src/cli/command-router.ts';
import { EXIT_CODE } from '../../src/cli/exit-codes.ts';

function fakeCommand(name: string, received: string[][] = []): CliCommand {
  return {
    name,
    usage: `usage of ${name}\n`,
    execute: async (args) => {
      received.push([...args]);
      return { kind: 'completed', output: `ran ${name}`, exitCode: EXIT_CODE.ok };
    },
  };
}

test('dispatches to the named command with the arguments that follow its name', async () => {
  const received: string[][] = [];
  const router = new CommandRouter([fakeCommand('doctor'), fakeCommand('report', received)]);

  assert.deepEqual(await router.route(['report', '--input', 's']), {
    kind: 'completed',
    output: 'ran report',
    exitCode: EXIT_CODE.ok,
  });
  assert.deepEqual(received, [['--input', 's']]);
});

test('top-level help lists the usage of every command, in registration order', async () => {
  const router = new CommandRouter([fakeCommand('doctor'), fakeCommand('report')]);
  const help = { kind: 'help', usage: 'usage of doctor\n\nusage of report\n' };

  assert.deepEqual(await router.route(['--help']), help);
  assert.deepEqual(await router.route(['-h']), help);
});

test('a missing or unknown command is a usage error that carries the usage', async () => {
  const router = new CommandRouter([fakeCommand('doctor')]);

  assert.deepEqual(await router.route([]), { kind: 'usage-error', message: 'missing command', usage: 'usage of doctor\n' });
  assert.deepEqual(await router.route(['explain']), {
    kind: 'usage-error',
    message: 'unknown command: explain',
    usage: 'usage of doctor\n',
  });
});

// R73 stands, and its reader is usually an agent: the refusal names the command that gives one a page, and the message
// it is promised to begin with stays the message. Measured 2026-10-04: with the usage alone, one agent in three guessed.
test('a bare command with nothing to answer it carries the way on, and nothing else does', async () => {
  const router = new CommandRouter([fakeCommand('doctor')], undefined, 'run: agentwhy start --detach');

  assert.deepEqual(await router.route([]), {
    kind: 'usage-error',
    message: 'missing command',
    usage: 'usage of doctor\n',
    hint: 'run: agentwhy start --detach',
  });
  assert.deepEqual(await router.route(['explain']), {
    kind: 'usage-error',
    message: 'unknown command: explain',
    usage: 'usage of doctor\n',
  });
});

test('where a person is there to answer a bare command, nothing is said about agents', async () => {
  const start = fakeCommand('start');
  const router = new CommandRouter([start], start, 'run: agentwhy start --detach');

  assert.deepEqual(await router.route([]), { kind: 'completed', output: 'ran start', exitCode: EXIT_CODE.ok });
});

test('two commands cannot share a name', () => {
  assert.throws(() => new CommandRouter([fakeCommand('doctor'), fakeCommand('doctor')]), /duplicate command: doctor/);
});

// R72-R74: a bare `agentwhy` runs one command, its flags reach it, and its usage is listed once when it is also named.
test('with no command it runs the default with no arguments, and forwards what begins with a dash', async () => {
  const received: string[][] = [];
  const start = fakeCommand('start', received);
  const router = new CommandRouter([start, fakeCommand('menu')], start);

  await router.route([]);
  await router.route(['--since', '3d']);
  await router.route(['menu']);

  assert.deepEqual(received, [[], ['--since', '3d']]);
});

test('the default is listed once in the usage, and help still comes first', async () => {
  const start = fakeCommand('start');
  const router = new CommandRouter([start, fakeCommand('menu')], start);

  assert.deepEqual(await router.route(['--help']), { kind: 'help', usage: 'usage of start\n\nusage of menu\n' });
});

test('without a default, a flag is an unknown command rather than something forwarded', async () => {
  const router = new CommandRouter([fakeCommand('start')]);

  assert.deepEqual(await router.route(['--since', '3d']), {
    kind: 'usage-error',
    message: 'unknown command: --since',
    usage: 'usage of start\n',
  });
});
