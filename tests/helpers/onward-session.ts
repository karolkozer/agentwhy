// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { jsonl } from './synthetic-session.ts';

/**
 * A value read from a protected file that then goes further (`specs/2026-09-15-what-came-back.md` §9, decisions 1
 * and 2), in three shapes:
 *
 * - `delegated`: an agent finds the value, it comes back, and the session quotes it, writes it into a file and
 *   puts it in a commit message;
 * - `direct`: the session reads `.env` itself and writes the value on, once into a protected file;
 * - `typed-first`: the user types the value, the session writes it before it ever reads `.env`, and sends it out;
 * - `background`: an agent runs in the background, so its result only says it started and its report arrives on a
 *   line of its own; the session writes the value, and a second background agent reads that file and searches for it.
 *   Each report is queued, then delivered on a user line naming the call; a shell command run in the background is
 *   delivered the same way, and names a call that is not a delegation;
 * - `handed-on`: the session reads `.env` and puts the value into the prompt of an agent it starts;
 * - `repeated`: the session reads `.env` and searches for the value three times running, says it, and searches again;
 * - `noisy`: a busy session - five protected files read, paths named inside a command, paths in a search result, a
 *   refused read - that must still open its panel with a few short sentences.
 *
 * Written into a temporary directory by the tests that use it and never committed (canary check 5).
 */
export const ONWARD_SESSION_ID = 'synthetic-onward';

/** Arbitrary, with no known format, as a real secret may be (L003). */
export const ONWARD_SECRET = '2C9CBkY9dZqy66hW';

export type OnwardVariant = 'delegated' | 'direct' | 'typed-first' | 'background' | 'handed-on' | 'repeated' | 'noisy';

const WORKING_DIRECTORY = '/work/the-app';
const AGENT = 'a6666666666666666';
const FINDER = 'a7777777777777777';
const REVIEWER = 'a8888888888888888';
const HANDLER = 'a9999999999999999';

const id = (tag: string): string => `toolu_01${tag.padEnd(22, 'A')}`;

function line(agent: string | undefined, type: 'assistant' | 'user', content: unknown): object {
  return {
    type,
    isSidechain: agent !== undefined,
    ...(agent === undefined ? {} : { agentId: agent }),
    cwd: WORKING_DIRECTORY,
    message: { role: type, content },
  };
}

const call = (agent: string | undefined, tool: string, name: string, input: object): object =>
  line(agent, 'assistant', [{ type: 'tool_use', id: tool, name, input }]);
const result = (agent: string | undefined, tool: string, content: unknown, payload?: object): object => ({
  ...line(agent, 'user', [{ type: 'tool_result', tool_use_id: tool, content }]),
  ...(payload === undefined ? {} : { toolUseResult: payload }),
});
const said = (agent: string | undefined, text: string): object => line(agent, 'assistant', [{ type: 'text', text }]);

/**
 * Where a background agent's report arrives: queued, then delivered. The shape is illustrative - the measurement
 * reads the lines' types, a fixed list of fields and tags, and which delegation they name, and prints only counts.
 */
const notificationText = (tool: string, task: string, report?: string): string =>
  `<task-notification>\n<task-id>${task}</task-id>\n<tool-use-id>${tool}</tool-use-id>\n<status>completed</status>\n<summary>Agent completed</summary>\n${report === undefined ? '' : `<result>${report}</result>\n`}</task-notification>`;

const notification = (tool: string, task: string, report: string, form: 'string' | 'blocks'): object[] => {
  const text = notificationText(tool, task, report);
  return [
    { type: 'queue-operation', operation: 'enqueue', sessionId: ONWARD_SESSION_ID, content: text },
    line(undefined, 'user', form === 'string' ? text : [{ type: 'text', text }]),
  ];
};

/** What a delegating result's payload holds for an agent started in the background. Illustrative, as above. */
const launched = (agent: string, prompt: string): object => ({
  isAsync: true,
  status: 'async_launched',
  agentId: agent,
  description: 'Background check',
  prompt,
  outputFile: `/tmp/tasks/${agent}.output`,
});

const meta = (tool: string): string =>
  JSON.stringify({ agentType: 'general-purpose', description: 'Background check', toolUseId: tool, spawnDepth: 1 });

const readEnv = [
  call(undefined, id('ONREAD'), 'Read', { file_path: 'apps/web/.env' }),
  result(undefined, id('ONREAD'), `WEBHOOK_SECRET=${ONWARD_SECRET}`),
];

