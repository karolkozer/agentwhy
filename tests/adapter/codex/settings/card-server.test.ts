// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FileAccessError } from '../../../../src/ports/file-access-error.ts';
import type { FileReader } from '../../../../src/ports/file-reader.ts';
import { cardServerIn, codexCardState, withCardServer, withoutCardServer } from '../../../../src/adapter/codex/settings/card-server.ts';

// `.ai/specs/2026-11-25-the-card-in-codex.md` CCX1, CCX4, CCX5, CCX6.
const RUN = ['npx', '-y', '@agentwhy/cli@1.2.3', 'cards'] as const;
const added = (toml: string, run: readonly string[] = RUN): string => {
  const edit = withCardServer(toml, run);
  assert.equal(edit.kind, 'edited');
  return edit.kind === 'edited' ? edit.text : '';
};
const out = (toml: string): string => {
  const edit = withoutCardServer(toml);
  return edit.kind === 'edited' ? edit.text : edit.reason;
};
const OTHERS = 'model = "x"\n\n[mcp_servers.buffer]\ncommand = "b"\n\n[hooks.state."/a:stop:0:0"]\ntrusted_hash = "sha256:1"\n';

test('the table is added at the end, read back as agentwhy\'s, and taken out to the byte', () => {
  for (const toml of ['', 'model = "x"', OTHERS, '# only a comment\n']) {
    const text = added(toml);
    assert.match(text, /\[mcp_servers\.agentwhy\]\n# agentwhy's card[^\n]*\ncommand = "npx"\nargs = \["-y", "@agentwhy\/cli@1\.2\.3", "cards"\]\nstartup_timeout_sec = 30\ntool_timeout_sec = 120\n$/);
    assert.deepEqual(cardServerIn(text), { kind: 'own', run: [...RUN], disabled: false });
    assert.equal(out(text), toml === '' || toml.endsWith('\n') ? toml : `${toml}\n`);
    assert.equal(added(text), text, 'a second run changes nothing');
  }
});

test('a newer agentwhy is written in place, and what else the person put there stays', () => {
  const held = added(OTHERS).replace('tool_timeout_sec = 120', 'tool_timeout_sec = 300\nenabled = false') + '\n[mcp_servers.agentwhy.tools.what_happened]\napproval_mode = "approve"\n\n[last]\na = 1\n';
  const newer = added(held, ['agentwhy', 'cards']);
  assert.match(newer, /command = "agentwhy"\nargs = \["cards"\]\nstartup_timeout_sec = 30\ntool_timeout_sec = 300\nenabled = false/);
  assert.deepEqual(cardServerIn(newer), { kind: 'own', run: ['agentwhy', 'cards'], disabled: true });
  // Left behind, its own sub-tables would be a server with no command, on which Codex does not start.
  const gone = out(newer);
  assert.doesNotMatch(gone, /agentwhy/);
  assert.match(gone, /\[last\]\na = 1\n$/);
});

test('a table a person wrote is theirs: never changed, never taken out', () => {
  const theirs = '[mcp_servers.agentwhy]\ncommand = "node"\nargs = ["/somewhere/cli.js", "cards"]\n';
  assert.deepEqual(cardServerIn(theirs), { kind: 'yours', disabled: false });
  assert.equal(cardServerIn(theirs + 'enabled = false\n').kind, 'yours');
  assert.equal(withCardServer(theirs, RUN).kind, 'unsafe');
  assert.equal(out(theirs), theirs);
});

test('a form a line edit cannot read is left alone and said', () => {
  for (const toml of [
    'mcp_servers = { agentwhy = { command = "x" } }\n', 'mcp_servers.agentwhy.command = "x"\n', '[mcp_servers]\nagentwhy = { command = "x" }\n',
    '[mcp_servers]\nagentwhy.command = "x"\n', '[mcp_servers."agentwhy"]\ncommand = "x"\n', "[mcp_servers.'agentwhy']\ncommand = \"x\"\n",
    '[mcp_servers.agentwhy.env]\nA = "1"\n', `${added('')}${added('')}`, '[[mcp_servers.agentwhy]]\ncommand = "x"\n', '[ mcp_servers . "agentwhy" ]\ncommand = "x"\n',
  ]) {
    assert.equal(cardServerIn(toml).kind, 'unsafe', toml);
    assert.equal(withCardServer(toml, RUN).kind, 'unsafe', toml);
    assert.equal(withoutCardServer(toml).kind, 'unsafe', toml);
  }
});

test('a name in a string or a comment, and another server\'s, is no table of agentwhy\'s', () => {
  for (const toml of ['note = """\n[mcp_servers.agentwhy]\n"""\n', '# [mcp_servers.agentwhy]\n', '[mcp_servers.agentwhy2]\ncommand = "x"\n', '[mcp_servers]\nother = { command = "x" }\n']) {
    assert.equal(cardServerIn(toml).kind, 'absent', toml);
    assert.equal(withoutCardServer(toml).kind, 'edited');
    assert.equal(out(added(toml)), toml);
  }
});

test('Codex writes the file too, and drops the comment: the table is still agentwhy\'s', () => {
  const rewritten = added('').split('\n').filter((line) => !line.startsWith('#')).join('\n').replace('= 30', '= 30.0').replace('= 120', '= 120.0');
  assert.deepEqual(cardServerIn(rewritten), { kind: 'own', run: [...RUN], disabled: false });
  assert.match(added(rewritten, ['agentwhy', 'cards']), /command = "agentwhy"/);
  assert.equal(out(rewritten), '');
});

test('only agentwhy in plain words is written or taken for its own', () => {
  for (const run of [['node', './cli.js', 'cards'], ['npx', '@someone/agentwhy', 'cards'], ['sh', '-c', 'agentwhy cards'], ['agentwhy', 'refuse'], ['a"b\n[x]', 'cards']]) {
    assert.equal(withCardServer('', run).kind, 'unsafe', run.join(' '));
    assert.equal(cardServerIn(`[mcp_servers.agentwhy]\ncommand = ${JSON.stringify(run[0])}\nargs = ${JSON.stringify(run.slice(1))}\nstartup_timeout_sec = 30\n`).kind, 'yours', run.join(' '));
  }
});

test('the state a page says: on, yours, off, and not known where the file could not be read for it', async () => {
  const state = (text: string | Error) => codexCardState({ readText: async () => { if (text instanceof Error) throw text; return text; } } as unknown as FileReader, '/Users/someone');
  assert.equal(await state(added('')), 'on');
  assert.equal(await state(`${added('')}enabled = false\n`), 'off');
  assert.equal(await state('[mcp_servers.agentwhy]\ncommand = "node"\n'), 'yours');
  assert.equal(await state('[mcp_servers.agentwhy]\ncommand = "node"\nenabled = false\n'), 'yours', 'theirs to turn on');
  assert.equal(await state('a = 1\n'), 'off');
  assert.equal(await state('mcp_servers = { agentwhy = {} }\n'), 'unknown');
  assert.equal(await state(new FileAccessError('not-found', 'x')), 'off');
  assert.equal(await state(new FileAccessError('unreadable', 'x')), 'unknown');
});

// The review of 2026-11-25.
test('what the person wrote after it, a comment or a table, stays to the byte', () => {
  const table = added('a = 1\n');
  for (const after of ['\n# my precious note\n# about z\n[z]\nb = 2\n', '\n# [mcp_servers.other]\n# command = "x"\n']) {
    assert.equal(out(table + after), `a = 1\n${after}`);
  }
  const crlf = added('a = 1\n').replaceAll('\n', '\r\n');
  assert.doesNotMatch(out(crlf), /agentwhy/);
});

test('a list written over several lines is no header, and hides none after it', () => {
  const lists = 'x = [\n  [1, 2],\n  ["]", \'[\'], # [\n]\n';
  assert.deepEqual(cardServerIn(added(lists)), { kind: 'own', run: [...RUN], disabled: false });
  assert.equal(out(added(lists)), lists);
  assert.equal(cardServerIn(`${lists}mcp_servers = { agentwhy = { command = "x" } }\n`).kind, 'unsafe');
  const held = added('') + 'extra = [\n  ["a"],\n]\n\n[z]\n';
  assert.equal(out(held), '\n[z]\n');
  for (const toml of ['x = [\n  """\n]\n""",\n]\n', 'x = [\n 1,\n']) assert.equal(withCardServer(toml, RUN).kind, 'unsafe', toml);
});

test('off is read however the key is written', () => {
  assert.equal(cardServerIn(`${added('')}"enabled" = false\n`).kind === 'own' && (cardServerIn(`${added('')}"enabled" = false\n`) as { disabled: boolean }).disabled, true);
});
