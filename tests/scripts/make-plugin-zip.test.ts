// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { runNode } from '../helpers/cli.ts';

// `.ai/specs/2026-10-15-agentwhy-as-a-plugin.md` §8.3, APD10: the zip the desktop app's Plugins window uploads - the
// packed package in a folder of its own, with the plugin's three files and no path the upload refuses.

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts', 'make-plugin-zip.mjs');
const has = (command: string): Promise<boolean> => execFileAsync('which', [command]).then(() => true, () => false);

test('the zip holds the packed package in agentwhy/, the plugin\'s files among it, and no path with @', async (t) => {
  if (!(await has('zip')) || !(await has('unzip'))) return t.skip('zip and unzip are not on PATH');
  const out = await mkdtemp(join(tmpdir(), 'agentwhy-plugin-zip-test-'));
  t.after(() => rm(out, { recursive: true, force: true }));

  const { version } = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')) as { version: string };
  const zip = join(out, `agentwhy-plugin-${version}.zip`);
  // An earlier run's zip, holding a file this package does not have: it must not survive into the new one.
  await mkdir(join(out, 'agentwhy'), { recursive: true });
  await writeFile(join(out, 'agentwhy', 'stale.txt'), 'from an earlier run\n');
  await execFileAsync('zip', ['-q', '-r', zip, 'agentwhy'], { cwd: out });
  await rm(join(out, 'agentwhy'), { recursive: true });

  const { code, stdout, stderr } = await runNode(SCRIPT, ['--out', out], { cwd: ROOT });
  assert.equal(code, 0, stderr);
  assert.match(stdout, new RegExp(`^wrote ${zip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: \\d+ files in agentwhy/`));

  const { stdout: listing } = await execFileAsync('unzip', ['-Z1', zip]);
  const paths = listing.trim().split('\n');
  for (const path of ['agentwhy/.claude-plugin/plugin.json', 'agentwhy/hooks/hooks.json', 'agentwhy/skills/report/SKILL.md', 'agentwhy/dist/cli.js', 'agentwhy/package.json']) {
    assert.ok(paths.includes(path), path);
  }
  assert.deepEqual(paths.filter((path) => !path.startsWith('agentwhy/')), [], 'everything in the one folder');
  assert.deepEqual(paths.filter((path) => path.includes('@') || path.includes('node_modules')), []);
  assert.equal(paths.includes('agentwhy/.claude-plugin/marketplace.json'), false, 'the marketplace is the repository\'s, not the plugin\'s');
  assert.equal(paths.includes('agentwhy/stale.txt'), false, 'an earlier zip is replaced, not added to');
});
