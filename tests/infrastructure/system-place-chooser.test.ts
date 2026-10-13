// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunScript } from '../../src/infrastructure/folder-window.ts';
import { SystemPlaceChooser } from '../../src/infrastructure/system-place-chooser.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

/** The script, answered as the test says: never the real window. */
function answering(answer: Awaited<ReturnType<RunScript>>) {
  const asked: (readonly string[])[] = [];
  const run: RunScript = async (args) => {
    asked.push(args);
    return answer;
  };
  return { run, asked };
}

// `2026-10-07-a-file-in-its-place.md` IP2, IPB12: the Mac's own window, files and folders together, in the form the
// maintainer's run found opens at all - an accessory app, brought forward, the panel floating above the browser.
test('IP2: on a Mac one window chooses files and folders together, and answers each place with every link followed', async (t) => {
  const root = await writeSession(t, { 'docs/contract.pdf': 'x', 'scans/a.png': 'x' });
  const answer = JSON.stringify([{ path: join(root, 'docs', 'contract.pdf'), folder: false }, { path: join(root, 'scans'), folder: true }, { path: join(root, 'gone'), folder: false }]);
  const { run, asked } = answering({ code: 0, stdout: answer + '\n', stderr: '' });
  const chooser = new SystemPlaceChooser('darwin', run);

  assert.equal(chooser.kinds, 'both');
  assert.deepEqual(await chooser.choose('Choose files and folders to keep from your AI', 'both', root), {
    chosen: [{ path: await realpath(join(root, 'docs', 'contract.pdf')), folder: false }, { path: await realpath(join(root, 'scans')), folder: true }],
  }, 'a place no longer there is left out');
  assert.deepEqual(asked[0]?.slice(-2), ['Choose files and folders to keep from your AI', root], 'the heading and where it opens are arguments, never in the source');
  const source = asked[0]?.[(asked[0]?.indexOf('-e') ?? 0) + 1] ?? '';
  for (const part of ['setActivationPolicy(1)', 'activateIgnoringOtherApps(true)', 'setCanChooseFiles(true)', 'setCanChooseDirectories(true)', 'setAllowsMultipleSelection(true)', 'setLevel(3)']) {
    assert.ok(source.includes(part), part);
  }

  assert.deepEqual(await new SystemPlaceChooser('darwin', answering({ code: 1, stdout: '', stderr: 'execution error: User canceled. (-128)' }).run).choose('x', 'both'), { cancelled: true });
  assert.deepEqual(await new SystemPlaceChooser('darwin', answering({ code: 0, stdout: 'cancelled\n', stderr: '' }).run).choose('x', 'both'), { cancelled: true });
});

// IP2 on Windows, not measured (IPB13): a file window choosing several, or a folder window choosing one; the answer is
// base64 of JSON, the console's code page never touching a name.
test('IP2: on Windows a file window chooses several, a folder window one, and nothing is spliced into the script', async (t) => {
  const root = await writeSession(t, { 'ledger.csv': 'x' });
  const answer = Buffer.from(JSON.stringify({ path: join(root, 'ledger.csv'), folder: false }), 'utf8').toString('base64');
  const { run, asked } = answering({ code: 0, stdout: answer, stderr: '' });
  const chooser = new SystemPlaceChooser('win32', run);

  assert.equal(chooser.kinds, 'separate');
  assert.deepEqual(await chooser.choose('Wybierz pliki', 'files'), { chosen: [{ path: await realpath(join(root, 'ledger.csv')), folder: false }] }, 'one place answered alone is still a list');
  const script = Buffer.from(asked[0]?.at(-1) ?? '', 'base64').toString('utf16le');
  assert.match(script, /OpenFileDialog/);
  assert.match(script, /\$dialog\.Multiselect = \$true/);
  assert.doesNotMatch(script, /Wybierz pliki/, 'the heading travels as base64 inside it, never as text');
  await chooser.choose('x', 'folder');
  assert.match(Buffer.from(asked[1]?.at(-1) ?? '', 'base64').toString('utf16le'), /FolderBrowserDialog/);
  assert.deepEqual(await new SystemPlaceChooser('win32', answering({ code: 3, stdout: '', stderr: '' }).run).choose('x', 'files'), { cancelled: true });
});

