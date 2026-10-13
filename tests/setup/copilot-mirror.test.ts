// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeFileSystem } from '../../src/infrastructure/node-file-system.ts';
import type { Chooser } from '../../src/ports/chooser.ts';
import type { Trial, TrialOutcome } from '../../src/ports/command-trial.ts';
import { CodexMirror } from '../../src/setup/codex-mirror.ts';
import { CopilotMirror } from '../../src/setup/copilot-mirror.ts';
import { ProjectSetup, type SetupOptions } from '../../src/setup/project-setup.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

// `2026-10-09-copilot-blocks-too.md` CB9, CB19, CBD9 and the plan's step 3: Copilot's check in the person's own
// `~/.copilot/hooks/agentwhy.json`, written after Claude Code's settings, tried first and only with consent.
const REFUSE: SetupOptions = { hooks: ['refuse'], protect: [], remove: false, yes: true };
const COPILOT_ALONE: SetupOptions = { protect: [], remove: false, yes: true, copilot: true };
/** This agentwhy as the composition root names it: its Node and its script, absolute, one shell word each. */
const OWN = "'/Users/someone/.local/node/bin/node' '/Users/someone/.local/lib/agentwhy/dist/cli.js'";
const OWN_COMMAND = `${OWN} refuse --copilot || agentwhy refuse --copilot || true`;

interface World {
  /** Whether Copilot is used on this computer. These tests default to yes. */
  readonly computer?: boolean;
  readonly interactive?: boolean;
  /** What each question at the terminal is answered: 0 yes, else no. */
  readonly answers?: readonly number[];
  /** What each trial answers, in order; the default is ran, exit 0. `null` is a mirror built with no trial. */
  readonly trials?: readonly TrialOutcome[] | null;
  /** Absent: this agentwhy cannot say where its Node and script are. */
  readonly own?: string | null;
  /** Codex's mirror between the two, as `init` builds it. */
  readonly withCodex?: boolean;
  /** A page's route: Copilot written only where a run names it. */
  readonly onlyWhenNamed?: boolean;
}

function mirrorIn(root: string, home: string, world: World = {}) {
  const asked: string[] = [];
  const tried: Trial[] = [];
  const answers = [...(world.answers ?? [])];
  const outcomes = [...(world.trials === null ? [] : world.trials ?? [])];
  const chooser: Chooser = { choose: async (heading) => (asked.push(heading), answers.shift()) };
  const files = new NodeFileSystem();
  const invocation = { find: async () => 'agentwhy', version: async () => undefined };
  const trial = world.trials === null ? {} : {
    trial: { run: async (each: Trial) => (tried.push(each), outcomes.shift() ?? { kind: 'ran' as const, exitCode: 0, stderr: '' }) },
  };
  const project = new ProjectSetup({
    files, chooser, hookChooser: { chooseMany: async () => undefined }, asker: { ask: async () => undefined },
    interactive: world.interactive ?? false, workingDirectory: root, home, invocation,
  });
  const setup = world.withCodex === true
    ? new CodexMirror({ setup: project, files, chooser, interactive: false, workingDirectory: root, home, invocation, codexOnThisComputer: async () => true, ...trial, trialFolder: root })
    : project;
  const mirror = new CopilotMirror({
    setup,
    files,
    chooser,
    interactive: world.interactive ?? false,
    workingDirectory: root,
    home,
    copilotOnThisComputer: async () => world.computer ?? true,
    ...(world.own === null ? {} : { ownInvocation: world.own ?? OWN }),
    ...trial,
    trialFolder: root,
    ...(world.onlyWhenNamed === undefined ? {} : { onlyWhenNamed: world.onlyWhenNamed }),
  });
  return { mirror, asked, tried };
}

/** A home directory whose `.copilot` folder exists, as every Copilot computer's does - its `hooks` folder not yet. */
async function homeWith(t: Parameters<typeof writeSession>[0], files: Readonly<Record<string, string>> = {}): Promise<string> {
  return writeSession(t, { '.copilot/config.json': '{}\n', ...files });
}

const HOOK_FILE = ['.copilot', 'hooks', 'agentwhy.json'] as const;
const hookFile = async (home: string): Promise<unknown> => JSON.parse(await readFile(join(home, ...HOOK_FILE), 'utf8'));
const exists = async (path: string): Promise<boolean> => readFile(path).then(() => true, () => false);
const ours = (command = OWN_COMMAND) => ({ version: 1, hooks: { PreToolUse: [{ type: 'command', command, timeoutSec: 30 }] } });
/** A project whose Claude Code settings already run `refuse`. */
const REFUSING = { '.claude/settings.local.json': JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'agentwhy refuse' }] }] } }) };

