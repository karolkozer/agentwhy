import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { realpath } from 'node:fs/promises';
import type { ProgramAnswer, RunScript } from '../../src/infrastructure/folder-window.ts';
import { PowershellFolderChooser } from '../../src/infrastructure/powershell-folder-chooser.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

/** The script, answered as the test says: never the real window. */
function answering(answer: ProgramAnswer) {
  const asked: (readonly string[])[] = [];
  const run: RunScript = async (args) => {
    asked.push(args);
    return answer;
  };
  return { run, asked };
}

/** The PowerShell a run was given, as PowerShell reads `-EncodedCommand`: UTF-16 in base64. */
function scriptOf(args: readonly string[] | undefined): string {
  const at = args?.indexOf('-EncodedCommand') ?? -1;
  return at < 0 ? '' : Buffer.from(args?.[at + 1] ?? '', 'base64').toString('utf16le');
}

const base64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64');

// which-project V12, VD3 amended 2026-09-28: Windows' own folder window, opened by the server; the page sends no path.
test('the chosen folder is the path the script answers in base64, with every link followed', async (t) => {
  const folder = await writeSession(t, {});
  const { run, asked } = answering({ code: 0, stdout: base64(folder) + '\r\n', stderr: '' });
  const chooser = new PowershellFolderChooser('win32', run);

  assert.equal(chooser.available, true);
  assert.deepEqual(await chooser.choose('Wybierz folder swojego projektu', 'C:\\Users\\someone\\Projects'), { chosen: await realpath(folder) });
  assert.deepEqual(asked[0]?.slice(0, 6), ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand']);
  const script = scriptOf(asked[0]);
  assert.match(script, /FolderBrowserDialog/);
  assert.match(script, /\$owner\.TopMost = \$true/, 'owned by a window on top, so it is not behind the browser');
  assert.ok(!script.includes('Wybierz folder') && !script.includes('Projects'), 'nothing the page says is spliced into the script as text');
  assert.ok(script.includes(base64('Wybierz folder swojego projektu')) && script.includes(base64('C:\\Users\\someone\\Projects')), 'it travels as base64');
});

test('Cancel is nothing chosen; a failure is said in the script\'s own words, or PowerShell\'s', async () => {
  assert.deepEqual(await new PowershellFolderChooser('win32', answering({ code: 3, stdout: '', stderr: '' }).run).choose('x'), { cancelled: true });
  assert.deepEqual(await new PowershellFolderChooser('win32', answering({ code: 1, stdout: 'failed:Access is denied.', stderr: '' }).run).choose('x'), { failed: 'Access is denied.' });
  assert.deepEqual(await new PowershellFolderChooser('win32', answering({ code: 1, stdout: '', stderr: 'powershell.exe is blocked\r\n' }).run).choose('x'), { failed: 'powershell.exe is blocked' });
  const gone = new PowershellFolderChooser('win32', answering({ code: 0, stdout: base64('C:\\no\\such\\folder'), stderr: '' }).run);
  assert.deepEqual(await gone.choose('x'), { failed: 'The folder chosen could not be found.' });
  const unstarted = answering({ code: 3, stdout: '', stderr: '' });
  await new PowershellFolderChooser('win32', unstarted.run).choose('x');
  assert.ok(scriptOf(unstarted.asked[0]).includes("$start = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(''))"), 'no folder given, none started in');
});

test('a computer that is not Windows offers none, and nothing is run', async () => {
  const { run, asked } = answering({ code: 0, stdout: '', stderr: '' });
  for (const platform of ['darwin', 'linux']) {
    const chooser = new PowershellFolderChooser(platform, run);
    assert.equal(chooser.available, false);
    assert.ok('failed' in (await chooser.choose('x')));
  }
  assert.deepEqual(asked, []);
});
