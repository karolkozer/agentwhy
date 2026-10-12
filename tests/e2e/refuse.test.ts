// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { runCli } from '../helpers/cli.ts';
import { writeSession } from '../helpers/synthetic-session.ts';
import { projectDirectoryName } from '../../src/adapter/claude-code/contract/projects.ts';

const shell = (command: string, cwd = '/work/the-app') =>
  JSON.stringify({ session_id: 's', cwd, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });

// worth-running-every-day R18, R19, run the way a hook runs it: input on a pipe, the exit code and stderr read.
test('refuse, as a hook: a command naming a protected path exits 2 and tells the agent which path and rule', async () => {
  const result = await runCli(['refuse'], { input: shell('cat apps/web/.env.development | head -3') });

  assert.equal(result.code, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^agentwhy refused this command: it names apps\/web\/\.env\.development, which this project's policy protects \(\*\*\/\.env\*\)\. /);
  assert.match(result.stderr, /Do not ask them to paste this file or a secret value into the chat; they can inspect it in their IDE\.\n$/);
});

// The same reading of a command line as a report's, including a path inside code handed to an interpreter (A3).
test('refuse, as a hook: a path inside inline code is refused too', async () => {
  const result = await runCli(['refuse'], { input: shell(`python3 -c "print(open('.env').read())"`) });

  assert.equal(result.code, 2);
  assert.match(result.stderr, /it names \.env,/);
});

// findings-worth-reading R1 as amended 2026-10-07: the same code as a heredoc program went through unread, in Claude
// Code's own hook as in Codex's - measured on the maintainer's rules on 2026-10-07 before the amendment.
test('refuse, as a hook: a path inside a heredoc an interpreter runs is refused too', async () => {
  const result = await runCli(['refuse'], { input: shell(["python3 - <<'PY'", "print(open('.env').read())", 'PY'].join('\n')) });

  assert.equal(result.code, 2);
  assert.match(result.stderr, /it names \.env,/);
});

// R21, stated in the usage: what it does not see, it lets through without a word. `/work/the-app` does not exist, so
// the search reaches no protected file.
test('refuse, as a hook: a search that reaches nothing protected, a sentence about a file and another tool pass silently', async () => {
  for (const input of [
    shell('grep -rn WEBHOOK_SECRET apps'),
    shell('echo "check apps/web/.env"'),
    shell('ls -la'),
    JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: '.env', content: 'x' } }),
  ]) {
    assert.deepEqual(await runCli(['refuse'], { input }), { code: 0, stdout: '', stderr: '' }, input);
  }
});

/** A project with secrets beside its code, as the one the searches below were measured on. */
const PROJECT = {
  '.env': 'SUPABASE_URL=https://example.supabase.co\n',
  '.env.local': 'SUPABASE_KEY=k\n',
  'app/page.tsx': 'export default function Page() {}\n',
  'lib/supabase.ts': 'process.env.SUPABASE_URL\n',
  'node_modules/pkg/.env': 'X=1\n',
};

// R21a. Measured 2026-09-24: with "Stop the AI" on, an agent asked for SUPABASE_URL ran each of these, and every one
// printed `.env:2:SUPABASE_URL=…` back to it. None names `.env`, which is why a reading of names passed them.
test('refuse, as a hook: a recursive search that would read a protected file is refused, and says which', async (t) => {
  const root = await writeSession(t, PROJECT);
  for (const command of [
    'ls -a && grep -rn "SUPABASE_URL" --exclude-dir=node_modules --exclude-dir=.next . 2>/dev/null',
    `grep -rn "SUPABASE_URL" --include='.env*' --include='*.ts' . 2>/dev/null | grep -v node_modules`,
    'rg --hidden SUPABASE_URL',
  ]) {
    const result = await runCli(['refuse'], { input: shell(command, root) });
    assert.equal(result.code, 2, command);
    assert.match(result.stderr, /^agentwhy refused this command: this search would read \.env(\.local)?, which this project's policy protects \(\*\*\/\.env\*\)\. /, command);
    assert.doesNotMatch(result.stderr, /supabase\.co|SUPABASE_KEY=/, 'what is inside the file never reaches the agent');
  }
});

// `2026-10-09-the-file-not-its-name.md` FN17. Found 2026-10-10 in the Claude desktop app: `cd lesson && for f in $(find .
// -type f); do cat "$f"; done` printed a blocked file whole and ran, and so did ten other shapes that hand a listing's names
// to a program - only a loop over a glob was refused. Each now reaches what its listing could list, from where it runs.
test('refuse, as a hook: a listing whose names a program opens reaches what it lists, from where it runs', async (t) => {
  const root = await writeSession(t, { ...PROJECT, 'config/.env': 'X=1\n', 'config/app.json': '{}\n', 'docs/secrets/key.txt': 'k\n', 'docs/guide.md': '# guide\n' });
  for (const command of [
    'for f in $(find . -type f); do cat "$f"; done',
    'for f in `find config -type f`; do cat $f; done',
    'cat $(find config -type f)',
    'find config -type f -exec cat {} \\;',
    'find config -type f -print0 | xargs -0 cat',
    'find config -type f | grep -v json | xargs head -5',
    'find config -type f | while read f; do cat "$f"; done',
    'files=$(find config -type f); cat $files',
    'cd config && for f in $(ls -a); do cat "$f"; done',
  ]) {
    const result = await runCli(['refuse'], { input: shell(command, root) });
    assert.equal(result.code, 2, command);
    assert.match(result.stderr, /this search would read (config\/)?\.env(\.local)?, which this project's policy protects/, command);
  }
  const fromCd = await runCli(['refuse'], { input: shell('cd config && for f in $(find . -type f); do cat "$f"; done', root) });
  assert.match(fromCd.stderr, /would read config\/\.env,/, 'named from where the line starts');

  for (const command of [
    'for f in $(find lib -type f); do cat "$f"; done',
    'for f in $(find . -type f); do echo "$f"; done',
    'find . -type f -exec ls -l {} \\;',
    'find config -name "*.json" -exec cat {} \\;',
    'for f in $(ls); do cat "$f"; done',
    'for f in $(ls docs); do cat docs/$f; done',
    'find . -type f | head',
  ]) {
    assert.deepEqual(await runCli(['refuse'], { input: shell(command, root) }), { code: 0, stdout: '', stderr: '' }, command);
  }
});

// §2.17, found 2026-10-10: the parser read the shell's reserved words as programs, so a recursive search wrapped in one -
// `if`, `then`, `{`, `do`, `!` - was never seen as a search, and ran while the same search alone was refused.
test('refuse, as a hook: a recursive search inside a compound command is refused as it is alone', async (t) => {
  const root = await writeSession(t, PROJECT);
  for (const command of [
    'if true; then grep -rn SUPABASE_URL .; fi',
    'if false; then :; else rg --hidden SUPABASE_URL; fi',
    '{ grep -rn SUPABASE_URL .; }',
    'for d in app; do grep -rn SUPABASE_URL .; done',
    'while true; do grep -rn SUPABASE_URL .; break; done',
    '! grep -rn SUPABASE_URL .',
  ]) {
    const result = await runCli(['refuse'], { input: shell(command, root) });
    assert.equal(result.code, 2, command);
    assert.match(result.stderr, /this search would read \.env/, command);
  }
  assert.equal((await runCli(['refuse'], { input: shell('if [ -d app ]; then grep -rn SUPABASE_URL app; fi', root) })).code, 0, 'a search that reaches no protected file still runs');
});

test('refuse, as a hook: a search that leaves the protected files out, or never reaches them, runs', async (t) => {
  const root = await writeSession(t, PROJECT);
  for (const command of [
    `grep -rn SUPABASE_URL --exclude='.env*' --exclude-dir=node_modules .`,
    'grep -rn SUPABASE_URL app lib',
    `grep -rn SUPABASE_URL --include='*.ts' .`,
    'rg SUPABASE_URL',
  ]) {
    assert.deepEqual(await runCli(['refuse'], { input: shell(command, root) }), { code: 0, stdout: '', stderr: '' }, command);
  }
});

test('refuse, as a hook: a glob the shell would expand into a protected name is refused', async (t) => {
  const root = await writeSession(t, PROJECT);

  const result = await runCli(['refuse'], { input: shell('cat .env* | head -3', root) });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /^agentwhy refused this command: \.env\* expands to \.env(\.local)?, which /);
  assert.equal((await runCli(['refuse'], { input: shell('wc -l lib/*.ts *', root) })).code, 0, 'a bare * leaves hidden names out');
});

test('refuse, as a hook: the project\'s own deny rules decide, not the default', async (t) => {
  const root = await writeSession(t, { '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(./config/vault/**)'] } }) });
  const settings = join(root, '.claude', 'settings.json');

  assert.equal((await runCli(['refuse', '--settings', settings], { input: shell('cat config/vault/key.pem') })).code, 2);
  assert.equal((await runCli(['refuse', '--settings', settings], { input: shell('cat .env') })).code, 0);
});

