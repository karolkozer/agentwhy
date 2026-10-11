// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FileAccessError } from '../../src/ports/file-access-error.ts';
import type { FileReader } from '../../src/ports/file-reader.ts';
import { choosePolicy } from '../../src/report/choose-policy.ts';
import type { TellListPaths } from '../../src/report/private-files/tell-lists.ts';

const PROJECT = '/work/project';
const LOCAL = `${PROJECT}/.claude/settings.local.json`;
const SHARED = `${PROJECT}/.claude/settings.json`;

/** A told list nobody wrote: every path this test's `pathsFor` names is simply never in `texts`. */
const NO_TELL: TellListPaths = { pathsFor: () => ({ local: '/no/local.json', shared: '/no/shared.json', computer: '/no/computer.json' }) };

function filesOf(texts: Readonly<Record<string, string>>): FileReader {
  return {
    readText: async (path) => {
      const text = texts[path];
      if (text === undefined) throw new FileAccessError('not-found', path);
      return text;
    },
    readLines: () => {
      throw new Error('a policy is read whole');
    },
  };
}

const deny = (...entries: readonly string[]): string => JSON.stringify({ permissions: { deny: entries } });

// Unchanged: a run that names neither --policy, --settings nor a project directory reads nothing and falls through
// to the built-in list, exactly as before this fix - a caller that does not opt in sees no new behaviour.
test('with no project directory given, an absent settingsPath still falls through to the built-in default', async () => {
  const resolved = await choosePolicy({}, filesOf({ [LOCAL]: deny('Read(.npmrc)') }), NO_TELL);

  assert.ok('policy' in resolved);
  assert.equal(resolved.policy.origin.kind, 'default');
});

// R.. (block-means-blocked K1, amended worth-running-every-day): the gap this fix closes. `start`/`report`/`check`
// off a terminal name no flag at all, so the project directory is what tells `choosePolicy` where to look.
test('with a project directory and no flags, the project\'s own local settings file is read', async () => {
  const resolved = await choosePolicy({}, filesOf({ [LOCAL]: deny('Read(.npmrc)', 'Edit(.npmrc)') }), NO_TELL, undefined, PROJECT);

  assert.ok('policy' in resolved);
  assert.deepEqual(resolved.policy.protected, [{ pattern: '**/.npmrc' }]);
  assert.equal(resolved.policy.origin.kind, 'settings');
});

test('the shared file alone is read too, the way Claude Code applies either one (K1)', async () => {
  const resolved = await choosePolicy({}, filesOf({ [SHARED]: deny('Read(.npmrc)') }), NO_TELL, undefined, PROJECT);

  assert.ok('policy' in resolved);
  assert.deepEqual(resolved.policy.protected, [{ pattern: '**/.npmrc' }]);
});

test('both files are read and merged, deduplicated where they name the same rule', async () => {
  const resolved = await choosePolicy(
    {},
    filesOf({ [LOCAL]: deny('Read(.npmrc)', 'Edit(.npmrc)'), [SHARED]: deny('Read(**/.env*)', 'Edit(**/.env*)', 'Read(.npmrc)', 'Edit(.npmrc)') }),
    NO_TELL,
    undefined,
    PROJECT,
  );

  assert.ok('policy' in resolved);
  assert.deepEqual(new Set(resolved.policy.protected.map((entry) => entry.pattern)), new Set(['**/.npmrc', '**/.env*']));
});

// A project freshly set up, or one agentwhy has never touched: absence is an answer, never an error.
test('neither file existing falls through to the built-in default, not a refusal', async () => {
  const resolved = await choosePolicy({}, filesOf({}), NO_TELL, undefined, PROJECT);

  assert.ok('policy' in resolved);
  assert.equal(resolved.policy.origin.kind, 'default');
});

// A settings file this run cannot parse is the same "not a policy" case a readable one with no deny list already
// is - never a reason to stop `start`/`report`/`check` from running, unlike a broken file named by --settings.
test('a broken local file is skipped quietly when the shared file still holds a rule', async () => {
  const resolved = await choosePolicy({}, filesOf({ [LOCAL]: '{ not json', [SHARED]: deny('Read(.npmrc)') }), NO_TELL, undefined, PROJECT);

  assert.ok('policy' in resolved);
  assert.deepEqual(resolved.policy.protected, [{ pattern: '**/.npmrc' }]);
});

test('both files broken also falls through to the built-in default', async () => {
  const resolved = await choosePolicy({}, filesOf({ [LOCAL]: '{ not json', [SHARED]: '{ not json' }), NO_TELL, undefined, PROJECT);

  assert.ok('policy' in resolved);
  assert.equal(resolved.policy.origin.kind, 'default');
});

