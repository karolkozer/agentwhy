import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { TestContext } from 'node:test';

// Every free-text position in the synthetic session carries this marker. `doctor` reports structure only,
// so no doctor output may ever contain it.
export const CANARY = 'CANARY';

export const SESSION_ID = 'sess-x';

export async function writeSession(t: TestContext, files: Readonly<Record<string, string>>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'agentwhy-session-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  for (const [relative, content] of Object.entries(files)) {
    const path = join(root, relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  return root;
}

export function jsonl(...lines: readonly (object | string)[]): string {
  return `${lines.map((line) => (typeof line === 'string' ? line : JSON.stringify(line))).join('\n')}\n`;
}

const MAIN_UUID = '11111111-1111-4111-8111-111111111111';
const ASSISTANT_UUID = '22222222-2222-4222-8222-222222222222';
const AGENT_CALL = 'toolu_01AAAAAAAAAAAAAAAAAAAAAAAA';
const BASH_CALL = 'toolu_01BBBBBBBBBBBBBBBBBBBBBBBB';
const READ_CALL = 'toolu_01CCCCCCCCCCCCCCCCCCCCCCCC';
const NESTED_CALL = 'toolu_01DDDDDDDDDDDDDDDDDDDDDDDD';

/**
 * A session that exercises every doctor path: known and unknown variants, an unparsable line, an incomplete
 * subagent file pair, a missing spilled result, spill paths mentioned outside result positions (a prompt,
 * assistant text, a tool input) that must not count as references, and content in every free-text position
 * that must not leak.
 */
export function syntheticSessionFiles(): Record<string, string> {
  return {
    [`${SESSION_ID}.jsonl`]: jsonl(
      {
        type: 'user',
        isSidechain: false,
        version: '2.1.268',
        uuid: MAIN_UUID,
        message: {
          role: 'user',
          content: `${CANARY}_USER_PROMPT please check the webhook, see tool-results/${CANARY}_IN_PROMPT.txt`,
        },
      },
      {
        type: 'assistant',
        isSidechain: false,
        version: '2.1.268',
        uuid: ASSISTANT_UUID,
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: `${CANARY}_ASSISTANT_TEXT mentions tool-results/${CANARY}_IN_TEXT.txt` },
            {
              type: 'tool_use',
              id: AGENT_CALL,
              name: 'Agent',
              input: {
                description: `${CANARY}_DESCRIPTION`,
                prompt: `${CANARY}_DELEGATION_PROMPT`,
                subagent_type: 'Explore',
              },
            },
            {
              type: 'tool_use',
              id: BASH_CALL,
              name: 'Bash',
              input: { command: `cat /work/tool-results/${CANARY}_IN_INPUT.txt` },
            },
          ],
        },
      },
      {
        type: 'user',
        isSidechain: false,
        toolDenialKind: 'permission-rule',
        toolUseResult: `${CANARY}_DENIAL_MESSAGE`,
        sourceToolAssistantUUID: ASSISTANT_UUID,
      },
      { type: 'system', subtype: 'stop_hook_summary', isSidechain: false },
      {
        type: 'bridge-session',
        bridgeSessionId: `${CANARY}_BRIDGE_SESSION`,
        lastSequenceNum: 7,
        ownerAccountUuid: `${CANARY}_ACCOUNT`,
        ownerOrganizationUuid: `${CANARY}_ORGANIZATION`,
        sessionId: SESSION_ID,
      },
      { type: 'attachment', [`${CANARY} key with spaces`]: true },
      '',
      `{"type":"user","message":{"content":"${CANARY}_TRUNCATED`,
    ),
    [`${SESSION_ID}/subagents/agent-a1.jsonl`]: jsonl(
      {
        type: 'assistant',
        isSidechain: true,
        message: {
          content: [{ type: 'tool_use', id: READ_CALL, name: 'Read', input: { file_path: `/work/${CANARY}_PATH/.env` } }],
        },
      },
      {
        type: 'user',
        isSidechain: true,
        toolUseResult: `Output saved to /work/${SESSION_ID}/tool-results/abc123.txt ${CANARY}_SPILL_NOTICE`,
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: READ_CALL,
              content: `${CANARY}_RESULT_TEXT, full output in /work/${SESSION_ID}/tool-results/def456.txt`,
            },
          ],
        },
      },
      { type: 'user', isSidechain: true, toolDenialKind: 'sandbox-rule' },
      { type: 'brand-new-type', isSidechain: true },
    ),
    [`${SESSION_ID}/subagents/agent-a1.meta.json`]: JSON.stringify({
      agentType: 'Explore',
      description: `${CANARY}_META_DESCRIPTION`,
      toolUseId: AGENT_CALL,
      spawnDepth: 1,
      requestShape: 'foreground',
      requestNonInteractive: true,
    }),
    [`${SESSION_ID}/subagents/agent-b2.meta.json`]: JSON.stringify({
      agentType: 'general-purpose',
      description: `${CANARY}_META_DESCRIPTION_NESTED`,
      toolUseId: NESTED_CALL,
      spawnDepth: 2,
      requestShape: 'background',
      requestNonInteractive: true,
    }),
    [`${SESSION_ID}/tool-results/def456.txt`]: `${CANARY}_SPILLED_CONTENT`,
  };
}
