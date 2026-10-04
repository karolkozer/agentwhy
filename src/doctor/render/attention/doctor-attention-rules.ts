// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { AttentionRule } from './attention-rule.ts';
import { DamagedMetaFilesRule } from './rules/damaged-meta-files-rule.ts';
import { DamagedTranscriptsRule } from './rules/damaged-transcripts-rule.ts';
import { IncompleteSubagentPairsRule } from './rules/incomplete-subagent-pairs-rule.ts';
import { MissingMainTranscriptRule } from './rules/missing-main-transcript-rule.ts';
import { MissingSpilledResultsRule } from './rules/missing-spilled-results-rule.ts';
import { MultipleWorkingDirectoriesRule } from './rules/multiple-working-directories-rule.ts';
import { UnknownDenialKindsRule } from './rules/unknown-denial-kinds-rule.ts';
import { UnknownLineTypesRule } from './rules/unknown-line-types-rule.ts';
import { UnrecognisedEntriesRule } from './rules/unrecognised-entries-rule.ts';
import { UnusableDirectoriesRule } from './rules/unusable-directories-rule.ts';

/**
 * The rules behind "Needs attention", in reading order. Unknown variants lead: they are what `doctor` exists to
 * surface after a Claude Code update. A new finding is a new rule added here; no existing rule changes.
 */
export function createDoctorAttentionRules(): readonly AttentionRule[] {
  return [
    new UnknownLineTypesRule(),
    new UnknownDenialKindsRule(),
    new MultipleWorkingDirectoriesRule(),
    new MissingMainTranscriptRule(),
    new UnusableDirectoriesRule(),
    new DamagedTranscriptsRule(),
    new IncompleteSubagentPairsRule(),
    new DamagedMetaFilesRule(),
    new MissingSpilledResultsRule(),
    new UnrecognisedEntriesRule(),
  ];
}
