import type { CapabilityRecord } from '../../../core/capability.ts';
import type { SourceRef } from '../../../core/evidence.ts';
import { MEASURED_PROFILES, UNKNOWN_MODE_ANSWERS, UNMEASURED_PROFILES, type Answer, type Question } from '../contract/capabilities.ts';
import type { SessionHeader } from '../discovery/session-header.ts';

/** What one file's reading found that changes what it can answer, beyond its build and mode. */
export interface ReadingFacts {
  /** A line, record or item the contract does not name: whatever it holds, the action stream is not known whole. */
  readonly unrecognised: boolean;
  /** A turn was interrupted (X14): the actions recorded before it stopped may not be all it ran. */
  readonly interrupted: boolean;
  /** Reasoning was recorded that holds no readable text. */
  readonly hiddenReasoning: boolean;
  /** A turn's permissions held a part the contract does not list. */
  readonly permissionsIncomplete: boolean;
  /** Turns recorded their permissions at all. */
  readonly permissionsRecorded: boolean;
}

/**
 * The questions a file answers, declared per source (X23): its build and history mode choose the contract's profile, and
 * what its reading found adds to it. An unrecognised part or an interrupted turn makes the action stream `unmeasured`
 * beside whatever the profile says, and never less.
 */
export function capabilitiesOf(header: SessionHeader, source: SourceRef, agentId: string | undefined, facts: ReadingFacts): CapabilityRecord[] {
  const agent = agentId === undefined ? {} : { agentId };
  const answers: Partial<Record<Question | 'reasoning' | 'permissions', Answer>> = { ...answersFor(header) };
  if (facts.hiddenReasoning) answers.reasoning = 'absent';
  if (facts.permissionsRecorded) answers.permissions = facts.permissionsIncomplete ? 'unmeasured' : 'supported';
  const records: CapabilityRecord[] = Object.entries(answers).map(([question, state]) => ({
    question: question as CapabilityRecord['question'], state: state as Answer, source, ...agent,
  }));
  if (facts.unrecognised || facts.interrupted) records.push({ question: 'actions', state: 'unmeasured', source, ...agent });
  return records;
}

function answersFor(header: SessionHeader): Partial<Record<Question, Answer>> {
  if (header.historyMode === 'unknown') return UNKNOWN_MODE_ANSWERS;
  const measured = MEASURED_PROFILES.find((profile) =>
    header.version !== undefined && profile.builds.includes(header.version) && profile.historyModes.includes(header.historyMode));
  return measured?.answers ?? UNMEASURED_PROFILES[header.historyMode];
}