// R20: failing closed would stop every command on a typo. Nothing reaches stderr, which the agent would read.
test('refuse, as a hook: bad flags, a broken input and a missing policy let the command run and warn the user', async (t) => {
  const missing = join(await writeSession(t, {}), 'missing.json');
  for (const [args, input] of [
    [['refuse', '--bogus'], shell('cat .env')],
    [['refuse'], '{"hook_event_name": "PreToolUse"'],
    [['refuse', '--policy', missing], shell('cat .env')],
  ] as const) {
    const result = await runCli(args, { input });
    assert.equal(result.code, 0, args.join(' '));
    assert.equal(result.stderr, '', args.join(' '));
    assert.match(result.stdout, /^\{"systemMessage":"agentwhy refuse .+ this command was not checked\."\}$/);
  }
});

// The same reading as a report's: a file a rule names exactly is refused by its bare name, and an identifier that
// only a wildcard rule matches is not.
test('refuse, as a hook: a file a rule names exactly is refused by its bare name', async (t) => {
  const root = await writeSession(t, {
    'customers.csv': 'id,name\n',
    '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(**/customers.csv)', 'Read(**/*.env)'] } }),
  });
  const settings = join(root, '.claude', 'settings.json');

  assert.equal((await runCli(['refuse', '--settings', settings], { input: shell('head -5 customers.csv', root) })).code, 2);
  assert.equal((await runCli(['refuse', '--settings', settings], { input: shell('grep -n process.env src', root) })).code, 0);
});

// F57: a file a person asked only to be told about is theirs to let the agent read; the hook stops only what is blocked.
test('refuse, as a hook: a file on the told list is let through, and a blocked one is not', async (t) => {
  const root = await writeSession(t, {
    'customers.csv': 'id,name\n',
    '.env': 'KEY=x\n',
    '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(**/.env*)', 'Edit(**/.env*)'] } }),
    '.claude/agentwhy.json': JSON.stringify({ version: 1, tell: ['**/customers.csv'] }),
  });
  const settings = join(root, '.claude', 'settings.json');

  assert.equal((await runCli(['refuse', '--settings', settings], { input: shell('head -5 customers.csv', root) })).code, 0);
  assert.equal((await runCli(['refuse', '--settings', settings], { input: shell('cat .env', root) })).code, 2);
});

/*
 * SW17 and F57 as amended, the maintainer's day of 2026-10-02 in one test: `cat demo.env` under the `.env` wildcard
 * was let through - the bare name was read as guessed text - and once the file was tracked by name, the fix had to
 * keep letting it through on the person's say-so, not by the same gap.
 */
test('refuse, as a hook: a bare name under a wildcard rule is refused, and tracking that name lets it through', async (t) => {
  const root = await writeSession(t, {
    'demo.env': 'API_TOKEN=x\n',
    '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(**/*.env)', 'Edit(**/*.env)'] } }),
  });
  const settings = join(root, '.claude', 'settings.json');

  const refused = await runCli(['refuse', '--settings', settings], { input: shell('cat demo.env', root) });
  assert.equal(refused.code, 2);
  assert.match(refused.stderr, /it names demo\.env/);

  const tracked = await writeSession(t, {
    'demo.env': 'API_TOKEN=x\n',
    '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(**/*.env)', 'Edit(**/*.env)'] } }),
    '.claude/agentwhy.json': JSON.stringify({ version: 1, tell: ['**/demo.env'] }),
  });
  const trackedSettings = join(tracked, '.claude', 'settings.json');
  assert.equal((await runCli(['refuse', '--settings', trackedSettings], { input: shell('cat demo.env', tracked) })).code, 0);
  assert.equal((await runCli(['refuse', '--settings', trackedSettings], { input: shell('cat .env', tracked) })).code, 2, 'the rest of the wildcard stays blocked');
});

// Found in review (2026-09-26). ripgrep matches a `-g` glob with a directory in it against the path, and an `--iglob`
// without regard to case (measured, ripgrep 14.1.1). Read against the bare name, case and all, each of these was let
// through while ripgrep opened `.env`.
test('refuse, as a hook: a ripgrep glob with a directory in it, or in another case, still reaches .env', async (t) => {
  const root = await writeSession(t, PROJECT);
  for (const command of [
    `rg --hidden -g '**/.env' SUPABASE_URL .`,
    `rg --hidden --iglob '*.ENV' SUPABASE_URL .`,
    `rg --hidden --glob-case-insensitive -g '.ENV*' SUPABASE_URL`,
  ]) {
    const result = await runCli(['refuse'], { input: shell(command, root) });
    assert.equal(result.code, 2, command);
    assert.match(result.stderr, /this search would read \.env/, command);
  }
});

// The other side: what ripgrep leaves out is still left out.
test('refuse, as a hook: a ripgrep glob that leaves .env out at any depth, or in any case, runs', async (t) => {
  const root = await writeSession(t, PROJECT);
  for (const command of [
    `rg --hidden -g '!**/.env*' SUPABASE_URL`,
    `rg --hidden --iglob '!.ENV*' SUPABASE_URL`,
    `rg --hidden --iglob '*.TS' SUPABASE_URL`,
  ]) {
    assert.deepEqual(await runCli(['refuse'], { input: shell(command, root) }), { code: 0, stdout: '', stderr: '' }, command);
  }
});

// Found in review (2026-09-26). The shell rewrites `~`, `$HOME` and `$PWD` before grep sees them; read as written, they
// named a directory that is not there, the search was dropped, and grep read the `.env` below.
test('refuse, as a hook: a search that starts at ~, $HOME or $PWD walks the directory the shell would give it', async (t) => {
  const home = await writeSession(t, { 'app/.env': 'SUPABASE_URL=https://example.supabase.co\n', 'app/lib/supabase.ts': 'x\n' });
  const elsewhere = await writeSession(t, {});
  for (const [command, cwd] of [
    ['grep -rn SUPABASE_URL ~/app', elsewhere],
    ['grep -rn SUPABASE_URL "$HOME/app"', elsewhere],
    ['grep -rn SUPABASE_URL ${HOME}/app/', elsewhere],
    ['rg --hidden SUPABASE_URL ~', elsewhere],
    ['grep -rn SUPABASE_URL $PWD', join(home, 'app')],
  ] as const) {
    const result = await runCli(['refuse'], { input: shell(command, cwd), env: { HOME: home } });
    assert.equal(result.code, 2, command);
    assert.match(result.stderr, /this search would read .*\.env,/, command);
  }
  const lib = await runCli(['refuse'], { input: shell('grep -rn SUPABASE_URL ~/app/lib', elsewhere), env: { HOME: home } });
  assert.deepEqual(lib, { code: 0, stdout: '', stderr: '' }, 'a directory below it that holds nothing protected');
});

// codex-blocks-too CK2-CK4, CKB2: Codex's input, every key it was measured to hand a hook, with fictional values.
const codexShell = (command: string, cwd: string) =>
  JSON.stringify({
    cwd, hook_event_name: 'PreToolUse', model: 'a-model', permission_mode: 'default', session_id: 's', tool_input: { command },
    tool_name: 'Bash', tool_use_id: 'call_1', transcript_path: '/Users/someone/.codex/sessions/rollout.jsonl', turn_id: 't',
  });

/** A project set up for both AIs: its local rules, and the Codex hook file `refuse --codex` finds the project by. */
/** Claude Code settings running `refuse` with this command - the marker the project is found by (AO5). */
const runsRefuse = (command: string, rest: Record<string, unknown> = {}) =>
  JSON.stringify({ ...rest, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command }] }] } });

