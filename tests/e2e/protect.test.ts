// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCli } from '../helpers/cli.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

/** `2026-10-05-protected-everywhere.md` G1-G3: the person's own computer-wide settings, in a home a test names. */
const settingsIn = (home: string) => join(home, '.claude', 'settings.json');
const held = async (home: string): Promise<string> => readFile(settingsIn(home), 'utf8').then((text) => text, () => '');

/** A hook input as Codex hands one over, in a folder no project is above. */
const codexShell = (command: string, cwd: string) =>
  JSON.stringify({ cwd, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, tool_use_id: 'call_1', session_id: 's', turn_id: 't' });

test('protect --list says so where nothing is protected, and reads nothing else', async (t) => {
  const empty = await writeSession(t, {});
  const noRules = await writeSession(t, { '.claude/settings.json': JSON.stringify({ model: 'a-model' }) });

  const absent = await runCli(['protect', '--list'], { env: { HOME: empty } });
  assert.equal(absent.code, 0);
  assert.match(absent.stdout, /is not there, so nothing is protected on this computer yet/);

  const none = await runCli(['protect', '--list'], { env: { HOME: noRules } });
  assert.equal(none.code, 0);
  assert.match(none.stdout, /protects no path, so nothing is protected on this computer yet/);
});

// R7, as every write in this project is asked for: off a terminal the plan is printed and nothing is written.
test('protect off a terminal shows the plan, says what a global rule costs, and writes nothing', async (t) => {
  const home = await writeSession(t, {});

  const result = await runCli(['protect', '~/.ssh/id_rsa'], { env: { HOME: home } });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Protect, in every project on this computer/);
  assert.match(result.stdout, /~\/\.ssh\/id_rsa/, 'a place, kept as its place (a-file-in-its-place IP1)');
  // GD9: the cost of a global rule is paid in words, so the words are part of what a person consents to.
  assert.match(result.stdout, /applies in every project on this computer, and no project can lift it/);
  assert.match(result.stdout, /keeps the file from being read as well as written/);
  assert.match(result.stdout, /"Read\(~\/\.ssh\/id_rsa\)"/, 'R4f: the exact JSON, where nobody could be asked');
  assert.match(result.stdout, /Nothing was written\. To write it: the same command with --yes/);
  assert.equal(await held(home), '', 'and the file is not created');
});

// G2, GD3: every form a person may type is written anchored, and nothing else in the file is touched.
test('protect --yes writes anchored rules and leaves every other setting alone', async (t) => {
  const home = await writeSession(t, { '.claude/settings.json': JSON.stringify({ model: 'a-model', theme: 'dark' }) });

  const result = await runCli(['protect', '~/.ssh/id_rsa', '.aws/credentials', '*.pem', '--yes'], { env: { HOME: home } });
  assert.equal(result.code, 0, result.stdout);
  assert.match(result.stdout, /3 paths are protected on this computer/);

  const after = JSON.parse(await held(home));
  assert.deepEqual(after.permissions.deny, [
    'Read(~/.ssh/id_rsa)', 'Edit(~/.ssh/id_rsa)',
    'Read(**/.aws/credentials)', 'Edit(**/.aws/credentials)',
    'Read(**/*.pem)', 'Edit(**/*.pem)',
  ]);
  assert.deepEqual({ model: after.model, theme: after.theme }, { model: 'a-model', theme: 'dark' }, "Claude Code's own settings stay");

  const listed = await runCli(['protect', '--list'], { env: { HOME: home } });
  assert.match(listed.stdout, /~\/\.ssh\/id_rsa/);
  assert.match(listed.stdout, /\*\*\/\*\.pem/);
});

/*
 * GD3, from GB1-GB6: an absolute path holds in Claude Code's own engine only as `//…`, which `refuse` is measured to
 * ignore, and the anchored form is the one both read. So it is refused by name rather than written in a form that
 * would protect in one place and not the other - and silence would read as "it is protected now".
 */
