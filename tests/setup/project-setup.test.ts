// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { NodeFileSystem } from '../../src/infrastructure/node-file-system.ts';
import type { Asker } from '../../src/ports/asker.ts';
import { FileAccessError } from '../../src/ports/file-access-error.ts';
import type { Chooser } from '../../src/ports/chooser.ts';
import type { MultiChooser } from '../../src/ports/multi-chooser.ts';
import { ProjectSetup, type SetupOptions } from '../../src/setup/project-setup.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

const INSTALL: SetupOptions = { hooks: ['watch'], protect: [], remove: false, yes: true, invoke: 'agentwhy' };
/** `--remove` with no hook named takes out every one of agentwhy's (R4b). */
const REMOVE: SetupOptions = { protect: [], remove: true, yes: true, invoke: 'agentwhy' };

interface World {
  readonly interactive?: boolean;
  /** What the confirmation answers: 0 yes, 1 show the JSON, 2 no, undefined left. */
  readonly answer?: number;
  /** What "Who is this for?" answers: 0 just me, 1 everyone. Defaults to the local file. */
  readonly who?: number;
  /** Positions ticked in a list, or undefined for a person who left it. */
  readonly ticked?: readonly number[];
  /** What is typed when asked what else to protect. */
  readonly typed?: string;
  /** What the finder says about how this agentwhy runs (`a-hook-runs-what-you-ran` J2). */
  readonly found?: string;
  /** The version of the agentwhy running (`nothing-updates-by-itself` U7). */
  readonly serving?: string;
  /** Which writes fail: a file's name, and the count of writes to it so far, this one included. */
  readonly unwritable?: Refuses;
  /** The person's home directory. Defaults to one that is not the project's (`which-project` V8). */
  readonly home?: string;
  /** The disk to run on, in place of the real one. */
  readonly disk?: NodeFileSystem;
}

/** Whether a write fails: as a read-only file's would (`true`), or as a full disk's, part way through (`'full'`). */
type Refuses = (file: string, attempt: number) => boolean | 'full';

/** The disk, with the writes a test names failing. */
class RefusingFileSystem extends NodeFileSystem {
  readonly #refuses: Refuses;
  readonly #attempts = new Map<string, number>();

  constructor(refuses: Refuses) {
    super();
    this.#refuses = refuses;
  }

  override async writeText(path: string, text: string): Promise<void> {
    const file = basename(path);
    const attempt = (this.#attempts.get(file) ?? 0) + 1;
    this.#attempts.set(file, attempt);
    const refused = this.#refuses(file, attempt);
    if (refused === 'full') {
      // A write that runs out of room has already cut the file short: Node truncates it before it writes.
      await super.writeText(path, text.slice(0, Math.floor(text.length / 2)));
      throw Object.assign(new Error(`ENOSPC: no space left on device, write '${path}'`), { code: 'ENOSPC' });
    }
    if (refused) throw new FileAccessError('unreadable', path);
    await super.writeText(path, text);
  }
}

/** A disk nothing is written to: a run that gets past a refusal fails here, rather than writing to the real one. */
class ReadOnlyFileSystem extends NodeFileSystem {
  override async writeText(path: string): Promise<void> {
    throw new Error(`a write to ${path} reached the disk`);
  }

  override async ensureDirectory(path: string): Promise<void> {
    throw new Error(`a folder at ${path} was about to be made`);
  }
}

function setupIn(root: string, options: World = {}) {
  const asked: string[] = [];
  const listed: { heading: string; labels: string[]; details: string[]; ticked: string[] }[] = [];
  const chooser: Chooser = {
    choose: async (heading) => {
      asked.push(heading);
      // Two questions reach the same port: where to write, and whether to write it.
      return heading.startsWith('Who is this for?') ? (options.who ?? 0) : options.answer;
    },
  };
  const hookChooser: MultiChooser = {
    chooseMany: async (heading, choices) => {
      listed.push({
        heading,
        labels: choices.map((choice) => choice.label),
        details: choices.map((choice) => choice.detail),
        ticked: choices.flatMap((choice) => (choice.selected ? [choice.label] : [])),
      });
      return options.ticked;
    },
  };
  const asker: Asker = {
    ask: async (question) => {
      asked.push(question);
      return options.typed;
    },
  };
  let finds = 0;
  const setup = new ProjectSetup({
    files: options.disk ?? (options.unwritable === undefined ? new NodeFileSystem() : new RefusingFileSystem(options.unwritable)),
    chooser,
    hookChooser,
    asker,
    interactive: options.interactive ?? false,
    workingDirectory: root,
    home: options.home ?? '/Users/someone',
    invocation: {
      find: async () => {
        finds += 1;
        return options.found ?? 'agentwhy';
      },
      version: async () => options.serving,
    },
  });
  return { setup, asked, listed, finds: () => finds };
}

const local = async (root: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(join(root, '.claude', 'settings.local.json'), 'utf8')) as Record<string, unknown>;

const shared = async (root: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(join(root, '.claude', 'settings.json'), 'utf8')) as Record<string, unknown>;

// worth-running-every-day R4, R6: a fresh project gets watch in its local file, reading the shared deny rules.
test('a project with deny rules in settings.json gets watch in settings.local.json, pointed at those rules', async (t) => {
  const root = await writeSession(t, { '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(./.env*)', 'Bash(cat:*)'] } }) });

  const result = await setupIn(root).setup.run(INSTALL);

  assert.equal(result.outcome, 'written');
  assert.match(result.output, /Protected after this: 1 rule in \.claude\/settings\.json, which is what the hooks read\./);
  assert.deepEqual(await local(root), {
    hooks: {
      SubagentStop: [{ hooks: [{ type: 'command', command: 'agentwhy watch --settings "$CLAUDE_PROJECT_DIR/.claude/settings.json"' }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'agentwhy watch --settings "$CLAUDE_PROJECT_DIR/.claude/settings.json"' }] }],
    },
  });
  assert.equal((await shared(root)).hooks, undefined, 'the shared file is never written unless it was chosen');
});

test('with no deny rules anywhere, the hooks take no flag and the output names the built-in default', async (t) => {
  const root = await writeSession(t, {});

  const result = await setupIn(root).setup.run({ ...INSTALL, hooks: ['watch', 'refuse'] });

  assert.match(result.output, /Protected after this: the built-in list, since no deny rule here names a file\.\n {4}\*\*\/\.env\*, /);
  assert.match(result.output, /a deny rule names a tool, not a file/);
  assert.match(result.output, /refuse also blocks cat \.env\.example/);
  const hooks = (await local(root)).hooks as Record<string, unknown>;
  assert.deepEqual(hooks.PreToolUse, [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'agentwhy refuse' }] }]);
});