/** A project blocked in Claude Code: its own rules, read by its `refuse` through `$CLAUDE_PROJECT_DIR`. */
const BOTH = {
  '.claude/settings.local.json': runsRefuse('agentwhy refuse --settings "$CLAUDE_PROJECT_DIR/.claude/settings.local.json"', {
    permissions: { deny: ['Read(./config/vault/**)', 'Edit(./config/vault/**)'] },
  }),
  'apps/web/page.ts': 'export {};\n',
};

// CK3, CKB6: Codex runs the check in the session's folder, below the project; the rules read are the project's. A
// relative --settings, as an older project-level entry wrote it, resolves against the project found (AO6).
test('refuse --codex: the project is found above the session\'s folder, and its own rules decide', async (t) => {
  const root = await writeSession(t, BOTH);
  const below = join(root, 'apps', 'web');
  const args = ['refuse', '--codex', '--settings', '.claude/settings.local.json'];

  const refused = await runCli(args, { input: codexShell('cat ../../config/vault/key.pem', below) });
  assert.equal(refused.code, 2);
  assert.match(refused.stderr, /^agentwhy refused this command: it names \.\.\/\.\.\/config\/vault\/key\.pem, /);
  assert.deepEqual(await runCli(args, { input: codexShell('cat .env', below) }), { code: 0, stdout: '', stderr: '' }, 'these rules replace the built-in list');
  assert.equal((await runCli(args, { input: codexShell('cat config/vault/key.pem', root) })).code, 2, 'and from the project itself');
});

// AO6: the computer-wide check carries no flags; the rules are the ones the project's own refuse command names.
test('refuse --codex without flags reads the rules the project\'s refuse names, or the built-in list where it names none', async (t) => {
  const root = await writeSession(t, BOTH);
  const below = join(root, 'apps', 'web');
  assert.equal((await runCli(['refuse', '--codex'], { input: codexShell('cat ../../config/vault/key.pem', below) })).code, 2, '$CLAUDE_PROJECT_DIR resolves to the project');
  assert.deepEqual(await runCli(['refuse', '--codex'], { input: codexShell('cat .env', below) }), { code: 0, stdout: '', stderr: '' }, 'those rules replace the built-in list');

  const plain = await writeSession(t, { '.claude/settings.local.json': runsRefuse('agentwhy refuse') });
  assert.equal((await runCli(['refuse', '--codex'], { input: codexShell('cat .env', plain) })).code, 2, 'refuse with no flags reads the built-in list');
});

// AO6: no project above runs refuse - no rules anybody chose here, so the command runs with no message.
test('refuse --codex without flags, where no project above runs refuse, lets the command run silently', async (t) => {
  const root = await writeSession(t, { '.claude/settings.local.json': JSON.stringify({ permissions: { allow: [] } }), 'apps/web/page.ts': 'export {};\n' });
  assert.deepEqual(await runCli(['refuse', '--codex'], { input: codexShell('cat .env', join(root, 'apps', 'web')) }), { code: 0, stdout: '', stderr: '' });
});

// CK3 with R20: a relative --settings with no project to read it in is not a guess at one. The person is told.
test('refuse --codex: a relative --settings with no project above runs the command and says it was not checked', async (t) => {
  const root = await writeSession(t, { 'apps/web/page.ts': 'export {};\n' });
  const result = await runCli(['refuse', '--codex', '--settings', '.claude/settings.local.json'], { input: codexShell('cat .env', join(root, 'apps', 'web')) });

  assert.equal(result.code, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /^\{"systemMessage":"agentwhy refuse found no project above this folder whose Claude Code settings run refuse, .+ this command was not checked\."\}$/);
});

// CK4: another of Codex's tools passes; Claude Code's input is read without the flag, as it was.
test('refuse --codex: another tool passes, and without the flag nothing changes for Claude Code', async (t) => {
  const root = await writeSession(t, BOTH);
  const other = JSON.stringify({ ...JSON.parse(codexShell('x', root)), tool_name: 'apply_patch', tool_input: { patch: '*** .env' } });
  assert.deepEqual(await runCli(['refuse', '--codex'], { input: other }), { code: 0, stdout: '', stderr: '' });
  assert.equal((await runCli(['refuse'], { input: shell('cat .env', root) })).code, 2);
});

/** A global policy, as `~/.claude/settings.json` holds it, in a home directory a test names (G4). */
const globalSettings = (deny: readonly string[]) => ({ '.claude/settings.json': JSON.stringify({ permissions: { deny } }) });

/*
 * `2026-10-05-protected-everywhere.md` G4, and its GB8 measured live: Codex's check is installed once, outside every
 * project, and runs in every session - but the rules were the project's alone, so the same file read clean from a
 * folder no project is above. A global policy, once written, is what that folder had none of.
 */
test('refuse --codex: with no project above, a global policy still blocks', async (t) => {
  const home = await writeSession(t, globalSettings(['Read(**/ledger.csv)']));
  const root = await writeSession(t, { 'apps/web/page.ts': 'export {};\n' });

  const result = await runCli(['refuse', '--codex'], { input: codexShell('cat ledger.csv', join(root, 'apps', 'web')), env: { HOME: home } });
  assert.equal(result.code, 2);
  // The sentence says "the computer-wide policy" since G16: in this very case there is no project to name.
  assert.match(result.stderr, /^agentwhy refused this command: it names ledger\.csv, which the computer-wide policy protects \(\*\*\/ledger\.csv\)\. /);
  assert.deepEqual(
    await runCli(['refuse', '--codex'], { input: codexShell('cat notes.txt', join(root, 'apps', 'web')), env: { HOME: home } }),
    { code: 0, stdout: '', stderr: '' },
    'and a file no rule names still runs',
  );
});

/*
 * Found by a review of step 1: an unreadable global file was passed over in silence, while a project's own unreadable
 * settings file is said. Silence there reads as "nothing is protected on this computer", which is the one thing it
 * cannot be known to mean, so it takes R20's existing not-checked path - the command still runs. A directory in the
 * file's place is an unreadable file on every platform and as any user, which `chmod` is not (conventions, Testing).
 */
test('refuse: a global settings file that cannot be read is said, and the command still runs', async (t) => {
  const home = await writeSession(t, { '.claude/settings.json/in-the-way.txt': 'a directory where the file should be\n' });
  const root = await writeSession(t, { 'ledger.csv': 'id,total\n' });

  const result = await runCli(['refuse'], { input: shell('cat ledger.csv', root), env: { HOME: home } });
  assert.equal(result.code, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /^\{"systemMessage":"agentwhy refuse .+ this command was not checked\."\}$/);
});

/*
 * Finding 1 of the second review, and the worst defect this branch had: the fix above returned the unreadable file as
 * the whole answer, throwing away a project policy that was readable and did refuse - so a file in the home directory
 * switched off protection inside every project. R20 lets a command run when it cannot be checked; it does not let one
 * through that the rules in hand refuse.
 */
test('refuse: an unreadable global file does not switch off the project\'s own rules', async (t) => {
  const home = await writeSession(t, { '.claude/settings.json/in-the-way.txt': 'a directory where the file should be\n' });
  const root = await writeSession(t, {
    '.env': 'KEY=x\n',
    'notes.txt': 'nothing secret\n',
    '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(**/.env*)'] } }),
  });
  const settings = join(root, '.claude', 'settings.json');
  const refuse = (command: string) => runCli(['refuse', '--settings', settings], { input: shell(command, root), env: { HOME: home } });

  const refused = await refuse('cat .env');
  assert.equal(refused.code, 2, "the project's own rule still refuses");
  assert.match(refused.stderr, /which this project's policy protects \(\*\*\/\.env\*\)/);

  // And where nothing refuses, the unreadable file is still said - the message never stands in for a refusal.
  const ran = await refuse('cat notes.txt');
  assert.equal(ran.code, 0);
  assert.match(ran.stdout, /^\{"systemMessage":"agentwhy refuse .+ this command was not checked\."\}$/);
});

/*
 * Finding 3 of the second review: a relative `--settings`, as an older project-level hook entry wrote it, names rules
 * only inside a project - and with none found this returned before the global policy was consulted at all, leaving
 * GB8's own hole open in that one form. The computer-wide policy needs no project.
 */
