// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from '../helpers/cli.ts';
import { installedHooks, pinnedVersions, runsKeySwap, withHooksPinnedTo, withKeySwap, withoutKeySwap } from '../../src/adapter/claude-code/settings/hook-entries.ts';
import { NodeFileSystem } from '../../src/infrastructure/node-file-system.ts';
import { hookComplete } from '../../src/report/start/settings-files.ts';
import { ProjectSetup } from '../../src/setup/project-setup.ts';

// `2026-11-05-a-key-in-what-it-read.md` KR1, KR10: the switch adds its own two entries, takes them out again, and neither
// changes what anything else reads from the file.
const WATCH = { hooks: [{ type: 'command', command: 'agentwhy watch' }] };
const REFUSE = { matcher: 'Bash', hooks: [{ type: 'command', command: 'agentwhy refuse' }] };
const HELD = {
  permissions: { deny: ['Read(.env)', 'Edit(.env)'] },
  theirs: { kept: true },
  hooks: {
    Stop: [WATCH],
    SubagentStop: [WATCH],
    UserPromptSubmit: [WATCH],
    PreToolUse: [REFUSE],
    PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: './their-formatter.sh' }] }],
  },
};

test('KR10: on, then off, and the file holds what it held', () => {
  const on = withKeySwap(HELD, 'agentwhy');
  assert.ok(runsKeySwap(on));
  const { settings, removed } = withoutKeySwap(on);
  assert.equal(removed, 2);
  assert.deepEqual(settings, HELD);
});

test('KR10: a file that held no hooks holds none again, with no empty key left', () => {
  const { settings } = withoutKeySwap(withKeySwap({ theirs: 1 }, 'npx @agentwhy/cli@0.6.0'));
  assert.deepEqual(settings, { theirs: 1 });
});

test('KR10: the switch is invisible to what says a project is set up, and to refuse and watch', () => {
  const alone = withKeySwap({}, 'agentwhy');
  assert.equal(installedHooks(alone).size, 0);
  assert.equal(hookComplete(alone, 'watch'), false);
  assert.equal(hookComplete(alone, 'refuse'), false);
  const on = withKeySwap(HELD, 'agentwhy');
  assert.deepEqual([...installedHooks(on)].sort(), [...installedHooks(HELD)].sort());
  assert.equal(hookComplete(on, 'watch'), hookComplete(HELD, 'watch'));
  assert.equal(hookComplete(on, 'refuse'), hookComplete(HELD, 'refuse'));
});

test('KR10: what a person left empty stays, and only what the switch held comes out', () => {
  const held = { hooks: { Stop: [], Notification: [{ hooks: [] }] } };
  assert.deepEqual(withoutKeySwap(withKeySwap(held, 'agentwhy')).settings, held);
});

test('U7: a pinned switch in a file of its own still moves with an update, and is said', async () => {
  const { settings, changed, switchFrom } = withHooksPinnedTo(withKeySwap({}, 'npx @agentwhy/cli@0.5.0'), '0.6.0');
  assert.deepEqual(changed, []);
  assert.equal(switchFrom, '0.5.0');
  assert.ok(JSON.stringify(settings).includes('npx @agentwhy/cli@0.6.0 hide-keys'));
});

test('KR1: on every tool, on both events, and a second write adds nothing', () => {
  const on = withKeySwap({}, 'agentwhy') as { hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]> };
  assert.deepEqual(Object.keys(on.hooks), ['PostToolUse', 'PostToolUseFailure']);
  for (const list of Object.values(on.hooks)) {
    assert.equal(list.length, 1);
    assert.equal(list[0]?.matcher, undefined);
    assert.equal(list[0]?.hooks[0]?.command, 'agentwhy hide-keys');
  }
  assert.deepEqual(withKeySwap(on, 'agentwhy'), on);
});

