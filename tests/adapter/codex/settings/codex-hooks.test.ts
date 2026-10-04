// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { agentwhyCodexEntries, codexRefuseCommand, codexRefuseIn, codexRefuseSettings, codexStopCommand, codexStopIn, withCodexRefuse, withOwnPair, withoutCodexRefuse, withoutOwnEntries } from '../../../../src/adapter/codex/settings/codex-hooks.ts';

const OURS = codexRefuseCommand('npx @agentwhy/cli@1.2.3', '.claude/settings.local.json');
const STOP = codexStopCommand('npx @agentwhy/cli@1.2.3');
/** Somebody else's hook on the same event, and a key agentwhy never writes. */
const THEIRS = { note: 'kept', hooks: {
  PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'lint-shell' }] }],
  Stop: [{ hooks: [{ type: 'command', command: 'echo codex-stop' }] }],
} };

// codex-blocks-too CK3: no absolute path, so the file works in a clone.
test('the command runs refuse --codex, with the rules as a path in the project', () => {
  assert.equal(OURS, 'npx @agentwhy/cli@1.2.3 refuse --codex --settings ".claude/settings.local.json"');
  assert.equal(codexRefuseCommand('agentwhy', undefined), 'agentwhy refuse --codex');
  assert.equal(STOP, 'npx @agentwhy/cli@1.2.3 codex-stop --codex');
});

// codex-says-it-too CX5: the Stop hook reads the rules `refuse` reads, named where `refuse` names them.
test('the rules refuse reads are read back from the file, and none where it names none', () => {
  assert.equal(codexRefuseSettings(withCodexRefuse({}, codexRefuseCommand('agentwhy', '.claude/settings.json'), STOP)), '.claude/settings.json');
  assert.equal(codexRefuseSettings(withCodexRefuse({}, codexRefuseCommand('agentwhy', undefined), STOP)), undefined);
  assert.equal(codexRefuseSettings(THEIRS), undefined);
});

// CK5, CKB4: Codex's shape - an event's list of matcher entries, each with its commands.
test('an empty file gets a PreToolUse refusal and a Stop conversation message', () => {
  const installed = withCodexRefuse({}, OURS, STOP);
  assert.deepEqual(installed, { hooks: {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: OURS }] }],
    Stop: [{ hooks: [{ type: 'command', command: STOP }] }],
  } });
  assert.equal(codexRefuseIn(installed), OURS);
  assert.equal(codexStopIn(installed), STOP);
});

// K13: a hook somebody wrote stays exactly as it was, beside agentwhy's.
test('another hook and another key stay, and a second write replaces agentwhy\'s entry rather than adding one', () => {
  const once = withCodexRefuse(THEIRS, OURS, STOP);
  const next = codexRefuseCommand('agentwhy', undefined);
  const twice = withCodexRefuse(once, next, 'agentwhy codex-stop --codex');

  assert.equal(twice['note'], 'kept');
  assert.deepEqual((twice['hooks'] as { PreToolUse: unknown[] }).PreToolUse, [
    { matcher: 'Bash', hooks: [{ type: 'command', command: 'lint-shell' }] },
    { matcher: 'Bash', hooks: [{ type: 'command', command: next }] },
  ]);
  assert.equal(codexRefuseIn(twice), next);
  assert.equal(codexStopIn(twice), 'agentwhy codex-stop --codex');
  assert.deepEqual((twice['hooks'] as { Stop: unknown[] }).Stop[0], THEIRS.hooks.Stop[0]);
});

test('taking it out leaves the rest, and says how many commands went', () => {
  const { file, removed } = withoutCodexRefuse(withCodexRefuse(THEIRS, OURS, STOP));
  assert.equal(removed, 2);
  assert.deepEqual(file, THEIRS);

  const alone = withoutCodexRefuse(withCodexRefuse({}, OURS, STOP));
  assert.deepEqual(alone, { file: { hooks: {} }, removed: 2 });
  assert.deepEqual(withoutCodexRefuse(THEIRS), { file: THEIRS, removed: 0 }, 'nothing of agentwhy\'s, nothing changed');
});

// Only `refuse --codex` is agentwhy's here: a Claude Code-style command somebody copied in is not taken for it.
test('a command without --codex is not agentwhy\'s Codex hook', () => {
  const copied = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'npx @agentwhy/cli refuse' }] }] } };
  assert.equal(codexRefuseIn(copied), undefined);
  assert.equal(withoutCodexRefuse(copied).removed, 0);
});

