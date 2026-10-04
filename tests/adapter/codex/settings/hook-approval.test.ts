// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { approvalKey, approvalOf, entryHash, withOwnApprovals, withoutOwnApprovals, type ConfigEdit } from '../../../../src/adapter/codex/settings/hook-approval.ts';

const HOOKS_PATH = '/Users/someone/.codex/hooks.json';

/**
 * The differential pair (AOB1; conventions, "a differential invariant"): these hashes were captured from the Codex binary
 * itself (`codex-cli 0.159.3`, `hooks/list` `currentHash`, 2026-10-02) for exactly these entries - not recomputed by the
 * code under test. If a Codex release changes its recipe, this says so before a page says a block holds.
 */
const MEASURED = {
  refuse: {
    event: 'PreToolUse',
    matcher: 'Bash',
    entry: { type: 'command', command: 'npx @agentwhy/cli@9.9.9 refuse --codex' },
    hash: 'sha256:b396e0938589e2ec5d787e079b5f09a5ddcc2931d8db754294ba72ddca7470e3',
  },
  stop: {
    event: 'Stop',
    entry: { type: 'command', command: 'npx @agentwhy/cli@9.9.9 codex-stop --codex' },
    hash: 'sha256:5e461b955b5e321f8516914a1ae39e41ef94f39efc1c106c5a48ff8a4ca6de9f',
  },
} as const;

const edited = (edit: ConfigEdit): string => {
  assert.equal(edit.kind, 'edited', edit.kind === 'unsafe' ? edit.reason : '');
  return edit.kind === 'edited' ? edit.text : '';
};

test('the hash equals the one the Codex binary computed for the same entry', () => {
  assert.equal(entryHash(MEASURED.refuse), MEASURED.refuse.hash);
  assert.equal(entryHash(MEASURED.stop), MEASURED.stop.hash);
});

test('a Stop matcher is dropped before hashing; a PreToolUse matcher is kept', () => {
  assert.equal(entryHash({ ...MEASURED.stop, matcher: 'Bash' }), MEASURED.stop.hash);
  assert.notEqual(entryHash({ ...MEASURED.refuse, matcher: 'Edit' }), MEASURED.refuse.hash);
});

test('an entry outside what was measured has no hash, never a guess (AO2)', () => {
  assert.equal(entryHash({ event: 'PreToolUse', entry: { type: 'mcp_tool', command: 'x' } }), undefined);
  assert.equal(entryHash({ event: 'PreToolUse', entry: { type: 'command', command: 'x', additionalContextLimit: 100 } }), undefined);
  assert.equal(entryHash({ event: 'PreToolUse', entry: { type: 'command', command: 'x', timeout: 'soon' } }), undefined);
  assert.equal(entryHash({ event: 'PreToolUse', entry: { type: 'command', command: 'x', timeout: 1.5 } }), undefined);
});

test('the defaults equal leaving them out; a named timeout or async changes the hash', () => {
  const plain = entryHash({ event: 'Stop', entry: { type: 'command', command: 'x' } });
  assert.equal(entryHash({ event: 'Stop', entry: { type: 'command', command: 'x', timeout: 600, async: false } }), plain);
  assert.notEqual(entryHash({ event: 'Stop', entry: { type: 'command', command: 'x', timeout: 30 } }), plain);
  assert.notEqual(entryHash({ event: 'Stop', entry: { type: 'command', command: 'x', async: true } }), plain);
});

test('the key is the file, the event in snake case and the two indices', () => {
  assert.equal(approvalKey(HOOKS_PATH, { event: 'PreToolUse', group: 1, handler: 0 }), `${HOOKS_PATH}:pre_tool_use:1:0`);
  assert.equal(approvalKey(HOOKS_PATH, { event: 'Stop', group: 0, handler: 2 }), `${HOOKS_PATH}:stop:0:2`);
});

const OTHERS = `model = "gpt-5"

[projects."/Users/someone/code/shop"]
trust_level = "trusted"

[hooks.state."/Users/someone/.codex/hooks.json:pre_tool_use:0:0"]
trusted_hash = "sha256:someone-elses"
`;

test('writing appends agentwhy\'s tables and leaves every other byte; a second write changes nothing', () => {
  const key = `${HOOKS_PATH}:pre_tool_use:1:0`;
  const next = edited(withOwnApprovals(OTHERS, HOOKS_PATH, [{ key, hash: 'sha256:ours' }]));
  assert.ok(next.startsWith(OTHERS));
  assert.deepEqual(approvalOf(next, key), { hash: 'sha256:ours', disabled: false });
  assert.deepEqual(approvalOf(next, `${HOOKS_PATH}:pre_tool_use:0:0`), { hash: 'sha256:someone-elses', disabled: false });
  assert.equal(edited(withOwnApprovals(next, HOOKS_PATH, [{ key, hash: 'sha256:ours' }])), next);
});

