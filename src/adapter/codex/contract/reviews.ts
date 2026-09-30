/**
 * Codex's own reviewer (X19, X20; §2.4): a child thread whose `source.subagent.other` is `guardian`, started by Codex and
 * never by the agent. Its turns name the reviewed turn by `root_turn_id` (§2.7: 52 references, all present); its
 * `task_complete.last_agent_message` is a JSON verdict (141 of 141) whose `outcome` was `allow` every time.
 */
export const REVIEWER = { other: 'other', guardian: 'guardian' } as const;

export const VERDICT = {
  outcome: 'outcome',
  risk: 'risk_level',
  rationale: 'rationale',
  /** The one outcome measured. Any other is unrecognised, never a refusal (X20, XB1). */
  allowed: 'allow',
} as const;