test('a command that only looks like it is left alone, and another tool of that name is not agentwhy', () => {
  const theirs = { hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: './hide-keys' }] }] } };
  assert.equal(runsKeySwap(theirs), false);
  assert.deepEqual(withoutKeySwap(theirs), { settings: theirs, removed: 0 });
});

test('U7: an update keeps the switch on the release of the rest, and with no switch it answers as it did', () => {
  const pinned = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'npx @agentwhy/cli@0.5.0 watch' }] }] } };
  const on = withKeySwap(pinned, 'npx @agentwhy/cli@0.5.0');
  const { settings, changed } = withHooksPinnedTo(on, '0.6.0');
  assert.deepEqual(changed.map((change) => change.hook), ['watch']);
  assert.ok(JSON.stringify(settings).includes('npx @agentwhy/cli@0.6.0 hide-keys'));
  assert.ok(!JSON.stringify(settings).includes('0.5.0'));
  assert.deepEqual(pinnedVersions(on), ['0.5.0'], 'the switch is no hook an update notice counts');
});

async function project(settings?: unknown): Promise<{ readonly dir: string; readonly home: string; readonly file: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'agentwhy-hide-keys-'));
  const home = join(dir, 'home');
  const work = join(dir, 'fictional-shop');
  await mkdir(home);
  await mkdir(join(work, '.claude'), { recursive: true });
  const file = join(work, '.claude', 'settings.local.json');
  if (settings !== undefined) await writeFile(file, `${JSON.stringify(settings, null, 2)}\n`);
  return { dir: work, home, file };
}

test('init --hide-keys and --remove --hide-keys: only the person\'s own file, and nothing else in it', async () => {
  const { dir, home, file } = await project(HELD);
  const env = { HOME: home };
  const on = await runCli(['init', '--hide-keys', '--yes', '--command', 'agentwhy'], { cwd: dir, env });
  assert.equal(on.code, 0, on.stderr);
  assert.ok(runsKeySwap(JSON.parse(await readFile(file, 'utf8'))));
  assert.match(on.stdout, /does not cover a command that fails/);
  const again = await runCli(['init', '--hide-keys', '--yes', '--command', 'agentwhy'], { cwd: dir, env });
  assert.match(again.stdout, /already hides keys/);
  const off = await runCli(['init', '--remove', '--hide-keys', '--yes', '--command', 'agentwhy'], { cwd: dir, env });
  assert.equal(off.code, 0, off.stderr);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), HELD);
  await rm(home, { recursive: true, force: true });
});

test('--hide-keys goes alone', async () => {
  const { dir, home } = await project();
  const run = await runCli(['init', '--hide-keys', '--refuse', '--yes'], { cwd: dir, env: { HOME: home } });
  assert.equal(run.code, 2);
  assert.match(run.stderr, /--hide-keys goes alone/);
});

test('undoing everything takes the switch out too, and naming one hook does not', async () => {
  const { dir, home, file } = await project(withKeySwap(HELD, 'agentwhy'));
  const env = { HOME: home };
  const one = await runCli(['init', '--remove', '--watch', '--yes'], { cwd: dir, env });
  assert.equal(one.code, 0, one.stderr);
  assert.ok(runsKeySwap(JSON.parse(await readFile(file, 'utf8'))));
  const all = await runCli(['init', '--remove', '--yes'], { cwd: dir, env });
  assert.equal(all.code, 0, all.stderr);
  assert.equal(runsKeySwap(JSON.parse(await readFile(file, 'utf8'))), false);
  assert.match(all.stdout, /Hiding keys\s+turned off/, 'the plan names it, since everything else stays');
});

test('a broken file is refused, and stays as it was', async () => {
  const { dir, home, file } = await project();
  await writeFile(file, 'not json');
  const run = await runCli(['init', '--hide-keys', '--yes'], { cwd: dir, env: { HOME: home } });
  assert.equal(run.code, 2);
  assert.equal(await readFile(file, 'utf8'), 'not json');
});

