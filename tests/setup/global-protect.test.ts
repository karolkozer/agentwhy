// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { agentwhyCodexEntries } from '../../src/adapter/codex/settings/codex-hooks.ts';
import { approvalKey, approvalOf, entryHash } from '../../src/adapter/codex/settings/hook-approval.ts';
import { NodeFileSystem } from '../../src/infrastructure/node-file-system.ts';
import type { Chooser } from '../../src/ports/chooser.ts';
import type { Trial } from '../../src/ports/command-trial.ts';
import { CodexMirror } from '../../src/setup/codex-mirror.ts';
import { GlobalProtect } from '../../src/setup/global-protect.ts';
import { GlobalSetup } from '../../src/setup/global-setup.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

interface World {
  /** Whether Codex is used on this computer (CK6, AO8). These tests default to yes. */
  readonly computer?: boolean;
  readonly interactive?: boolean;
  /** What each question at the terminal is answered: 0 yes, else no. */
  readonly answers?: readonly number[];
}

/** `agentwhy protect` as the composition root builds it, in a home a test names, with a trial that always runs. */
function protectIn(home: string, world: World = {}) {
  const asked: string[] = [];
  const tried: Trial[] = [];
  const answers = [...(world.answers ?? [])];
  const chooser: Chooser = {
    choose: async (heading) => {
      asked.push(heading);
      return answers.shift();
    },
  };
  const files = new NodeFileSystem();
  const interactive = world.interactive ?? false;
  const codexOnThisComputer = async () => world.computer ?? true;
  const global = new GlobalSetup({ files, chooser, interactive, home });
  const codex = new CodexMirror({
    setup: { run: async () => assert.fail('the computer-wide path runs Codex\'s part alone, never a project\'s setup') },
    files,
    chooser,
    interactive,
    workingDirectory: home,
    home,
    invocation: { find: async () => 'agentwhy', version: async () => undefined },
    codexOnThisComputer,
    trial: {
      run: async (trial: Trial) => {
        tried.push(trial);
        return { kind: 'ran', exitCode: 0, stderr: '' };
      },
    },
    trialFolder: home,
    refuseRuns: () => global.holds(),
    migrate: false,
  });
  return { protect: new GlobalProtect({ global, codex, codexOnThisComputer }), asked, tried };
}

const yes = (...paths: string[]) => ({ protect: paths, remove: false, yes: true });
/** A home directory whose `.codex` folder exists, as every Codex computer's does. */
const homeWith = (t: Parameters<typeof writeSession>[0], files: Readonly<Record<string, string>> = {}) =>
  writeSession(t, { '.codex/config.toml': '', ...files });
const userHooks = async (home: string): Promise<unknown> => JSON.parse(await readFile(join(home, '.codex', 'hooks.json'), 'utf8'));
const exists = async (path: string): Promise<boolean> => readFile(path).then(() => true, () => false);
/** The deny rules in the person's own Claude Code settings; none once the last is taken out with its empty list. */
const denied = async (home: string): Promise<unknown> =>
  JSON.parse(await readFile(join(home, '.claude', 'settings.json'), 'utf8')).permissions?.deny ?? [];
const own = (command: string) => ({ type: 'command', command, timeout: 30 });
const pair = () => ({ hooks: {
  PreToolUse: [{ matcher: 'Bash', hooks: [own('agentwhy refuse --codex')] }],
  Stop: [{ hooks: [own('agentwhy codex-stop --codex')] }],
} });

/** AO3, as a page verifies it: every entry approved with the hash of the entry as it stands, none disabled. */
async function verified(home: string): Promise<boolean> {
  const file = (await userHooks(home)) as Parameters<typeof agentwhyCodexEntries>[0];
  const config = await readFile(join(home, '.codex', 'config.toml'), 'utf8');
  const path = join(home, '.codex', 'hooks.json');
  const placed = agentwhyCodexEntries(file);
  return placed.length > 0 && placed.every((candidate) => {
    const approval = approvalOf(config, approvalKey(path, candidate));
    return approval !== undefined && approval.hash === entryHash(candidate) && !approval.disabled;
  });
}

/*
 * `2026-10-05-protected-everywhere.md` G17: Codex has no rules of its own and sees the computer-wide ones only through
 * agentwhy's check - so a computer where no project was ever set up had rules that held in Claude Code and nowhere in
 * Codex. From the home folder the "project" file and the person's own are one file, which `migrate: false` keeps.
 */
test('protect writes the rules, then installs agentwhy\'s check in Codex, tried and approved; a second run changes nothing', async (t) => {
  const home = await homeWith(t);
  const { protect, tried } = protectIn(home);

  const first = await protect.run(yes('~/.ssh/id_rsa'));
  assert.equal(first.outcome, 'written', first.output);
  assert.deepEqual(await denied(home), ['Read(~/.ssh/id_rsa)', 'Edit(~/.ssh/id_rsa)'], 'a place, as its place (a-file-in-its-place IP1)');
  assert.deepEqual(await userHooks(home), pair(), 'one pair, kept although the home folder is the working directory');
  assert.equal(await verified(home), true);
  assert.deepEqual(tried.map((trial) => trial.commandLine), ['agentwhy refuse --codex', 'agentwhy codex-stop --codex'], 'tried first (AO14)');
  const [rules, codex] = [first.output.indexOf('protected on this computer, in every project.'), first.output.indexOf("Codex: agentwhy's check is in ~/.codex/hooks.json")];
  assert.ok(rules > 0 && codex > rules, 'the rules are said first, then Codex\'s part');
  assert.match(first.output, /and wherever your computer-wide rules do\./);

  // The same place again. A name (`.ssh/id_rsa`) is no longer the same rule: it holds only inside the folder the AI
  // works in (a-file-in-its-place IPB4), so it would be written beside the place, not taken for it.
  const again = await protect.run(yes('~/.ssh/id_rsa'));
  assert.equal(again.outcome, 'unchanged');
  // As `init --codex` says where everything matches: the person learns Codex is covered, not just that nothing changed.
  assert.match(again.output, /Codex: ~\/\.codex\/hooks\.json already runs agentwhy's check, approved\./);
  assert.deepEqual(await userHooks(home), pair());
  assert.equal(tried.length, 2, 'nothing to write, nothing tried again');
});

// The rules may have been written before G17, or by hand: protecting them again installs what was missing.
test('rules already there and no check in Codex yet: the check is installed, and the run says written', async (t) => {
  const home = await homeWith(t, { '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(**/.ssh/id_rsa)', 'Edit(**/.ssh/id_rsa)'] } }) });
  const { protect } = protectIn(home);

  const result = await protect.run(yes('.ssh/id_rsa'));
  assert.equal(result.outcome, 'written', 'the rules were unchanged, Codex\'s files were not');
  assert.match(result.output, /already protects every path named/);
  assert.deepEqual(await userHooks(home), pair());
  assert.equal(await verified(home), true);
});

