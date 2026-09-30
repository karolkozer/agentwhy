import { jsonl } from './synthetic-session.ts';

/**
 * The motivating case rebuilt for `specs/2026-09-15-what-came-back.md` §6: a delegated agent searches for a variable, the
 * result carries the file and its value, and the agent's report comes back into the context of the agent that
 * asked. What the report carries is what a test varies.
 *
 * Written into a temporary directory by the tests that use it and never committed: a committed fixture may carry
 * nothing but markers (canary check 5).
 */
export const RETURN_SESSION_ID = 'synthetic-return';

/** Arbitrary, with no known format, as a real secret may be (L003). */
export const RETURNED_SECRET = 'EPzLE4tu9Argh963';

/**
 * What the report carries: the whole value, a prefix and a suffix of it, only the path, nothing, only ordinary
 * values read from `.env`, or a protected path no agent reached.
 */
export type Carried = 'value' | 'fragment' | 'path' | 'nothing' | 'ordinary' | 'unreached';

export interface ReturnSessionOptions {
  readonly carried: Carried;
  /** The searching agent is started by an agent the session started, and both report what they found. */
  readonly nested?: boolean;
  /** The session's delegating call never receives a result. */
  readonly resultMissing?: boolean;
  /**
   * The searching agent reads both protected files with one call, which concatenates them: the value that comes
   * back was read from one of them, and nothing in the output says which.
   */
  readonly readsTogether?: boolean;
  /**
   * What the result carries, when it differs from the agent's own messages - as the measured session had it: the
   * whole value in the agent's messages, and no run of 6 or more of it in the result.
   */
  readonly resultCarries?: Carried;
  /**
   * The searching agent runs in the background, as the motivating case's did (`specs/2026-09-15-where-the-value-went.md`
   * §2): the session's result is a launch notice, and the report is `delivered` on a user line after it is queued,
   * only `queued`, or `awaited` - neither queued nor delivered.
   */
  readonly background?: 'delivered' | 'queued' | 'awaited';
  /**
   * The searching agent hands its report back through a `SubagentHandback` call instead of writing it as a
   * message, as auto mode does from Claude Code v2.1.271 (contract v10, `when-an-agent-finishes` D9). The
   * delegating call's own result then carries nothing of the file, so only the handback holds what came back.
   */
  readonly handback?: true;
  /**
   * The agent that delegated writes the searched value in a message of its own afterwards, while what came back
   * carries none of it: the shape of a reply this version cannot read at all. Nothing else can put that value in
   * the parent's hands, so the record forces the crossing even where the carrier is unknown.
   */
  readonly parentWrites?: true;
  /**
   * The searching agent reaches the same protected file twice - it searches for the variable, then reads the file
   * it found it in. Two findings, one agent: what the file's own panel answers "who touched it" with.
   */
  readonly twice?: true;
}

const WORKING_DIRECTORY = '/work/the-app';
const SEARCHER = 'a4444444444444444';
const MIDDLE = 'a5555555555555555';
const ASKED_TO = 'Find why the webhook returns 500';

const REPORTS: Readonly<Record<Carried, string>> = {
  value: `The webhook fails because WEBHOOK_SECRET in apps/web/.env.development is ${RETURNED_SECRET}, and the handler signs with another.`,
  fragment: `The webhook fails because WEBHOOK_SECRET is set to ${RETURNED_SECRET.slice(0, 6)}...${RETURNED_SECRET.slice(-6)}, and the handler signs with another.`,
  path: 'The webhook secret is configured in apps/web/.env.development, and the handler signs with another.',
  nothing: 'The handler rejects the signature; the configuration it reads needs checking.',
  ordinary: 'The server listens on port 3000 with DEBUG=true, so the logs will show the rejection.',
  unreached: 'The fix belongs in apps/api/.env.production, which nobody has opened.',
};