// `2026-10-02-codex-approves-its-own-hook.md` AO1, AO4, AOD3: the person's own file, where approval keys are positional.
const REFUSE_NOW = 'agentwhy refuse --codex';
const STOP_NOW = 'agentwhy codex-stop --codex';
/** An entry as found in a file - older ones carry no timeout. */
const own = (command: string) => ({ type: 'command', command });
/** An entry as `withOwnPair` writes it: with Codex's wait for the check (AOD9). */
const written = (command: string) => ({ type: 'command', command, timeout: 30 });
/** Another tool's hooks first, as GitKraken's were in the measured file (AOB1 e). */
const TOOL = { matcher: '', hooks: [own('gk ai hook run --host codex')] };
const AFTER = { matcher: '', hooks: [own('later-tool run')] };

test('the pair is appended after another tool\'s entries, keyed as Codex counts them', () => {
  const { file, removed, stuck } = withOwnPair({ hooks: { PreToolUse: [TOOL], Stop: [TOOL] } }, REFUSE_NOW, STOP_NOW);
  assert.deepEqual(file, { hooks: {
    PreToolUse: [TOOL, { matcher: 'Bash', hooks: [written(REFUSE_NOW)] }],
    Stop: [TOOL, { hooks: [written(STOP_NOW)] }],
  } });
  assert.deepEqual([removed, stuck], [0, 0]);
  assert.deepEqual(agentwhyCodexEntries(file).map((entry) => [entry.event, entry.group, entry.handler, entry.matcher]), [
    ['PreToolUse', 1, 0, 'Bash'],
    ['Stop', 1, 0, undefined],
  ]);
});

// AOD3: a changed command stays where it is, so the tool after it keeps its key and approval.
test('a changed command is rewritten in place, and an entry after it keeps its position', () => {
  const before = { hooks: {
    PreToolUse: [TOOL, { matcher: 'Bash', hooks: [own('npx @agentwhy/cli@0.1.0 refuse --codex')] }, AFTER],
    Stop: [{ hooks: [own('npx @agentwhy/cli@0.1.0 codex-stop --codex')] }, AFTER],
  } };
  const { file } = withOwnPair(before, REFUSE_NOW, STOP_NOW);
  assert.deepEqual(file, { hooks: {
    PreToolUse: [TOOL, { matcher: 'Bash', hooks: [written(REFUSE_NOW)] }, AFTER],
    Stop: [{ hooks: [written(STOP_NOW)] }, AFTER],
  } });
});

// AO4, AOB4, AOB5: two pairs means everything said twice; whatever wrote the second, one stays.
test('two agentwhy pairs become one, the first in place; a duplicate before another tool\'s entry leaves an empty group', () => {
  const before = { hooks: {
    PreToolUse: [
      { matcher: 'Bash', hooks: [own('npx @agentwhy/cli@0.1.0 refuse --codex')] },
      { matcher: 'Bash', hooks: [own(REFUSE_NOW)] },
      AFTER,
    ],
    Stop: [{ hooks: [own(STOP_NOW)] }, { hooks: [own('npx @agentwhy/cli@0.1.0 codex-stop --codex')] }],
  } };
  const { file, removed, stuck } = withOwnPair(before, REFUSE_NOW, STOP_NOW);
  assert.deepEqual(file, { hooks: {
    PreToolUse: [{ matcher: 'Bash', hooks: [written(REFUSE_NOW)] }, { matcher: 'Bash', hooks: [] }, AFTER],
    Stop: [{ hooks: [written(STOP_NOW)] }],
  } }, 'the empty group keeps AFTER at index 2; a trailing one goes');
  assert.deepEqual([removed, stuck], [2, 0]);
});

// AO4: an agentwhy entry with another tool's after it in the same group cannot come out without moving that one.
test('an entry sharing a group with a later entry of another tool stays, and is counted as stuck', () => {
  const shared = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [own('npx @agentwhy/cli@0.1.0 refuse --codex'), own('lint-shell')] }] } };
  const { file, removed, stuck } = withoutOwnEntries(shared);
  assert.deepEqual(file, shared);
  assert.deepEqual([removed, stuck], [0, 1]);
});

// AO4, AO7: removal keeps every later key; trailing emptied groups go, and the event's list with them only when empty.
test('removal leaves an empty group before another tool\'s entry, and drops trailing ones', () => {
  const installed = withOwnPair({ hooks: { PreToolUse: [TOOL], Stop: [TOOL] } }, REFUSE_NOW, STOP_NOW).file;
  const later = { ...installed, hooks: { ...(installed.hooks as object), Stop: [TOOL, { hooks: [own(STOP_NOW)] }, AFTER] } };
  const { file, removed, stuck } = withoutOwnEntries(later);
  assert.deepEqual(file, { hooks: { PreToolUse: [TOOL], Stop: [TOOL, { hooks: [] }, AFTER] } });
  assert.deepEqual([removed, stuck], [2, 0]);
  assert.deepEqual(withoutOwnEntries({ hooks: { PreToolUse: [TOOL] } }), { file: { hooks: { PreToolUse: [TOOL] } }, removed: 0, stuck: 0 });
});
