// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, readFile, realpath, symlink } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli, runNode } from '../helpers/cli.ts';
import { writeSession } from '../helpers/synthetic-session.ts';
import { plainVersion } from '../../src/shared/plain-version.ts';

/**
 * This checkout's own version, which the command run from it reports: `0.0.0-dev` between releases, a release's number
 * from the commit that sets it until the next one. What `init` writes and says follows it (U1, U7), so these tests
 * expect whichever it is rather than one of them.
 */
const VERSION = (JSON.parse(await readFile(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8')) as { version: string }).version;
const RELEASE = plainVersion(VERSION) !== undefined;

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
  const npx = RELEASE ? `npx @agentwhy/cli@${VERSION}` : 'npx @agentwhy/cli';
  assert.equal(settings.hooks.Stop[0]?.hooks[0]?.command, `${npx} watch`);
  assert.ok(result.stdout.includes(`the hooks run "${npx}"`), result.stdout);
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

// `nothing-updates-by-itself` U7, end to end: a checkout between releases has nothing to update to, and one at a
// release finds no hook older than itself in a project that has none.
test('init --update takes no other flag, and from a checkout updates nothing', async (t) => {
  const project = await writeSession(t, {});
  assert.equal((await runCli(['init', '--update', '--watch'], { cwd: project })).code, 2);

  const result = await runCli(['init', '--update', '--yes'], { cwd: project });
  assert.equal(result.code, 0, result.stderr);
  if (RELEASE) assert.ok(result.stdout.includes(`Nothing to update: no hook here runs a release of agentwhy older than ${VERSION}.`), result.stdout);
  else assert.match(result.stdout, /is not a release, so there is nothing to update to/);
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

/*
 * `2026-10-02-codex-approves-its-own-hook.md` AO13: no test touches the person's own files. A child the helper runs
 * with no `HOME` of its own sees a temporary home - never the real one, where `init` will soon write Codex's check.
 */
test('a child given no HOME sees a temporary home, never the real one', async (t) => {
  const folder = await writeSession(t, { 'home.mjs': "import { homedir } from 'node:os'; process.stdout.write(homedir());\n" });

  const seen = (await runNode(join(folder, 'home.mjs'), [])).stdout;
  assert.notEqual(seen, homedir());
  assert.ok((await realpath(seen)).startsWith(await realpath(tmpdir())), seen);
  assert.equal((await runNode(join(folder, 'home.mjs'), [], { env: { HOME: '/Users/someone' } })).stdout, '/Users/someone', 'a test that names one keeps it');
});

// AO13 with AO1: what init knows of Codex comes from the home it is given - with no `.codex` there, nothing for
// Codex; with one, the check lands in that home's own file, tried first (AO14), and never in the project.
test('init reads Codex from the home it is given, and writes the check into that home alone', async (t) => {
  const bare = await writeSession(t, {});
  const withCodex = await writeSession(t, { '.codex/config.toml': '' });
  // The invocation is given whole, so the trial's login shell needs no PATH of this test's making.
  const invoke = `node "${fileURLToPath(new URL('../../src/cli.ts', import.meta.url))}"`;
  for (const [home, codex] of [[bare, false], [withCodex, true]] as const) {
    const project = await writeSession(t, {});
    const result = await runCli(['init', '--refuse', '--yes', '--command', invoke], { cwd: project, env: { HOME: home } });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(await readFile(join(project, '.codex', 'hooks.json'), 'utf8').then(() => true, () => false), false, 'never in the project (AO4)');
    const written = await readFile(join(home, '.codex', 'hooks.json'), 'utf8').then((text) => text, () => undefined);
    assert.equal(written !== undefined, codex, codex ? 'a home with .codex holds the check' : 'a home without .codex: nothing for Codex');
    if (codex) {
      assert.match(written ?? '', /refuse --codex/);
      assert.match(result.stdout, /approved in ~\/\.codex\/config\.toml/);
      assert.match(await readFile(join(home, '.codex', 'config.toml'), 'utf8'), /trusted_hash = "sha256:/);
    }
  }
});
