import type { Counts } from '../../../shared/counter.ts';
import type { AbsenceReason } from '../discovery/discovered-session.ts';

export type SourceState = 'present' | AbsenceReason;

/** Counts grouped under a label, such as the keys carried by each line type. */
export type CountsByLabel = Readonly<Record<string, Counts>>;

export interface TranscriptStats {
  readonly files: number;
  readonly unreadableFiles: number;
  readonly lines: number;
  readonly unparsableLines: number;
  readonly lineTypes: Counts;
  readonly unknownLineTypes: readonly string[];
  readonly unknownLineTypeKeys: CountsByLabel;
  readonly topLevelKeys: Counts;
  readonly sidechain: {
    readonly true: number;
    readonly false: number;
    readonly absent: number;
    readonly invalid: number;
  };
  readonly systemSubtypes: Counts;
  readonly tools: Counts;
  readonly agentToolUses: number;
  readonly deniedCalls: number;
  readonly uniqueToolUseIds: number;
  readonly uniqueUuids: number;
}

/**
 * The session's working directories, as counts. The directories themselves are paths from a machine: they are
 * read to be counted and never enter the report.
 */
export interface WorkingDirectoryStats {
  /** How many different working directories the session's lines carry. More than one is an unrecognised variant. */
  readonly distinct: number;
  /** Lines carrying a cwd that is not a string. */
  readonly invalid: number;
}

export interface MetaStats {
  readonly files: number;
  readonly unreadableFiles: number;
  readonly unparsableFiles: number;
  readonly keys: Counts;
  readonly agentType: Counts;
  readonly spawnDepth: Counts;
  readonly requestShape: Counts;
}

export interface DenialStats {
  readonly byKind: Counts;
  readonly unknownKinds: readonly string[];
}

export interface ToolResultReferenceStats {
  readonly referenced: number;
  readonly missing: number;
}

/** Task notifications delivered on a user line, by what the call they name is. */
export interface TaskNotificationStats {
  readonly delivered: number;
  readonly namingADelegation: number;
  readonly namingAnotherCall: number;
  /** Naming a call that no transcript of this session holds. */
  readonly namingNoCall: number;
  readonly withoutCallId: number;
}

/** The whole `doctor` output. A closed schema: counts and labels only, never transcript content. */
export interface DoctorReport {
  readonly schemaVersion: 4;
  readonly contractVersion: number;
  readonly verifiedAgainst: string;
  readonly sessionId: string;
  readonly sources: {
    readonly mainTranscript: SourceState;
    readonly subagentsDirectory: SourceState;
    readonly toolResultsDirectory: SourceState;
    readonly subagentFiles: {
      readonly total: number;
      readonly withTranscript: number;
      readonly withMeta: number;
      readonly incompletePairs: number;
    };
    readonly toolResultFiles: number;
    readonly unrecognisedEntries: number;
  };
  readonly toolVersions: Counts;
  readonly workingDirectories: WorkingDirectoryStats;
  readonly main: TranscriptStats;
  readonly subagents: TranscriptStats;
  readonly meta: MetaStats;
  readonly agentToolInputKeys: Counts;
  readonly denials: DenialStats;
  readonly toolResultReferences: ToolResultReferenceStats;
  readonly taskNotifications: TaskNotificationStats;
}
