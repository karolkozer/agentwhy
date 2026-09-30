import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseSubagentStopInput } from '../../../../src/adapter/claude-code/hooks/subagent-stop-input.ts';

const DOCUMENTED = {
  session_id: 'abc123',
  transcript_path: '/Users/someone/.claude/projects/-work-app/abc123.jsonl',
  cwd: '/work/app',
  permission_mode: 'default',
  hook_event_name: 'SubagentStop',
  stop_hook_active: false,
  agent_id: 'def456',
  agent_type: 'Explore',
  agent_transcript_path: '/Users/someone/.claude/projects/-work-app/abc123/subagents/agent-def456.jsonl',
  last_assistant_message: 'Analysis complete.',
};

// Spec §2, D2: the input the reference documents, until B4b measures a real one. The session comes with it: an alert
// found here is remembered under it until the turn ends (`a-notice-in-the-conversation.md` R6).
test('the documented input yields the session, the agent and its last message', () => {
  assert.deepEqual(parseSubagentStopInput(JSON.stringify(DOCUMENTED)), {
    agent: { transcriptPath: DOCUMENTED.transcript_path, agentId: 'def456', lastMessage: 'Analysis complete.', sessionId: 'abc123' },
  });
});

test('an input without a last message still names the agent', () => {
  const { last_assistant_message: _dropped, ...rest } = DOCUMENTED;
  assert.deepEqual(parseSubagentStopInput(JSON.stringify(rest)), {
    agent: { transcriptPath: DOCUMENTED.transcript_path, agentId: 'def456', sessionId: 'abc123' },
  });
});

// Without one there is no conversation to speak in, and the immediate channels are all that is left.
test('an input without a session names the agent and leaves the session out', () => {
  const { session_id: _dropped, ...rest } = DOCUMENTED;
  assert.deepEqual(parseSubagentStopInput(JSON.stringify(rest)), {
    agent: { transcriptPath: DOCUMENTED.transcript_path, agentId: 'def456', lastMessage: 'Analysis complete.' },
  });
});

test('what cannot be used is named, never thrown', () => {
  assert.deepEqual(parseSubagentStopInput('not json'), { unusable: 'not-json' });
  assert.deepEqual(parseSubagentStopInput('[1]'), { unusable: 'not-json' });
  assert.deepEqual(parseSubagentStopInput(JSON.stringify({ ...DOCUMENTED, hook_event_name: 'Stop' })), { unusable: 'another-event' });
  assert.deepEqual(parseSubagentStopInput(JSON.stringify({ ...DOCUMENTED, agent_id: '' })), { unusable: 'field-missing' });
  assert.deepEqual(parseSubagentStopInput(JSON.stringify({ ...DOCUMENTED, transcript_path: 7 })), { unusable: 'field-missing' });
});
