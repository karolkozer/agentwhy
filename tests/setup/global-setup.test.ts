// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeFileSystem } from '../../src/infrastructure/node-file-system.ts';
import { FileAccessError } from '../../src/ports/file-access-error.ts';
import { GlobalSetup } from '../../src/setup/global-setup.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

/**
 * A disk that fills part way through the first write of the settings file: the file is cut short, then the write
 * fails as the port names it. Every later write goes through, so a file that is put back is put back for real.
 */
function fillingDisk(settings: string) {
  const inner = new NodeFileSystem();
  let writes = 0;
  return {
    readText: (path: string) => inner.readText(path),
    readLines: (path: string) => inner.readLines(path),
    ensureDirectory: (path: string) => inner.ensureDirectory(path),
    writeText: async (path: string, text: string) => {
      if (path === settings && (writes += 1) === 1) {
        await writeFile(path, text.slice(0, 12));
        throw new FileAccessError('unreadable', path);
      }
      return inner.writeText(path, text);
    },
  };
}

// Found by the review of 2026-10-06: the install put the file back, the removal passed nothing to put back with.
test('a removal cut short by a full disk puts Claude Code\'s settings file back as it was, and says so', async (t) => {
  const original = `${JSON.stringify({ model: 'a-model', permissions: { deny: ['Read(**/.ssh/**)', 'Edit(**/.ssh/**)'] } }, null, 2)}\n`;
  const home = await writeSession(t, { '.claude/settings.json': original });
  const settings = join(home, '.claude', 'settings.json');
  const setup = new GlobalSetup({ files: fillingDisk(settings), chooser: { choose: async () => undefined }, interactive: false, home });

  const result = await setup.run({ protect: [], unprotect: ['.ssh/**'], remove: true, yes: true });
  assert.equal(result.outcome, 'unwritable');
  assert.match(result.output, /could not be written, so it was put back as it was/);
  assert.equal(await readFile(settings, 'utf8'), original, 'byte for byte');
});

// `protected-everywhere` GD23: alerts in every project - the computer's `watch`, on both its events, the one hook this
// file is given. Taken out alone: a `watch` of the person's own, and every other hook and rule, stay.
test('GD23: the computer’s alerts are written on both events, read back, and taken out alone', async (t) => {
  const own = { hooks: [{ type: 'command', command: 'agentwhy watch --notify os' }] };
  const original = `${JSON.stringify({ model: 'a-model', permissions: { deny: ['Read(**/.ssh/**)', 'Edit(**/.ssh/**)'] }, hooks: { Stop: [own] } }, null, 2)}\n`;
  const home = await writeSession(t, { '.claude/settings.json': original });
  const settings = join(home, '.claude', 'settings.json');
  const setup = new GlobalSetup({ files: new NodeFileSystem(), chooser: { choose: async () => undefined }, interactive: false, home, invocation: { find: async () => 'agentwhy' } });

  assert.equal(await setup.alertsOn(), false, 'a watch of the person’s own is not the computer’s');
  assert.equal((await setup.alerts(true, { yes: false })).outcome, 'not-confirmed', 'consent first, as for a rule');
  const on = await setup.alerts(true, { yes: true });
  assert.equal(on.outcome, 'written', on.output);
  const written = JSON.parse(await readFile(settings, 'utf8')) as { hooks: Record<string, { hooks: { command: string }[] }[]>; model: string; permissions: unknown };
  assert.deepEqual(Object.keys(written.hooks).sort(), ['Stop', 'SubagentStop']);
  assert.deepEqual(written.hooks.SubagentStop?.flatMap((entry) => entry.hooks.map((hook) => hook.command)), ['agentwhy watch --everywhere']);
  assert.deepEqual(written.hooks.Stop?.flatMap((entry) => entry.hooks.map((hook) => hook.command)), ['agentwhy watch --notify os', 'agentwhy watch --everywhere']);
  assert.equal(written.model, 'a-model');
  assert.equal(await setup.alertsOn(), true);
  assert.equal((await setup.alerts(true, { yes: true })).outcome, 'unchanged');

  const off = await setup.alerts(false, { yes: true });
  assert.equal(off.outcome, 'written', off.output);
  assert.equal(await readFile(settings, 'utf8'), original, 'the file is as it was: its own watch, its rules');
  assert.equal(await setup.alertsOn(), false);
  assert.equal((await setup.alerts(false, { yes: true })).outcome, 'unchanged');
});

test('GD23: alerts not written where the run cannot say how agentwhy runs, nor into a file that does not parse', async (t) => {
  const home = await writeSession(t, { '.claude/settings.json': '{ not json' });
  const broken = new GlobalSetup({ files: new NodeFileSystem(), chooser: { choose: async () => undefined }, interactive: false, home, invocation: { find: async () => 'agentwhy' } });
  assert.equal((await broken.alerts(true, { yes: true })).outcome, 'refused');
  assert.equal(await broken.alertsOn(), 'unreadable');
  assert.equal(await readFile(join(home, '.claude', 'settings.json'), 'utf8'), '{ not json');

  const empty = await writeSession(t, {});
  const blind = new GlobalSetup({ files: new NodeFileSystem(), chooser: { choose: async () => undefined }, interactive: false, home: empty });
  assert.equal((await blind.alerts(true, { yes: true })).outcome, 'refused');
  assert.equal(await blind.alertsOn(), false, 'no file is no alerts');
});

test('GD23: alerts cut short by a full disk put the file back as it was', async (t) => {
  const original = `${JSON.stringify({ model: 'a-model' }, null, 2)}\n`;
  const home = await writeSession(t, { '.claude/settings.json': original });
  const settings = join(home, '.claude', 'settings.json');
  const setup = new GlobalSetup({ files: fillingDisk(settings), chooser: { choose: async () => undefined }, interactive: false, home, invocation: { find: async () => 'agentwhy' } });
  const result = await setup.alerts(true, { yes: true });
  assert.equal(result.outcome, 'unwritable');
  assert.equal(await readFile(settings, 'utf8'), original);
});
