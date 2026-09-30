import type { AgentId } from './agent.ts';
import type { EvidenceRef } from './evidence.ts';
import type { SessionModel } from './session-model.ts';

/**
 * An agent's last words, added to the model when the transcript on disk does not hold them yet
 * (`specs/2026-09-16-when-an-agent-finishes.md` R9).
 *
 * **Measured 2026-09-16 (B4c):** on 4 of 4 finished agents - foreground, background and nested - the agent's only text
 * block was written to its transcript after the `SubagentStop` hook had run. A reading of the file alone misses exactly
 * the message the motivating case's value was in.
 *
 * The record it is given is the one after every record of that agent read from disk. That is not a line number: an
 * attachment line may land between them. It is the one thing known about its place - it was written after all of
 * them - and it is the order the rules that compare records need. When the words are already on disk, the model is
 * returned unchanged, so a transcript that caught up is not read twice.
 */
export function withLateMessage(model: SessionModel, agentId: AgentId, text: string): SessionModel {
  if (text === '') return model;

  const fromAgent = (evidence: EvidenceRef): boolean => evidence.source.kind === 'agent' && evidence.source.agentId === agentId;
  const own = model.messages.filter((message) => message.agentId === agentId);
  if (own.some((message) => message.text === text)) return model;

  const records = [
    ...model.events.flatMap((event) => [event.evidence, ...(event.result === undefined ? [] : [event.result.evidence])]),
    ...own.map((message) => message.evidence),
  ]
    .filter(fromAgent)
    .map((evidence) => evidence.record);
  const after = records.reduce((last, record) => Math.max(last, record), 0) + 1;

  return {
    ...model,
    messages: [...model.messages, { agentId, kind: 'said', text, completeness: 'complete', evidence: { source: { kind: 'agent', agentId }, record: after } }],
  };
}
