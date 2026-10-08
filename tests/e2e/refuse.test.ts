// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
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
