// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { codexCheckState } from '../../../../src/adapter/codex/settings/codex-check.ts';
import { agentwhyCodexEntries, approvedCodexEntries } from '../../../../src/adapter/codex/settings/codex-hooks.ts';
import { approvalKey, entryHash } from '../../../../src/adapter/codex/settings/hook-approval.ts';
import { FileAccessError } from '../../../../src/ports/file-access-error.ts';
import type { FileReader } from '../../../../src/ports/file-reader.ts';
import type { JsonObject } from '../../../../src/shared/json.ts';

const HOME = '/Users/someone';
const HOOKS_PATH = join(HOME, '.codex', 'hooks.json');
const own = (command: string) => ({ type: 'command', command, timeout: 30 });
const REFUSE = own('agentwhy refuse --codex');
const STOP = own('agentwhy codex-stop --codex');

/** `~/.codex` as this computer holds it: the two files, each absent where it is not given. */
const files = (hooks: JsonObject | undefined, config: string | undefined): FileReader => ({
  readText: async (path) => {
    const text = path === HOOKS_PATH ? (hooks === undefined ? undefined : JSON.stringify(hooks)) : config;
    if (text === undefined) throw new FileAccessError('not-found', path);
    return text;
  },
  readLines: async function* () {},
});

/** The config approving exactly the entries setup approves, as `CodexMirror` writes it. */
const approving = (hooks: JsonObject): string =>
  approvedCodexEntries(hooks)
    .map((entry) => `[hooks.state."${approvalKey(HOOKS_PATH, entry)}"]\ntrusted_hash = "${entryHash(entry) ?? ''}"\n`)
    .join('\n');

const pair: JsonObject = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [REFUSE] }], Stop: [{ hooks: [STOP] }] } };
/** AO4: a second agentwhy entry sharing a group with another tool's, which setup leaves where it is, unapproved. */
const withStuck: JsonObject = {
  hooks: {
    PreToolUse: [{ matcher: 'Bash', hooks: [REFUSE] }, { matcher: 'Bash', hooks: [own('other-tool check'), REFUSE] }],
    Stop: [{ hooks: [STOP] }],
  },
};

test('the approved pair reads as on', async () => {
  assert.equal(await codexCheckState(files(pair, approving(pair)), HOME), 'on');
});

// A stuck entry is never approved (AO3, AO4), so demanding an approval for it too would say `stale` for good: no run
// of setup could ever clear it, and the page's Fix it would stay there with nothing left to fix.
test('an entry left sharing a group with another tool\'s does not make the approved check stale', async () => {
  assert.equal(agentwhyCodexEntries(withStuck).length, 3, 'three entries of agentwhy\'s');
  assert.equal(approvedCodexEntries(withStuck).length, 2, 'two of them approved: the first of each event');
  assert.equal(await codexCheckState(files(withStuck, approving(withStuck)), HOME), 'on');
});

test('entries with no approval, a wrong hash or a person\'s enabled = false read as stale', async () => {
  assert.equal(await codexCheckState(files(pair, ''), HOME), 'stale', 'nothing approved');
  assert.equal(await codexCheckState(files(pair, undefined), HOME), 'stale', 'no config.toml to read');
  assert.equal(await codexCheckState(files(pair, approving(pair).replace(/sha256:[0-9a-f]+/, 'sha256:older')), HOME), 'stale', 'a hash that moved on');
  const offByHand = approving(pair).replace(/\n/, '\nenabled = false\n');
  assert.equal(await codexCheckState(files(pair, offByHand), HOME), 'stale', 'both approved, the first turned off by hand');
});

test('no entries of agentwhy\'s, and no hooks file at all, read as absent', async () => {
  assert.equal(await codexCheckState(files({ hooks: { Stop: [{ hooks: [own('other-tool check')] }] } }, ''), HOME), 'absent');
  assert.equal(await codexCheckState(files(undefined, ''), HOME), 'absent');
});
