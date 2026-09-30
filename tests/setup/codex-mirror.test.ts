import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeFileSystem } from '../../src/infrastructure/node-file-system.ts';
import type { Chooser } from '../../src/ports/chooser.ts';
import { CodexMirror } from '../../src/setup/codex-mirror.ts';
import { ProjectSetup, type SetupOptions } from '../../src/setup/project-setup.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

const REFUSE: SetupOptions = { hooks: ['refuse'], protect: [], remove: false, yes: true, invoke: 'agentwhy' };

interface World {
  /** Whether a Codex conversation is listed for the project (CK6). */
  readonly conversations?: boolean;
  readonly interactive?: boolean;
  /** What each question at the terminal is answered: 0 yes, else no. */
  readonly answers?: readonly number[];
}

function mirrorIn(root: string, world: World = {}) {
  const asked: string[] = [];
  const answers = [...(world.answers ?? [])];
  const chooser: Chooser = {
    choose: async (heading) => {
      asked.push(heading);
      return answers.shift();
    },
  };
  const files = new NodeFileSystem();
  const invocation = { find: async () => 'agentwhy', version: async () => undefined };
  const setup = new ProjectSetup({
    files,
    chooser,
    hookChooser: { chooseMany: async () => undefined },
    asker: { ask: async () => undefined },
    interactive: world.interactive ?? false,
    workingDirectory: root,
    home: '/Users/someone',
    invocation,
  });
  const mirror = new CodexMirror({
    setup,
    files,
    chooser,
    interactive: world.interactive ?? false,
    workingDirectory: root,
    invocation,
    codexConversations: async () => world.conversations ?? false,
  });
  return { mirror, asked };
}

const codexHooks = async (root: string): Promise<unknown> => JSON.parse(await readFile(join(root, '.codex', 'hooks.json'), 'utf8'));
const exists = async (path: string): Promise<boolean> => readFile(path).then(() => true, () => false);
const entry = (command: string) => ({ hooks: {
  PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command }] }],
  Stop: [{ hooks: [{ type: 'command', command: 'agentwhy codex-stop --codex' }] }],
} });

// codex-blocks-too CK5, CK6: a project with Codex conversations gets Codex's hook with Claude Code's `refuse`.
test('installing refuse in a project that uses Codex writes Codex\'s hook, and a second run changes nothing', async (t) => {
  const root = await writeSession(t, {});
  const { mirror } = mirrorIn(root, { conversations: true });

  const first = await mirror.run(REFUSE);
  assert.equal(first.outcome, 'written');
  assert.deepEqual(await codexHooks(root), entry('agentwhy refuse --codex'), 'no rules of its own: the built-in list, as Claude Code\'s');
  assert.match(first.output, /Codex: agentwhy's hook is in \.codex\/hooks\.json\. It blocks the same files there, once approved\./);
  assert.match(first.output, /Until then Codex skips it without a word, and does not block anything\./, 'CK8');

  const again = await mirror.run(REFUSE);
  assert.equal(again.outcome, 'unchanged');
  assert.doesNotMatch(again.output, /Codex/);
});

// CK6, CKD5: a Claude Code project gets no `.codex` folder.
test('a project with no sign of Codex gets nothing for it, and --codex writes it', async (t) => {
  const root = await writeSession(t, {});
  const { mirror } = mirrorIn(root);

  await mirror.run(REFUSE);
  assert.equal(await exists(join(root, '.codex', 'hooks.json')), false);

  const asked = await mirror.run({ protect: [], remove: false, yes: true, codex: true });
  assert.equal(asked.outcome, 'written');
  assert.deepEqual(await codexHooks(root), entry('agentwhy refuse --codex'));
});

// CK6: a `.codex` folder is a sign of Codex on its own; CK2, CK3: the rules are Claude Code's, as a path in the project.
test('protecting a file points Codex\'s hook at the same rules, as a path in the project', async (t) => {
  const root = await writeSession(t, { '.codex/config.toml': '' });
  const { mirror } = mirrorIn(root);

  await mirror.run({ protect: ['config/vault/**'], remove: false, yes: true, invoke: 'agentwhy' });
  assert.deepEqual(await codexHooks(root), entry('agentwhy refuse --codex --settings ".claude/settings.local.json"'));
  const claude = JSON.parse(await readFile(join(root, '.claude', 'settings.local.json'), 'utf8')) as { permissions: { deny: string[] } };
  assert.ok(claude.permissions.deny.some((rule) => rule.startsWith('Read(') && rule.includes('config/vault/**')), 'Claude Code\'s rules are the ones read');
});

// CK5, K13: taking `refuse` out takes Codex's out, and leaves a hook somebody else wrote.
test('removing refuse takes Codex\'s hook out and leaves every other hook', async (t) => {
  const theirs = { matcher: 'Bash', hooks: [{ type: 'command', command: 'lint-shell' }] };
  const root = await writeSession(t, { '.codex/hooks.json': JSON.stringify({ hooks: { PreToolUse: [theirs] } }) });
  const { mirror } = mirrorIn(root);

  await mirror.run(REFUSE);
  assert.deepEqual(await codexHooks(root), { hooks: { PreToolUse: [theirs, entry('agentwhy refuse --codex').hooks.PreToolUse[0]], Stop: entry('agentwhy refuse --codex').hooks.Stop } });

  const removed = await mirror.run({ protect: [], remove: true, yes: true, invoke: 'agentwhy' });
  assert.equal(removed.outcome, 'written');
  assert.match(removed.output, /Codex: agentwhy's hook is out of \.codex\/hooks\.json\./);
  assert.deepEqual(await codexHooks(root), { hooks: { PreToolUse: [theirs] } });
});

// CK9: a changed command is a changed hook, which Codex asks about again.
test('a changed command says Codex asks for approval again', async (t) => {
  const root = await writeSession(t, { '.codex/hooks.json': JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'npx @agentwhy/cli@0.1.0 refuse --codex' }] }] } }) });
  const { mirror } = mirrorIn(root);

  const changed = await mirror.run(REFUSE);
  assert.match(changed.output, /agentwhy's hook in \.codex\/hooks\.json changed, so Codex asks you to approve it again\./);
  assert.deepEqual(await codexHooks(root), entry('agentwhy refuse --codex'));
});