// `2026-10-07-a-file-in-its-place.md` IP1: a path from `/` is a place, written `//` - the form Claude Code applies wherever
// it works (IPB5) and `refuse` reads as the same place (IP3). A Windows path, or one named by a variable, is not measured
// (IPB13) and is still refused, saying what to type instead.
test('protect writes a path from / as its place, and refuses a form not measured, saying what to type instead', async (t) => {
  const home = await writeSession(t, {});

  const result = await runCli(['protect', '/Volumes/share/ledger.csv', '--yes'], { env: { HOME: home } });
  assert.equal(result.code, 0, result.stdout);
  assert.deepEqual(JSON.parse(await held(home)).permissions.deny, ['Read(//Volumes/share/ledger.csv)', 'Edit(//Volumes/share/ledger.csv)']);
  const clean = await writeSession(t, {});

  // Found by the review of 2026-10-06: only a leading `/` was refused, so these were anchored into rules that name no
  // path an agent uses - `**/C:/Users/…`, `**/$HOME/…` - and said to be protected.
  // The review of the same day, again: a Windows variable in any case, PowerShell's `$env:`, and `~\\`, which is not `~/`.
  for (const absolute of ['C:/Users/someone/.ssh/**', 'C:\\Users\\someone\\.ssh\\id_rsa', '\\\\nas\\share\\Contracts', '$HOME/.ssh/id_rsa', '${HOME}/.aws/**', '%USERPROFILE%\\.ssh\\id_rsa',
    '%UserProfile%\\.ssh\\id_rsa', '$env:USERPROFILE\\.ssh', '~\\.ssh\\id_rsa']) {
    const typed = await runCli(['protect', absolute, '--yes'], { env: { HOME: clean } });
    assert.equal(typed.code, 2, absolute);
    assert.match(typed.stdout, /a Windows path, or one named by a variable, is not written here/, absolute);
    assert.match(typed.stdout, /Name the place with ~\//, absolute);
  }
  assert.equal(await held(clean), '', 'and none of them was written');
});

test('protect adds nothing twice, and says so', async (t) => {
  const home = await writeSession(t, {});
  assert.equal((await runCli(['protect', '~/.ssh/**', '--yes'], { env: { HOME: home } })).code, 0);
  const again = await runCli(['protect', '~/.ssh/**', '--yes'], { env: { HOME: home } });

  assert.equal(again.code, 0);
  assert.match(again.stdout, /already protects every path named\. Nothing to add\./);
  assert.equal(JSON.parse(await held(home)).permissions.deny.length, 2, 'and the rules are not repeated');
});

// R27's rule, for this file: a run can never empty the list by accident, so only a path named is taken out.
test('protect --remove takes out what is named, and refuses to guess', async (t) => {
  const home = await writeSession(t, {});
  await runCli(['protect', '.ssh/id_rsa', '.aws/credentials', '--yes'], { env: { HOME: home } });

  const unnamed = await runCli(['protect', '--remove', '--yes'], { env: { HOME: home } });
  assert.equal(unnamed.code, 2);
  assert.match(unnamed.stderr, /--remove needs the paths to take out/);

  const wrong = await runCli(['protect', '--remove', '--unprotect', 'nothing/here', '--yes'], { env: { HOME: home } });
  assert.equal(wrong.code, 2);
  assert.match(wrong.stdout, /no path named is protected/);
  assert.match(wrong.stdout, /\*\*\/\.ssh\/id_rsa/, 'and what it does protect is listed, to copy from');

  const removed = await runCli(['protect', '--remove', '--unprotect', '~/.ssh/id_rsa', '--yes'], { env: { HOME: home } });
  assert.equal(removed.code, 0, removed.stdout);
  assert.match(removed.stdout, /Removed: 2 deny rules/);
  assert.deepEqual(JSON.parse(await held(home)).permissions.deny, ['Read(**/.aws/credentials)', 'Edit(**/.aws/credentials)'], 'the one not named stays');
});

// Found by the review of 2026-10-06: `--list` shows a rule written by hand in its own form and says to name it, and
// naming it matched only the anchored form - so the rule could never be taken out here.
test('protect --remove takes out a rule written by hand, named the way --list shows it', async (t) => {
  const home = await writeSession(t, { '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(~/.ssh/id_rsa)', 'Edit(~/.ssh/id_rsa)', 'Read(**/.aws/**)'] } }) });
  assert.match((await runCli(['protect', '--list'], { env: { HOME: home } })).stdout, /^  ~\/\.ssh\/id_rsa$/m);

  const removed = await runCli(['protect', '--remove', '--unprotect', '~/.ssh/id_rsa', '--yes'], { env: { HOME: home } });
  assert.equal(removed.code, 0, removed.stdout);
  assert.match(removed.stdout, /Removed: 2 deny rules/);
  assert.deepEqual(JSON.parse(await held(home)).permissions.deny, ['Read(**/.aws/**)'], 'what was not named stays');
});

