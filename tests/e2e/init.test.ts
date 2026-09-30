import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, readFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from '../helpers/cli.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

/**
 * A `PATH` that finds this checkout as `agentwhy`, the way a global link does, or finds no agentwhy at all: what the
 * hooks `init` writes run depends on it (`a-hook-runs-what-you-ran` J2), so every test that reads a command sets it.
 */
async function pathWith(project: string, installed: boolean): Promise<string> {
  const bin = join(project, 'bin');
  await mkdir(bin);
  if (installed) await symlink(fileURLToPath(new URL('../../src/cli.ts', import.meta.url)), join(bin, 'agentwhy'));
  return bin;
}

// worth-running-every-day R4, R7, R8, run the way a person runs it from a project directory.
test('init --yes installs the hooks, and the hook it installed then refuses a protected read', async (t) => {
  const project = await writeSession(t, { '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(./config/vault/**)'] } }) });

  const installed = await runCli(['init', '--refuse', '--yes'], { cwd: project, env: { PATH: await pathWith(project, true) } });
  assert.equal(installed.code, 0, installed.stderr);

  const settings = JSON.parse(await readFile(join(project, '.claude', 'settings.local.json'), 'utf8')) as {
    hooks: { PreToolUse: { hooks: { command: string }[] }[] };
  };
  const command = settings.hooks.PreToolUse[0]?.hooks[0]?.command ?? '';
  assert.equal(command, 'agentwhy refuse --settings "$CLAUDE_PROJECT_DIR/.claude/settings.json"');

  // The command as Claude Code would expand it.
  const args = ['refuse', '--settings', join(project, '.claude', 'settings.json')];
  const input = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'cat config/vault/prod.key' } });
  assert.equal((await runCli(args, { input })).code, 2);
});

// J2: run by something that is not the agentwhy on PATH - npx, as a person following the README runs it.
test('init run where no agentwhy is on PATH writes hooks that run it through npx', async (t) => {
  const project = await writeSession(t, {});

  const result = await runCli(['init', '--yes'], { cwd: project, env: { PATH: await pathWith(project, false) } });

  assert.equal(result.code, 0, result.stderr);
  const settings = JSON.parse(await readFile(join(project, '.claude', 'settings.local.json'), 'utf8')) as {
    hooks: { Stop: { hooks: { command: string }[] }[] };
  };
  assert.equal(settings.hooks.Stop[0]?.hooks[0]?.command, 'npx @agentwhy/cli watch');
  assert.match(result.stdout, /the hooks run "npx @agentwhy\/cli"/);
});

test('init without --yes, not at a terminal, writes nothing and exits 0', async (t) => {
  const project = await writeSession(t, {});

  const result = await runCli(['init'], { cwd: project });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Nothing was written/);
  await assert.rejects(readFile(join(project, '.claude', 'settings.local.json')));
});

test('init refuses an empty --command as a usage error, now that it has no default', async (t) => {
  const result = await runCli(['init', '--command', '  ', '--yes'], { cwd: await writeSession(t, {}) });
  assert.equal(result.code, 2);
  assert.match(result.stderr + result.stdout, /--command is empty/);
});

// `nothing-updates-by-itself` U7, end to end: this checkout is no release, so there is nothing to update to.
test('init --update takes no other flag, and from a checkout says it is not a release', async (t) => {
  const project = await writeSession(t, {});
  assert.equal((await runCli(['init', '--update', '--watch'], { cwd: project })).code, 2);

  const result = await runCli(['init', '--update', '--yes'], { cwd: project });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /is not a release, so there is nothing to update to/);
  await assert.rejects(readFile(join(project, '.claude', 'settings.local.json')));
});

test('init refuses --protect together with --remove as a usage error', async (t) => {
  const result = await runCli(['init', '--remove', '--protect', '*.pem'], { cwd: await writeSession(t, {}) });
  assert.equal(result.code, 2);
});

// R4b, R4c off a terminal: the flags are the whole interface, and a pattern reaches the deny list.
test('init --refuse --protect installs that hook alone and denies the pattern for Read and Edit', async (t) => {
  const project = await writeSession(t, {});

  const result = await runCli(['init', '--refuse', '--protect', 'config/creds.json', '--yes'], { cwd: project });

  assert.equal(result.code, 0, result.stderr);
  const settings = JSON.parse(await readFile(join(project, '.claude', 'settings.local.json'), 'utf8')) as {
    hooks: Record<string, unknown>;
    permissions: { deny: string[] };
  };
  assert.deepEqual(Object.keys(settings.hooks), ['PreToolUse']);
  assert.deepEqual(settings.permissions.deny, ['Read(config/creds.json)', 'Edit(config/creds.json)']);
  // The rule it wrote is the one its own hook then reads.
  const args = ['refuse', '--settings', join(project, '.claude', 'settings.local.json')];
  const input = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'cat config/creds.json' } });
  assert.equal((await runCli(args, { input })).code, 2);
});