test('installing refuse tries the check, writes agentwhy\'s one entry by absolute paths, and a second run changes nothing', async (t) => {
  const root = await writeSession(t, {});
  const home = await homeWith(t, { '.copilot/hooks/mine.json': '{"version":1,"hooks":{}}\n' });
  const { mirror, tried } = mirrorIn(root, home);

  const first = await mirror.run(REFUSE);
  assert.equal(first.outcome, 'written');
  assert.deepEqual(await hookFile(home), ours(), 'one entry, agentwhy on PATH where it is gone, failing open, a 30 second wait (CBD9, CB17)');
  assert.deepEqual(tried.map((each) => each.commandLine), [`${OWN} refuse --copilot`], 'tried without its fallback, which would hide a failure');
  assert.deepEqual(JSON.parse(tried[0]?.input ?? ''), { hook_event_name: 'PreToolUse', cwd: root, tool_name: 'Bash', tool_input: { command: 'true' } });
  assert.match(first.output, /Copilot: agentwhy's check is in ~\/\.copilot\/hooks\/agentwhy\.json\. Copilot - in the terminal, its desktop app and VS Code - then refuses a call that would open a blocked file/);
  assert.match(first.output, /Not covered: MCP tools, a blocked file's name in a listing, and a file VS Code hands Copilot itself - one open in the editor or attached to a question\./);
  assert.equal(await readFile(join(home, '.copilot', 'hooks', 'mine.json'), 'utf8'), '{"version":1,"hooks":{}}\n', "the person's own hook file is untouched");

  const second = await mirror.run(REFUSE);
  assert.equal(second.outcome, 'unchanged');
  assert.doesNotMatch(second.output, /Copilot/);
  assert.equal(tried.length, 1, 'nothing to try where nothing changes');
});

test('--command is the person\'s own word for agentwhy, and is what the check runs', async (t) => {
  const root = await writeSession(t, {});
  const home = await homeWith(t);
  await mirrorIn(root, home).mirror.run({ ...REFUSE, invoke: 'npx @agentwhy/cli@1.2.3' });
  assert.deepEqual(await hookFile(home), ours('npx @agentwhy/cli@1.2.3 refuse --copilot || agentwhy refuse --copilot || true'));
});

test('a computer without Copilot is written nothing, and no folder is made; asked by name, it is said', async (t) => {
  const root = await writeSession(t, {});
  const home = await writeSession(t, {});
  const { mirror } = mirrorIn(root, home, { computer: false });

  const result = await mirror.run(REFUSE);
  assert.equal(result.outcome, 'written');
  assert.doesNotMatch(result.output, /Copilot/);
  assert.deepEqual(await readdir(home), [], 'nothing in the home directory');

  const alone = await mirror.run(COPILOT_ALONE);
  assert.equal(alone.outcome, 'refused');
  assert.equal(alone.output, 'Copilot: there is no ~/.copilot folder, so Copilot is not used on this computer and nothing was written for it.\n');
});

test('init --copilot alone: written where refuse runs here, and said where it does not', async (t) => {
  const home = await homeWith(t);
  const plain = await writeSession(t, {});
  const nothing = await mirrorIn(plain, home).mirror.run(COPILOT_ALONE);
  assert.equal(nothing.outcome, 'unchanged');
  assert.match(nothing.output, /^Copilot: nothing to write\. agentwhy blocks Copilot where refuse runs, and refuse doesn't run here yet: agentwhy init --refuse --copilot\n$/);
  assert.equal(await exists(join(home, ...HOOK_FILE)), false);

  const refusing = await writeSession(t, REFUSING);
  const { mirror } = mirrorIn(refusing, home);
  assert.equal((await mirror.run(COPILOT_ALONE)).outcome, 'written');
  assert.deepEqual(await hookFile(home), ours());
  assert.equal(await readFile(join(refusing, '.claude', 'settings.local.json'), 'utf8'), REFUSING['.claude/settings.local.json'], "Claude Code's settings are not touched");
  assert.match((await mirror.run(COPILOT_ALONE)).output, /^Copilot: ~\/\.copilot\/hooks\/agentwhy\.json already runs agentwhy's check\./);
});

test('a file of that name agentwhy did not write is never rewritten or removed', async (t) => {
  for (const [text, says] of [
    ['{"version":1,"hooks":{"PreToolUse":[{"type":"command","command":"my-guard check"}]}}\n', /holds something agentwhy did not write, so it was left as it is/],
    ['{"version":1,"hooks":{"PreToolUse":[{"type":"command","command":"agentwhy refuse --copilot || true"},{"type":"command","command":"my-guard"}]}}\n', /holds something agentwhy did not write/],
    ['{"version":1,"hooks":{"PreToolUse":[{"type":"command","command":"agentwhy refuse --copilot"}],"PostToolUse":[]}}\n', /holds something agentwhy did not write/],
    ['not json', /is not a JSON object, so agentwhy's check was not written to it/],
  ] as const) {
    // A project of its own each time: the remove below takes this one's refuse out.
    const root = await writeSession(t, REFUSING);
    const home = await homeWith(t, { '.copilot/hooks/agentwhy.json': text });
    const { mirror } = mirrorIn(root, home);
    const installed = await mirror.run(COPILOT_ALONE);
    assert.equal(installed.outcome, 'refused', text);
    assert.match(installed.output, says, text);
    const removed = await mirror.run({ ...COPILOT_ALONE, remove: true });
    assert.equal(removed.outcome, 'refused', 'Copilot was named, and its part was refused: exit 2 (decided 2026-10-12)');
    assert.match(removed.output, /Removed: 1 hook command\./, "the project's own remove ran and is said");
    assert.match(removed.output, /Copilot: ~\/\.copilot\/hooks\/agentwhy\.json (holds something agentwhy did not write|could not be read), so it was left as it is/, text);
    assert.equal(await readFile(join(home, ...HOOK_FILE), 'utf8'), text, text);
  }
});

test('a check that fails its trial, or cannot be tried, is not written', async (t) => {
  const root = await writeSession(t, REFUSING);
  for (const [world, says] of [
    [{ trials: [{ kind: 'ran', exitCode: 1, stderr: 'boom' }] }, /"'\/Users\/someone\/\.local\/node\/bin\/node' '\/Users\/someone\/\.local\/lib\/agentwhy\/dist\/cli\.js' refuse --copilot" exited with code 1 \(boom\) when tried as a hook, so nothing was written/],
    [{ trials: [{ kind: 'not-started', reason: 'ENOENT' }] }, /could not be started \(ENOENT\), so nothing was written/],
    [{ trials: null }, /agentwhy could not try the check before writing it, so nothing was written/],
    [{ own: null }, /agentwhy could not tell where its own Node and script are, so nothing was written\. Name how to run agentwhy with --command/],
  ] as const) {
    const home = await homeWith(t);
    const result = await mirrorIn(root, home, world).mirror.run(COPILOT_ALONE);
    assert.equal(result.outcome, 'refused');
    assert.match(result.output, says);
    assert.equal(await exists(join(home, ...HOOK_FILE)), false);
  }
});

test('R7: off a terminal without --yes the plan is printed and nothing written; at one, No writes nothing', async (t) => {
  const root = await writeSession(t, REFUSING);
  const home = await homeWith(t);
  const unasked = await mirrorIn(root, home).mirror.run({ ...COPILOT_ALONE, yes: false });
  assert.equal(unasked.outcome, 'not-confirmed');
  assert.match(unasked.output, /^And in Copilot, agentwhy will write a file of its own, outside every project:\n\n {2}~\/\.copilot\/hooks\/agentwhy\.json\n/);
  assert.match(unasked.output, /If neither this agentwhy nor one on Copilot's PATH can start - after a Node upgrade, say - Copilot runs the call unchecked rather than stopping your work\. Running init again puts it right\./);
  assert.match(unasked.output, /Nothing was written for Copilot\. To write it: the same command with --yes\n$/);
  assert.equal(await exists(join(home, ...HOOK_FILE)), false);

  const no = mirrorIn(root, home, { interactive: true, answers: [1] });
  assert.equal((await no.mirror.run({ ...COPILOT_ALONE, yes: false })).outcome, 'declined');
  assert.match(no.asked[0] ?? '', /Write it\?$/);
  assert.equal(await exists(join(home, ...HOOK_FILE)), false);

  const yes = mirrorIn(root, home, { interactive: true, answers: [0] });
  const written = await yes.mirror.run({ ...COPILOT_ALONE, yes: false });
  assert.equal(written.outcome, 'written');
  assert.doesNotMatch(written.output, /And in Copilot/, 'the plan was shown in the question, not again');
  assert.deepEqual(await hookFile(home), ours());
});

// Decided 2026-10-12, as Codex's AO9: the agentwhy a check already runs is kept while it can start, so the agentwhys of
// different projects do not rewrite each other's - its files looked at, never run.
test('an existing check is kept while its agentwhy is there, and replaced where it is gone', async (t) => {
  const root = await writeSession(t, REFUSING);
  const there = await writeSession(t, { 'bin/node': '', 'lib/agentwhy/dist/cli.js': '' });
  const theirs = `'${join(there, 'bin', 'node')}' '${join(there, 'lib', 'agentwhy', 'dist', 'cli.js')}'`;
  const gone = "'/Users/someone/old/node' '/Users/someone/old/agentwhy/dist/cli.js'";

  const plain = await homeWith(t, { '.copilot/hooks/agentwhy.json': `${JSON.stringify(ours('agentwhy refuse --copilot || true'))}\n` });
  assert.match((await mirrorIn(root, plain).mirror.run(COPILOT_ALONE)).output, /already runs agentwhy's check/, "a --command's plain agentwhy is the person's own");

  const kept = await homeWith(t, { '.copilot/hooks/agentwhy.json': `${JSON.stringify(ours(`${theirs} refuse --copilot || agentwhy refuse --copilot || true`))}\n` });
  const { mirror: keeping, tried } = mirrorIn(root, kept);
  assert.equal((await keeping.run(COPILOT_ALONE)).outcome, 'unchanged');
  assert.deepEqual(tried, [], 'nothing found in the file is run where nothing changes');

  const older = await homeWith(t, { '.copilot/hooks/agentwhy.json': `${JSON.stringify(ours(`${theirs} refuse --copilot || true`))}\n` });
  const updating = await mirrorIn(root, older).mirror.run(COPILOT_ALONE);
  assert.match(updating.output, /\n\nCopilot: agentwhy's check in ~\/\.copilot\/hooks\/agentwhy\.json changed\. It holds from Copilot's next new chat/);
  assert.deepEqual(await hookFile(older), ours(`${theirs} refuse --copilot || agentwhy refuse --copilot || true`), 'the same agentwhy, with the fallback now written');

  const stale = await homeWith(t, { '.copilot/hooks/agentwhy.json': `${JSON.stringify(ours(`${gone} refuse --copilot || agentwhy refuse --copilot || true`))}\n` });
  const replaced = await mirrorIn(root, stale).mirror.run({ ...COPILOT_ALONE, yes: false });
  assert.match(replaced.output, /It replaces agentwhy's check there now, which runs: '\/Users\/someone\/old\/node'/);
  assert.equal((await mirrorIn(root, stale).mirror.run(COPILOT_ALONE)).outcome, 'written');
  assert.deepEqual(await hookFile(stale), ours(), 'a check whose agentwhy is gone gives way to this one');
});

// Decided 2026-10-12: `--codex --copilot` runs both parts, and a part named on the command line that was refused is the
// run's answer, exit 2.
test('--codex --copilot runs both whatever Codex answers, and a named part refused is the run\'s answer', async (t) => {
  const root = await writeSession(t, REFUSING);
  const home = await homeWith(t);
  const { mirror } = mirrorIn(root, home, { withCodex: true });
  // `withCodex` answers that Codex is used, while this home has no `~/.codex` - its part cannot be written.
  const both = await mirror.run({ ...COPILOT_ALONE, codex: true });
  assert.equal(both.outcome, 'unwritable', 'exit 2, as a refused part');
  assert.match(both.output, /Codex: ~\/\.codex\/config\.toml could not be written/);
  assert.match(both.output, /\nCopilot: agentwhy's check is in ~\/\.copilot\/hooks\/agentwhy\.json\./);
  assert.deepEqual(await hookFile(home), ours());

  const theirs = await homeWith(t, { '.copilot/hooks/agentwhy.json': '{"mine":true}\n' });
  const named = await mirrorIn(root, theirs).mirror.run({ ...REFUSE, copilot: true });
  assert.equal(named.outcome, 'refused', 'Copilot named and refused beside --refuse');
  const unnamed = await mirrorIn(root, theirs).mirror.run(REFUSE);
  assert.equal(unnamed.outcome, 'unchanged', 'not named, it is said and does not decide the exit code - refuse already ran here');
  assert.match(unnamed.output, /holds something agentwhy did not write/);
});

test('a remove installs nothing, and a hooks folder that is a file is said, not a crash', async (t) => {
  const root = await writeSession(t, { '.claude/settings.local.json': JSON.stringify({ hooks: {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'agentwhy refuse' }] }],
    SubagentStop: [{ hooks: [{ type: 'command', command: 'agentwhy watch' }] }],
  } }) });
  const home = await homeWith(t);
  const partial = await mirrorIn(root, home).mirror.run({ hooks: ['watch'], protect: [], remove: true, yes: true });
  assert.doesNotMatch(partial.output, /Copilot/);
  assert.equal(await exists(join(home, ...HOOK_FILE)), false, 'refuse still runs here, and a remove still writes nothing for Copilot');

  const blocked = await homeWith(t, { '.copilot/hooks': 'a file where the folder goes' });
  const result = await mirrorIn(await writeSession(t, {}), blocked).mirror.run(REFUSE);
  assert.equal(result.outcome, 'written', "Claude Code's settings were written");
  assert.match(result.output, /Copilot: ~\/\.copilot\/hooks\/agentwhy\.json could not be written, so nothing was changed for Copilot\.\n$/);
});

test('a project\'s remove keeps the check for the other projects; --remove --copilot takes the file out alone', async (t) => {
  const root = await writeSession(t, REFUSING);
  const home = await homeWith(t, { '.copilot/hooks/mine.json': '{}\n' });
  const { mirror } = mirrorIn(root, home);
  await mirror.run(COPILOT_ALONE);

  const plain = await mirror.run({ protect: [], remove: true, yes: true });
  assert.equal(plain.outcome, 'written');
  assert.match(plain.output, /Copilot: agentwhy's check in ~\/\.copilot\/hooks\/agentwhy\.json stays - other projects may block files with it, and it does nothing where none do\. To take it out of Copilot everywhere: agentwhy init --remove --copilot\n$/);
  assert.deepEqual(await hookFile(home), ours());

  const removed = await mirror.run({ protect: [], remove: true, yes: true, copilot: true });
  assert.match(removed.output, /Copilot: ~\/\.copilot\/hooks\/agentwhy\.json is removed\. Copilot no longer blocks anything for agentwhy\.\n$/);
  assert.equal(await exists(join(home, ...HOOK_FILE)), false);
  assert.equal(await readFile(join(home, '.copilot', 'hooks', 'mine.json'), 'utf8'), '{}\n', "the person's own hook file stays");

  const again = await mirror.run({ protect: [], remove: true, yes: true, copilot: true });
  assert.match(again.output, /Copilot: agentwhy's check is not in ~\/\.copilot\/hooks\/agentwhy\.json, so there was nothing to take out\.\n$/);
});

test('an update re-pins Claude Code\'s hooks alone, and Codex\'s mirror still writes its own between the two', async (t) => {
  const root = await writeSession(t, {});
  const home = await homeWith(t, { '.codex/config.toml': '' });
  const both = mirrorIn(root, home, { withCodex: true });
  const result = await both.mirror.run({ ...REFUSE, invoke: 'agentwhy' });
  assert.equal(result.outcome, 'written');
  assert.match(result.output, /Codex: agentwhy's check is in ~\/\.codex\/hooks\.json/);
  assert.match(result.output, /Copilot: agentwhy's check is in ~\/\.copilot\/hooks\/agentwhy\.json/);
  assert.ok(result.output.indexOf('Codex:') < result.output.indexOf('Copilot:'), 'Codex is said first, as it is written');
  assert.deepEqual(await hookFile(home), ours('agentwhy refuse --copilot || true'));

  const updateHome = await homeWith(t);
  const updated = await mirrorIn(root, updateHome).mirror.run({ protect: [], remove: false, yes: true, update: true });
  assert.doesNotMatch(updated.output, /Copilot/);
  assert.equal(await exists(join(updateHome, ...HOOK_FILE)), false);
});

// R7, CB9: a page writes Copilot's file only from Copilot's own window, whose confirmation names it.
test('on a page\'s route, only a run that names Copilot writes or removes its file', async (t) => {
  const root = await writeSession(t, {});
  const home = await homeWith(t);
  const { mirror } = mirrorIn(root, home, { onlyWhenNamed: true });

  const finish = await mirror.run(REFUSE);
  assert.equal(finish.outcome, 'written', "Claude Code's settings were written");
  assert.doesNotMatch(finish.output, /Copilot/);
  assert.equal(await exists(join(home, ...HOOK_FILE)), false, 'Finish blocking named no Copilot file, and writes none');

  assert.equal((await mirror.run(COPILOT_ALONE)).outcome, 'written');
  assert.deepEqual(await hookFile(home), ours());

  const uninstall = await mirror.run({ protect: [], remove: true, yes: true, hooks: ['watch', 'refuse'] });
  assert.doesNotMatch(uninstall.output, /Copilot/, 'an unticked uninstall says nothing of Copilot');
  assert.deepEqual(await hookFile(home), ours());
  await mirror.run({ protect: [], remove: true, yes: true, copilot: true, hooks: [] });
  assert.equal(await exists(join(home, ...HOOK_FILE)), false, 'the ticked one takes it out');
});