// R8: idempotent, and --remove restores what was there.
test('a second run adds nothing, and --remove leaves the other keys and hooks as they were', async (t) => {
  const before = { model: 'opus', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }] } };
  const root = await writeSession(t, { '.claude/settings.local.json': JSON.stringify(before) });
  const { setup } = setupIn(root);

  assert.equal((await setup.run({ ...INSTALL, hooks: ['watch', 'refuse'] })).outcome, 'written');
  assert.equal((await setup.run({ ...INSTALL, hooks: ['watch', 'refuse'] })).outcome, 'unchanged');
  assert.equal((await setup.run(REMOVE)).outcome, 'written');
  assert.deepEqual(await local(root), before);
  assert.equal((await setup.run(REMOVE)).outcome, 'unchanged');
});

// The bug this fixes: the list showed an installed hook as ticked, but unticking it changed nothing in the file.
test('unticking an installed hook removes it, off a terminal and at one', async (t) => {
  const root = await writeSession(t, {});
  const { setup } = setupIn(root);

  assert.equal((await setup.run({ ...INSTALL, hooks: ['watch', 'refuse'] })).outcome, 'written');
  assert.ok(((await local(root)).hooks as Record<string, unknown>).PreToolUse, 'refuse is installed');

  // Off a terminal: naming only watch takes refuse back out, and says so.
  const droppedRefuse = await setup.run({ ...INSTALL, hooks: ['watch'] });
  assert.equal(droppedRefuse.outcome, 'written');
  assert.match(droppedRefuse.output, /stopped: agentwhy refuse no longer runs here/);
  const afterFlag = (await local(root)).hooks as Record<string, unknown>;
  assert.equal(afterFlag.PreToolUse, undefined, 'refuse is gone');
  assert.ok(afterFlag.SubagentStop, 'watch is still there');

  // At a terminal: ticking nothing at all takes watch out too, and no empty "hooks" key is left behind.
  const interactive = setupIn(root, { interactive: true, answer: 0, ticked: [], typed: '' });
  const result = await interactive.setup.run({ protect: [], remove: false, yes: false, invoke: 'agentwhy' });
  assert.equal(result.outcome, 'written');
  assert.equal((await local(root)).hooks, undefined, 'no hook, and no empty hooks key either');
});

// R4: a file this command cannot parse is refused, never rewritten.
test('a settings.local.json that is not a JSON object is refused and left as it was', async (t) => {
  const root = await writeSession(t, { '.claude/settings.local.json': '{ "model": "opus", // a comment\n}' });

  const result = await setupIn(root).setup.run(INSTALL);

  assert.equal(result.outcome, 'refused');
  assert.equal(await readFile(join(root, '.claude', 'settings.local.json'), 'utf8'), '{ "model": "opus", // a comment\n}');
});

// R7: nothing is written without consent.
test('without a terminal and without --yes the plan is printed and nothing is written', async (t) => {
  const root = await writeSession(t, {});

  const result = await setupIn(root).setup.run({ ...INSTALL, yes: false });

  assert.equal(result.outcome, 'not-confirmed');
  assert.match(result.output, /The exact JSON:/, 'nobody could be asked, so the whole change is printed');
  assert.match(result.output, /Nothing was written\. To write it: the same command with --yes\n$/);
  await assert.rejects(readFile(join(root, '.claude', 'settings.local.json')));
});

test('at a terminal a person is asked; no writes nothing, yes writes without repeating the plan', async (t) => {
  const root = await writeSession(t, {});

  const declined = setupIn(root, { interactive: true, answer: 2, ticked: [0], typed: '' });
  assert.equal((await declined.setup.run({ ...INSTALL, yes: false })).outcome, 'declined');
  assert.match(declined.asked.at(-1) ?? '', /agentwhy will change this in \.claude\/settings\.local\.json \(your own file, not committed\):/);
  await assert.rejects(readFile(join(root, '.claude', 'settings.local.json')));

  const accepted = await setupIn(root, { interactive: true, answer: 0, ticked: [0], typed: '' }).setup.run({ ...INSTALL, yes: false });
  assert.equal(accepted.outcome, 'written');
  // A command that ends without saying what to do next leaves someone who has just installed it with nothing to do.
  assert.match(accepted.output, /^Done\. Claude Code picks it up when the next session starts\./);
  assert.match(accepted.output, /What happens now\n {2}- a notice, for you, when this conversation or an agent it starts copies a protected value/);
  assert.match(accepted.output, /Next\n {2}- see what has happened so far {6}agentwhy check/);
  assert.match(accepted.output, /undo this setup {19}agentwhy init --remove/);
});