test('refuse --codex: a relative --settings with no project above still applies the global policy', async (t) => {
  const home = await writeSession(t, globalSettings(['Read(**/ledger.csv)']));
  const root = await writeSession(t, { 'apps/web/page.ts': 'export {};\n' });
  const args = ['refuse', '--codex', '--settings', '.claude/settings.local.json'];
  const below = join(root, 'apps', 'web');

  const refused = await runCli(args, { input: codexShell('cat ledger.csv', below), env: { HOME: home } });
  assert.equal(refused.code, 2);
  assert.match(refused.stderr, /which the computer-wide policy protects \(\*\*\/ledger\.csv\)/);

  // What the global policy does not name is still a run nobody could check, said as it was before (CK3 with R20).
  const unchecked = await runCli(args, { input: codexShell('cat .env', below), env: { HOME: home } });
  assert.equal(unchecked.code, 0);
  assert.match(unchecked.stdout, /^\{"systemMessage":"agentwhy refuse found no project above this folder .+ not checked\."\}$/);
});

// G4: a home directory whose settings hold no deny rules is the state every computer is in before this is set up -
// where it holds none, the check behaves exactly as it did, which is what keeps this additive.
test('refuse --codex: a global settings file with no deny rules changes nothing', async (t) => {
  const root = await writeSession(t, { 'apps/web/page.ts': 'export {};\n' });
  for (const home of [
    await writeSession(t, { '.claude/settings.json': JSON.stringify({ model: 'a-model', theme: 'dark' }) }),
    await writeSession(t, { '.claude/settings.json': '{ not json' }),
    await writeSession(t, {}),
  ]) {
    assert.deepEqual(
      await runCli(['refuse', '--codex'], { input: codexShell('cat ledger.csv', join(root, 'apps', 'web')), env: { HOME: home } }),
      { code: 0, stdout: '', stderr: '' },
      home,
    );
  }
});

// G4: the union is additive in both directions - the project's own rule still decides, and the global one is added
// to it, never in place of it. The route a global rule closes is the one `refuse` exists for: a shell command.
test('refuse: a project\'s own rules and a global policy both apply', async (t) => {
  const home = await writeSession(t, globalSettings(['Read(**/ledger.csv)']));
  const root = await writeSession(t, { '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(./config/vault/**)'] } }) });
  const settings = join(root, '.claude', 'settings.json');
  const refuse = (command: string) => runCli(['refuse', '--settings', settings], { input: shell(command, root), env: { HOME: home } });

  assert.equal((await refuse('cat config/vault/key.pem')).code, 2, 'the project\'s own rule still decides');
  assert.equal((await refuse('cat ledger.csv')).code, 2, 'and the global rule is added to it');
  assert.deepEqual(await refuse('cat README.md'), { code: 0, stdout: '', stderr: '' }, 'what neither names runs');
});

/*
 * G15 and GD7, found by the review of step 1: a project's tell list (F57) and a policy file's `allowed` both reach
 * `protectionOf`, where an exception wins over every protecting pattern - so a project could open a file the whole
 * computer blocks. A global block is answered first now; a project may add to what is kept from the agent, never
 * take away from it.
 */
test('refuse: a project\'s tell list does not lift a global block', async (t) => {
  const home = await writeSession(t, globalSettings(['Read(**/ledger.csv)']));
  const root = await writeSession(t, {
    'ledger.csv': 'id,total\n',
    '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(**/.env*)'] } }),
    '.claude/agentwhy.json': JSON.stringify({ version: 1, tell: ['**/ledger.csv'] }),
  });
  const settings = join(root, '.claude', 'settings.json');

  const named = await runCli(['refuse', '--settings', settings], { input: shell('cat ledger.csv', root), env: { HOME: home } });
  assert.equal(named.code, 2, 'the tell list names the same pattern and does not lift it');
  assert.match(named.stderr, /which the computer-wide policy protects \(\*\*\/ledger\.csv\)/);
});

// G15: and a broader tell list, which covers the global pattern rather than repeating it, does not lift it either.
test('refuse: a broader tell list does not lift a global block, and a project\'s own exception still works', async (t) => {
  const home = await writeSession(t, globalSettings(['Read(**/ledger.csv)']));
  // The project tells a whole shape of file, and blocks something else of its own. A pattern a project both blocks
  // and tells is blocked already, by `withTold`, so that is not what this measures.
  const root = await writeSession(t, {
    'ledger.csv': 'id,total\n',
    'invoices.csv': 'id,total\n',
    '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(**/.env*)'] } }),
    '.claude/agentwhy.json': JSON.stringify({ version: 1, tell: ['**/*.csv'] }),
  });
  const settings = join(root, '.claude', 'settings.json');
  const refuse = (command: string) => runCli(['refuse', '--settings', settings], { input: shell(command, root), env: { HOME: home } });

  assert.equal((await refuse('cat ledger.csv')).code, 2, 'the global block holds under a broader tell');
  assert.deepEqual(await refuse('cat invoices.csv'), { code: 0, stdout: '', stderr: '' }, "the project's own told file is still let through");
});

// G15: a policy file is "the whole of what was chosen" for a project, and its exceptions still answer for its own
// rules - but not for a block written outside every project.
test('refuse: a policy file\'s allowed list does not lift a global block', async (t) => {
  const home = await writeSession(t, globalSettings(['Read(**/ledger.csv)']));
  const root = await writeSession(t, {
    'ledger.csv': 'id,total\n',
    '.env.example': 'KEY=\n',
    'policy.json': JSON.stringify({ version: 1, level: 'no-read', protected: ['**/.env*'], allowed: ['**/ledger.csv', '**/.env.example'] }),
  });
  const refuse = (command: string) => runCli(['refuse', '--policy', join(root, 'policy.json')], { input: shell(command, root), env: { HOME: home } });

  assert.equal((await refuse('cat ledger.csv')).code, 2);
  assert.deepEqual(await refuse('cat .env.example'), { code: 0, stdout: '', stderr: '' }, "the policy's own exception still answers for its own rule");
});

// G16: under a global rule there may be no project at all, so the reason names the policy a person can go and change.
test('refuse: the reason says which policy stopped the command', async (t) => {
  const home = await writeSession(t, globalSettings(['Read(**/ledger.csv)']));
  const root = await writeSession(t, {
    'ledger.csv': 'id,total\n',
    '.env': 'KEY=x\n',
    '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(**/.env*)'] } }),
  });
  const settings = join(root, '.claude', 'settings.json');
  const refuse = (command: string) => runCli(['refuse', '--settings', settings], { input: shell(command, root), env: { HOME: home } });

  assert.match((await refuse('cat ledger.csv')).stderr, /which the computer-wide policy protects \(\*\*\/ledger\.csv\)/);
  assert.match((await refuse('cat .env')).stderr, /which this project's policy protects \(\*\*\/\.env\*\)/, "a project's own rule is still said as the project's");
});

// G16, settled by the second review's finding 4: where a project and the computer name the very same pattern, the
// computer's is what holds - taking the project's rule out would not unblock the file - so that is what is said.
test('refuse: a pattern both a project and the computer name is said as the computer\'s', async (t) => {
  const home = await writeSession(t, globalSettings(['Read(**/ledger.csv)']));
  const root = await writeSession(t, {
    'ledger.csv': 'id,total\n',
    '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(**/ledger.csv)'] } }),
  });

  const result = await runCli(['refuse', '--settings', join(root, '.claude', 'settings.json')], { input: shell('cat ledger.csv', root), env: { HOME: home } });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /which the computer-wide policy protects \(\*\*\/ledger\.csv\)/);
});

// G4 with R21a: a global rule is enforced by every route refuse covers, not only a command that names the file.
test('refuse: a global policy covers a search and a glob too, not only a named path', async (t) => {
  const home = await writeSession(t, globalSettings(['Read(**/ledger.csv)']));
  const root = await writeSession(t, { 'ledger.csv': 'id,total\n7,42\n', 'app/page.ts': 'export {};\n' });
  const refuse = (command: string) => runCli(['refuse'], { input: shell(command, root), env: { HOME: home } });

  const searched = await refuse('grep -rn 42 .');
  assert.equal(searched.code, 2);
  assert.match(searched.stderr, /this search would read ledger\.csv, /);
  const globbed = await refuse('cat ledger.*');
  assert.equal(globbed.code, 2);
  assert.match(globbed.stderr, /ledger\.\* expands to ledger\.csv, /);
  assert.doesNotMatch(`${searched.stderr}${globbed.stderr}`, /id,total|7,42/, 'what is inside the file never reaches the agent');
});

/*
 * `2026-10-05-protected-everywhere.md` GD11: a file the computer tracks is let through in every project, as a
 * project's own told list lets it through - read from the person's agentwhy directory, never from the project. A
 * project that blocks the same file keeps it blocked: both naming it is the safer of the two.
 */
