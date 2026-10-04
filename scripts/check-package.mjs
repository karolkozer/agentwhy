// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
// Packs this project, installs the tarball into an empty project outside the repository, and runs the installed
// command - the way a stranger meets it (`specs/2026-09-16-worth-running-every-day.md` R1-R3). `dist/` run in place
// proves nothing about the tarball: a module left out of `files` is still on disk here.
//
//   node scripts/check-package.mjs                       # the Node running this script
//   node scripts/check-package.mjs --node /path/to/node  # another Node, to measure the engines floor
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { cell, cellOutput, command, item, meta, ROOT as CODEX_ROOT, rolloutPath, said, TURN, turnContext } from '../tests/helpers/codex-session.ts';

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));

const { values } = parseArgs({ options: { node: { type: 'string' } } });
const node = values.node ?? process.execPath;

const work = await mkdtemp(join(tmpdir(), 'agentwhy-package-'));
try {
  // `npm pack` runs `prepack`, which builds: a tarball without a build cannot be made.
  await execFileAsync('npm', ['pack', '--pack-destination', work], { cwd: ROOT });
  const tarball = (await readdir(work)).find((name) => name.endsWith('.tgz'));
  if (tarball === undefined) throw new Error('npm pack wrote no tarball');

  const project = join(work, 'project');
  await mkdir(project);
  await writeFile(join(project, 'package.json'), '{ "name": "agentwhy-package-check", "private": true }\n');
  await execFileAsync('npm', ['install', '--no-audit', '--no-fund', join(work, tarball)], { cwd: project });

  const bin = join(project, 'node_modules', '@agentwhy', 'cli', 'dist', 'cli.js');
  const { stdout: version } = await execFileAsync(node, ['--version']);
  const { stdout } = await execFileAsync(node, [bin, '--help'], { cwd: project });
  if (!stdout.includes('Usage: agentwhy check')) throw new Error('the installed command did not print its usage');

  // The shim npm links is what `npx @agentwhy/cli` runs; it must start with the Node on PATH, not with this script's.
  const { stdout: shim } = await execFileAsync(join(project, 'node_modules', '.bin', 'agentwhy'), ['--help'], { cwd: project });
  if (!shim.includes('Usage: agentwhy init')) throw new Error('the linked bin did not print its usage');

  // The Codex adapter and its contract run from the tarball, not only load (`.ai/plans/2026-09-29-what-codex-wrote.md`
  // step 9): a fictional rollout, recognised by its first line and read by `doctor` and `report`.
  const codex = join(project, rolloutPath(CODEX_ROOT));
  await mkdir(dirname(codex), { recursive: true });
  const output = 'README.md\n';
  await writeFile(codex, [
    meta(CODEX_ROOT), turnContext(TURN),
    cell('call_a', 'const r = await tools.exec_command({ cmd: "ls" }); text(r.output)'),
    item(CODEX_ROOT, command('exec_a', 'ls', output)), cellOutput('call_a', output), said('msg_1', 'final_answer', 'Listed.'),
  ].map((line) => JSON.stringify(line)).join('\n') + '\n');
  const { stdout: doctor } = await execFileAsync(node, [bin, 'doctor', '--input', codex], { cwd: project });
  if (!doctor.includes('agentwhy doctor · Codex')) throw new Error('the installed doctor did not read a Codex rollout as Codex');
  const { stdout: report } = await execFileAsync(node, [bin, 'report', '--input', codex, '--width', '100'], { cwd: project });
  if (!report.includes('· Codex')) throw new Error('the installed report did not read a Codex rollout as Codex');

  process.stdout.write(`installed ${tarball} and ran it on Node ${version.trim()}; doctor and report read a Codex rollout\n`);
} finally {
  await rm(work, { recursive: true, force: true });
}