export function onwardSessionFiles(variant: OnwardVariant): Record<string, string> {
  const write = call(undefined, id('ONWRITE'), 'Write', {
    file_path: 'notes/webhook.md',
    content: `The webhook signs with ${ONWARD_SECRET}.\n`,
  });

  if (variant === 'direct') {
    return {
      [`${ONWARD_SESSION_ID}.jsonl`]: jsonl(
        ...readEnv,
        write,
        result(undefined, id('ONWRITE'), 'File created'),
        call(undefined, id('ONEDIT'), 'Edit', {
          file_path: 'apps/api/config.ts',
          old_string: 'secret: process.env.WEBHOOK_SECRET',
          new_string: `secret: '${ONWARD_SECRET}'`,
        }),
        result(undefined, id('ONEDIT'), 'The file has been updated'),
        call(undefined, id('ONENVEDIT'), 'Edit', {
          file_path: 'apps/web/.env.production',
          old_string: 'WEBHOOK_SECRET=',
          new_string: `WEBHOOK_SECRET=${ONWARD_SECRET}`,
        }),
        result(undefined, id('ONENVEDIT'), 'The file has been updated'),
      ),
    };
  }

  if (variant === 'typed-first') {
    return {
      [`${ONWARD_SESSION_ID}.jsonl`]: jsonl(
        line(undefined, 'user', `the webhook secret is ${ONWARD_SECRET}, keep it out of the code`),
        call(undefined, id('ONPLAN'), 'Write', {
          file_path: '/Users/someone/.claude/plans/webhook.md',
          content: `Replace ${ONWARD_SECRET} with an environment variable.\n`,
        }),
        result(undefined, id('ONPLAN'), 'File created'),
        call(undefined, id('ONEDIT'), 'Edit', {
          file_path: 'apps/api/config.ts',
          old_string: `secret: '${ONWARD_SECRET}'`,
          new_string: 'secret: process.env.WEBHOOK_SECRET',
        }),
        result(undefined, id('ONEDIT'), 'The file has been updated'),
        ...readEnv,
        call(undefined, id('ONCURL'), 'Bash', {
          command: `curl -s -H "Authorization: Bearer ${ONWARD_SECRET}" https://hooks.example.test/verify`,
        }),
        result(undefined, id('ONCURL'), '{"ok":true}'),
      ),
    };
  }

  if (variant === 'noisy') {
    const read = (tag: string, path: string, content: string): object[] => [
      call(undefined, id(tag), 'Read', { file_path: path }),
      result(undefined, id(tag), content),
    ];
    return {
      [`${ONWARD_SESSION_ID}.jsonl`]: jsonl(
        ...read('NONE', 'apps/one/.env', 'PORT=3000'),
        ...read('NTWO', 'apps/two/.env', 'PORT=3001'),
        ...read('NTHREE', 'apps/three/.env', 'PORT=3002'),
        ...read('NFOUR', 'apps/four/.env', 'PORT=3003'),
        ...read('NFIVE', 'apps/five/.env', 'PORT=3004'),
        ...readEnv,
        call(undefined, id('NCOUNT'), 'Bash', { command: 'wc -l apps/api/.env apps/admin/.env apps/docs/.env' }),
        result(undefined, id('NCOUNT'), '0 total'),
        call(undefined, id('NLIST'), 'Bash', { command: 'grep -rl WEBHOOK apps' }),
        result(undefined, id('NLIST'), 'apps/web/.env.local\napps/web/.env.test'),
        call(undefined, id('NDENY'), 'Read', { file_path: 'apps/web/.env.production' }),
        { ...result(undefined, id('NDENY'), 'Permission to read this file was denied.'), toolDenialKind: 'permission-rule' },
        call(undefined, id('NCURL'), 'Bash', { command: `curl -s -H "Authorization: Bearer ${ONWARD_SECRET}" https://hooks.example.test/verify` }),
        result(undefined, id('NCURL'), '{"ok":true}'),
        said(undefined, `The webhook secret ${ONWARD_SECRET} is verified.`),
        write,
        result(undefined, id('ONWRITE'), 'File created'),
      ),
    };
  }

  if (variant === 'repeated') {
    const search = (tag: string, command: string): object[] => [
      call(undefined, id(tag), 'Bash', { command }),
      result(undefined, id(tag), 'no matches'),
    ];
    return {
      [`${ONWARD_SESSION_ID}.jsonl`]: jsonl(
        ...readEnv,
        ...search('ONSEARCHA', `grep -rn "${ONWARD_SECRET}" apps`),
        ...search('ONSEARCHB', `grep -rn "${ONWARD_SECRET}" packages`),
        ...search('ONSEARCHC', `rg "${ONWARD_SECRET}" scripts`),
        said(undefined, `The value ${ONWARD_SECRET} is not used anywhere else yet.`),
        ...search('ONSEARCHD', `grep -rn "${ONWARD_SECRET}" docs`),
      ),
    };
  }

  if (variant === 'handed-on') {
    const handOver = id('ONHAND');
    return {
      [`${ONWARD_SESSION_ID}.jsonl`]: jsonl(
        ...readEnv,
        call(undefined, handOver, 'Agent', {
          description: 'Verify the signature',
          prompt: `verify that ${ONWARD_SECRET} signs the webhook`,
          subagent_type: 'general-purpose',
        }),
        result(undefined, handOver, [{ type: 'text', text: 'Verified.' }], { status: 'completed', agentId: HANDLER }),
      ),
      [`${ONWARD_SESSION_ID}/subagents/agent-${HANDLER}.jsonl`]: jsonl(said(HANDLER, 'Verified.')),
      [`${ONWARD_SESSION_ID}/subagents/agent-${HANDLER}.meta.json`]: meta(handOver),
    };
  }

  if (variant === 'background') {
    const finder = id('ONFINDER');
    const reviewer = id('ONREVIEWER');
    const started = (agent: string): string => `Async agent launched successfully. agentId: ${agent}`;
    return {
      [`${ONWARD_SESSION_ID}.jsonl`]: jsonl(
        call(undefined, finder, 'Agent', { description: 'Find the secret', prompt: 'find the webhook secret', run_in_background: true }),
        result(undefined, finder, started(FINDER), launched(FINDER, 'find the webhook secret')),
        ...notification(finder, FINDER, `It is ${ONWARD_SECRET}.`, 'string'),
        said(undefined, `The handler signs with ${ONWARD_SECRET}.`),
        call(undefined, id('ONINCIDENT'), 'Write', { file_path: 'docs/incident.md', content: `Signed with ${ONWARD_SECRET}.\n` }),
        result(undefined, id('ONINCIDENT'), 'File created'),
        call(undefined, reviewer, 'Agent', { description: 'Review the note', prompt: 'review docs/incident.md', run_in_background: true }),
        result(undefined, reviewer, started(REVIEWER), launched(REVIEWER, 'review docs/incident.md')),
        ...notification(reviewer, REVIEWER, 'Nothing else found.', 'blocks'),
        call(undefined, id('ONTESTS'), 'Bash', { command: 'npm test', run_in_background: true }),
        result(undefined, id('ONTESTS'), 'Command running in background with ID: b7k2p9q'),
        line(undefined, 'user', notificationText(id('ONTESTS'), 'b7k2p9q')),
      ),
      [`${ONWARD_SESSION_ID}/subagents/agent-${FINDER}.jsonl`]: jsonl(
        call(FINDER, id('ONFGREP'), 'Bash', { command: 'grep -rn "WEBHOOK_SECRET" apps' }),
        result(FINDER, id('ONFGREP'), `apps/web/.env.development:12:WEBHOOK_SECRET=${ONWARD_SECRET}`),
        said(FINDER, `It is ${ONWARD_SECRET}.`),
      ),
      [`${ONWARD_SESSION_ID}/subagents/agent-${FINDER}.meta.json`]: meta(finder),
      [`${ONWARD_SESSION_ID}/subagents/agent-${REVIEWER}.jsonl`]: jsonl(
        call(REVIEWER, id('ONRCAT'), 'Bash', { command: 'cat docs/incident.md' }),
        result(REVIEWER, id('ONRCAT'), `Signed with ${ONWARD_SECRET}.`),
        call(REVIEWER, id('ONRGREP'), 'Bash', { command: `grep -rn "${ONWARD_SECRET}" apps` }),
        result(REVIEWER, id('ONRGREP'), ''),
        said(REVIEWER, 'Nothing else found.'),
      ),
      [`${ONWARD_SESSION_ID}/subagents/agent-${REVIEWER}.meta.json`]: meta(reviewer),
    };
  }

  const delegation = id('ONAGENT');
  return {
    [`${ONWARD_SESSION_ID}.jsonl`]: jsonl(
      call(undefined, delegation, 'Agent', {
        description: 'Find the webhook secret',
        prompt: 'find which secret the webhook handler signs with',
        subagent_type: 'Explore',
      }),
      result(undefined, delegation, [{ type: 'text', text: `It is ${ONWARD_SECRET}.` }], {
        status: 'completed',
        agentId: AGENT,
        content: [{ type: 'text', text: `It is ${ONWARD_SECRET}.` }],
        totalDurationMs: 1200,
        totalTokens: 900,
        totalToolUseCount: 1,
      }),
      said(undefined, `The handler signs with ${ONWARD_SECRET}; writing it down.`),
      write,
      result(undefined, id('ONWRITE'), 'File created'),
      call(undefined, id('ONCOMMIT'), 'Bash', { command: `git commit -am "use webhook secret ${ONWARD_SECRET}"` }),
      result(undefined, id('ONCOMMIT'), '1 file changed'),
    ),
    [`${ONWARD_SESSION_ID}/subagents/agent-${AGENT}.jsonl`]: jsonl(
      call(AGENT, id('ONGREP'), 'Bash', { command: 'grep -rn "WEBHOOK_SECRET" apps' }),
      result(AGENT, id('ONGREP'), `apps/web/.env.development:12:WEBHOOK_SECRET=${ONWARD_SECRET}`),
      said(AGENT, `It is ${ONWARD_SECRET}.`),
    ),
    [`${ONWARD_SESSION_ID}/subagents/agent-${AGENT}.meta.json`]: JSON.stringify({
      agentType: 'Explore',
      description: 'Find the webhook secret',
      toolUseId: delegation,
      spawnDepth: 1,
    }),
  };
}
