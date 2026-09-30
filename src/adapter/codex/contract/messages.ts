/**
 * The agent's own words and the words it was given (X31; XB10, §2.8). Measured for `codex exec` 0.157.0 `paginated`:
 * assistant text is `response_item/message` with role `assistant`, content `output_text` and a `phase`; an `AgentMessage`
 * item with the same `id` is a copy of it (15 of 15); `task_complete.last_agent_message` is a copy of the turn's final
 * answer, with no id of its own (6 of 6). Two messages with identical text and different ids are two (2 pairs).
 */
export const RESPONSE_ITEMS = {
  message: 'message',
  reasoning: 'reasoning',
  codeCell: 'custom_tool_call',
  codeCellOutput: 'custom_tool_call_output',
  functionCall: 'function_call',
  functionOutput: 'function_call_output',
  agentMessage: 'agent_message',
  compaction: 'compaction',
} as const;

export const MESSAGE = {
  id: 'id',
  role: 'role',
  content: 'content',
  phase: 'phase',
  blockType: 'type',
  blockText: 'text',
} as const;

export const ROLES = { assistant: 'assistant', user: 'user', developer: 'developer' } as const;

/** Content block types: `output_text` on assistant messages, `input_text` on the others (§2.2, §2.8). */
export const TEXT_BLOCKS = { said: 'output_text', given: 'input_text' } as const;

/** `phase` on assistant messages and `AgentMessage` items (§2.8): what the core calls a channel. */
export const PHASES = { commentary: 'commentary', final_answer: 'final' } as const;

/** Message items (§2.3): copies of response records, joined by `id` where one is (§2.8). */
export const MESSAGE_ITEMS = {
  agent: 'AgentMessage',
  user: 'UserMessage',
  reasoning: 'Reasoning',
  compaction: 'ContextCompaction',
  functionOutput: 'FunctionCallOutput',
} as const;

/** An `AgentMessage` or `UserMessage` item's content blocks: `Text` and `text` (§2.8). */
export const ITEM_TEXT_BLOCKS = ['Text', 'text'] as const;

/**
 * Reasoning: `encrypted_content` on every measured record, and readable `summary[].text` on some (§2.2: 163 parts); none
 * readable in §2.8. A `Reasoning` item joins its record by `id` (1 of 1) with its own `summary_text` and `raw_content`.
 */
export const REASONING = { encrypted: 'encrypted_content', summary: 'summary', summaryText: 'text' } as const;
export const REASONING_ITEM = { summary: 'summary_text', raw: 'raw_content' } as const;

/** Event copies the editor builds of §2.2 wrote (22 and 34 lines); no source rule is measured for them. */
export const EVENT_MESSAGES = { user: 'user_message', agent: 'agent_message', text: 'message' } as const;