// `the-agent-tells-you` D17, measured: a change to a file that was there applies from the next reply; one that is
// created may not be watched yet, so only the next session is promised for it.
test('a change to a settings file that was there applies from the next reply, and a file just created from the next session', async (t) => {
  const created = await writeSession(t, {});
  // `--yes` prints the plan first, so the line is found after it.
  assert.match((await setupIn(created).setup.run(INSTALL)).output, /\nDone\. Claude Code picks it up when the next session starts\./);

  const there = await writeSession(t, { '.claude/settings.local.json': JSON.stringify({ model: 'opus' }) });
  const changed = (await setupIn(there).setup.run(INSTALL)).output;
  assert.match(changed, /\nDone\. Claude Code applies it from your AI's next reply\./);
  assert.doesNotMatch(changed, /next session/);
});

// Review finding 3, end to end through the use case: a second run with a path adds nothing, and --remove takes it out.
test('with --command naming a path, a second run adds nothing and --remove takes the hooks out', async (t) => {
  const root = await writeSession(t, {});
  const { setup } = setupIn(root);
  const invoke = 'node /opt/agentwhy/dist/cli.js';
  const withPath: SetupOptions = { ...INSTALL, hooks: ['watch', 'refuse'], invoke };

  assert.equal((await setup.run(withPath)).outcome, 'written');
  assert.equal((await setup.run(withPath)).outcome, 'unchanged');
  assert.equal((await setup.run({ ...REMOVE, invoke })).outcome, 'written');
  assert.deepEqual(await local(root), {});
});

/** Every command the file's hooks run, in the order they were written. */
const commandsIn = (settings: Record<string, unknown>): string[] =>
  Object.values((settings.hooks ?? {}) as Record<string, { hooks: { command: string }[] }[]>)
    .flatMap((entries) => entries.flatMap((entry) => entry.hooks.map((hook) => hook.command)));

// `a-hook-runs-what-you-ran` J1: --command, else the hooks already running, else how this agentwhy runs.
test('with no --command, an empty project gets the command the finder gives, asked once', async (t) => {
  const root = await writeSession(t, {});
  const { setup, finds } = setupIn(root, { found: 'npx @agentwhy/cli' });

  await setup.run({ hooks: ['watch', 'refuse'], protect: [], remove: false, yes: true });

  assert.deepEqual(commandsIn(await local(root)), ['npx @agentwhy/cli watch', 'npx @agentwhy/cli watch', 'npx @agentwhy/cli refuse']);
  assert.equal(finds(), 1);
});

test('a hook written next runs the way the running ones do, from either file, and the finder is not asked (R42)', async (t) => {
  for (const target of ['local', 'shared'] as const) {
    const root = await writeSession(t, {});
    await setupIn(root).setup.run({ ...INSTALL, target });
    const { setup, finds } = setupIn(root, { found: 'npx @agentwhy/cli' });

    // Written to the local file either way; the command comes from wherever `watch` already runs.
    await setup.run({ hooks: ['refuse'], keep: true, protect: [], remove: false, yes: true });

    assert.deepEqual(commandsIn(await local(root)).filter((command) => command.endsWith('refuse')), ['agentwhy refuse'], target);
    assert.equal(finds(), 0, target);
  }
});

test('--command wins over a running hook, and over the finder', async (t) => {
  const root = await writeSession(t, {});
  await setupIn(root).setup.run(INSTALL);
  const { setup, finds } = setupIn(root, { found: 'npx @agentwhy/cli' });

  await setup.run({ hooks: ['refuse'], keep: true, protect: [], remove: false, yes: true, invoke: 'node /opt/agentwhy/dist/cli.js' });

  assert.deepEqual(commandsIn(await local(root)), ['agentwhy watch', 'agentwhy watch', 'node /opt/agentwhy/dist/cli.js refuse']);
  assert.equal(finds(), 0);
});

// J4, J8: a running hook in more than plain words is not repeated and not rewritten; the finder decides the new one.
test('a running hook in more than plain words is left as it runs, and the new one takes the finder\'s command', async (t) => {
  const quoted = '"$HOME/bin/agentwhy" watch';
  const root = await writeSession(t, {
    '.claude/settings.local.json': JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: quoted }] }] } }),
  });
  const { setup, finds } = setupIn(root, { found: 'npx @agentwhy/cli' });

  await setup.run({ hooks: ['refuse'], keep: true, protect: [], remove: false, yes: true });

  assert.deepEqual(commandsIn(await local(root)), [quoted, 'npx @agentwhy/cli refuse']);
  assert.equal(finds(), 1);
});

test('--remove with no --command still takes out a hook run through npx', async (t) => {
  const root = await writeSession(t, {});
  await setupIn(root, { found: 'npx @agentwhy/cli' }).setup.run({ hooks: ['watch', 'refuse'], protect: [], remove: false, yes: true });

  const result = await setupIn(root).setup.run({ protect: [], remove: true, yes: true });

  assert.equal(result.outcome, 'written');
  assert.deepEqual(commandsIn(await local(root)), []);
});

// `nothing-updates-by-itself` U7: init --update pins older hooks to this release, and does nothing else.
const pinnedAt = async (root: string, version: string, target: 'local' | 'shared' = 'local', hooks: readonly ('watch' | 'refuse')[] = ['watch']): Promise<void> => {
  await setupIn(root).setup.run({ hooks, keep: true, protect: [], remove: false, yes: true, target, invoke: `npx @agentwhy/cli@${version}` });
};
const UPDATE: SetupOptions = { protect: [], remove: false, yes: true, update: true };