test('an existing PreToolUse hook gains the Stop message on the next setup run', async (t) => {
  const root = await writeSession(t, { '.codex/hooks.json': JSON.stringify({ hooks: { PreToolUse: [entry('agentwhy refuse --codex').hooks.PreToolUse[0]] } }) });
  const { mirror } = mirrorIn(root);
  const result = await mirror.run(REFUSE);
  assert.equal(result.outcome, 'written');
  assert.deepEqual(await codexHooks(root), entry('agentwhy refuse --codex'));
  assert.match(result.output, /approve it again/);
});

// CK7: its own part of the plan, its own answer; a "no" keeps Claude Code's part written.
test('at a terminal Codex\'s part is asked apart, and a no leaves Claude Code\'s part written', async (t) => {
  const root = await writeSession(t, {});
  const { mirror, asked } = mirrorIn(root, { conversations: true, interactive: true, answers: [0, 1] });

  const result = await mirror.run({ ...REFUSE, yes: false, target: 'local' });
  assert.equal(asked.length, 2, 'Claude Code\'s plan, then Codex\'s');
  assert.match(asked[1] ?? '', /^And in Codex, agentwhy will change \.codex\/hooks\.json:/);
  assert.match(result.output, /Nothing was written for Codex\./);
  assert.equal(await exists(join(root, '.claude', 'settings.local.json')), true);
  assert.equal(await exists(join(root, '.codex', 'hooks.json')), false);
});

// R7 off a terminal without --yes: the plan is printed, and nothing is written for Codex either.
test('off a terminal without --yes, Codex\'s plan is printed and nothing is written', async (t) => {
  const root = await writeSession(t, { '.claude/settings.local.json': JSON.stringify(entryFor('agentwhy refuse')) });
  const { mirror } = mirrorIn(root, { conversations: true });

  const result = await mirror.run({ protect: [], remove: false, yes: false, codex: true });
  assert.equal(result.outcome, 'not-confirmed');
  assert.match(result.output, /Nothing was written for Codex\. To write it: the same command with --yes/);
  assert.equal(await exists(join(root, '.codex', 'hooks.json')), false);
});

// A file this will not rewrite is said, never guessed past.
test('a .codex/hooks.json that is not JSON is left as it is, and said', async (t) => {
  const root = await writeSession(t, { '.codex/hooks.json': '{ not json' });
  const { mirror } = mirrorIn(root);

  const result = await mirror.run(REFUSE);
  assert.match(result.output, /Codex: \.codex\/hooks\.json is not a JSON object, so agentwhy's hook was not written to it\./);
  assert.equal(await readFile(join(root, '.codex', 'hooks.json'), 'utf8'), '{ not json');
});

/** Claude Code's settings running one command on `PreToolUse`, as `init --refuse` writes it. */
function entryFor(command: string) {
  return { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command }] }] } };
}

// onboarding W15, W20a: Finish writes through Settings' routes, and those run the setup `CodexMirror` wraps - so the
// onboarding's own writes, an add of the built-in list and search protection switched on, write Codex's hook too.
test('the onboarding\'s writes, through Settings\' routes, write Codex\'s hook in a project that uses Codex', async (t) => {
  const { settingsChangeToSetup } = await import('../../src/report/start/serve/settings-setup.ts');
  const root = await writeSession(t, {});
  const { mirror } = mirrorIn(root, { conversations: true });

  const added = await settingsChangeToSetup(mirror, { change: 'adopt', patterns: ['**/.env*'], where: 'local' });
  assert.equal(added.outcome, 'written');
  assert.deepEqual(await codexHooks(root), entry('agentwhy refuse --codex --settings ".claude/settings.local.json"'));

  // Uninstall with no rules named takes both hooks out and leaves the rules, as Settings' own Uninstall of a file whose
  // rules it did not write.
  const off = await settingsChangeToSetup(mirror, { change: 'uninstall', rules: { local: [] } });
  assert.equal(off.outcome, 'written');
  assert.deepEqual(await codexHooks(root), { hooks: {} }, 'Uninstall takes it out');

  await settingsChangeToSetup(mirror, { change: 'hooks', hooks: ['refuse'], on: true, where: 'local' });
  assert.deepEqual(await codexHooks(root), entry('agentwhy refuse --codex --settings ".claude/settings.local.json"'),
    'and a block switched on again puts it back, reading the rules that stayed');
});
