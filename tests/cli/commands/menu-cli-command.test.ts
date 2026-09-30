import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MenuCliCommand } from '../../../src/cli/commands/menu-cli-command.ts';
import type { CliCommand, CommandResult } from '../../../src/cli/cli-command.ts';
import type { Chooser } from '../../../src/ports/chooser.ts';

function menuWith(options: { readonly answer?: number; readonly answers?: readonly (number | undefined)[]; readonly interactive?: boolean } = {}) {
  const ran: string[] = [];
  const printed: string[] = [];
  const answers = [...(options.answers ?? [])];
  const asked: { heading: string; labels: string[] }[] = [];
  const command = (name: string): CliCommand => ({
    name,
    usage: `usage of ${name}\n`,
    execute: async (): Promise<CommandResult> => {
      ran.push(name);
      return { kind: 'completed', output: `${name} ran\n`, exitCode: 0 };
    },
  });
  const chooser: Chooser = {
    choose: async (heading, choices) => {
      asked.push({ heading, labels: choices.map((choice) => choice.label) });
      return options.answers === undefined ? options.answer : answers.shift();
    },
  };
  const menu = new MenuCliCommand({
    chooser,
    printer: { write: (text) => printed.push(text) },
    interactive: options.interactive ?? true,
    entries: [
      { label: 'check', detail: 'what to do about the last 7 days', command: command('check') },
      { label: 'init', detail: 'set this project up', command: command('init') },
    ],
  });
  return { menu, ran, asked, printed };
}

// R24: what is picked runs, what it said is printed, and the list comes back - a command that ends in silence leaves
// a person with nothing to do next.
test('what is picked runs, is printed, and the list comes back until the person leaves', async () => {
  const { menu, ran, asked, printed } = menuWith({ answers: [1, 0, undefined] });

  const result = await menu.execute([]);

  assert.deepEqual(result, { kind: 'completed', output: '', exitCode: 0 });
  assert.deepEqual(ran, ['init', 'check']);
  // A blank line above and below: on screen a command's answer and the next question run together otherwise.
  assert.deepEqual(printed, ['\ninit ran\n\n', '\ncheck ran\n\n']);
  assert.deepEqual(asked.map(({ heading }) => heading), ['What do you want to do?', 'What now?', 'What now?']);
  assert.deepEqual(asked[0]?.labels, ['check', 'init', 'Quit']);
});

test('Quit ends it, and so does leaving the list', async () => {
  const quit = menuWith({ answers: [2] });
  assert.deepEqual(await quit.menu.execute([]), { kind: 'completed', output: '', exitCode: 0 });
  assert.deepEqual(quit.ran, []);

  const left = menuWith({});
  assert.deepEqual(await left.menu.execute([]), { kind: 'completed', output: '', exitCode: 0 });
  assert.deepEqual(left.ran, []);
});

// Off a terminal nothing can be picked, so the shell gets what it always got: the usage, and exit 2.
test('with no terminal it is the old usage error, and asks nobody', async () => {
  const { menu, ran, asked } = menuWith({ interactive: false });

  const result = await menu.execute([]);

  assert.equal(result.kind, 'usage-error');
  assert.equal(result.kind === 'usage-error' ? result.message : '', 'menu needs a terminal');
  assert.deepEqual([...ran, ...asked], []);
});

test('arguments after it are a usage error: it takes none', async () => {
  assert.equal((await menuWith({}).menu.execute(['check'])).kind, 'usage-error');
});
