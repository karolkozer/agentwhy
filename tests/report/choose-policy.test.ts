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