test('--update pins older hooks in either file to this release, keeping their flags, and says what changed', async (t) => {
  const root = await writeSession(t, {});
  await pinnedAt(root, '0.2.0');
  await pinnedAt(root, '0.1.0', 'shared', ['refuse']);

  const result = await setupIn(root, { serving: '0.3.0' }).setup.run(UPDATE);

  assert.equal(result.outcome, 'written');
  assert.deepEqual(commandsIn(await local(root)), ['npx @agentwhy/cli@0.3.0 watch', 'npx @agentwhy/cli@0.3.0 watch']);
  assert.deepEqual(commandsIn(await shared(root)), ['npx @agentwhy/cli@0.3.0 refuse']);
  assert.match(result.output, /watch \(SubagentStop\) +0\.2\.0 -> 0\.3\.0/);
  assert.match(result.output, /refuse \(PreToolUse\) +0\.1\.0 -> 0\.3\.0/);
  assert.match(result.output, /Updated: from your AI's next reply, the hooks here run agentwhy 0\.3\.0\./);
});

test('--update changes nothing where no hook is older, where one is newer, or where this agentwhy is not a release', async (t) => {
  const root = await writeSession(t, {});
  await pinnedAt(root, '0.4.0');
  const before = await local(root);

  for (const serving of ['0.4.0', '0.3.0']) {
    const result = await setupIn(root, { serving }).setup.run(UPDATE);
    assert.equal(result.outcome, 'unchanged', serving);
    assert.match(result.output, new RegExp(`no hook here runs a release of agentwhy older than ${serving.replace(/\./g, '\\.')}`), serving);
  }
  const dev = await setupIn(root, { serving: '0.0.0-dev' }).setup.run(UPDATE);
  assert.equal(dev.outcome, 'unchanged');
  assert.match(dev.output, /This agentwhy \(0\.0\.0-dev\) is not a release/);
  assert.deepEqual(await local(root), before);
});

test('--update without --yes where nobody can be asked prints the plan and writes nothing', async (t) => {
  const root = await writeSession(t, {});
  await pinnedAt(root, '0.2.0');

  const result = await setupIn(root, { serving: '0.3.0' }).setup.run({ ...UPDATE, yes: false });

  assert.equal(result.outcome, 'not-confirmed');
  assert.match(result.output, /agentwhy init --update will pin agentwhy's hooks to 0\.3\.0/);
  assert.deepEqual(commandsIn(await local(root)), ['npx @agentwhy/cli@0.2.0 watch', 'npx @agentwhy/cli@0.2.0 watch']);
});

test('--update writes neither file where one of them is not a JSON object', async (t) => {
  const root = await writeSession(t, { '.claude/settings.json': '[1, 2]' });
  await pinnedAt(root, '0.2.0');

  const result = await setupIn(root, { serving: '0.3.0' }).setup.run(UPDATE);

  assert.equal(result.outcome, 'refused');
  assert.deepEqual(commandsIn(await local(root)), ['npx @agentwhy/cli@0.2.0 watch', 'npx @agentwhy/cli@0.2.0 watch']);
});

// Found by a review: the file written first stayed written when the second failed, and the project ran two releases.
test('--update puts the file it wrote first back as it was when the second cannot be written', async (t) => {
  const root = await writeSession(t, {});
  await pinnedAt(root, '0.2.0');
  await pinnedAt(root, '0.1.0', 'shared', ['refuse']);
  const localBefore = await readFile(join(root, '.claude', 'settings.local.json'), 'utf8');

  const result = await setupIn(root, { serving: '0.3.0', unwritable: (file) => file === 'settings.json' }).setup.run(UPDATE);

  assert.equal(result.outcome, 'unwritable');
  assert.match(result.output, /\.claude\/settings\.json could not be written, so nothing was changed\.\n$/);
  assert.equal(await readFile(join(root, '.claude', 'settings.local.json'), 'utf8'), localBefore, 'byte for byte');
  assert.deepEqual(commandsIn(await shared(root)), ['npx @agentwhy/cli@0.1.0 refuse']);
});

test('--update says which file runs the new release where it could not be put back either', async (t) => {
  const root = await writeSession(t, {});
  await pinnedAt(root, '0.2.0');
  await pinnedAt(root, '0.1.0', 'shared', ['refuse']);

  const unwritable = (file: string, attempt: number): boolean => file === 'settings.json' || (file === 'settings.local.json' && attempt > 1);
  const result = await setupIn(root, { serving: '0.3.0', unwritable }).setup.run(UPDATE);

  assert.equal(result.outcome, 'unwritable');
  assert.match(result.output, /\.claude\/settings\.json could not be written, and \.claude\/settings\.local\.json could not be put back: it runs agentwhy 0\.3\.0 now, and \.claude\/settings\.json does not\. Run agentwhy init --update again once \.claude\/settings\.json can be written\./);
  assert.deepEqual(commandsIn(await local(root)), ['npx @agentwhy/cli@0.3.0 watch', 'npx @agentwhy/cli@0.3.0 watch']);
});

// Found by a second review: only an error the port names was put back, and a full disk cuts the file it fails on short.
test('--update puts both files back where a full disk stops the second write part way, and lets the error through', async (t) => {
  const root = await writeSession(t, {});
  await pinnedAt(root, '0.2.0');
  await pinnedAt(root, '0.1.0', 'shared', ['refuse']);
  const text = (file: string): Promise<string> => readFile(join(root, '.claude', file), 'utf8');
  const before = [await text('settings.local.json'), await text('settings.json')];

  const full = (file: string, attempt: number): boolean | 'full' => (file === 'settings.json' && attempt === 1 ? 'full' : false);
  await assert.rejects(setupIn(root, { serving: '0.3.0', unwritable: full }).setup.run(UPDATE), /ENOSPC/);

  assert.deepEqual([await text('settings.local.json'), await text('settings.json')], before, 'both byte for byte');
});

// Found by a review: `init` put back only the file a hook moved out of, and left the one it wrote cut short.
test('init puts its file back where a full disk stops the write part way, and lets the error through', async (t) => {
  const root = await writeSession(t, {});
  await setupIn(root).setup.run(INSTALL);
  const before = await readFile(join(root, '.claude', 'settings.local.json'), 'utf8');

  const full = (file: string, attempt: number): boolean | 'full' => (file === 'settings.local.json' && attempt === 1 ? 'full' : false);
  await assert.rejects(setupIn(root, { unwritable: full }).setup.run({ ...INSTALL, hooks: ['refuse'], keep: true }), /ENOSPC/);

  assert.equal(await readFile(join(root, '.claude', 'settings.local.json'), 'utf8'), before, 'byte for byte');
});

// R4g, found by a review: a hook moved between the files was written in first and taken out second, so a failure left
// it running from both, and the answer named the file that had been written.
test('a hook moved to the shared file is taken out of the local one first, and put back where the shared one fails', async (t) => {
  const root = await writeSession(t, {});
  await setupIn(root).setup.run(INSTALL);
  const before = await readFile(join(root, '.claude', 'settings.local.json'), 'utf8');

  const result = await setupIn(root, { unwritable: (file) => file === 'settings.json' }).setup.run({ ...INSTALL, target: 'shared' });

  assert.equal(result.outcome, 'unwritable');
  assert.match(result.output, /\.claude\/settings\.json could not be written, so \.claude\/settings\.local\.json was put back as it was\.\n$/);
  assert.equal(await readFile(join(root, '.claude', 'settings.local.json'), 'utf8'), before);
  await assert.rejects(readFile(join(root, '.claude', 'settings.json')));
});

test('where the file a hook moves out of cannot be written, that file is named and nothing changes', async (t) => {
  const root = await writeSession(t, {});
  await setupIn(root).setup.run(INSTALL);
  const before = await readFile(join(root, '.claude', 'settings.local.json'), 'utf8');

  const result = await setupIn(root, { unwritable: (file) => file === 'settings.local.json' }).setup.run({ ...INSTALL, target: 'shared' });

  assert.equal(result.outcome, 'unwritable');
  assert.match(result.output, /\.claude\/settings\.local\.json could not be written, so nothing was changed\.\n$/);
  assert.equal(await readFile(join(root, '.claude', 'settings.local.json'), 'utf8'), before);
  await assert.rejects(readFile(join(root, '.claude', 'settings.json')), 'watch runs from one file, not two');
});

// Found by a second review: a mark that turns the direction of text is no control character, and passed.
test('--update shows an event key with a direction mark or a line separator in it as plain text', async (t) => {
  const event = 'Stop\u{202e}0.3.0 >- 0.0.0\u{2028}\u{2066}x';
  const hooks = { [event]: [{ hooks: [{ type: 'command', command: 'npx @agentwhy/cli@0.2.0 watch' }] }] };
  const root = await writeSession(t, { '.claude/settings.json': JSON.stringify({ hooks }) });

  const result = await setupIn(root, { serving: '0.3.0' }).setup.run(UPDATE);

  assert.equal(result.outcome, 'written');
  assert.doesNotMatch(result.output, /[\u{202e}\u{2028}\u{2066}]/u);
  assert.match(result.output, /watch \(Stop 0\.3\.0 >- 0\.0\.0  x\) *0\.2\.0 -> 0\.3\.0/);
  assert.deepEqual(Object.keys((await shared(root)).hooks as object), [event], 'the key is written back as it was');
});

// Found by a review: an event key from a cloned file reached the plan raw, and could rewrite it before consent.
test('--update shows an event key with control characters in it as plain text, and writes the key as it was', async (t) => {
  const event = 'Stop\u001b[2K\u001b[1GAll clear';
  const hooks = { [event]: [{ hooks: [{ type: 'command', command: 'npx @agentwhy/cli@0.2.0 watch' }] }] };
  const root = await writeSession(t, { '.claude/settings.json': JSON.stringify({ hooks }) });

  const result = await setupIn(root, { serving: '0.3.0' }).setup.run(UPDATE);

  assert.equal(result.outcome, 'written');
  assert.doesNotMatch(result.output, /\u001b/);
  assert.match(result.output, /watch \(Stop \[2K \[1GAll clear\) *0\.2\.0 -> 0\.3\.0/);
  assert.deepEqual(Object.keys((await shared(root)).hooks as object), [event]);
});

// R4a: at a terminal everything init can do is one list, with one thing ticked - the notice, which blocks nothing.
test('the list offers both hooks and the paths question, ticks the notice, and installs what was ticked', async (t) => {
  const root = await writeSession(t, {});
  const { setup, listed } = setupIn(root, { interactive: true, answer: 0, ticked: [1], typed: '' });

  const { hooks, protect, ...rest } = INSTALL;
  const result = await setup.run({ ...rest, protect, yes: false });

  assert.equal(result.outcome, 'written');
  // A keyword, a dash, and the rest - short enough to read at a glance, with the cost beside it.
  assert.deepEqual(listed[0]?.labels, [
    'Notify me - an agent copied a protected value',
    'Block - shell commands that open protected files',
    'Protect - more files of my own',
  ]);
  assert.deepEqual(listed[0]?.ticked, ['Notify me - an agent copied a protected value'], 'one default, and it blocks nothing');
  assert.ok(listed[0]?.labels.every((label) => label.length <= 56), 'a row fits a narrow terminal');
  assert.match(listed[0]?.heading ?? '', /Tick everything you want\./);
  assert.match(listed[0]?.details.join(' ') ?? '', /also blocks cat \.env\.example/);
  assert.match(listed[0]?.details.join(' ') ?? '', /for you only; nothing is blocked/);
  const installed = (await local(root)).hooks as Record<string, unknown>;
  assert.deepEqual(Object.keys(installed), ['PreToolUse'], 'only what was ticked');
});

test('a person who ticks nothing, or leaves the list, has nothing written', async (t) => {
  const root = await writeSession(t, {});
  const { hooks, ...rest } = INSTALL;

  assert.equal((await setupIn(root, { interactive: true, ticked: [], typed: '' }).setup.run({ ...rest, yes: false })).outcome, 'declined');
  assert.equal((await setupIn(root, { interactive: true, typed: '' }).setup.run({ ...rest, yes: false })).outcome, 'declined');
  await assert.rejects(readFile(join(root, '.claude', 'settings.local.json')));
});

// R4c: what is typed, and what --protect names, become deny rules for Read and Edit.
test('patterns typed and given become deny rules, once each, and the bad ones are named', async (t) => {
  const root = await writeSession(t, {});
  const { setup } = setupIn(root, { interactive: true, answer: 0, ticked: [0], typed: ' *.pem , config/creds.json , *.pem , bad(1) ' });

  const result = await setup.run({ ...INSTALL, protect: ['secrets/**', '*.pem'], yes: false });

  assert.equal(result.outcome, 'written');
  assert.match(result.output, /Not written: "bad\(1\)" - a deny rule is written as Read\(\.\.\.\)/);
  assert.deepEqual((await local(root)).permissions, {
    deny: ['Read(secrets/**)', 'Edit(secrets/**)', 'Read(*.pem)', 'Edit(*.pem)', 'Read(config/creds.json)', 'Edit(config/creds.json)'],
  });
});

// R4d: rules written locally move where the hooks read, and the shared file's rules are copied so nothing is dropped.
test('writing a rule points the hooks at the local file and copies the shared file rules in', async (t) => {
  const root = await writeSession(t, {
    '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(./config/vault/**)', 'Bash(cat:*)'] } }),
  });

  const result = await setupIn(root).setup.run({ ...INSTALL, protect: ['*.pem'] });

  assert.match(result.output, /\.\/config\/vault\/\*\* +copied from settings\.json, so it stays protected/);
  assert.match(result.output, /\*\.pem +added, for reading and for editing/);
  assert.match(result.output, /1 copied rule will not follow later changes to settings\.json/);
  assert.deepEqual((await local(root)).permissions, { deny: ['Read(*.pem)', 'Edit(*.pem)', 'Read(./config/vault/**)'] });
  const hooks = (await local(root)).hooks as Record<string, { hooks: { command: string }[] }[]>;
  // Both of `watch`'s events read the same file, because both run the same command line.
  for (const event of ['SubagentStop', 'Stop']) {
    assert.equal(hooks[event]?.[0]?.hooks[0]?.command, 'agentwhy watch --settings "$CLAUDE_PROJECT_DIR/.claude/settings.local.json"', event);
  }
});

