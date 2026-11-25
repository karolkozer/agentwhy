// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { filesWrittenIn } from '../../src/core/access/command-line.ts';
import { mainSource } from '../../src/core/evidence.ts';
import type { ToolEvent } from '../../src/core/event.ts';
import type { SessionModel } from '../../src/core/session-model.ts';
import { guardChangesOf, guardFileOf } from '../../src/report/guard-changes.ts';

const HOME = '/Users/someone';
const PROJECT = '/Users/someone/the-app';
const evidence = (record: number) => ({ source: mainSource(), record });

function event(id: string, overrides: Partial<ToolEvent>): ToolEvent {
  return {
    id, agentId: 'a1', sequence: 1, toolName: 'Edit', input: {}, targets: [], commands: [], resultShape: 'none', toolKnown: true,
    outcome: 'succeeded', evidence: evidence(1), completeness: 'complete', workingDirectory: PROJECT, ...overrides,
  };
}

function model(...events: readonly ToolEvent[]): SessionModel {
  return {
    provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [], sessionId: 's',
    projectRoot: { kind: 'absent' }, agents: [], delegations: [], events, messages: [], gaps: [], completeness: 'complete',
  };
}

const settings = `${PROJECT}/.claude/settings.local.json`;
const edit = (removed: string, written: string, path = settings, extra: Partial<ToolEvent> = {}): ToolEvent =>
  event('e', { targets: [path], removed: [removed], written: [written], ...extra });
const said = (...events: readonly ToolEvent[]) => guardChangesOf(model(...events), { home: HOME }).map((change) => change.said);

// OG1 and the guard files of §2: a closed list, never a word found in a path.
test('OG1: the guard files are the closed list, each by its place', () => {
  assert.deepEqual(guardFileOf(settings, { home: HOME }), { kind: 'block', of: 'claude-code' });
  assert.deepEqual(guardFileOf(`${HOME}/.claude/settings.json`, { home: HOME }), { kind: 'block', of: 'claude-code' });
  assert.deepEqual(guardFileOf('.claude/settings.json', { home: HOME }), { kind: 'block', of: 'claude-code' });
  assert.deepEqual(guardFileOf(`${HOME}/.codex/hooks.json`, { home: HOME }), { kind: 'block', of: 'codex' });
  assert.deepEqual(guardFileOf(`${HOME}/.codex/config.toml`, { home: HOME }), { kind: 'block', of: 'codex' });
  assert.deepEqual(guardFileOf(`${HOME}/.copilot/hooks/agentwhy.json`, { home: HOME }), { kind: 'block', of: 'copilot' });
  assert.deepEqual(guardFileOf(`${PROJECT}/.claude/agentwhy.json`, { home: HOME }), { kind: 'track' });
  assert.deepEqual(guardFileOf(`${HOME}/.agentwhy/private-files.json`, { home: HOME }), { kind: 'track' });
  assert.deepEqual(guardFileOf(`${HOME}/.agentwhy/projects/-Users-someone-the-app/private-files.json`, { home: HOME }), { kind: 'track' });
  for (const path of [`${PROJECT}/CLAUDE.md`, `${PROJECT}/docs/AGENTS.md`, `${PROJECT}/.claude/agents/reviewer.md`, `${PROJECT}/.claude/skills/x/SKILL.md`]) {
    assert.deepEqual(guardFileOf(path, { home: HOME }), { kind: 'instructions' }, path);
  }
  for (const path of [`${PROJECT}/src/settings.json`, `${PROJECT}/.codex/hooks.json`, `${PROJECT}/notes/claude-settings.local.json.md`, `${PROJECT}/README.md`]) {
    assert.equal(guardFileOf(path, { home: HOME }), undefined, path);
  }
  // With no home folder, only the form naming it: a project's own `.codex/hooks.json` is still none.
  assert.equal(guardFileOf(`${PROJECT}/.codex/hooks.json`, {}), undefined);
  assert.deepEqual(guardFileOf('~/.codex/hooks.json', {}), { kind: 'block', of: 'codex' });
  assert.deepEqual(guardFileOf(`${PROJECT}/CLAUDE.local.md`, { home: HOME }), { kind: 'instructions' });
});

