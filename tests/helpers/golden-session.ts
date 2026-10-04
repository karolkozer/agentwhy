// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { jsonl } from './synthetic-session.ts';

/**
 * The session the report goldens are drawn from (`specs/2026-09-15-findings-worth-reading.md` criterion 10). A delegated
 * agent reaches a protected file through what a `grep` brought back - the motivating case's shape - while the
 * session itself names one outright, a rule refuses one attempt, and one call never returns, so every section of
 * the summary has something to say. As the motivating case did (`specs/2026-09-15-where-the-value-went.md` §2), the agent runs
 * in the background: its result is a launch notice, its report - carrying the value - is delivered on a line of its
 * own, and the session then writes that value into a file that is not protected.
 *
 * It is written into a temporary directory by the test and by `golden:report`, and never committed as JSONL:
 * committed fixtures may carry nothing but markers (canary check 5), and a report golden has to show a path.
 */
export const GOLDEN_SESSION_ID = 'synthetic-delegated-search';

const AGENT_ID = 'a2222222222222222';
const WORKING_DIRECTORY = '/work/the-app';
const ASKED_TO = 'Find why the webhook returns 500';

/** A tool-use id in the shape of a real one, which the scanner's identifier rules key on (lesson L001). */
const id = (tag: string): string => `toolu_01${tag.padEnd(22, 'A')}`;
const uuid = (digit: string): string => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;

function call(record: string, tool: string, name: string, input: object, agent = false): object {
  return {
    type: 'assistant',
    isSidechain: agent,
    ...(agent ? { agentId: AGENT_ID } : {}),
    cwd: WORKING_DIRECTORY,
    uuid: record,
    message: { role: 'assistant', content: [{ type: 'tool_use', id: tool, name, input }] },
  };
}

function result(tool: string, content: string, agent = false, extra: object = {}): object {
  return {
    type: 'user',
    isSidechain: agent,
    ...(agent ? { agentId: AGENT_ID } : {}),
    cwd: WORKING_DIRECTORY,
    ...extra,
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tool, content }] },
  };
}

/** What the agent worked out before it called, which `specs/2026-09-15-why-this-call.md` reads as the words before a call. */
function thought(record: string, text: string): object {
  return {
    type: 'assistant',
    isSidechain: true,
    agentId: AGENT_ID,
    cwd: WORKING_DIRECTORY,
    uuid: record,
    message: { role: 'assistant', content: [{ type: 'thinking', thinking: text, signature: 'golden' }] },
  };
}

/** A text block the delegated agent wrote: its own words, which are not what came back. */
function wrote(record: string, text: string): object {
  return {
    type: 'assistant',
    isSidechain: true,
    agentId: AGENT_ID,
    cwd: WORKING_DIRECTORY,
    uuid: record,
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  };
}

/** A launch notice: the payload says the agent started, and the words carry no report. */
function launched(tool: string): object {
  return result(tool, `Async agent launched successfully.\nagentId: ${AGENT_ID}`, false, {
    toolUseResult: { isAsync: true, status: 'async_launched', agentId: AGENT_ID, description: ASKED_TO },
  });
}

/** The agent's report, queued and then delivered to the session on a user line of its own. */
function delivered(tool: string, report: string): object[] {
  const words = `<task-notification>\n<task-id>${AGENT_ID}</task-id>\n<tool-use-id>${tool}</tool-use-id>\n<status>completed</status>\n<result>${report}</result>\n</task-notification>`;
  return [
    { type: 'queue-operation', operation: 'enqueue', sessionId: GOLDEN_SESSION_ID, content: words },
    { type: 'user', isSidechain: false, cwd: WORKING_DIRECTORY, message: { role: 'user', content: words } },
  ];
}

/** Relative path to content, in the layout of spec §4.0: `<session-id>.jsonl` beside `<session-id>/`. */
export function goldenSessionFiles(): Record<string, string> {
  const delegation = id('GOLDENAGENT');
  const denied = uuid('5');
  const report = 'WEBHOOK_SECRET in apps/web/.env.development is fixture-value; the handler signs with another.';

  return {
    [`${GOLDEN_SESSION_ID}.jsonl`]: jsonl(
      call(uuid('1'), id('GOLDENREAD'), 'Read', { file_path: 'apps/web/.npmrc' }),
      result(id('GOLDENREAD'), 'registry set'),
      call(uuid('2'), delegation, 'Agent', {
        description: ASKED_TO,
        prompt: 'confirm which secret the webhook is configured to use',
        subagent_type: 'Explore',
      }),
      launched(delegation),
      ...delivered(delegation, report),
      call(uuid('8'), id('GOLDENWRITE'), 'Write', { file_path: 'docs/incident.md', content: 'The webhook signs with fixture-value.\n' }),
      result(id('GOLDENWRITE'), 'File created'),
      // No result follows this one: the summary has a gap to put before what was reached.
      call(uuid('3'), id('GOLDENPENDING'), 'Bash', { command: 'npm test' }),
    ),
    [`${GOLDEN_SESSION_ID}/subagents/agent-${AGENT_ID}.jsonl`]: jsonl(
      thought(uuid('7'), 'The handler signs with a secret, so it is set in one of the env files. Search for the name.'),
      call(uuid('4'), id('GOLDENGREP'), 'Bash', { command: 'grep -rn "WEBHOOK_SECRET" apps --include=*.ts' }, true),
      result(id('GOLDENGREP'), 'apps/web/.env.development:12:WEBHOOK_SECRET=fixture-value', true),
      call(denied, id('GOLDENDENIED'), 'Read', { file_path: 'apps/web/.env.local' }, true),
      result(id('GOLDENDENIED'), 'permission denied', true, {
        toolDenialKind: 'permission-rule',
        sourceToolAssistantUUID: denied,
      }),
      // The shape the measured session had: the whole value in the agent's own message, and in the report delivered
      // after the launch notice (`specs/2026-09-15-where-the-value-went.md` §2).
      wrote(uuid('6'), report),
    ),
    [`${GOLDEN_SESSION_ID}/subagents/agent-${AGENT_ID}.meta.json`]: JSON.stringify({
      agentType: 'Explore',
      description: ASKED_TO,
      toolUseId: delegation,
      spawnDepth: 1,
    }),
  };
}
