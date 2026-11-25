import { DamagedMetaFilesRule } from './rules/damaged-meta-files-rule.js';
import { DamagedTranscriptsRule } from './rules/damaged-transcripts-rule.js';
import { IncompleteSubagentPairsRule } from './rules/incomplete-subagent-pairs-rule.js';
import { MissingMainTranscriptRule } from './rules/missing-main-transcript-rule.js';
import { MissingSpilledResultsRule } from './rules/missing-spilled-results-rule.js';
import { MultipleWorkingDirectoriesRule } from './rules/multiple-working-directories-rule.js';
import { UnknownDenialKindsRule } from './rules/unknown-denial-kinds-rule.js';
import { UnknownLineTypesRule } from './rules/unknown-line-types-rule.js';
import { UnrecognisedEntriesRule } from './rules/unrecognised-entries-rule.js';
import { UnusableDirectoriesRule } from './rules/unusable-directories-rule.js';
/**
 * The rules behind "Needs attention", in reading order. Unknown variants lead: they are what `doctor` exists to
 * surface after a Claude Code update. A new finding is a new rule added here; no existing rule changes.
 */
export function createDoctorAttentionRules() {
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