// OG2: what a change did, as far as the text taken out and put in show it.
test('OG2: a deny rule taken out, added, an allow rule added, and agentwhy\'s check removed', () => {
  const deny = (...rules: readonly string[]) => `"permissions": {\n    "deny": [\n${rules.map((rule) => `      "${rule}"`).join(',\n')}\n    ]`;
  assert.deepEqual(said(edit(deny('Read(./.env)', 'Edit(./.env)'), deny())), [[{ kind: 'took-out-block', pattern: './.env' }]]);
  assert.deepEqual(said(edit(deny(), deny('Read(./secrets/**)'))), [[{ kind: 'added-block', pattern: './secrets/**' }]]);
  assert.deepEqual(said(edit('"allow": [\n', '"allow": [\n      "Read(./.env)",\n')), [[{ kind: 'added-allow', pattern: './.env' }]]);
  assert.deepEqual(said(edit('      "Read(./.env)",\n', '')), [[{ kind: 'changed-rule', pattern: './.env' }]], 'the list is not in the fragment');
  const hook = '{ "type": "command", "command": "npx @agentwhy/cli refuse --settings \\"$CLAUDE_PROJECT_DIR/.claude/settings.local.json\\"" }';
  assert.deepEqual(said(edit(`"hooks": [${hook}]`, '"hooks": []')), [[{ kind: 'removed-check' }]]);
  assert.deepEqual(said(edit(`"hooks": [${hook}]`, `"hooks": [${hook}, { "type": "command", "command": "npm test" }]`)), ['other'], 'the check stays');
  assert.deepEqual(said(edit('"model": "a"', '"model": "b"')), ['other'], 'something else changed: never nothing');
  // The review of step 1: the same rule, its list shown on one side only, is no change.
  assert.deepEqual(said(edit('      "Read(./.env)",\n', '"deny": [\n      "Read(./.env)",\n')), ['other']);
});

test('OG2: a Track list entry taken off, and what the record does not hold', () => {
  const track = `${PROJECT}/.claude/agentwhy.json`;
  assert.deepEqual(said(edit('"tell": [\n    "customers.csv",\n    "notes.md"\n  ]', '"tell": [\n    "notes.md"\n  ]', track)), [[{ kind: 'took-off-track', pattern: 'customers.csv' }]]);
  // A Write of a whole file: the record has no earlier text.
  assert.deepEqual(said(event('w', { toolName: 'Write', targets: [settings], written: ['{}'] })), ['not-in-record']);
  // An instruction file is never read (OGD2).
  assert.deepEqual(said(edit('old', 'new', `${PROJECT}/CLAUDE.md`)), ['not-in-record']);
  // A change to several files at once: which file lost which line is not known.
  assert.deepEqual(said(event('p', { toolName: 'FileChange', targets: [settings, `${PROJECT}/src/a.ts`], removed: ['"Read(./.env)"'], written: ['x'] })), ['not-in-record']);
  assert.deepEqual(said(edit('old', 'new', `${PROJECT}/src/settings.ts`)), [], 'not a guard file');
});

// OG5: a refused or unknown write is an attempt, never a change.
test('OG5: a stopped write is an attempt, and an unknown one is not known to have changed the file', () => {
  const outcomes = guardChangesOf(model(
    edit('a', 'b', settings, { id: 'x', outcome: 'blocked' }),
    edit('a', 'b', settings, { id: 'y', outcome: 'unknown' }),
    edit('a', 'b', settings, { id: 'z' }),
  ), { home: HOME }).map((change) => change.outcome);
  assert.deepEqual(outcomes, ['attempted', 'unknown', 'changed']);
});