// An explicit --settings still names one file exactly, as it always has: the project directory never widens it,
// and a file it names that cannot be read still refuses the whole run (unlike the defaulted, soft-skip case above).
test('an explicit settingsPath is read alone, project directory or not, and a missing one still refuses', async () => {
  const found = await choosePolicy({ settingsPath: SHARED }, filesOf({ [LOCAL]: deny('Read(.npmrc)'), [SHARED]: deny('Read(.env)') }), NO_TELL, undefined, PROJECT);
  assert.ok('policy' in found);
  assert.deepEqual(found.policy.protected, [{ pattern: '**/.env' }]);

  const missing = await choosePolicy({ settingsPath: SHARED }, filesOf({}), NO_TELL, undefined, PROJECT);
  assert.ok('errors' in missing);
  assert.match(missing.errors[0] ?? '', new RegExp(`${SHARED} could not be read`));
});

// F57: the told list still resolves to the project directory, exactly as it did when settingsPath was undefined -
// this only fills in what pattern a default read is said under, never the project the told list is read for.
test('the told list is still read from the project directory when defaulting', async () => {
  let asked: string | undefined;
  const tell: TellListPaths = {
    pathsFor: (settingsPath) => {
      asked = settingsPath;
      return { local: '/no/local.json', shared: '/no/shared.json', computer: '/no/computer.json' };
    },
  };

  await choosePolicy({}, filesOf({}), tell, undefined, PROJECT);

  assert.equal(asked, LOCAL, 'the representative path still names the project directory two levels up');
});

// `2026-10-09-the-file-not-its-name.md` FN14, FN15, FNB30: a place inside the project - what Block writes for a file at its
// root - holds that path alone, as Claude Code applies it; a told `./notes.md` is the root's file alone; a deny rule of one
// name is every file of it, as Claude Code applies that. Named by `--settings` (the hook's way) or read as the project's own.
// G6, GD17, built 2026-10-10: the computer's own rules are added to whatever was chosen, as `refuse` adds them - a report
// read without them said "Nothing private" of a file the computer blocks, over the refusal that named its policy.
test('the computer-wide rules are added to every policy chosen, a policy file\'s included, and an unreadable one adds none', async () => {
  const home = '/work';
  const computer = `${home}/.claude/settings.json`;
  const files = filesOf({ [LOCAL]: deny('Read(**/.env*)'), [computer]: deny('Read(~/project/plan_nauki.md)'), '/work/policy.json': JSON.stringify({ version: 1, level: 'no-read', protected: ['**/*.pem'] }) });
  for (const choice of [{}, { settingsPath: LOCAL }, { policyPath: '/work/policy.json' }]) {
    const resolved = await choosePolicy(choice, files, NO_TELL, home, PROJECT);
    assert.ok('policy' in resolved, JSON.stringify(choice));
    assert.deepEqual(resolved.policy.protected.filter((entry) => entry.everywhere === true), [{ pattern: '/work/project/plan_nauki.md', everywhere: true }], JSON.stringify(choice));
  }
  const without = await choosePolicy({}, files, NO_TELL, undefined, PROJECT);
  assert.ok('policy' in without);
  assert.ok(!without.policy.protected.some((entry) => entry.everywhere === true), 'no home, no computer');
  const unreadable: FileReader = { ...files, readText: async (path) => { if (path === computer) throw new FileAccessError('unreadable', path); return files.readText(path); } };
  const kept = await choosePolicy({}, unreadable, NO_TELL, home, PROJECT);
  assert.ok('policy' in kept);
  assert.deepEqual(kept.policy.protected, [{ pattern: '**/.env*' }]);
});

test('FN15: a project place and a told root entry hold their path alone; a rule of one name holds every file of it', async () => {
  const home = '/work';
  const toldList = `${PROJECT}/.claude/agentwhy.json`;
  const tell: TellListPaths = { pathsFor: () => ({ local: '/no/local.json', shared: toldList, computer: '/no/computer.json' }) };
  const files = filesOf({ [LOCAL]: deny('Read(~/project/drafts/**)', 'Read(./plan.md)', 'Read(./docs/notes.md)'), [toldList]: JSON.stringify({ version: 1, tell: ['./notes.md'] }) });
  for (const choice of [{ settingsPath: LOCAL }, {}]) {
    const resolved = await choosePolicy(choice, files, tell, home, PROJECT);
    assert.ok('policy' in resolved);
    assert.deepEqual(resolved.policy.protected, [
      { pattern: '**/notes.md', at: PROJECT, mode: 'tell' },
      { pattern: '**/drafts/**', at: PROJECT },
      { pattern: '**/plan.md' },
      { pattern: '**/docs/notes.md' },
    ], JSON.stringify(choice));
  }

  const broader = await choosePolicy({}, filesOf({ [LOCAL]: deny('Read(~/project/drafts/**)'), [SHARED]: deny('Read(**/drafts/**)') }), NO_TELL, home, PROJECT);
  assert.ok('policy' in broader);
  assert.deepEqual(broader.policy.protected, [{ pattern: '**/drafts/**' }], 'the other file blocks every drafts folder');
  const relative = await choosePolicy({ settingsPath: '.claude/settings.local.json' }, filesOf({ '.claude/settings.local.json': deny('Read(~/project/drafts/**)') }), NO_TELL, home);
  assert.ok('policy' in relative);
  assert.deepEqual(relative.policy.protected, [{ pattern: '/work/project/drafts/**' }], 'a project no path says: the place, as before');
});