/** A person at a terminal, ticking rows of the list by their place in it. */
async function atTerminal(settings: unknown, ticks: (labels: readonly string[]) => readonly number[]) {
  const { dir, file } = await project(settings);
  const lists: string[][] = [];
  const setup = new ProjectSetup({
    files: new NodeFileSystem(),
    chooser: { choose: async () => 0 },
    hookChooser: {
      chooseMany: async (_heading, rows) => {
        const labels = rows.map((row) => row.label);
        lists.push(labels);
        return [...ticks(labels)];
      },
    },
    asker: { ask: async () => undefined },
    interactive: true,
    workingDirectory: dir,
    home: '/Users/someone',
    invocation: { find: async () => 'agentwhy', version: async () => undefined },
  });
  const result = await setup.run({ protect: [], remove: true, yes: false });
  return { result, file, labels: lists[0] ?? [] };
}

test('at a terminal the switch is a row of its own, last, so that the others still mean what they meant', async () => {
  const { file, labels } = await atTerminal(withKeySwap(HELD, 'agentwhy'), (rows) => [rows.length - 1]);
  assert.match(labels.at(-1) ?? '', /Hide keys/);
  const after = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(runsKeySwap(after), false);
  assert.deepEqual([...installedHooks(after)].sort(), [...installedHooks(HELD)].sort(), 'ticking it alone takes out nothing else');
  assert.deepEqual(after.permissions, HELD.permissions);
});

test('at a terminal, unticked, the switch stays whatever else is ticked', async () => {
  const { file, labels } = await atTerminal(withKeySwap(HELD, 'agentwhy'), (rows) => rows.flatMap((label, at) => (label.includes('Hide keys') ? [] : [at])));
  assert.ok(labels.length > 1);
  assert.ok(runsKeySwap(JSON.parse(await readFile(file, 'utf8'))));
});

test('at a terminal a file holding the switch alone still has something to take out', async () => {
  const { result, file } = await atTerminal(withKeySwap({}, 'agentwhy'), () => [0]);
  assert.equal(result.outcome, 'written');
  assert.equal(runsKeySwap(JSON.parse(await readFile(file, 'utf8'))), false);
});

