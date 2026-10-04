// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { realpath } from 'node:fs/promises';
import { OsascriptFolderChooser, type RunScript } from '../../src/infrastructure/osascript-folder-chooser.ts';
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

// which-project V12, VD3: macOS's own folder window, opened by the server; the page never sends a path.
test('the chosen folder is the path the system answers, with every link followed', async (t) => {
  const folder = await writeSession(t, {});
  const { run, asked } = answering({ code: 0, stdout: `${folder}/\n`, stderr: '' });
  const chooser = new OsascriptFolderChooser('darwin', run);

  assert.equal(chooser.available, true);
  assert.deepEqual(await chooser.choose('Choose your project’s folder'), { chosen: await realpath(folder) });
  assert.equal(asked[0]?.at(-1), 'Choose your project’s folder', 'the heading is an argument, never inside the script');
  assert.deepEqual(asked[0]?.slice(0, 2), ['-l', 'JavaScript']);
  assert.ok(asked[0]?.some((line) => line.includes('activateIgnoringOtherApps(true)')), 'VB1: brought forward through AppKit - in 0.6 s, in front of the browser');
  const source = asked[0]?.[(asked[0]?.indexOf('-e') ?? 0) + 1] ?? '';
  assert.ok(source.includes('function run(argv)') && !source.includes('Choose your project'), 'nothing the page says is spliced into the script');
});

// VB1: left to itself the window opens where it was last left - on the maintainer's computer, a folder iCloud keeps.
test('the window starts in the folder it is given, passed as an argument as the heading is', async (t) => {
  const folder = await writeSession(t, {});
  const { run, asked } = answering({ code: 0, stdout: `${folder}/\n`, stderr: '' });
  await new OsascriptFolderChooser('darwin', run).choose('Choose your project’s folder', '/Users/someone/Projects');
  assert.deepEqual(asked[0]?.slice(-2), ['Choose your project’s folder', '/Users/someone/Projects']);
  assert.ok(asked[0]?.some((line) => line.includes('options.defaultLocation = Path(argv[1])')));
});

test('Cancel is nothing chosen, and any other answer is said as it came', async () => {
  const cancelled = new OsascriptFolderChooser('darwin', answering({ code: 1, stdout: '', stderr: '0:73: execution error: User canceled. (-128)\n' }).run);
  assert.deepEqual(await cancelled.choose('x'), { cancelled: true });
  const broken = new OsascriptFolderChooser('darwin', answering({ code: 1, stdout: '', stderr: 'execution error: Not authorized (-1743)\n' }).run);
  assert.deepEqual(await broken.choose('x'), { failed: 'execution error: Not authorized (-1743)' });
  const gone = new OsascriptFolderChooser('darwin', answering({ code: 0, stdout: '/Users/someone/no-such-folder/\n', stderr: '' }).run);
  assert.deepEqual(await gone.choose('x'), { failed: 'The folder chosen could not be found.' });
});

test('a computer without a window this code has measured offers none', async () => {
  const { run, asked } = answering({ code: 0, stdout: '/x/', stderr: '' });
  for (const platform of ['linux', 'win32']) {
    const chooser = new OsascriptFolderChooser(platform, run);
    assert.equal(chooser.available, false);
    assert.ok('failed' in (await chooser.choose('x')));
  }
  assert.deepEqual(asked, [], 'nothing was run');
});
