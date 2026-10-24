// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
// The agentwhy plugin as one zip, for the Claude desktop app's Plugins window (**Add > Upload plugin**, the account
// route) and for a plugin directory that takes an archive (`.ai/specs/2026-10-15-agentwhy-as-a-plugin.md` §8.3, APD10).
// It is made from the tarball `npm pack` makes - the package a stranger installs, never this working tree - with the
// package's folder inside the zip named `agentwhy`, and no `node_modules`: the upload refuses a path with `@`, and
// `dist/` runs without its dependency (APD2).
//
//   node scripts/make-plugin-zip.mjs                 # writes agentwhy-plugin-<version>.zip in this folder
//   node scripts/make-plugin-zip.mjs --out <dir>     # into another folder
//
// It needs `tar` and `zip` on PATH.
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FOLDER = 'agentwhy';
/** The three files that make the package a plugin (§5): without one, the zip would be a package and no plugin. */
const PLUGIN = ['.claude-plugin/plugin.json', 'hooks/hooks.json', 'skills/report/SKILL.md'];

const { values } = parseArgs({ options: { out: { type: 'string' } } });
const out = resolve(values.out ?? process.cwd());

/** Every file under `directory`, as a path relative to it with `/` between its parts. */
async function filesIn(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => relative(directory, join(entry.parentPath, entry.name)).split(sep).join('/'));
}

const work = await mkdtemp(join(tmpdir(), 'agentwhy-plugin-zip-'));
try {
  // `npm pack` runs `prepack`, which builds: the zip holds what the published package holds.
  await execFileAsync('npm', ['pack', '--pack-destination', work], { cwd: ROOT });
  const tarball = (await readdir(work)).find((name) => name.endsWith('.tgz'));
  if (tarball === undefined) throw new Error('npm pack wrote no tarball');
  await execFileAsync('tar', ['-xzf', tarball], { cwd: work });
  await rename(join(work, 'package'), join(work, FOLDER));

  const files = await filesIn(join(work, FOLDER));
  const missing = PLUGIN.filter((path) => !files.includes(path));
  if (missing.length > 0) throw new Error(`the package is no plugin: it holds no ${missing.join(', ')}`);
  const refused = files.filter((path) => path.includes('@') || path.split('/').includes('node_modules'));
  if (refused.length > 0) throw new Error(`the upload refuses these paths: ${refused.join(', ')}`);

  const { version } = JSON.parse(await readFile(join(work, FOLDER, 'package.json'), 'utf8'));
  const zip = join(out, `agentwhy-plugin-${version}.zip`);
  // `zip` adds to an archive already there, so one of an earlier run would keep files this package no longer has.
  await rm(zip, { force: true });
  // -X leaves out the file attributes a zip carries for one system alone; the folder goes in whole.
  await execFileAsync('zip', ['-q', '-r', '-X', zip, FOLDER], { cwd: work });
  process.stdout.write(`wrote ${zip}: ${files.length} files in ${FOLDER}/, the plugin's manifest, hooks and skill among them\n`);
} finally {
  await rm(work, { recursive: true, force: true });
}