// R4d, found while rebuilding Settings (`.ai/plans/2026-09-23-settings-redesign.md`, S4): a rule added with no hook named
// left a hook installed earlier reading the built-in list, so the rule was enforced by Claude Code and never watched.
test('a rule added later points the hooks already installed at the file it was written to', async (t) => {
  const root = await writeSession(t, {});
  const { setup } = setupIn(root);
  assert.equal((await setup.run({ ...INSTALL, hooks: ['watch', 'refuse'] })).outcome, 'written');

  const added = await setup.run({ ...INSTALL, hooks: [], protect: ['*.pem'] });

  assert.equal(added.outcome, 'written');
  assert.match(added.output, /Pointed at it: agentwhy watch and agentwhy refuse, which read other rules until now\./);
  const hooks = (await local(root)).hooks as Record<string, { hooks: { command: string }[] }[]>;
  for (const event of ['SubagentStop', 'Stop', 'PreToolUse']) {
    assert.equal(hooks[event]?.length, 1, `${event} runs once`);
    assert.match(hooks[event]?.[0]?.hooks[0]?.command ?? '', / --settings "\$CLAUDE_PROJECT_DIR\/\.claude\/settings\.local\.json"$/, event);
  }
});

test('a hook given a policy file is not pointed anywhere else', async (t) => {
  const command = 'agentwhy watch --policy ./policy.json';
  const root = await writeSession(t, {
    '.claude/settings.local.json': JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command }] }] } }),
  });

  await setupIn(root).setup.run({ ...INSTALL, hooks: [], protect: ['*.pem'] });

  const hooks = (await local(root)).hooks as Record<string, { hooks: { command: string }[] }[]>;
  assert.equal(hooks.Stop?.[0]?.hooks[0]?.command, command);
});

