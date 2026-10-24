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
import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative, sep } from 'node:path';
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

/** A command given `input` on its standard input, as Claude Code hands a hook its event: its exit code and what it said. */
function withInput(command, args, input, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

/**
 * The installed package copied where no `node_modules` is above it, as the npm source installs a plugin (its
 * dependencies only from a lockfile the package does not ship): `refuse` must stop a fictional `cat .env` against a rule
 * of a fictional home's, and `watch` and `session-start` must start and exit 0. Then `claude plugin validate --strict`
 * on the copy, where `claude` is on PATH - and said as skipped where it is not.
 */
async function checkThePlugin(installed, env) {
  const plugin = join(work, 'plugin');
  await cp(installed, plugin, { recursive: true, filter: (path) => !relative(installed, path).split(sep).includes('node_modules') });
  const home = join(work, 'plugin-home');
  await mkdir(join(home, '.claude'), { recursive: true });
  await writeFile(join(home, '.claude', 'settings.json'), JSON.stringify({ permissions: { deny: ['Read(**/.env)', 'Edit(**/.env)'] } }));
  const hooks = JSON.parse(await readFile(join(plugin, 'hooks', 'hooks.json'), 'utf8')).hooks;
  // A project inside a home: `session-start` says nothing in the system's temporary space, where `work` is, but a home
  // there is the person's own (`inTemporarySpace`), so its project is told. That home has no rule of the computer's:
  // where one denies a file the plugin blocks it, and the paragraph says nothing.
  const newHome = join(work, 'plugin-new-home');
  const project = (at) => join(at, 'work', 'shop');
  await mkdir(project(home), { recursive: true });
  await mkdir(project(newHome), { recursive: true });
  const run = (event, input, at = home) => withInput('sh', ['-c', hooks[event][0].hooks[0].command],
    JSON.stringify({ session_id: 's', cwd: project(at), hook_event_name: event, ...input }),
    { cwd: project(at), env: { ...env, HOME: at, CLAUDE_PLUGIN_ROOT: plugin } });

  const refused = await run('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'cat .env' } });
  if (refused.code !== 2 || !refused.stderr.startsWith('agentwhy refused this command')) throw new Error(`the plugin's refuse did not stop cat .env: exit ${refused.code}, ${refused.stderr}`);
  for (const [event, input] of [['Stop', { stop_hook_active: false }], ['SubagentStop', { stop_hook_active: false }]]) {
    const ran = await run(event, input);
    if (ran.code !== 0) throw new Error(`the plugin's ${event} hook exited ${ran.code}: ${ran.stderr}`);
  }
  // AP6: a project nobody set up is told, once, in the paragraph's own words.
  const started = await run('SessionStart', { source: 'startup' }, newHome);
  if (started.code !== 0 || !started.stdout.startsWith('agentwhy, a tool the person installed as a Claude Code plugin')) {
    throw new Error(`the plugin's SessionStart hook did not tell a project nobody set up: exit ${started.code}, ${started.stdout}${started.stderr}`);
  }

  const validated = await execFileAsync('claude', ['plugin', 'validate', '--strict', plugin]).then(
    () => 'and `claude plugin validate --strict` passed it',
    (error) => {
      if (error.code === 'ENOENT') return 'and `claude` is not on PATH, so it was not validated';
      throw new Error(`claude plugin validate --strict refused the plugin: ${error.stdout ?? ''}${error.stderr ?? ''}`);
    },
  );
  return `the plugin, with no dependency beside it, refused cat .env, told a new project at its start and ran its other hooks, ${validated}`;
}

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

  // `.ai/specs/2026-10-15-agentwhy-as-a-plugin.md` AP14, APD2: the plugin as its npm source installs it - the package
  // alone, no dependency beside it - each hook run as `hooks.json` writes it, and the copy validated by Claude Code
  // where `claude` is on PATH.
  const pluginSaid = await checkThePlugin(join(project, 'node_modules', '@agentwhy', 'cli'), env);

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
  process.stdout.write(`${pluginSaid}\n`);
} finally {
  await rm(work, { recursive: true, force: true });
}