/** A tool-use id in the shape of a real one (lesson L001). */
const id = (tag: string): string => `toolu_01${tag.padEnd(22, 'A')}`;
const uuid = (digit: string): string =>
  `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;

function line(agent: string | undefined, type: 'assistant' | 'user', content: unknown[], extra: object = {}): object {
  return {
    type,
    isSidechain: agent !== undefined,
    ...(agent === undefined ? {} : { agentId: agent }),
    cwd: WORKING_DIRECTORY,
    ...extra,
    message: { role: type, content },
  };
}

const call = (agent: string | undefined, record: string, tool: string, name: string, input: object): object =>
  line(agent, 'assistant', [{ type: 'tool_use', id: tool, name, input }], { uuid: record });

const result = (agent: string | undefined, tool: string, content: unknown, extra: object = {}): object =>
  line(agent, 'user', [{ type: 'tool_result', tool_use_id: tool, content }], extra);

const said = (agent: string | undefined, record: string, text: string): object =>
  line(agent, 'assistant', [{ type: 'text', text }], { uuid: record });

/** What a delegating call's result looks like: the report as text blocks, and a payload naming the agent. */
function returned(agent: string | undefined, tool: string, child: string, report: string): object {
  const blocks = [{ type: 'text', text: report }];
  return result(agent, tool, blocks, { toolUseResult: { status: 'completed', agentId: child, content: blocks } });
}

/** A launch notice: the payload says the agent started, and the words carry no report. */
function launched(tool: string, child: string): object {
  return result(undefined, tool, [{ type: 'text', text: `Async agent launched successfully.\nagentId: ${child}` }], {
    toolUseResult: { isAsync: true, status: 'async_launched', agentId: child, description: ASKED_TO, outputFile: `/tmp/tasks/${child}.output` },
  });
}

/** The report of an agent started in the background, as it is queued and then delivered. */
function notification(tool: string, child: string, report: string): string {
  return `<task-notification>\n<task-id>${child}</task-id>\n<tool-use-id>${tool}</tool-use-id>\n<status>completed</status>\n<summary>Agent "${ASKED_TO}" completed</summary>\n<result>${report}</result>\n</task-notification>`;
}

function backgroundReturn(options: ReturnSessionOptions, tool: string, child: string): object[] {
  const words = notification(tool, child, REPORTS[options.resultCarries ?? options.carried]);
  return [
    launched(tool, child),
    ...(options.background === 'awaited' ? [] : [{ type: 'queue-operation', operation: 'enqueue', sessionId: RETURN_SESSION_ID, content: words }]),
    ...(options.background === 'delivered' ? [{ type: 'user', isSidechain: false, cwd: WORKING_DIRECTORY, message: { role: 'user', content: words } }] : []),
  ];
}

/** Relative path to content, in the layout of spec §4.0. */
export function returnSessionFiles(options: ReturnSessionOptions): Record<string, string> {
  const report = REPORTS[options.carried];
  const delegation = id('RETURNAGENT');
  const nested = id('RETURNNESTED');
  const first = options.nested === true ? MIDDLE : SEARCHER;
  const subagents = `${RETURN_SESSION_ID}/subagents`;

  const files: Record<string, string> = {
    [`${RETURN_SESSION_ID}.jsonl`]: jsonl(
      call(undefined, uuid('1'), delegation, 'Agent', {
        description: ASKED_TO,
        prompt: 'find which secret the webhook handler signs with',
        subagent_type: options.nested === true ? 'general-purpose' : 'Explore',
      }),
      ...(options.resultMissing === true
        ? []
        : options.background !== undefined
          ? backgroundReturn(options, delegation, first)
          : [returned(undefined, delegation, first, REPORTS[options.handback === true ? 'nothing' : (options.resultCarries ?? options.carried)])]),
      said(undefined, uuid('2'), options.parentWrites === true ? REPORTS.value : 'The agent has reported back.'),
    ),
    [`${subagents}/agent-${SEARCHER}.jsonl`]: jsonl(
      ...(options.readsTogether === true
        ? [
          call(SEARCHER, uuid('3'), id('RETURNCAT'), 'Bash', { command: 'cat apps/web/.env.development apps/web/.env' }),
          result(SEARCHER, id('RETURNCAT'), `WEBHOOK_SECRET=${RETURNED_SECRET}\nPORT=3000\nDEBUG=true`),
        ]
        : [
          call(SEARCHER, uuid('3'), id('RETURNGREP'), 'Bash', { command: 'grep -rn "WEBHOOK_SECRET" apps --include=*.env*' }),
          result(SEARCHER, id('RETURNGREP'), `apps/web/.env.development:12:WEBHOOK_SECRET=${RETURNED_SECRET}`),
          call(SEARCHER, uuid('4'), id('RETURNREAD'), 'Read', { file_path: 'apps/web/.env' }),
          result(SEARCHER, id('RETURNREAD'), 'PORT=3000\nDEBUG=true'),
          ...(options.twice === true
            ? [
              call(SEARCHER, uuid('8'), id('RETURNAGAIN'), 'Read', { file_path: 'apps/web/.env.development' }),
              result(SEARCHER, id('RETURNAGAIN'), `WEBHOOK_SECRET=${RETURNED_SECRET}`),
            ]
            : []),
        ]),
      ...(options.handback === true
        ? [call(SEARCHER, uuid('5'), id('RETURNBACK'), 'SubagentHandback', { message: report })]
        : [said(SEARCHER, uuid('5'), report)]),
    ),
    [`${subagents}/agent-${SEARCHER}.meta.json`]: JSON.stringify({
      agentType: 'Explore',
      description: options.nested === true ? 'Search the configuration' : ASKED_TO,
      toolUseId: options.nested === true ? nested : delegation,
      spawnDepth: options.nested === true ? 2 : 1,
    }),
  };

  if (options.nested === true) {
    files[`${subagents}/agent-${MIDDLE}.jsonl`] = jsonl(
      call(MIDDLE, uuid('6'), nested, 'Agent', {
        description: 'Search the configuration',
        prompt: 'search the configuration for the webhook secret',
        subagent_type: 'Explore',
      }),
      returned(MIDDLE, nested, SEARCHER, report),
      said(MIDDLE, uuid('7'), report),
    );
    files[`${subagents}/agent-${MIDDLE}.meta.json`] = JSON.stringify({
      agentType: 'general-purpose',
      description: ASKED_TO,
      toolUseId: delegation,
      spawnDepth: 1,
    });
  }
  return files;
}