test('refuse: a file the computer tracks is let through, and a project that blocks it keeps it blocked', async (t) => {
  const home = await writeSession(t, { '.agentwhy/private-files.json': JSON.stringify({ version: 1, tell: ['**/*.env'] }) });
  // No deny list of its own, so the built-in list - which blocks `*.env` - is what the computer's choice gives way to.
  const builtIn = await writeSession(t, { 'demo.env': 'API_TOKEN=x\n', '.claude/settings.json': JSON.stringify({ model: 'a-model' }) });
  const blocks = await writeSession(t, {
    'demo.env': 'API_TOKEN=x\n',
    '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(**/*.env)', 'Edit(**/*.env)'] } }),
  });
  const refuse = (root: string) =>
    runCli(['refuse', '--settings', join(root, '.claude', 'settings.json')], { input: shell('cat demo.env', root), env: { HOME: home } });

  assert.deepEqual(await refuse(builtIn), { code: 0, stdout: '', stderr: '' }, 'tracked on this computer, so read and told');
  const kept = await refuse(blocks);
  assert.equal(kept.code, 2, "the project's own block of the same pattern holds");
  assert.match(kept.stderr, /which this project's policy protects \(\*\*\/\*\.env\)/);
});


/*
 * `2026-10-07-a-file-in-its-place.md` IP3, IPD3, from IPB7: a computer rule written for a place - `~/…` or `//…` - is
 * that place in `refuse` as it is in Claude Code, and a command is read where it runs. Every way IPB7 found through -
 * a relative path, `./`, `cd … &&`, `$PWD`, `..` - is refused now; the same name in another folder is not, and an
 * identifier that only looks like a name is not made a file by being resolved.
 */
test('refuse: a rule naming a place holds however the command reaches it, and only there', async (t) => {
  const home = await writeSession(t, {
    'docs/my app/sub/canary.txt': 'x\n',
    'docs/other/sub/canary.txt': 'x\n',
  });
  const app = join(home, 'docs', 'my app');
  const other = join(home, 'docs', 'other');
  for (const rule of ['Read(~/docs/my app/sub/canary.txt)', `Read(/${join(app, 'sub', 'canary.txt')})`]) {
    await mkdir(join(home, '.claude'), { recursive: true });
    await writeFile(join(home, '.claude', 'settings.json'), JSON.stringify({ permissions: { deny: [rule] } }));
    for (const codex of [false, true]) {
      const run = (command: string, cwd: string) =>
        runCli(['refuse', ...(codex ? ['--codex'] : [])], { input: (codex ? codexShell : shell)(command, cwd), env: { HOME: home } });
      for (const [command, cwd] of [
        ['cat sub/canary.txt', app], ['cat ./sub/canary.txt', app], ['cd sub && cat canary.txt', app],
        ['cat "$PWD/sub/canary.txt"', app], ['cat ../"my app"/sub/canary.txt', other], ['cat ~/docs/"my app"/sub/canary.txt', app],
      ] as const) {
        assert.equal((await run(command, cwd)).code, 2, `${rule}, ${codex ? 'Codex' : 'Claude Code'}: ${command}`);
      }
      assert.equal((await run('cat sub/canary.txt', other)).code, 0, 'a file of the same name elsewhere is not that place');
      assert.equal((await run('grep -n config.env sub', other)).code, 0, 'nor is an identifier made a file');
    }
  }
});

/*
 * `2026-10-09-the-file-not-its-name.md` FN6, FNB6, FNB7: a rule for one file of a project met a path `refuse` could place,
 * which is what lets another lesson's `exercise.py` through - and missed every line whose folder it cannot follow, where
 * the rule for the name refused. Measured live: `find -exec cat` and `pushd; cat` printed the file in both AIs.
 */
