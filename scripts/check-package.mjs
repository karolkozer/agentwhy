// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
// Packs this project, installs the tarball into an empty project outside the repository, and runs the installed
// command - the way a stranger meets it (`specs/2026-09-16-worth-running-every-day.md` R1-R3). `dist/` run in place
// proves nothing about the tarball: a module left out of `files` is still on disk here.
//
//   node scripts/check-package.mjs                       # the Node running this script
//   node scripts/check-package.mjs --node /path/to/node  # another Node, to measure the engines floor
//
// A Node under the floor is measured as a hook's shell would meet it (`.ai/specs/2026-10-13-the-node-a-hook-finds.md`
// NF1-NF3): first on PATH with this script's own after it, where the newer one runs every step; and then alone, where
// it says the floor in one line, or - from the Node the dependency runs on - goes on as it did.
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { floorVerdict } from '../src/shared/node-floor.ts';
import { cell, cellOutput, command, item, meta, ROOT as CODEX_ROOT, rolloutPath, said, TURN, turnContext } from '../tests/helpers/codex-session.ts';
import { assistantMessage, records, SESSION as COPILOT_SESSION, sessionStart, toolResult, toolStart, userMessage, workspaceYaml } from '../tests/helpers/copilot-session.ts';

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));

const { values } = parseArgs({ options: { node: { type: 'string' } } });
const node = values.node ?? process.execPath;
// A Node named to be measured stands first on PATH, as the one a shell would find; this script's own comes after it.
const env = values.node === undefined ? process.env : { ...process.env, PATH: [dirname(node), dirname(process.execPath), process.env.PATH ?? ''].join(delimiter) };

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
  const { stdout } = await execFileAsync(node, [bin, '--help'], { cwd: project, env });
  if (!stdout.includes('Usage: agentwhy check')) throw new Error('the installed command did not print its usage');

  // The shim npm links is what `npx @agentwhy/cli` runs; it must start with the Node on PATH, not with this script's.
  const { stdout: shim } = await execFileAsync(join(project, 'node_modules', '.bin', 'agentwhy'), ['--help'], { cwd: project, env });
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
  const { stdout: doctor } = await execFileAsync(node, [bin, 'doctor', '--input', codex], { cwd: project, env });
  if (!doctor.includes('agentwhy doctor · Codex')) throw new Error('the installed doctor did not read a Codex rollout as Codex');
  const { stdout: report } = await execFileAsync(node, [bin, 'report', '--input', codex, '--width', '100'], { cwd: project, env });
  if (!report.includes('· Codex')) throw new Error('the installed report did not read a Codex rollout as Codex');

  // The Copilot adapter and its contract too (`.ai/plans/2026-10-09-what-copilot-wrote.md` step 7): a fictional session's
  // folder, recognised by its first line and read by `doctor` and `report`.
  const copilot = join(project, 'copilot', COPILOT_SESSION);
  await mkdir(copilot, { recursive: true });
  await writeFile(join(copilot, 'events.jsonl'), records(COPILOT_SESSION,
    sessionStart(COPILOT_SESSION, { context: { cwd: project } }), userMessage('List the files.'),
    toolStart('call_a', 'bash', { command: 'ls' }), toolResult('call_a', 'README.md\n<shellId: 1 completed with exit code 0>', { exitCode: 0 }),
    assistantMessage('Listed.'),
  ));
  await writeFile(join(copilot, 'workspace.yaml'), workspaceYaml({ id: COPILOT_SESSION, cwd: project, name: 'List the files' }));
  const { stdout: copilotDoctor } = await execFileAsync(node, [bin, 'doctor', '--input', copilot], { cwd: project });
  if (!copilotDoctor.includes('agentwhy doctor · Copilot')) throw new Error('the installed doctor did not read a Copilot session as Copilot');
  const { stdout: copilotReport } = await execFileAsync(node, [bin, 'report', '--input', copilot, '--width', '100'], { cwd: project });
  if (!copilotReport.includes('· Copilot')) throw new Error('the installed report did not read a Copilot session as Copilot');

  // NF3: the same Node with nothing newer in reach.
  const verdict = floorVerdict(version);
  let floor = '';
  if (verdict !== 'runs') {
    const alone = await execFileAsync(node, [bin, '--help'], { cwd: project, env: { ...process.env, PATH: dirname(node) } })
      .then((ran) => ({ code: 0, stdout: ran.stdout, stderr: ran.stderr }), (error) => ({ code: error.code, stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? '') }));
    if (verdict === 'cannot-load') {
      const said = `agentwhy needs Node 22 or newer: this shell runs Node ${version.trim().replace(/^v/, '')} (`;
      if (alone.code !== 1 || !alone.stderr.startsWith(said) || alone.stderr.trimEnd().includes('\n')) throw new Error(`a Node that cannot load the package did not say the floor in one line and exit 1: exit ${alone.code}, ${alone.stderr}`);
      floor = '; under the floor - a newer Node on PATH ran it, and alone it said the floor in one line and exited 1';
    } else {
      if (!alone.stdout.includes('Usage: agentwhy check')) throw new Error(`a Node the dependency runs on did not go on as before: exit ${alone.code}, ${alone.stderr}`);
      floor = '; under the floor - a newer Node on PATH ran it, and alone it went on, unsupported';
    }
  }

  process.stdout.write(`installed ${tarball} and ran it on Node ${version.trim()}; doctor and report read a Codex rollout and a Copilot session${floor}\n`);
} finally {
  await rm(work, { recursive: true, force: true });
}
