// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { hookEntries, withHookEntries } from '../../src/adapter/claude-code/settings/hook-entries.ts';
import { behind } from '../../src/setup/behind.ts';

const running = (invoke: string, hooks: readonly ('watch' | 'refuse')[] = ['watch']) => withHookEntries({}, hookEntries(hooks, invoke, 'local'));

// `nothing-updates-by-itself` U2, one case each.
test('a hook pinned to an older release is behind, and names the release it runs and the one serving', () => {
  assert.deepEqual(behind({ local: running('npx @agentwhy/cli@0.2.0') }, '0.3.0'), { from: '0.2.0', to: '0.3.0', shared: false });
  assert.deepEqual(behind({ shared: running('npx --yes @agentwhy/cli@0.2.0') }, '0.3.0'), { from: '0.2.0', to: '0.3.0', shared: true });
});

test('where the hooks run different releases, the lowest is named, with the file it runs from', () => {
  const files = { local: running('npx @agentwhy/cli@0.2.5'), shared: running('npx @agentwhy/cli@0.1.0', ['refuse']) };
  assert.deepEqual(behind(files, '0.3.0'), { from: '0.1.0', to: '0.3.0', shared: true });
});

test('nothing is behind where the hooks are not pinned, are installed, run a path, or are as new or newer', () => {
  for (const invoke of ['npx @agentwhy/cli', 'agentwhy', 'node /opt/agentwhy/dist/cli.js', 'npx @agentwhy/cli@0.3.0', 'npx @agentwhy/cli@0.4.0', 'npx @agentwhy/cli@0.3.0-beta.1']) {
    assert.equal(behind({ local: running(invoke) }, '0.3.0'), undefined, invoke);
  }
  assert.equal(behind({}, '0.3.0'), undefined);
});

test('nothing is behind an agentwhy that is not a release, or whose version is not known', () => {
  assert.equal(behind({ local: running('npx @agentwhy/cli@0.2.0') }, '0.0.0-dev'), undefined);
  assert.equal(behind({ local: running('npx @agentwhy/cli@0.2.0') }, undefined), undefined);
});
