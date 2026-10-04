// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { NodeAgentwhyInvocation } from '../../src/infrastructure/node-agentwhy-invocation.ts';

/** The published way: pinned to a release (`nothing-updates-by-itself` U1), unpinned where there is none to pin to. */
const NPX = 'npx @agentwhy/cli';
const pinned = (version: string): string => `${NPX}@${version}`;

/**
 * The layouts of `a-hook-runs-what-you-ran` J2, on disk: a global install with its bin, a checkout with a link to it,
 * an `npx` cache laid out as JB2 measured it, a broken link, and an empty directory.
 */
async function layouts(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'agentwhy-invocation-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const bin = async (link: string, target: string): Promise<void> => {
    await mkdir(dirname(link), { recursive: true });
    await symlink(target, link);
  };
  const cli = async (packageRoot: string, version: string): Promise<string> => {
    await mkdir(join(packageRoot, 'dist'), { recursive: true });
    await mkdir(join(packageRoot, 'src'), { recursive: true });
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: '@agentwhy/cli', version }) + '\n');
    await writeFile(join(packageRoot, 'src', 'cli.ts'), '');
    const file = join(packageRoot, 'dist', 'cli.js');
    await writeFile(file, '#!/usr/bin/env node\n');
    await chmod(file, 0o755);
    return file;
  };

  const global = join(root, 'global');
  await bin(join(global, 'bin', 'agentwhy'), await cli(join(global, 'lib', 'node_modules', '@agentwhy', 'cli'), '0.2.0'));
  const checkout = join(root, 'checkout');
  await bin(join(root, 'linked', 'agentwhy'), await cli(checkout, '0.0.0-dev'));
  const npxBin = join(root, 'npm', '_npx', 'aa592f986900a9c4', 'node_modules', '.bin');
  await bin(join(npxBin, 'agentwhy'), await cli(join(root, 'npm', '_npx', 'aa592f986900a9c4', 'node_modules', '@agentwhy', 'cli'), '0.3.0'));
  await bin(join(root, 'broken', 'agentwhy'), join(root, 'nowhere', 'cli.js'));
  await mkdir(join(root, 'code', 'agentwhy'), { recursive: true });
  await mkdir(join(root, 'plain'));
  const unreadable = join(root, 'unreadable');
  await mkdir(join(unreadable, 'dist'), { recursive: true });
  await writeFile(join(unreadable, 'package.json'), 'not json');
  await writeFile(join(unreadable, 'dist', 'cli.js'), '');

  return {
    globalBin: join(global, 'bin'),
    globalScript: join(global, 'bin', 'agentwhy'),
    linked: join(root, 'linked'),
    checkoutSource: join(checkout, 'src', 'cli.ts'),
    npxBin,
    npxScript: join(npxBin, 'agentwhy'),
    broken: join(root, 'broken'),
    /** A directory holding a folder named agentwhy, the way a folder of checkouts does. */
    code: join(root, 'code'),
    plain: join(root, 'plain'),
    checkoutScript: join(checkout, 'dist', 'cli.js'),
    unreadableScript: join(unreadable, 'dist', 'cli.js'),
  };
}

const find = (script: string | undefined, path: readonly string[] | undefined, platform = 'darwin'): Promise<string> =>
  new NodeAgentwhyInvocation({ script, path: path?.join(delimiter), platform }).find();

// J2, one row of its table each.
test('run from a global install, the hooks run agentwhy', async (t) => {
  const at = await layouts(t);
  assert.equal(await find(at.globalScript, [at.plain, at.globalBin]), 'agentwhy');
});

test('run from a checkout, through its link or as its source, the hooks run agentwhy', async (t) => {
  const at = await layouts(t);
  assert.equal(await find(join(at.linked, 'agentwhy'), [at.linked]), 'agentwhy');
  assert.equal(await find(at.checkoutSource, [at.linked]), 'agentwhy');
});

test('run through npx with nothing installed, the agentwhy npx put on PATH is not taken for an installed one', async (t) => {
  const at = await layouts(t);
  // JB2: npx puts its own bin first; it is gone once npx exits, and so is every hook written from it.
  assert.equal(await find(at.npxScript, [at.npxBin, at.plain]), pinned('0.3.0'));
});

test('run through npx with another copy installed, the hooks run what was run', async (t) => {
  const at = await layouts(t);
  assert.equal(await find(at.npxScript, [at.npxBin, at.globalBin]), pinned('0.3.0'));
});

test('the first agentwhy on PATH decides, and a broken link or a folder is passed over', async (t) => {
  const at = await layouts(t);
  // A hook's shell runs the checkout's copy here, not the global one this process is.
  assert.equal(await find(at.globalScript, [at.linked, at.globalBin]), pinned('0.2.0'));
  assert.equal(await find(at.globalScript, [at.broken, at.globalBin]), 'agentwhy');
  // Found by a review: a directory passes X_OK, and a shell looking a command up skips it.
  assert.equal(await find(at.globalScript, [at.code, at.globalBin]), 'agentwhy');
});

// J3: what nothing here has measured, or cannot look at, is the form that works wherever npx does.
test('Windows, no PATH, and a script that is not there give the npx form', async (t) => {
  const at = await layouts(t);
  assert.equal(await find(at.globalScript, [at.globalBin], 'win32'), pinned('0.2.0'));
  assert.equal(await find(at.globalScript, undefined), pinned('0.2.0'));
  assert.equal(await find(undefined, [at.globalBin]), NPX);
  assert.equal(await find(join(at.plain, 'missing.js'), [at.globalBin]), NPX);
});

// `nothing-updates-by-itself` U1: a release is pinned; a version on no registry is not written, and neither is a guess.
test('the npx form is pinned to a release, and left unpinned where the version is not one or cannot be read', async (t) => {
  const at = await layouts(t);
  assert.equal(await find(at.checkoutScript, [at.plain]), NPX);
  assert.equal(await find(at.unreadableScript, [at.plain]), NPX);
});

test('the version is the running package\'s own, as its package.json says', async (t) => {
  const at = await layouts(t);
  const version = (script: string | undefined): Promise<string | undefined> =>
    new NodeAgentwhyInvocation({ script, path: undefined, platform: 'darwin' }).version();
  assert.equal(await version(at.globalScript), '0.2.0');
  assert.equal(await version(at.npxScript), '0.3.0');
  assert.equal(await version(at.checkoutSource), '0.0.0-dev');
  assert.equal(await version(at.unreadableScript), undefined);
  assert.equal(await version(undefined), undefined);
});
