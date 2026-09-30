export const CONVERSATION_LINE_TYPES = ['user', 'assistant'] as const;

export const SKIPPED_LINE_TYPES = [
  'attachment',
  'queue-operation',
  'atis-latch',
  'last-prompt',
  'ai-title',
  'system',
  'file-history-snapshot',
  'file-history-delta',
  'bridge-session',
] as const;

export const SYSTEM_LINE_TYPE = 'system' satisfies (typeof SKIPPED_LINE_TYPES)[number];

/** The line an agent writes on. A user line carries text blocks too, and they are not the agent's words. */
export const ASSISTANT_LINE_TYPE = 'assistant' satisfies (typeof CONVERSATION_LINE_TYPES)[number];

/** The line a result arrives on, and a report delivered late. Its words are not the words of the agent it reaches. */
export const USER_LINE_TYPE = 'user' satisfies (typeof CONVERSATION_LINE_TYPES)[number];

export type LineTypeClass = 'conversation' | 'skipped' | 'unknown';

export function classifyLineType(type: unknown): LineTypeClass {
  if (typeof type !== 'string') return 'unknown';
  if ((CONVERSATION_LINE_TYPES as readonly string[]).includes(type)) return 'conversation';
  if ((SKIPPED_LINE_TYPES as readonly string[]).includes(type)) return 'skipped';
  return 'unknown';
}