test('refuse: a rule for one file holds where the folder is not known, as a rule for its name did, and lets the same name elsewhere through', async (t) => {
  const target = 'lessons/stage_02/02_tuples/exercise.py';
  const root = await writeSession(t, {
    '.claude/settings.local.json': runsRefuse('agentwhy refuse --settings "$CLAUDE_PROJECT_DIR/.claude/settings.local.json"', {
      permissions: { deny: [`Read(./${target})`, `Edit(./${target})`] },
    }),
    [target]: 'x\n',
    'lessons/stage_01/01_variables/exercise.py': 'x\n',
  });
  const settings = join(root, '.claude', 'settings.local.json');
  for (const codex of [false, true]) {
    const who = codex ? 'Codex' : 'Claude Code';
    const run = (command: string) => (codex
      ? runCli(['refuse', '--codex'], { input: codexShell(command, root) })
      : runCli(['refuse', '--settings', settings], { input: shell(command, root) }));
    for (const command of [
      `cat ${target}`,
      'pushd lessons/stage_02/02_tuples; cat exercise.py',
      'pushd lessons/stage_02/02_tuples && cat exercise.py && popd',
      'find lessons -name exercise.py -exec cat {} +',
      'find lessons -name exercise.py -execdir cat {} \\;',
      'find lessons -name exercise.py | xargs cat',
      'env -C lessons/stage_02/02_tuples cat exercise.py',
      'tar -C lessons/stage_02/02_tuples -cf - exercise.py',
      `bash -c "cat ${target}"`,
      'for d in lessons/stage_02/02_tuples; do cat $d/exercise.py; done',
      // Found by the review of 2026-10-09: a shell handed code by an option with -c among others, or by a program that runs it.
      "bash -lc 'cd lessons/stage_02/02_tuples && cat exercise.py'",
      "sh -ec 'cd lessons/stage_02/02_tuples; cat exercise.py'",
      "env bash -c 'cd lessons/stage_02/02_tuples && cat exercise.py'",
      "nohup sh -c 'cd lessons/stage_02/02_tuples && cat exercise.py'",
      "timeout 5 bash -c 'cd lessons/stage_02/02_tuples && cat exercise.py'",
      "eval 'cd lessons/stage_02/02_tuples && cat exercise.py'",
    ]) {
      assert.equal((await run(command)).code, 2, `${who}: ${command}`);
    }
    for (const command of ['cat lessons/stage_01/01_variables/exercise.py', 'cd lessons/stage_01/01_variables && cat exercise.py', 'cat exercise.py']) {
      assert.deepEqual(await run(command), { code: 0, stdout: '', stderr: '' }, `${who}, the same name elsewhere: ${command}`);
    }
    // FND9, FNB23: a find that prints where files are and opens none - the agent looking for another lesson's file -
    // is not met by the name; FNB23's three, in each AI's words.
    for (const command of [
      'find . -path "*stage_01*" -name "exercise.py" | grep 01_variables',
      `cd "${root}" && find . -path "*stage_01*" -path "*01_variables*" -name "exercise.py" | head;`,
      "find . -name exercise.py -path '*01_variables*' -print",
    ]) {
      assert.deepEqual(await run(command), { code: 0, stdout: '', stderr: '' }, `${who}, a find that only lists: ${command}`);
    }
    // FND9: where the name is still what stops a line, the refusal says which file the rule is for, and that another of
    // that name, named by its path, is not this rule's - the agent of FNB23 took it for its own file's and gave up.
    const byName = await run('find lessons -name exercise.py -exec cat {} +');
    const said = byName.stdout + byName.stderr;
    assert.equal(byName.code, 2, `${who}: still refused`);
    assert.match(said, /it names exercise\.py, which this project's policy protects \(\*\*\/lessons\/stage_02\/02_tuples\/exercise\.py\)\. The rule is for lessons\/stage_02\/02_tuples\/exercise\.py alone: this command names exercise\.py in a folder agentwhy cannot follow, so it was stopped for that file\. Another file called exercise\.py, named by its path from the project's folder, is not stopped by this rule\./, who);
    assert.doesNotMatch(said, /Protected files are kept out of the agent's reach/, `${who}: not the sentence for a file the line named itself`);
  }
});

/*
 * `2026-10-09-the-file-not-its-name.md` FNB25: Codex read a blocked folder's files through a word the shell expands -
 * `for f in lekcje/etap_03_funkcje/*` + `/{teoria.md,exercise.py}; do sed -n 1,55p "$f"; done` - since only a glob in the
 * last part of a word was expanded, and a brace list not at all. Both builds let it through.
 */
test('refuse: a glob in a folder part, or a brace list, reaching a blocked folder is refused - and one that misses it is not', async (t) => {
  const root = await writeSession(t, {
    '.claude/settings.local.json': runsRefuse('agentwhy refuse --settings "$CLAUDE_PROJECT_DIR/.claude/settings.local.json"', {
      permissions: { deny: ['Read(./lessons/stage_03/**)', 'Edit(./lessons/stage_03/**)', 'Read(./lessons/stage_01/02_ops/exercise.py)'] },
    }),
    'lessons/stage_03/01_functions/teoria.md': 'x\n',
    'lessons/stage_03/01_functions/exercise.py': 'x\n',
    'lessons/stage_01/01_vars/exercise.py': 'x\n',
    'lessons/stage_01/02_ops/exercise.py': 'x\n',
    'lessons/stage_01/03_loops/exercise.py': 'x\n',
    'lessons/stage_02/01_lists/teoria.md': 'x\n',
  });
  const settings = join(root, '.claude', 'settings.local.json');
  for (const codex of [false, true]) {
    const who = codex ? 'Codex' : 'Claude Code';
    const run = (command: string) => (codex
      ? runCli(['refuse', '--codex'], { input: codexShell(command, root) })
      : runCli(['refuse', '--settings', settings], { input: shell(command, root) }));
    for (const command of [
      'for f in lessons/stage_03/*/{teoria.md,exercise.py}; do echo "$f"; sed -n 1,55p "$f"; done',
      'cat lessons/stage_03/*/teoria.md',
      'cat lessons/*/*/teoria.md',
      'cat {lessons/stage_03/01_functions/teoria.md,README.md}',
      'cat lessons/*/02_ops/exercise.py',
      'cat lessons/stage_01/*/exercise.py',
    ]) {
      assert.equal((await run(command)).code, 2, `${who}: ${command}`);
    }
    for (const command of [
      'cat lessons/*/01_vars/exercise.py',
      'head -3 lessons/stage_01/0[13]*/exercise.py',
      'cat lessons/stage_02/*/teoria.md',
    ]) {
      assert.deepEqual(await run(command), { code: 0, stdout: '', stderr: '' }, `${who}, misses what is blocked: ${command}`);
    }
  }
});

/*
 * `2026-10-09-the-file-not-its-name.md` FN13, FNB27: `rg --files | rg exercise` was refused by both builds over a blocked
 * file elsewhere in the project - the second `rg` reads the names the first prints, and was taken for a search of the
 * folder. `grep -r` given no path reads the folder whatever it is fed, and stays refused.
 */
test('refuse: rg fed by a pipe searches no folder and is let through; rg and grep -r searching the folder are not', async (t) => {
  const root = await writeSession(t, {
    '.claude/settings.local.json': runsRefuse('agentwhy refuse --settings "$CLAUDE_PROJECT_DIR/.claude/settings.local.json"', {
      permissions: { deny: ['Read(**/SPEC.md)', 'Edit(**/SPEC.md)'] },
    }),
    'SPEC.md': 'x\n',
    'lessons/stage_01/exercise.py': 'x\n',
  });
  const settings = join(root, '.claude', 'settings.local.json');
  for (const codex of [false, true]) {
    const who = codex ? 'Codex' : 'Claude Code';
    const run = (command: string) => (codex
      ? runCli(['refuse', '--codex'], { input: codexShell(command, root) })
      : runCli(['refuse', '--settings', settings], { input: shell(command, root) }));
    for (const command of ['rg --files | rg exercise', 'rg --files | rg -n exercise | head -5']) {
      assert.deepEqual(await run(command), { code: 0, stdout: '', stderr: '' }, `${who}: ${command}`);
    }
    for (const command of ['rg exercise', 'echo x | grep -r exercise']) {
      assert.equal((await run(command)).code, 2, `${who}: ${command}`);
    }
  }
});

/*
 * `2026-10-09-the-file-not-its-name.md` FN14, FN15, FNB26, FNB30: a file at the project's root blocked is its place alone
 * - what Block writes - and holds that file alone, as Claude Code applies it; a rule of one name (`./notes.md`) holds
 * every notes.md, as Claude Code applies that too; and a told root file lifts no other block - it had let a blocked
 * `docs/notes.md` through by its path and its whole path, and in Codex `refuse` is the one protection there is.
 */
test('refuse: a root file blocked by its place holds it alone, a rule of one name holds every file of it, and a told one lifts no other block', async (t) => {
  const place = (path: string, root: string) => [`Read(/${join(root, path)})`, `Edit(/${join(root, path)})`];
  const pair = (path: string, root: string) => [`Read(./${path})`, `Edit(./${path})`, ...place(path, root)];
  for (const kind of ['place', 'name', 'told'] as const) {
    const root = await writeSession(t, { 'notes.md': 'x\n', 'docs/notes.md': 'x\n', 'docs/other.md': 'x\n' });
    await mkdir(join(root, '.claude'), { recursive: true });
    const deny = kind === 'place' ? place('notes.md', root) : kind === 'name' ? ['Read(./notes.md)', 'Edit(./notes.md)'] : pair('docs/notes.md', root);
    await writeFile(join(root, '.claude', 'settings.local.json'), runsRefuse('agentwhy refuse --settings "$CLAUDE_PROJECT_DIR/.claude/settings.local.json"', { permissions: { deny } }));
    if (kind === 'told') await writeFile(join(root, '.claude', 'agentwhy.json'), JSON.stringify({ version: 1, tell: ['./notes.md'] }));
    const settings = join(root, '.claude', 'settings.local.json');
    for (const codex of [false, true]) {
      const who = `${codex ? 'Codex' : 'Claude Code'}, ${kind}`;
      const run = (command: string) => (codex
        ? runCli(['refuse', '--codex'], { input: codexShell(command, root) })
        : runCli(['refuse', '--settings', settings], { input: shell(command, root) }));
      const refused = kind === 'told' ? ['cat docs/notes.md', `cat ${join(root, 'docs/notes.md')}`, 'cat ./docs/notes.md']
        : kind === 'name' ? ['cat notes.md', 'cat docs/notes.md', `cat ${join(root, 'docs/notes.md')}`]
          : ['cat notes.md', `cat ${join(root, 'notes.md')}`, 'cat ./notes.md', 'cd docs && cat notes.md', 'rg x -g notes.md', 'find . -name notes.md -exec cat {} +'];
      const letThrough = kind === 'told' ? ['cat notes.md', 'cat docs/other.md']
        : kind === 'name' ? ['cat docs/other.md']
          // FNB28: two searches for the name, refused when `find`'s pattern was read as a shell glob; FNB29: a listing by a pattern.
          : ['cat docs/notes.md', 'cat ./docs/notes.md', 'grep -rn x docs', 'cat docs/other.md', "ls -la docs && find docs -iname '*notes*'", 'find . -iname "notes*" -not -path "./.git/*"',
            "pwd && rg --files -g 'AGENTS.md' -g 'notes.md'", 'find . -name notes.md', 'rg --files | rg notes.md'];
      for (const command of refused) assert.equal((await run(command)).code, 2, `${who}: ${command}`);
      for (const command of letThrough) assert.deepEqual(await run(command), { code: 0, stdout: '', stderr: '' }, `${who}, let through: ${command}`);
    }
  }
});

// FN17 as amended 2026-10-11 (FNB42): `cd <lesson> && for f in *; …` was refused for the blocked `note.md` at the root - the
// glob was expanded where the hook started, never where the line's `cd` had taken it. A glob expands where its command
// runs, after an absolute or a relative `cd`, and is still refused where what it becomes is blocked.
test('refuse: a glob expands where the line is when its command runs, after its cd', async (t) => {
  const root = await writeSession(t, {
    '.claude/settings.local.json': runsRefuse('agentwhy refuse --settings "$CLAUDE_PROJECT_DIR/.claude/settings.local.json"', {
      permissions: { deny: ['Read(./note.md)', 'Read(./lessons/01_vars/exercise.py)'] },
    }),
    'note.md': 'x\n',
    'lessons/01_vars/exercise.py': 'x\n',
    'lessons/02_lists/exercise.py': 'x\n',
    'lessons/02_lists/teoria.md': 'x\n',
  });
  const settings = join(root, '.claude', 'settings.local.json');
  const run = (command: string) => runCli(['refuse', '--settings', settings], { input: shell(command, root) });
  for (const command of [
    `cd "${root}/lessons/02_lists" && for f in *; do echo "=== $f ==="; cat "$f"; done`,
    'cd lessons/02_lists && cat *',
  ]) {
    assert.deepEqual(await run(command), { code: 0, stdout: '', stderr: '' }, command);
  }
  for (const [command, named] of [
    ['for f in *; do cat "$f"; done', 'note.md'],
    [`cd "${root}/lessons/01_vars" && for f in *; do cat "$f"; done`, 'lessons/01_vars/exercise.py'],
    ['cd lessons/01_vars && cat *', 'lessons/01_vars/exercise.py'],
  ] as const) {
    const result = await run(command);
    assert.equal(result.code, 2, command);
    assert.match(result.stderr, new RegExp('\\* expands to ' + named.replaceAll('.', '\\.') + ','), command);
  }
});

// `2026-10-11-a-folder-found-while-it-runs.md` FW1-FW4, FWB1: a folder a line finds while it runs read a blocked folder
// unrefused. It is now any place under where the line runs - or under where its program looked - and what reads or lists
// it there is refused, with how to get a checked run; a word only named refuses nothing.
test('refuse, as a hook: a folder a line finds while it runs is any place its program could have found', async (t) => {
  const root = await writeSession(t, {
    ...PROJECT, 'config/.env': 'X=1\n', 'docs/secrets/key.txt': 'k\n', 'docs/guide.md': '# guide\n', 'notes/a b/secrets/plan.txt': 'p\n',
  });
  for (const command of [
    'd=$(find . -type d -name secrets | head -1); cat "$d"/*',
    // A place with a space in it is one word where the line writes the variable bare.
    "d=$(find notes -type d -name 'a b' | head -1); grep -r . $d",
    'd=$(find . -type d -name secrets | head -1); find "$d" -type f -exec cat {} +',
    'd=$(find . -type d -name secrets | head -1); find "$d" -type f | while read f; do cat "$f"; done',
    'd=$(find . -type d -name config | head -1); for f in $(find "$d" -type f); do cat "$f"; done',
    'for d in $(find . -type d -name secrets); do grep -r . "$d"; done',
    'd=$(find . -type d -name secrets | head -1); cd "$d" && cat *',
  ]) {
    const result = await runCli(['refuse'], { input: shell(command, root) });
    assert.equal(result.code, 2, command);
    assert.match(result.stderr, /^agentwhy refused this command: this search would read [^,]+, which this project's policy protects \(.+\)\. It reads \$[df], a folder it only finds while it runs, so agentwhy cannot tell it is not one holding a protected file\. Name the folder by its path and the command can be checked\. /, command);
  }
  // A file found while it runs is refused too - here by the search that finds it, before it is read.
  assert.equal((await runCli(['refuse'], { input: shell("f=$(find . -name 'key.txt' | head -1); cat \"$f\"", root) })).code, 2);
  for (const command of [
    'd=$(find . -type d -name secrets | head -1); echo "$d"',
    'd=$(find . -type d -name secrets | head -1); test -d "$d" && echo yes',
    'd=$(find . -type d -name secrets | head -1); cd "$d" && pwd',
    'd=$(find lib -type d | head -1); cat "$d"/*',
    'd=$(find docs -maxdepth 1 -name guide.md | head -1); cat "$d"',
    // Found where the line moved to: `lib` holds no protected file, though the folder the hook started in holds `.env`.
    'cd lib && for f in $(find . -type f); do cat "$f"; done',
    'n=$(wc -l < lib/supabase.ts); head -n "$n" lib/supabase.ts',
  ]) {
    assert.deepEqual(await runCli(['refuse'], { input: shell(command, root) }), { code: 0, stdout: '', stderr: '' }, command);
  }
});

// FW4: a rule written for one place is named by what it holds - the retest's agent read "**/note.md" as every note.md.
test('refuse, as a hook: a rule written for one file is named by that file', async (t) => {
  const root = await writeSession(t, { 'note.md': 'n\n', 'docs/note.md': 'd\n' });
  // As Settings writes it into the project's own settings, from the home folder: `Read(~/<project>/note.md)`.
  const env = { HOME: dirname(root) };
  await mkdir(join(root, '.claude'), { recursive: true });
  await writeFile(join(root, '.claude', 'settings.local.json'), JSON.stringify({ permissions: { deny: [`Read(~/${basename(root)}/note.md)`] } }));
  const settings = join(root, '.claude', 'settings.local.json');
  const refused = await runCli(['refuse', '--settings', settings], { input: shell('cat note.md', root), env });
  assert.equal(refused.code, 2);
  assert.match(refused.stderr, /it names note\.md, which this project's policy protects \(note\.md\)\./);
  assert.equal((await runCli(['refuse', '--settings', settings], { input: shell('cat docs/note.md', root), env })).code, 0, 'another note.md is not this rule\'s');
  // A rule written for every place keeps its pattern.
  assert.match((await runCli(['refuse'], { input: shell('cat .env', root), env })).stderr, /protects \(\*\*\/\.env\*\)/);
  // And a pattern also written for every place is named as written: it holds `docs/note.md` too.
  await writeFile(settings, JSON.stringify({ permissions: { deny: [`Read(~/${basename(root)}/note.md)`, 'Read(**/note.md)'] } }));
  assert.match((await runCli(['refuse', '--settings', settings], { input: shell('cat note.md', root), env })).stderr, /protects \(\*\*\/note\.md\)\./);
});

/**
 * `2026-10-11-the-rules-where-the-file-is.md` RW3-RW5, RWB2: the Codex app runs a conversation in a folder of its own,
 * which no project is above, and the project's blocked file, named by its whole path, was printed. The rules of the
 * project a word lies in now hold it there, from anywhere - and only its own files.
 */
async function lessonsAndAChat(t: Parameters<typeof writeSession>[0]): Promise<{ home: string; lessons: string; chat: string; other: string }> {
  const home = await writeSession(t, { 'Projects/lessons/note.md': 'n\n', 'Projects/lessons/docs/note.md': 'd\n', 'Documents/Codex/a-chat/note.md': 'c\n' });
  const lessons = join(home, 'Projects', 'lessons');
  const other = join(home, 'Projects', 'other');
  const chat = join(home, 'Documents', 'Codex', 'a-chat');
  const files: Record<string, string> = {
    [join(lessons, '.claude', 'settings.local.json')]: runsRefuse('agentwhy refuse --settings "$CLAUDE_PROJECT_DIR/.claude/settings.local.json"', {
      permissions: { deny: ['Read(~/Projects/lessons/note.md)', 'Read(./stages/03/**)', 'Read(**/*.key)'] },
    }),
    [join(home, '.agentwhy', 'projects', projectDirectoryName(lessons), 'private-files.json')]: JSON.stringify({ version: 1, tell: ['./templates/**', 'demo.key'] }),
    // Another set-up project, which tracks every `note.md` of its own.
    [join(other, '.claude', 'settings.local.json')]: runsRefuse('agentwhy refuse --settings "$CLAUDE_PROJECT_DIR/.claude/settings.local.json"', { permissions: { deny: ['Read(./private/**)'] } }),
    [join(home, '.agentwhy', 'projects', projectDirectoryName(other), 'private-files.json')]: JSON.stringify({ version: 1, tell: ['note.md'] }),
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  return { home, lessons, chat, other };
}

test('RW3: a project\'s rules hold its files from a folder no project is above, in both AIs', async (t) => {
  const { home, lessons, chat } = await lessonsAndAChat(t);
  for (const codex of [false, true]) {
    const who = codex ? 'Codex' : 'Claude Code';
    const run = (command: string, cwd = chat) => runCli(['refuse', ...(codex ? ['--codex'] : [])], { input: (codex ? codexShell : shell)(command, cwd), env: { HOME: home } });

    const named = await run(`cat '${lessons}/note.md'`);
    assert.equal(named.code, 2, who);
    assert.match(named.stderr, /which the policy of the project it is in protects \(~\/Projects\/lessons\/note\.md\)\. /, who);
    for (const command of [`cd ${lessons} && cat note.md`, `head -3 ~/Projects/lessons/stages/03/exercise.py`, `cat ${lessons}/app/secret.key`, `grep -rn KEY ${lessons}`]) {
      assert.equal((await run(command)).code, 2, `${who}: ${command}`);
    }
    for (const command of ['cat note.md', `cat ${lessons}/docs/note.md`, `cat ${lessons}/templates/lesson.py`, `cat ${lessons}/app/demo.key`, `cat ${chat}/secret.key`]) {
      assert.deepEqual(await run(command), { code: 0, stdout: '', stderr: '' }, `${who}: ${command} is not the project's blocked file`);
    }
    // As the project's own hook runs it: Claude Code's with the flag `init` writes, Codex's finding the project.
    const inside = codex ? await run('cat note.md', lessons)
      : await runCli(['refuse', '--settings', join(lessons, '.claude', 'settings.local.json')], { input: shell('cat note.md', lessons), env: { HOME: home } });
    assert.match(inside.stderr, /which this project's policy protects \(note\.md\)\./, `${who}: from the project itself, its own rule as before`);
  }
});

// RW4, RWD2: the project a line runs in tracks every `note.md` of its own; that says nothing of another project's.
test('RW4: the told list of the project a line runs in does not lift another project\'s block', async (t) => {
  const { home, lessons, other } = await lessonsAndAChat(t);
  for (const codex of [false, true]) {
    const run = (command: string) => runCli(['refuse', ...(codex ? ['--codex'] : [])], { input: (codex ? codexShell : shell)(command, other), env: { HOME: home } });
    const settings = codex ? [] : ['--settings', join(other, '.claude', 'settings.local.json')];
    const runWith = (command: string) => (codex ? run(command) : runCli(['refuse', ...settings], { input: shell(command, other), env: { HOME: home } }));
    assert.equal((await runWith('cat ../lessons/note.md')).code, 2, codex ? 'Codex' : 'Claude Code');
    assert.equal((await runWith('cat note.md')).code, 0, 'its own note.md is still let through');
    assert.equal((await runWith(`cat ${lessons}/templates/x.py`)).code, 0);
  }
});

// RW6: a project whose rules cannot be read refuses nothing, and is said, where nothing else refused (R20).
test('RW6: a project whose rules cannot be read lets the line run, said', async (t) => {
  const { home, chat } = await lessonsAndAChat(t);
  const broken = join(home, 'Projects', 'broken');
  await mkdir(join(broken, '.claude'), { recursive: true });
  await writeFile(join(broken, '.claude', 'settings.local.json'), runsRefuse(`agentwhy refuse --settings ${join(broken, 'missing.json')}`));
  const result = await runCli(['refuse', '--codex'], { input: codexShell(`cat ${broken}/notes.txt`, chat), env: { HOME: home } });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /could not read the policy it was given, so this command was not checked/);
});

/**
 * `2026-10-11-the-rules-where-the-file-is.md` RW11, RWB6: Claude Code runs a project's hooks only in a conversation
 * started in that project. The Claude desktop app moves a conversation started in its own folder into a project, and
 * `cat <project>/note.md` ran there with no check at all. The computer's own check finds the project as Codex's does.
 */
test('RW11: refuse --everywhere checks Claude Code\'s input wherever the conversation was started', async (t) => {
  const { home, lessons, chat } = await lessonsAndAChat(t);
  const run = (command: string, cwd: string) => runCli(['refuse', '--everywhere'], { input: shell(command, cwd), env: { HOME: home } });

  const outside = await run(`cat '${lessons}/note.md'`, chat);
  assert.equal(outside.code, 2);
  assert.match(outside.stderr, /which the policy of the project it is in protects \(~\/Projects\/lessons\/note\.md\)/);
  const moved = await run('cat note.md', lessons);
  assert.equal(moved.code, 2, 'moved into the project, its rules are found from where the line runs');
  assert.match(moved.stderr, /which this project's policy protects \(note\.md\)/);
  assert.deepEqual(await run('cat .env', chat), { code: 0, stdout: '', stderr: '' }, 'where nobody chose a rule, nothing is refused and nothing said');
  assert.deepEqual(await run(`cat '${lessons}/templates/lesson.py'`, chat), { code: 0, stdout: '', stderr: '' }, 'a tracked file is let through');

  const both = await runCli(['refuse', '--everywhere', '--codex'], { input: shell('cat note.md', lessons), env: { HOME: home } });
  assert.equal(both.code, 0);
  assert.match(both.stdout, /given arguments it does not recognise/);
});

/**
 * `2026-10-12-a-read-outside-the-project.md` RX1, RXB1: Claude Code read a project's blocked `note.md` with its own `Read`,
 * from the Claude desktop app's folder and from another project - the project's deny rule holds only in a conversation
 * started in it, and the computer's check ran on the shell alone. A `Read` is now read as the line printing its file.
 */
test('RX1: refuse --everywhere judges Claude Code\'s Read by the rules where its file is', async (t) => {
  const { home, lessons, chat, other } = await lessonsAndAChat(t);
  const read = (filePath: string, cwd: string) =>
    runCli(['refuse', '--everywhere'], { input: JSON.stringify({ session_id: 's', cwd, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: filePath } }), env: { HOME: home } });

  for (const cwd of [chat, other]) {
    const refused = await read(`${lessons}/note.md`, cwd);
    assert.equal(refused.code, 2, cwd);
    assert.match(refused.stderr, new RegExp(`^agentwhy refused this command: it names ${lessons}/note\\.md, which the policy of the project it is in protects \\(~/Projects/lessons/note\\.md\\)\\. `));
    assert.equal((await read(`${lessons}/stages/03/it's.py`, cwd)).code, 2, 'a quote in the path is read as itself');
    for (const path of [`${lessons}/docs/note.md`, `${lessons}/templates/lesson.py`, `${chat}/note.md`]) {
      assert.deepEqual(await read(path, cwd), { code: 0, stdout: '', stderr: '' }, `${path} from ${cwd}`);
    }
  }
  assert.equal((await read(`${lessons}/note.md`, lessons)).code, 2, 'and from inside the project, as its deny rule would');
});

/**
 * RW15, RWB7, RWB8: Codex runs a command in the folder its call names - 1366 of 2795 commands of the maintainer's
 * rollouts name one - and the hook is told the session's folder. On 2026-10-12 `cat note.md`, with `workdir` the
 * project, ran from the Codex app's own folder. The cell running it is the rollout's newest, written before the hook runs.
 */
test('RW15: refuse --codex reads a command where its call runs it, from the rollout', async (t) => {
  const { home, lessons, chat } = await lessonsAndAChat(t);
  const rollout = join(home, 'rollout.jsonl');
  const cell = (code: string) => writeFile(rollout, [
    JSON.stringify({ type: 'session_meta', payload: { cwd: chat } }),
    JSON.stringify({ type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', call_id: 'c1', input: code } }),
    JSON.stringify({ type: 'token_usage_record', payload: {} }),
  ].join('\n') + '\n');
  const run = (command: string, cwd: string) => runCli(['refuse', '--codex'], {
    input: JSON.stringify({ ...JSON.parse(codexShell(command, cwd)), transcript_path: rollout }), env: { HOME: home },
  });

  await cell(`await tools.exec_command({cmd:"cat note.md",workdir:${JSON.stringify(lessons)}});`);
  const refused = await run('cat note.md', chat);
  assert.equal(refused.code, 2, 'the project\'s note.md, though the hook was told the chat\'s folder');
  assert.match(refused.stderr, /it names note\.md, which this project's policy protects \(note\.md\)/);

  // A rule for one place meets the command where it runs: told the project's root, the line reads `docs/secret.md`.
  await mkdir(join(home, '.claude'), { recursive: true });
  await writeFile(join(home, '.claude', 'settings.json'), JSON.stringify({ permissions: { deny: ['Read(~/Projects/lessons/docs/secret.md)'] } }));
  await cell(`await tools.exec_command({cmd:"cat secret.md",workdir:${JSON.stringify(join(lessons, 'docs'))}});`);
  assert.equal((await run('cat secret.md', lessons)).code, 2, 'docs/secret.md, though the hook was told the project\'s root');
  await cell('await tools.exec_command({cmd:"cat secret.md"});');
  assert.deepEqual(await run('cat secret.md', lessons), { code: 0, stdout: '', stderr: '' }, 'and the root\'s secret.md is not that place');

  await cell('const d = "docs"; await tools.exec_command({cmd:"cat note.md",workdir:d});');
  const unknown = await run('cat note.md', chat);
  assert.equal(unknown.code, 0);
  assert.match(unknown.stdout, /could not tell which folder Codex runs this command in, so this command was not checked/);
});
