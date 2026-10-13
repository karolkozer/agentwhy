// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { CapabilityRecord } from '../../../core/capability.ts';
import type { SourceRef } from '../../../core/evidence.ts';
import { MEASURED_LINE, MEASURED_PROFILES, UNMEASURED_ANSWERS, type Answer, type Question } from '../contract/capabilities.ts';

/**
 * The questions one file answers, for each agent whose records it holds (`what-copilot-wrote` X23's rule, CPD13): the
 * profile its build was measured with, which every build of the measured `1.0.x` line takes too, until the file holds a
 * record type or a record-level key the contract does not know - then nothing about it is measured. A build of another
 * line answers nothing.
 */
export function capabilitiesOf(version: string | undefined, unknownShape: boolean, sources: readonly { readonly source: SourceRef; readonly agentId?: string }[]): CapabilityRecord[] {
  const answers = unknownShape ? UNMEASURED_ANSWERS : answersFor(version);
  return sources.flatMap(({ source, agentId }) => (Object.entries(answers) as [Question, Answer][]).map(([question, state]) => ({
    question, state, source, ...(agentId === undefined ? {} : { agentId }),
  })));
}

function answersFor(version: string | undefined): Readonly<Record<Question, Answer>> {
  if (version === undefined) return UNMEASURED_ANSWERS;
  const measured = MEASURED_PROFILES.find((profile) => profile.builds.includes(version));
  if (measured !== undefined) return measured.answers;
  // CPD13: the line's other builds take the profile the line was measured with.
  const line = MEASURED_PROFILES.find((profile) => profile.builds.some((build) => MEASURED_LINE.test(build)));
  return MEASURED_LINE.test(version) && line !== undefined ? line.answers : UNMEASURED_ANSWERS;
}