// AO8: on a computer without ~/.codex nothing is written for Codex, the folder is never created, and nothing is said.
test('a computer without Codex gets the rules and nothing else', async (t) => {
  const home = await writeSession(t, {});
  const { protect, tried } = protectIn(home, { computer: false });

  const result = await protect.run(yes('.aws/credentials'));
  assert.equal(result.outcome, 'written');
  assert.deepEqual(await denied(home), ['Read(**/.aws/credentials)', 'Edit(**/.aws/credentials)']);
  assert.equal(await exists(join(home, '.codex')), false);
  assert.doesNotMatch(result.output, /Codex/);
  assert.equal(tried.length, 0);
});

// R7: Codex's files are changed only after the rules are, so a plan not consented to installs nothing either.
test('nothing is installed for Codex when the rules were not written: a plan, a refusal, a no', async (t) => {
  const home = await homeWith(t);

  const planned = await protectIn(home).protect.run({ protect: ['.ssh/id_rsa'], remove: false, yes: false });
  assert.equal(planned.outcome, 'not-confirmed');
  // A form not measured (IPB13): a Windows path is refused, and nothing for Codex either.
  const refused = await protectIn(home).protect.run(yes('C:\\Users\\someone\\.ssh\\id_rsa'));
  assert.equal(refused.outcome, 'refused');
  const asked = protectIn(home, { interactive: true, answers: [2] });
  const declined = await asked.protect.run({ protect: ['.ssh/id_rsa'], remove: false, yes: false });
  assert.equal(declined.outcome, 'declined');
  assert.equal(asked.asked.length, 1, 'only the rules were asked about');

  assert.equal(await exists(join(home, '.codex', 'hooks.json')), false);
  assert.equal(await readFile(join(home, '.codex', 'config.toml'), 'utf8'), '', 'no approval either');
});

// AO8: at a terminal Codex's part is its own question, after the rules', and a no there keeps the rules written.
test('at a terminal Codex\'s part is asked apart, and a no leaves the rules written and Codex as it was', async (t) => {
  const home = await homeWith(t);
  const { protect, asked } = protectIn(home, { interactive: true, answers: [0, 1] });

  const result = await protect.run({ protect: ['.ssh/id_rsa'], remove: false, yes: false });
  assert.equal(asked.length, 2, 'the rules\' plan, then Codex\'s');
  assert.match(asked[1] ?? '', /^And in Codex, agentwhy will change your own Codex files, outside every project:/);
  assert.match(asked[1] ?? '', /about a tenth of a second/, 'AOB9\'s cost is in the plan');
  assert.match(result.output, /Nothing was written for Codex\./);
  assert.deepEqual(await denied(home), ['Read(**/.ssh/id_rsa)', 'Edit(**/.ssh/id_rsa)']);
  assert.equal(await exists(join(home, '.codex', 'hooks.json')), false);
});

// AOD4: the check does nothing where no rule is, and other projects may block files with it - so a removal keeps it.
test('a removal takes the rules out and leaves agentwhy\'s check in Codex', async (t) => {
  const home = await homeWith(t);
  const { protect, tried } = protectIn(home);
  await protect.run(yes('.ssh/id_rsa'));

  const removed = await protect.run({ protect: [], unprotect: ['.ssh/id_rsa'], remove: true, yes: true });
  assert.equal(removed.outcome, 'written');
  assert.deepEqual(await denied(home), []);
  assert.deepEqual(await userHooks(home), pair());
  assert.equal(await verified(home), true);
  assert.equal(tried.length, 2, 'only the install tried anything');
});

// `protected-everywhere` GD10, decided 2026-10-07: the rules stay in Claude Code's file, and where Codex is used the
// write and `--list` say why a file of Claude Code's holds them. A computer without Codex is told nothing of Codex.
test('where Codex is used, the write and the list say why Claude Code\'s file holds the rules', async (t) => {
  const kept = /kept in Claude Code's settings even if you use only Codex: Claude Code applies them by itself, and Codex, which has no rules of its own, follows them through agentwhy's check/;
  const codex = protectIn(await homeWith(t));
  assert.match((await codex.protect.run(yes('.aws/credentials'))).output, kept);
  assert.match((await codex.protect.list()).output, kept);

  const none = protectIn(await writeSession(t, {}), { computer: false });
  await none.protect.run(yes('.aws/credentials'));
  assert.doesNotMatch((await none.protect.list()).output, /Codex/);
  assert.doesNotMatch((await protectIn(await homeWith(t)).protect.list()).output, /Codex/, 'nor a list of nothing');
});