test('CHD1: the switch writes the project\'s own file and Codex\'s hook, never Copilot\'s, and off leaves Codex\'s for other projects', async () => {
  // A project that runs `refuse`, on a computer with both: what every other write of `init` may follow. Found on a real computer.
  // `2026-11-09-codex-hides-keys.md` CHD1 reverses KR10's "never Codex's" for this switch alone.
  const { dir, home, file } = await project(HELD);
  const codexHooks = join(home, '.codex', 'hooks.json');
  const codexConfig = join(home, '.codex', 'config.toml');
  const copilot = join(home, '.copilot', 'hooks', 'agentwhy.json');
  await mkdir(join(home, '.codex'), { recursive: true });
  await mkdir(join(home, '.copilot', 'hooks'), { recursive: true });
  const check = { matcher: 'Bash', hooks: [{ type: 'command', command: 'agentwhy refuse --codex' }] };
  const copilotText = `${JSON.stringify({ version: 1, hooks: { PreToolUse: [{ type: 'command', command: 'agentwhy refuse --copilot || true', timeoutSec: 30 }] } }, null, 2)}\n`;
  await writeFile(codexHooks, `${JSON.stringify({ hooks: { PreToolUse: [check] } }, null, 2)}\n`);
  await writeFile(codexConfig, 'model = "fictional"\n');
  await writeFile(copilot, copilotText);
  const env = { HOME: home };
  // AO14 tries the hook as Codex will, so it runs this checkout.
  const invoke = `"${process.execPath}" "${fileURLToPath(new URL('../../src/cli.ts', import.meta.url))}"`;

  const on = await runCli(['init', '--hide-keys', '--yes', '--command', invoke], { cwd: dir, env });
  assert.equal(on.code, 0, on.stderr);
  assert.doesNotMatch(on.stdout, /Copilot:/);
  assert.match(on.stdout, /Codex: its hook that hides keys is in ~\/\.codex\/hooks\.json, approved/);
  const written = JSON.parse(await readFile(codexHooks, 'utf8'));
  assert.deepEqual(written.hooks.PreToolUse, [check], 'agentwhy\'s check is left as it was');
  assert.deepEqual(written.hooks.PostToolUse, [{ matcher: 'Bash', hooks: [{ type: 'command', command: `${invoke} hide-keys --codex`, timeout: 30 }] }]);
  const config = await readFile(codexConfig, 'utf8');
  assert.ok(config.startsWith('model = "fictional"\n'));
  assert.match(config, /:post_tool_use:0:0"\]\n.*\ntrusted_hash = "sha256:[0-9a-f]{64}"/);
  assert.equal(await readFile(copilot, 'utf8'), copilotText);

  const off = await runCli(['init', '--remove', '--hide-keys', '--yes', '--command', invoke], { cwd: dir, env });
  assert.equal(off.code, 0, off.stderr);
  assert.match(off.stdout, /stays in ~\/\.codex\/hooks\.json - other projects may have this switch on/);
  assert.deepEqual(JSON.parse(await readFile(codexHooks, 'utf8')), written, 'Codex\'s hook stays for the other projects');
  assert.equal(await readFile(codexConfig, 'utf8'), config);
  assert.equal(await readFile(copilot, 'utf8'), copilotText);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), HELD);

  const codexToo = await runCli(['init', '--remove', '--hide-keys', '--codex', '--yes', '--command', invoke], { cwd: dir, env });
  assert.equal(codexToo.code, 0, codexToo.stderr);
  assert.deepEqual(JSON.parse(await readFile(codexHooks, 'utf8')).hooks.PreToolUse, [check]);
  assert.equal(JSON.parse(await readFile(codexHooks, 'utf8')).hooks.PostToolUse, undefined);
  assert.equal(await readFile(codexConfig, 'utf8'), 'model = "fictional"\n');
  await rm(home, { recursive: true, force: true });
});

test('KR1: a project pinned to an older release gets a line that release can answer, and its other hooks stay', async () => {
  // A release older than this one answers `hide-keys` with a usage error and exit 2, which the AI would read after every call. Found on a project pinned to 0.3.5.
  const older = 'npx @agentwhy/cli@0.3.5';
  const held = { hooks: { Stop: [{ hooks: [{ type: 'command', command: `${older} watch` }] }], PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: `${older} refuse` }] }] } };
  const { dir, home, file } = await project(held);
  const on = await runCli(['init', '--hide-keys', '--yes'], { cwd: dir, env: { HOME: home } });
  assert.equal(on.code, 0, on.stderr);
  const written = JSON.parse(await readFile(file, 'utf8'));
  const line = written.hooks.PostToolUse[0].hooks[0].command as string;
  assert.ok(line.endsWith(' hide-keys'), line);
  assert.ok(!line.includes('0.3.5'), line);
  assert.equal(written.hooks.Stop[0].hooks[0].command, `${older} watch`);
  assert.ok(runsKeySwap(written));
  const off = await runCli(['init', '--remove', '--hide-keys', '--yes'], { cwd: dir, env: { HOME: home } });
  assert.equal(off.code, 0, off.stderr);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), held);
  await rm(home, { recursive: true, force: true });
});

test('KR1: a project on this release or a newer one keeps what it runs', async () => {
  const newer = 'npx @agentwhy/cli@99.0.0';
  const { dir, home, file } = await project({ hooks: { Stop: [{ hooks: [{ type: 'command', command: `${newer} watch` }] }] } });
  const on = await runCli(['init', '--hide-keys', '--yes'], { cwd: dir, env: { HOME: home } });
  assert.equal(on.code, 0, on.stderr);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).hooks.PostToolUse[0].hooks[0].command, `${newer} hide-keys`);
  await rm(home, { recursive: true, force: true });
});