// OG1's shell reading, and OG3: agentwhy's own command is no finding.
test('OG1, OG3: a shell line writing a guard file is a change, agentwhy\'s own command is not', () => {
  const shell = (command: string) => event(command, { toolName: 'Bash', commands: [command], resultShape: 'listing' });
  const found = (command: string) => guardChangesOf(model(shell(command)), { home: HOME }).map(({ path, file, via, said: what }) => ({ path, kind: file.kind, via, what }));
  for (const command of [
    "sed -i '' '/Read(.\\/.env)/d' .claude/settings.local.json",
    'echo "{}" > .claude/settings.json',
    'cp /tmp/backup.json .claude/settings.local.json',
    'printf x | tee -a ~/.codex/hooks.json',
  ]) {
    const [change, ...more] = found(command);
    assert.equal(more.length, 0, command);
    assert.equal(change?.via, 'shell', command);
    assert.equal(change?.what, 'not-in-record', command);
  }
  for (const command of [
    'cat .claude/settings.local.json',
    'cat .claude/settings.json > /tmp/copy.json',
    'npm test 2>&1 | tail -5',
    'npx @agentwhy/cli init --protect secrets.txt > .claude/settings.local.json',
  ]) assert.deepEqual(found(command), [], command);
  // The review of step 1: agentwhy's own command excuses only what it writes, never the rest of the line.
  assert.deepEqual(found('agentwhy protect "~/.ssh/**" && cp a ~/.codex/hooks.json').map(({ kind }) => kind), ['block']);
  assert.deepEqual(found("npx @agentwhy/cli --version && sed -i '/deny/d' .claude/settings.local.json").map(({ kind }) => kind), ['block']);
});

test('filesWrittenIn: redirections, tee, sed -i, mv and cp, and nothing a line only reads', () => {
  const cases: readonly (readonly [string, readonly string[]])[] = [
    ['echo x > out.txt', ['out.txt']],
    ['echo x >> log.txt 2> err.txt', ['log.txt', 'err.txt']],
    ['make &> build.log', ['build.log']],
    ['npm test 2>&1 >/dev/null', []],
    ['cat a | tee -a b c', ['b', 'c']],
    ["sed -i 's/a/b/' f.txt g.txt", ['f.txt', 'g.txt']],
    ["sed -i.bak -e 's/a/b/' f.txt", ['f.txt']],
    ["sed 's/a/b/' f.txt", []],
    ['mv old.json new.json', ['new.json']],
    ['cp -r a b dest/', ['dest/']],
    ['cat f.txt', []],
  ];
  for (const [command, expected] of cases) assert.deepEqual(filesWrittenIn(command), expected, command);
});

// Measured 2026-11-23 on the maintainer's conversations: the three rows the first reading turned were settings an AI wrote
// for fictional projects - a scratch folder, a sub-folder, a folder named by a variable. Only the session's own project
// and the home folder hold the person's protection.
test('a settings file of a project the session did not run in is no guard file; the home folder\'s is', () => {
  const kinds = (...events: readonly ToolEvent[]) => guardChangesOf(model(...events), { home: HOME }).map((change) => change.path);
  assert.deepEqual(kinds(
    event('a', { toolName: 'Write', targets: ['/private/tmp/scratch/proj-dot/.claude/settings.json'], written: ['{}'] }),
    event('b', { toolName: 'Write', targets: [`${PROJECT}/fixtures/project/.claude/settings.json`], written: ['{}'] }),
    event('c', { toolName: 'Bash', commands: ['cat > "$P/.claude/settings.local.json" <<EOF\n{}\nEOF'], resultShape: 'listing' }),
    event('d', { toolName: 'Bash', commands: ['echo {} > project/.claude/settings.json'], resultShape: 'listing' }),
  ), []);
  assert.deepEqual(kinds(
    event('e', { toolName: 'Write', targets: [`${HOME}/.claude/settings.json`], written: ['{}'] }),
    event('f', { toolName: 'Bash', commands: ['echo {} > .claude/settings.local.json'], resultShape: 'listing' }),
    event('g', { toolName: 'Write', targets: ['/work/other/.claude/settings.json'], written: ['{}'], workingDirectory: '/work/other' }),
  ), [`${HOME}/.claude/settings.json`, '.claude/settings.local.json', '/work/other/.claude/settings.json']);
});
