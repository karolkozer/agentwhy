import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { codexRefuseCommand, codexRefuseIn, codexStopCommand, codexStopIn, withCodexRefuse, withoutCodexRefuse } from '../../../../src/adapter/codex/settings/codex-hooks.ts';

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
