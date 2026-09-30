import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseStopInput } from '../../../../src/adapter/claude-code/hooks/stop-input.ts';

const DOCUMENTED = {
  session_id: 'abc123',
  transcript_path: '/Users/someone/.claude/projects/-work-app/abc123.jsonl',
  cwd: '/work/app',
  hook_event_name: 'Stop',
  stop_hook_active: false,
  last_assistant_message: 'Done.',
};

// B6a measured this event as the one that shows a systemMessage. All it is read for is the session that turn belongs to.
// B6a measured this event as the one that shows a systemMessage; B8b measured what it carries. The session, the
// primary transcript and the turn's last words are all it is read for (`the-agent-nobody-watches.md` R3).
test('a Stop input yields the session, the primary transcript and the turn\'s last words', () => {
  assert.deepEqual(parseStopInput(JSON.stringify(DOCUMENTED)), {
    turn: { sessionId: 'abc123', active: false, transcriptPath: DOCUMENTED.transcript_path, lastMessage: 'Done.' },
  });
});

// B9c: `true` on the Stop that ends a continuation a block caused. Anything but `true` is "not inside one", so a
// flag this version cannot read never becomes the reason a person is told nothing.
test('stop_hook_active is read as true only when it is exactly true', () => {
  const active = (value: unknown): boolean | undefined => {
    const parsed = parseStopInput(JSON.stringify({ ...DOCUMENTED, stop_hook_active: value }));
    return 'turn' in parsed ? parsed.turn.active : undefined;
  };

  assert.equal(active(true), true);
  for (const value of [false, 'true', 1, null, undefined]) assert.equal(active(value), false, String(value));
});

// An input without the transcript names a session and nothing to read: the turn's own reach stays unasked.
test('a Stop input without a transcript still names the session', () => {
  const { transcript_path: _dropped, ...rest } = DOCUMENTED;
  assert.deepEqual(parseStopInput(JSON.stringify(rest)), { turn: { active: false, sessionId: 'abc123', lastMessage: 'Done.' } });
});

test('the event decides: a SubagentStop input is another event, not a Stop', () => {
  const input = { ...DOCUMENTED, hook_event_name: 'SubagentStop' };
  assert.deepEqual(parseStopInput(JSON.stringify(input)), { unusable: 'another-event' });
});

test('what cannot be used is named, never thrown', () => {
  const { session_id: _dropped, ...withoutSession } = DOCUMENTED;

  assert.deepEqual(parseStopInput('not json at all'), { unusable: 'not-json' });
  assert.deepEqual(parseStopInput(JSON.stringify(withoutSession)), { unusable: 'field-missing' });
  assert.deepEqual(parseStopInput(JSON.stringify({ ...DOCUMENTED, session_id: '' })), { unusable: 'field-missing' });
});