test('IP2: elsewhere there is no window, and a place is typed', async () => {
  const chooser = new SystemPlaceChooser('linux', async () => assert.fail('no window is opened'));
  assert.equal(chooser.kinds, undefined);
  assert.match(String((await chooser.choose('x', 'both') as { failed: string }).failed), /type the place instead/);
});

// `2026-10-13-a-window-slow-to-open.md` WN1, WNB1: the system handed the script no panel - nil, after AppKit's own minute
// - and the line after `openPanel` failed as a `TypeError` a page showed word for word. The script asks first.
test('WN1: where the system hands over no window, the script says so before it uses one', async () => {
  const { run, asked } = answering({ code: 0, stdout: 'unavailable\n', stderr: '' });
  const answer = await new SystemPlaceChooser('darwin', run).choose('x', 'both');
  assert.ok('failed' in answer && !/TypeError|setCanChooseFiles/.test(answer.failed), JSON.stringify(answer));
  const source = asked[0]?.[(asked[0]?.indexOf('-e') ?? 0) + 1] ?? '';
  const made = source.indexOf('$.NSOpenPanel.openPanel');
  const asks = source.indexOf('if (!panel || panel.isNil() || typeof panel.setCanChooseFiles !== "function") return "unavailable";');
  assert.ok(made > 0 && asks > made && asks < source.indexOf('panel.setCanChooseFiles(true)'), 'asked after the panel is made and before its first use');
  assert.match(source, /try \{ panel = \$\.NSOpenPanel\.openPanel; \} catch \(error\) \{ return "unavailable"; \}/);
  // What failed before this, as the system wrote it: still a failure, and still never thrown.
  const typeError = 'execution error: Error: TypeError: panel.setCanChooseFiles is not a function. (-2700)';
  assert.deepEqual(await new SystemPlaceChooser('darwin', answering({ code: 1, stdout: '', stderr: typeError }).run).choose('x', 'both'), { failed: typeError });
});

// WN2, WNB4: three scripts ran at once, each with a service of the system's of its own.
test('WN2: one window at a time - a second ask while one is open opens nothing, and the hold is let go whatever the first answers', async () => {
  let opened = 0;
  let answerFirst: (answer: Awaited<ReturnType<RunScript>>) => void = () => undefined;
  const run: RunScript = () => {
    opened += 1;
    return new Promise((resolve) => { answerFirst = resolve; });
  };
  const chooser = new SystemPlaceChooser('darwin', run);
  const first = chooser.choose('x', 'both');
  assert.deepEqual(await chooser.choose('x', 'both'), { open: true });
  assert.deepEqual(await chooser.choose('x', 'files'), { open: true });
  assert.equal(opened, 1, 'no second window was opened');
  answerFirst({ code: 0, stdout: 'cancelled', stderr: '' });
  assert.deepEqual(await first, { cancelled: true });

  const again = chooser.choose('x', 'both');
  assert.equal(opened, 2, 'once the first answered, a window opens again');
  answerFirst({ code: 1, stdout: '', stderr: 'boom' });
  assert.deepEqual(await again, { failed: 'boom' });

  // A program that could not start rejects; the chooser never throws, and is not left holding a window.
  const broken = new SystemPlaceChooser('darwin', async () => { throw new Error('spawn osascript ENOENT'); });
  assert.deepEqual(await broken.choose('x', 'both'), { failed: 'spawn osascript ENOENT' });
  assert.deepEqual(await broken.choose('x', 'both'), { failed: 'spawn osascript ENOENT' }, 'not `open`: the hold was let go');
});