test('a pattern already denied is not written twice, and nothing else changes', async (t) => {
  const root = await writeSession(t, {
    '.claude/settings.local.json': JSON.stringify({ permissions: { deny: ['Read(*.pem)', 'Edit(*.pem)'] } }),
  });
  const { setup } = setupIn(root);

  assert.equal((await setup.run({ ...INSTALL, protect: ['*.pem'] })).outcome, 'written');
  assert.deepEqual((await local(root)).permissions, { deny: ['Read(*.pem)', 'Edit(*.pem)'] });
  assert.equal((await setup.run({ ...INSTALL, protect: ['*.pem'] })).outcome, 'unchanged');
});

// R4f: the exact JSON is in the record of a run nobody was asked about; R4b: one hook can be removed by name.
test('the printed plan holds the JSON, and one hook can be removed by name', async (t) => {
  const root = await writeSession(t, {});
  const { setup } = setupIn(root);

  const written = await setup.run({ ...INSTALL, hooks: ['watch', 'refuse'], protect: ['*.pem'] });
  assert.match(written.output, / {2}The exact JSON:\n/);
  assert.match(written.output, /"SubagentStop": \[/);
  assert.match(written.output, /"deny": \[\n\s+"Read\(\*\.pem\)",\n\s+"Edit\(\*\.pem\)"/);
  assert.ok(!written.output.includes('Show me the exact JSON'), 'that choice is for a terminal, not for this output');

  const removed = await setup.run({ ...REMOVE, hooks: ['refuse'] });
  assert.equal(removed.outcome, 'written');
  assert.match(removed.output, /will take this out of \.claude\/settings\.local\.json:\n\n {2}Hooks {10}refuse/);
  assert.match(removed.output, /Removed: 1 hook command\./);
  assert.match(removed.output, /The 2 deny rules in that file stayed/);
  const hooks = (await local(root)).hooks as Record<string, unknown>;
  assert.deepEqual(Object.keys(hooks), ['SubagentStop', 'Stop'], 'watch stays, on both of its events');
  assert.ok((await local(root)).permissions, 'deny rules are left alone unless they are named');
});

// R4f, made readable: the JSON is a choice at the terminal, not a wall above the question.
test('the question shows a summary, and the JSON only when it is asked for', async (t) => {
  const root = await writeSession(t, {});
  const asked: string[] = [];
  const answers = [1, 0]; // first: show me the JSON; then: yes
  const setup = new ProjectSetup({
    files: new NodeFileSystem(),
    chooser: {
      choose: async (heading, choices) => {
        if (heading.startsWith('Who is this for?')) return 0;
        asked.push(`${heading}\n== ${choices.map((choice) => choice.label).join(' | ')}`);
        return answers.shift();
      },
    },
    hookChooser: { chooseMany: async () => [0] },
    invocation: { find: async () => 'agentwhy', version: async () => undefined },
    asker: { ask: async () => '' },
    interactive: true,
    workingDirectory: root,
    home: '/Users/someone',
  });

  const { hooks, ...rest } = INSTALL;
  const result = await setup.run({ ...rest, yes: false });

  assert.equal(result.outcome, 'written');
  assert.equal(asked.length, 2, 'asked again after the JSON was shown');
  assert.ok(!(asked[0] ?? '').includes('The exact JSON'), 'the first question is the summary alone');
  assert.match(asked[0] ?? '', /== Yes \| Show me the exact JSON \| No$/);
  assert.match(asked[1] ?? '', /The exact JSON:\n {4}\{/);
  assert.match(asked[1] ?? '', /== Yes \| No$/, 'and it is not offered twice');
});

// R4g: the file is the person's choice, and what each means is on the line.
test('a person can send the hooks to the shared file, and is told what that means', async (t) => {
  const root = await writeSession(t, {});
  const { setup, asked } = setupIn(root, { interactive: true, who: 1, answer: 0, ticked: [0], typed: '' });

  const { hooks, ...rest } = INSTALL;
  const result = await setup.run({ ...rest, yes: false });

  assert.equal(result.outcome, 'written');
  assert.match(asked[0] ?? '', /^Who is this for\?/);
  assert.deepEqual(Object.keys((await shared(root)).hooks as Record<string, unknown>), ['SubagentStop', 'Stop']);
  await assert.rejects(readFile(join(root, '.claude', 'settings.local.json')), 'the local file is left alone');
});

// R4g: rules are copied into the local file, never out of it - a person's own choice is not published.
test('writing to the shared file copies nothing out of the local one', async (t) => {
  const root = await writeSession(t, {
    '.claude/settings.local.json': JSON.stringify({ permissions: { deny: ['Read(my-notes/**)', 'Edit(my-notes/**)'] } }),
  });

  const result = await setupIn(root).setup.run({ ...INSTALL, target: 'shared', protect: ['*.pem'] });

  assert.equal(result.outcome, 'written');
  assert.deepEqual(((await shared(root)).permissions as { deny: string[] }).deny, ['Read(*.pem)', 'Edit(*.pem)']);
  assert.match(result.output, /committed, so it runs for everyone who clones/);
});

// R4g: changing your mind moves the hooks rather than leaving them running from both files.
test('installing into the other file takes the hook out of the one that ran it', async (t) => {
  const root = await writeSession(t, {});
  const { setup } = setupIn(root);

  assert.equal((await setup.run(INSTALL)).outcome, 'written');
  const moved = await setup.run({ ...INSTALL, target: 'shared' });

  assert.equal(moved.outcome, 'written');
  assert.match(moved.output, /Moving out of \.claude\/settings\.local\.json: watch, so it does not run twice\./);
  assert.deepEqual(Object.keys((await shared(root)).hooks as Record<string, unknown>), ['SubagentStop', 'Stop']);
  assert.deepEqual(await local(root), {}, 'and the file it came from runs nothing of agentwhy now');
});

// R26: at a terminal, --remove asks what to take out - the hooks, and every deny rule, by the path it protects.
test('--remove lists the hooks and the rules, and takes out exactly what was ticked', async (t) => {
  const root = await writeSession(t, {});
  assert.equal((await setupIn(root).setup.run({ ...INSTALL, hooks: ['watch', 'refuse'], protect: ['*.pem'] })).outcome, 'written');

  // Rows: watch, refuse, then one per protected path - not one per rule, since Read and Edit protect the same thing.
  const { setup, listed } = setupIn(root, { interactive: true, answer: 0, ticked: [1, 2] });
  const result = await setup.run({ protect: [], remove: true, yes: false, invoke: 'agentwhy' });

  assert.equal(result.outcome, 'written');
  assert.deepEqual(listed[0]?.labels, [
    'Notify me - stop running agentwhy watch',
    'Block - stop running agentwhy refuse',
    'Unprotect *.pem',
  ]);
  assert.equal(listed[0]?.details.at(-1), 'takes Read(*.pem) and Edit(*.pem) out of .claude/settings.local.json');
  assert.deepEqual(listed[0]?.ticked, [], 'nothing is ticked: removing is never the default');
  assert.match(listed[0]?.heading ?? '', /What should agentwhy stop doing here\? Tick what to remove\./);
  assert.deepEqual(Object.keys((await local(root)).hooks as Record<string, unknown>), ['SubagentStop', 'Stop'], 'watch stays');
  assert.deepEqual(await local(root), {
    hooks: {
      SubagentStop: [{ hooks: [{ type: 'command', command: 'agentwhy watch --settings "$CLAUDE_PROJECT_DIR/.claude/settings.local.json"' }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'agentwhy watch --settings "$CLAUDE_PROJECT_DIR/.claude/settings.local.json"' }] }],
    },
  });
});

// R27: off a terminal a rule is removed only when it is named.
test('--unprotect takes named rules out, and --remove alone leaves every rule', async (t) => {
  const root = await writeSession(t, {});
  const { setup } = setupIn(root);
  assert.equal((await setup.run({ ...INSTALL, protect: ['*.pem', 'secrets/**'] })).outcome, 'written');

  const result = await setup.run({ ...REMOVE, unprotect: ['*.pem'] });

  assert.equal(result.outcome, 'written');
  // `watch`'s two events, and `refuse`, which protecting installs with the rules (`block-means-blocked` K4).
  assert.match(result.output, /Removed: 3 hook commands, 2 deny rules\./);
  assert.deepEqual((await local(root)).permissions, { deny: ['Read(secrets/**)', 'Edit(secrets/**)'] });
});

test('removing every rule leaves the file without an empty permissions block', async (t) => {
  const root = await writeSession(t, {});
  const { setup } = setupIn(root);
  assert.equal((await setup.run({ ...INSTALL, protect: ['*.pem'] })).outcome, 'written');

  assert.equal((await setup.run({ ...REMOVE, unprotect: ['*.pem'] })).outcome, 'written');

  assert.deepEqual(await local(root), {});
});

// ── what the served Settings view asks for (worth-running-every-day R58) ───────────────────────────────────────
// The page names the hooks it means every time, including when it means none of them. These two say what that
// buys: `init` off a terminal reads silence about hooks as `watch` on the way in and as every hook on the way out,
// and a person who pressed Add or Remove asked for neither.
test('protecting a pattern with no hook named writes the rule and installs nothing', async (t) => {
  const root = await writeSession(t, {});

  const result = await setupIn(root).setup.run({ hooks: [], protect: ['config/*.pem'], remove: false, yes: true, invoke: 'npx agentwhy' });

  assert.equal(result.outcome, 'written');
  const settings = await local(root);
  assert.deepEqual(settings.permissions, { deny: ['Read(config/*.pem)', 'Edit(config/*.pem)'] });
  assert.equal(settings.hooks, undefined, 'the confirm step offered a deny rule, so a deny rule is all that was written');
});

// R39: a hook is installed or removed only where one is named. Settings sends `hooks: []` with every Add, and one hook
// with every switch; both used to take out whatever else was running, because any hooks given were read as the whole
// set, as a terminal's list and `--watch` alone are.
test('protecting a pattern with no hook named leaves the hooks that run where they are', async (t) => {
  const root = await writeSession(t, {});
  const { setup } = setupIn(root);
  await setup.run({ hooks: ['watch', 'refuse'], protect: [], remove: false, yes: true, invoke: 'npx agentwhy' });

  const result = await setup.run({ hooks: [], protect: ['config/*.pem'], remove: false, yes: true, invoke: 'npx agentwhy' });

  assert.equal(result.outcome, 'written');
  assert.doesNotMatch(result.output, /Stop running/);
  const hooks = (await local(root)).hooks as Record<string, unknown>;
  assert.ok(hooks.SubagentStop !== undefined && hooks.Stop !== undefined && hooks.PreToolUse !== undefined, 'both hooks still run');
});

test('a switch turned on installs its hook beside the one already running', async (t) => {
  const root = await writeSession(t, {});
  const { setup } = setupIn(root);
  await setup.run({ hooks: ['watch'], protect: [], remove: false, yes: true, invoke: 'npx agentwhy' });

  const result = await setup.run({ hooks: ['refuse'], keep: true, protect: [], remove: false, yes: true, invoke: 'npx agentwhy' });

  assert.equal(result.outcome, 'written');
  const hooks = (await local(root)).hooks as Record<string, unknown>;
  assert.ok(hooks.SubagentStop !== undefined && hooks.PreToolUse !== undefined, 'watch stayed, refuse was added');
});

test('unprotecting a pattern with no hook named takes the rule out and leaves the hooks running', async (t) => {
  const root = await writeSession(t, {});
  const { setup } = setupIn(root);
  await setup.run({ hooks: ['watch', 'refuse'], protect: ['config/*.pem', '.npmrc'], remove: false, yes: true, invoke: 'npx agentwhy' });

  const result = await setup.run({ hooks: [], protect: [], remove: true, unprotect: ['.npmrc'], yes: true, invoke: 'npx agentwhy' });

  assert.equal(result.outcome, 'written');
  const settings = await local(root);
  assert.deepEqual(settings.permissions, { deny: ['Read(config/*.pem)', 'Edit(config/*.pem)'] }, 'only the rule that was named');
  const hooks = settings.hooks as Record<string, unknown>;
  assert.ok(hooks.SubagentStop !== undefined && hooks.PreToolUse !== undefined, 'both hooks stayed: neither was named');
});

test('a switch turned off takes out that one hook and leaves every deny rule', async (t) => {
  const root = await writeSession(t, {});
  const { setup } = setupIn(root);
  await setup.run({ hooks: ['watch', 'refuse'], protect: ['.npmrc'], remove: false, yes: true, invoke: 'npx agentwhy' });

  const result = await setup.run({ hooks: ['refuse'], protect: [], remove: true, yes: true, invoke: 'npx agentwhy' });

  assert.equal(result.outcome, 'written');
  const settings = await local(root);
  const hooks = settings.hooks as Record<string, unknown>;
  assert.equal(hooks.PreToolUse, undefined, 'refuse was named, so refuse went');
  assert.ok(hooks.SubagentStop !== undefined, 'watch was not named, so watch stayed');
  assert.deepEqual(settings.permissions, { deny: ['Read(.npmrc)', 'Edit(.npmrc)'] }, 'and no rule went with it');
});

// `.ai/specs/2026-09-25-block-means-blocked.md` K4-K6: a file protected is a file blocked, and a block is its deny rules
// and `refuse` both - without `refuse`, `cat .env` walks past `Read(.env)` (R4e).
const hooksIn = async (root: string): Promise<string[]> =>
  Object.values(((await local(root)).hooks ?? {}) as Record<string, { hooks: { command: string }[] }[]>)
    .flatMap((groups) => groups.flatMap((group) => group.hooks.map((hook) => hook.command.split(' --settings')[0] ?? '')));

test('K4: --protect installs refuse with the rules, with no hook named and with watch named', async (t) => {
  for (const hooks of [undefined, ['watch'] as const]) {
    const root = await writeSession(t, {});
    const result = await setupIn(root).setup.run({ ...(hooks === undefined ? {} : { hooks }), protect: ['.env'], remove: false, yes: true, invoke: 'agentwhy' });
    assert.equal(result.outcome, 'written');
    assert.deepEqual([...new Set(await hooksIn(root))].sort(), ['agentwhy refuse', 'agentwhy watch'], `hooks: ${String(hooks)}`);
    assert.match(result.output, /refuse comes with protected files: the deny rules stop Claude Code's own file tools/);
  }
});

test('K4: a run that protects nothing installs refuse only where it is asked for, and an empty list names none', async (t) => {
  const plain = await writeSession(t, {});
  await setupIn(plain).setup.run({ protect: [], remove: false, yes: true, invoke: 'agentwhy' });
  assert.ok(!(await hooksIn(plain)).includes('agentwhy refuse'), 'watch alone, as R4b has it');

  const named = await writeSession(t, {});
  await setupIn(named).setup.run({ hooks: [], protect: ['config/*.pem'], remove: false, yes: true, invoke: 'agentwhy' });
  assert.deepEqual(await hooksIn(named), [], 'the page changing a rule already there names no hook (K3)');
});

test('K5: at a terminal, the Protect line ticked puts refuse in the plan, and says why', async (t) => {
  const root = await writeSession(t, {});
  const { setup, listed } = setupIn(root, { interactive: true, answer: 0, ticked: [0, 2], typed: '*.pem' });
  const result = await setup.run({ protect: [], remove: false, yes: false, invoke: 'agentwhy' });
  assert.equal(result.outcome, 'written');
  assert.match(listed[0]?.details[2] ?? '', /deny rules Claude Code applies, and refuse for shell commands/);
  assert.deepEqual([...new Set(await hooksIn(root))].sort(), ['agentwhy refuse', 'agentwhy watch']);
});

test('K6: taking refuse out while rules stay says what is left and the way back', async (t) => {
  const root = await writeSession(t, {});
  const { setup } = setupIn(root);
  await setup.run({ ...INSTALL, protect: ['*.pem', 'secrets/**'] });

  const result = await setup.run({ ...REMOVE, hooks: ['refuse'] });
  assert.match(result.output, /2 protected paths are no longer kept from shell commands: a command or a search can print them\. agentwhy init --refuse --watch puts it back\./);

  const none = await writeSession(t, {});
  const bare = setupIn(none).setup;
  await bare.run({ hooks: ['refuse'], protect: [], remove: false, yes: true, invoke: 'agentwhy' });
  assert.doesNotMatch((await bare.run({ ...REMOVE, hooks: ['refuse'] })).output, /no longer kept/, 'no rule left, nothing to say');
});

// which-project V8: the home directory's .claude/settings.json is Claude Code's settings for every project. The bug this
// fixes: `npx @agentwhy/cli` in a new terminal set up the home directory, and "Everyone on this project" wrote there.
test('in the home directory nothing is written - no hook, no rule, no update - and nothing is asked', async (t) => {
  const root = await writeSession(t, {});
  const writes: SetupOptions[] = [
    INSTALL,
    { ...INSTALL, target: 'shared' },
    { protect: ['contract.pdf'], remove: false, yes: true, invoke: 'agentwhy' },
    UPDATE,
  ];

  for (const options of writes) {
    const { setup, asked, listed } = setupIn(root, { home: root, interactive: true });
    const result = await setup.run(options);
    assert.equal(result.outcome, 'refused');
    assert.match(result.output, /doesn't change settings in your home folder: it isn't a project, and Claude Code reads its \.claude\/settings\.json in every project\. Nothing was written\./);
    assert.deepEqual([asked, listed], [[], []], 'refused before "Who is this for?"');
  }
  assert.deepEqual(await readdir(root), [], 'not even .claude/ was made');
});

test('in the home directory, what agentwhy wrote there before can still be taken out', async (t) => {
  const before = { model: 'opus' };
  const root = await writeSession(t, { '.claude/settings.local.json': JSON.stringify(before) });
  // Written the way an agentwhy from before this check could: its home was not yet told apart.
  assert.equal((await setupIn(root).setup.run(INSTALL)).outcome, 'written');

  const result = await setupIn(root, { home: root }).setup.run(REMOVE);

  assert.equal(result.outcome, 'written');
  assert.deepEqual(await local(root), before);
});

test('the root of a disk is no project either, and a folder in the home directory is one', async (t) => {
  // The root itself, since nothing else is one; on a disk that takes no write, so a refusal that failed could not write
  // /.claude on the real one - which a run as root, in a container, would.
  const atRoot = await setupIn('/', { disk: new ReadOnlyFileSystem() }).setup.run(INSTALL);
  assert.equal(atRoot.outcome, 'refused');
  assert.match(atRoot.output, /doesn't change settings at the root of a disk: it isn't a project\. Nothing was written\./);

  const root = await writeSession(t, {});
  assert.equal((await setupIn(root, { home: dirname(root) }).setup.run(INSTALL)).outcome, 'written');
});