// GD9 with the review of 2026-10-06: `refuse` reads a Write() rule as a block, and a removal takes out only the Read()
// and Edit() pair this writes - so the path is said to stay protected, not called unprotected.
test('protect --remove says when another tool\'s rule still blocks the path, and leaves that rule alone', async (t) => {
  const deny = ['Read(**/.aws/**)', 'Edit(**/.aws/**)', 'Write(**/.aws/**)'];
  const home = await writeSession(t, { '.claude/settings.json': JSON.stringify({ permissions: { deny } }) });

  const removed = await runCli(['protect', '--remove', '--unprotect', '.aws/**', '--yes'], { env: { HOME: home } });
  assert.equal(removed.code, 0, removed.stdout);
  assert.match(removed.stdout, /Removed: 2 deny rules\. Write\(\*\*\/\.aws\/\*\*\) stays: a rule for another tool, which agentwhy reads as a block too, so that path stays protected until it is taken out by hand\./);
  assert.doesNotMatch(removed.stdout, /no longer protected/);
  assert.deepEqual(JSON.parse(await held(home)).permissions.deny, ['Write(**/.aws/**)']);

  // The review of the same day: another tool's rule written by hand in its own form blocks the same files.
  const tilde = await writeSession(t, { '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(**/.aws/**)', 'Edit(**/.aws/**)', 'Write(~/.aws/**)'] } }) });
  const handWritten = await runCli(['protect', '--remove', '--unprotect', '.aws/**', '--yes'], { env: { HOME: tilde } });
  assert.match(handWritten.stdout, /Write\(~\/\.aws\/\*\*\) stays/);
  assert.doesNotMatch(handWritten.stdout, /no longer protected/);

  const again = await runCli(['protect', '--remove', '--unprotect', '.aws/**', '--yes'], { env: { HOME: home } });
  assert.equal(again.code, 2);
  assert.match(again.stdout, /Write\(\*\*\/\.aws\/\*\*\) is a rule for another tool, which agentwhy writes none of and does not take out: remove it by hand\./);
});

// The file is Claude Code's own, and holds settings this tool never wrote: one it cannot parse is never rewritten.
test('protect refuses a settings file it cannot parse, and changes nothing', async (t) => {
  const home = await writeSession(t, { '.claude/settings.json': '{ not json' });

  for (const args of [['protect', '.ssh/**', '--yes'], ['protect', '--list'], ['protect', '--remove', '--unprotect', '.ssh/**', '--yes']]) {
    const result = await runCli(args, { env: { HOME: home } });
    assert.equal(result.code, 2, args.join(' '));
    assert.match(result.stdout, /is not a JSON object/, args.join(' '));
  }
  assert.equal(await held(home), '{ not json', 'the file is left exactly as it was');
});

/*
 * G1 with G4, the two halves of the promise joined: this is the first thing in this work that a person can do and
 * then see. A rule written here is honoured by `refuse` in a folder no project is above - which is where GB8
 * measured, live, that nothing held before.
 */
test('a path protected by protect is refused in a folder with no project at all', async (t) => {
  const home = await writeSession(t, {});
  const folder = await writeSession(t, { 'notes.txt': 'nothing secret\n' });
  await runCli(['protect', 'ledger.csv', '--yes'], { env: { HOME: home } });

  const refused = await runCli(['refuse', '--codex'], { input: codexShell('cat ledger.csv', folder), env: { HOME: home } });
  assert.equal(refused.code, 2);
  assert.match(refused.stderr, /which the computer-wide policy protects \(\*\*\/ledger\.csv\)/);

  assert.deepEqual(
    await runCli(['refuse', '--codex'], { input: codexShell('cat notes.txt', folder), env: { HOME: home } }),
    { code: 0, stdout: '', stderr: '' },
    'and what nobody protected still runs',
  );

  // Taking the rule out puts that folder back where it was, which is what makes this undoable.
  await runCli(['protect', '--remove', '--unprotect', 'ledger.csv', '--yes'], { env: { HOME: home } });
  assert.equal((await runCli(['refuse', '--codex'], { input: codexShell('cat ledger.csv', folder), env: { HOME: home } })).code, 0);
});

test('protect refuses arguments that contradict each other', async (t) => {
  const home = await writeSession(t, {});
  for (const [args, message] of [
    [['protect'], /no path was named/],
    [['protect', '--list', '.ssh/**'], /--list reads and writes nothing/],
    [['protect', '--unprotect', '.ssh/**'], /--unprotect takes rules out, so it belongs with --remove/],
    [['protect', '--remove', '.ssh/**'], /--remove takes rules out; name them with --unprotect/],
    [['protect', '--bogus'], /--bogus/],
  ] as const) {
    const result = await runCli([...args], { env: { HOME: home } });
    assert.equal(result.code, 2, args.join(' '));
    assert.match(result.stderr, message, args.join(' '));
  }
  assert.equal(await held(home), '', 'and none of them wrote anything');
});
