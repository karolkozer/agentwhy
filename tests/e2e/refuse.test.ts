// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { runCli } from '../helpers/cli.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

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

// R21, stated in the usage: what it does not see, it lets through without a word. `/work/the-app` does not exist, so
// the search reaches no protected file.
test('refuse, as a hook: a search that reaches nothing protected, a sentence about a file and another tool pass silently', async () => {
  for (const input of [
    shell('grep -rn WEBHOOK_SECRET apps'),
    shell('echo "check apps/web/.env"'),
    shell('ls -la'),
    JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '.env' } }),
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