test('a changed hash is replaced in place; keys with quotes and backslashes round-trip', () => {
  const path = 'C:\\Users\\some "one"\\.codex\\hooks.json';
  const key = `${path}:stop:0:0`;
  const written = edited(withOwnApprovals('', path, [{ key, hash: 'sha256:a' }]));
  const changed = edited(withOwnApprovals(written, path, [{ key, hash: 'sha256:b' }]));
  assert.deepEqual(approvalOf(changed, key), { hash: 'sha256:b', disabled: false });
  assert.equal(changed.match(/\[hooks\.state\./g)?.length, 1);
});

test('a header written with spaces and a trailing comment is read as the same table', () => {
  const key = `${HOOKS_PATH}:stop:1:0`;
  const spaced = `[ hooks . state . "${key}" ]  # by hand\ntrusted_hash = "sha256:old"  # note\n`;
  assert.deepEqual(approvalOf(spaced, key), { hash: 'sha256:old', disabled: false });
  const next = edited(withOwnApprovals(spaced, HOOKS_PATH, [{ key, hash: 'sha256:new' }]));
  assert.deepEqual(approvalOf(next, key), { hash: 'sha256:new', disabled: false });
  assert.match(next, /# by hand/, 'the person\'s header stays as written');
});

test('a stale agentwhy table - its hash at a key no longer agentwhy\'s - is dropped; a stranger\'s is not', () => {
  const stale = `${OTHERS}\n[hooks.state."${HOOKS_PATH}:pre_tool_use:2:0"]\ntrusted_hash = "sha256:ours"\n`;
  const next = edited(withOwnApprovals(stale, HOOKS_PATH, [{ key: `${HOOKS_PATH}:pre_tool_use:1:0`, hash: 'sha256:ours' }]));
  assert.equal(approvalOf(next, `${HOOKS_PATH}:pre_tool_use:2:0`), undefined);
  assert.deepEqual(approvalOf(next, `${HOOKS_PATH}:pre_tool_use:0:0`), { hash: 'sha256:someone-elses', disabled: false });
});

test('a person\'s enabled = false moves with agentwhy\'s approval to the new key of the same event (AO2)', () => {
  const stale = `[hooks.state."${HOOKS_PATH}:stop:2:0"]\nenabled = false\ntrusted_hash = "sha256:ours-stop"\n`;
  const next = edited(withOwnApprovals(stale, HOOKS_PATH, [
    { key: `${HOOKS_PATH}:pre_tool_use:1:0`, hash: 'sha256:ours-pre' },
    { key: `${HOOKS_PATH}:stop:1:0`, hash: 'sha256:ours-stop' },
  ]));
  assert.deepEqual(approvalOf(next, `${HOOKS_PATH}:stop:1:0`), { hash: 'sha256:ours-stop', disabled: true });
  assert.deepEqual(approvalOf(next, `${HOOKS_PATH}:pre_tool_use:1:0`), { hash: 'sha256:ours-pre', disabled: false }, 'only the same event');
  assert.equal(approvalOf(next, `${HOOKS_PATH}:stop:2:0`), undefined);
});

test('removal takes agentwhy\'s tables out whole, enabled = false included, and leaves others byte for byte', () => {
  const key = `${HOOKS_PATH}:stop:1:0`;
  const written = edited(withOwnApprovals(OTHERS, HOOKS_PATH, [{ key, hash: 'sha256:ours' }]));
  assert.equal(edited(withoutOwnApprovals(written, HOOKS_PATH, new Set([key]), new Set(['sha256:ours']))), OTHERS);

  const disabled = `${OTHERS}\n[hooks.state."${key}"]\nenabled = false\ntrusted_hash = "sha256:ours"\n`;
  const removed = edited(withoutOwnApprovals(disabled, HOOKS_PATH, new Set([key]), new Set(['sha256:ours'])));
  assert.doesNotMatch(removed, /enabled = false/, 'it named agentwhy\'s entry; left, it would disable whatever lands there next');
  assert.match(removed, /sha256:someone-elses/);
});

// AO11: a line edit beside these forms would make the file invalid, and Codex would not start.
test('agentwhy\'s key, or hooks itself, in a form a line edit cannot extend is unsafe, and nothing is written', () => {
  const key = `${HOOKS_PATH}:pre_tool_use:1:0`;
  const want = [{ key, hash: 'sha256:ours' }];
  for (const [form, toml] of [
    ['a dotted key at the root', `hooks.state."${key}".trusted_hash = "sha256:x"\n`],
    ['hooks inline at the root', `hooks = { state = {} }\n`],
    ['state inline in [hooks]', `[hooks]\nstate = {}\n`],
    ['the key inline in [hooks.state]', `[hooks.state]\n"${key}" = { trusted_hash = "sha256:x" }\n`],
    ['the key in a literal-string header', `[hooks.state.'${key}']\ntrusted_hash = "sha256:x"\n`],
    ['the header twice', `[hooks.state."${key}"]\ntrusted_hash = "a"\n\n[hooks.state."${key}"]\ntrusted_hash = "b"\n`],
  ] as const) {
    assert.equal(withOwnApprovals(toml, HOOKS_PATH, want).kind, 'unsafe', form);
  }
  assert.equal(withOwnApprovals(`[hooks.state]\n"${HOOKS_PATH}:stop:0:0" = { trusted_hash = "sha256:x" }\n`, HOOKS_PATH, want).kind, 'edited', 'another key inline is no conflict');
});

// Found by review: a key this does not read is not an absent key - a line added beside it is a duplicate, and
// duplicate keys are invalid TOML, so Codex would refuse the whole config.
test('agentwhy\'s own table holding trusted_hash or enabled in another form is unsafe, and nothing is written', () => {
  const key = `${HOOKS_PATH}:stop:1:0`;
  const want = [{ key, hash: 'sha256:ours' }];
  for (const [form, toml] of [
    ['a literal-string hash', `[hooks.state."${key}"]\ntrusted_hash = 'sha256:old'\n`],
    ['a quoted key', `[hooks.state."${key}"]\n"trusted_hash" = "sha256:old"\n`],
    ['a hash over several lines', `[hooks.state."${key}"]\ntrusted_hash = """\nsha256:old"""\n`],
  ] as const) {
    assert.equal(withOwnApprovals(toml, HOOKS_PATH, want).kind, 'unsafe', form);
  }

  // The carried `enabled = false` of AO2 is only added where no `enabled` line is there to be duplicated.
  const stale = `[hooks.state."${HOOKS_PATH}:stop:2:0"]\nenabled = false\ntrusted_hash = "sha256:ours"\n`;
  const on = `${stale}\n[hooks.state."${key}"]\nenabled = true\ntrusted_hash = "sha256:ours"\n`;
  assert.equal(withOwnApprovals(on, HOOKS_PATH, want).kind, 'unsafe', 'enabled = true, and the stale table is disabled');
  assert.equal(withOwnApprovals(on, HOOKS_PATH, [{ key, hash: 'sha256:other' }]).kind, 'edited', 'no choice to carry: the hash alone is replaced');
});

test('a line inside a multi-line string is never read as a table', () => {
  const key = `${HOOKS_PATH}:stop:1:0`;
  const toml = `developer_instructions = """\n[hooks.state."${key}"]\ntrusted_hash = "sha256:quoted"\n"""\n`;
  assert.equal(approvalOf(toml, key), undefined);
  const next = edited(withOwnApprovals(toml, HOOKS_PATH, [{ key, hash: 'sha256:ours' }]));
  assert.ok(next.startsWith(toml), 'the string is left exactly as it was');
  assert.deepEqual(approvalOf(next, key), { hash: 'sha256:ours', disabled: false });
});

// AO11: a triple quote that opens nothing - in a comment, inside a single-line string, or closed on its own line -
// leaves the rest of the file readable. Read as one odd count per line, an existing approval is missed and a second
// table appended under the same key, which Codex will not start on.
test('a triple quote that opens no multi-line string hides nothing after it', () => {
  const key = `${HOOKS_PATH}:stop:0:0`;
  const table = `[hooks.state."${key}"]\ntrusted_hash = "sha256:old"\n`;
  for (const [form, before] of [
    ['a comment', '# a path written """ like this\n'],
    ['a basic string', `notify = "say ''' now"\n`],
    ['a literal string', `notify = 'say """ now'\n`],
    ['a multi-line string closed on its line', 'instructions = """one line"""\n'],
    ['an escaped quote in a basic string', 'notify = "a \\" and \'\'\' after it"\n'],
  ] as const) {
    const toml = `${before}${table}`;
    assert.deepEqual(approvalOf(toml, key), { hash: 'sha256:old', disabled: false }, form);
    const next = edited(withOwnApprovals(toml, HOOKS_PATH, [{ key, hash: 'sha256:ours' }]));
    assert.equal(next.split('[hooks.state.').length - 1, 1, `${form}: the table is edited in place, never a second one appended`);
    assert.deepEqual(approvalOf(next, key), { hash: 'sha256:ours', disabled: false }, form);
  }
});
