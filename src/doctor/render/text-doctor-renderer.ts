import type { CountsByLabel, DoctorReport, TranscriptStats } from '../../adapter/claude-code/probe/doctor-report.ts';
import type { Renderer } from '../../shared/renderer.ts';
import { countsTable, table } from '../../shared/text-table.ts';
import type { AttentionRule } from './attention/attention-rule.ts';

const SECTION_INDENT = 2;
const SUBSECTION_INDENT = 4;
const DETAIL_INDENT = 6;
const NOTHING_TO_REPORT = 'none';

export class TextDoctorRenderer implements Renderer<DoctorReport> {
  readonly #attentionRules: readonly AttentionRule[];

  constructor(attentionRules: readonly AttentionRule[]) {
    this.#attentionRules = attentionRules;
  }

  render(report: DoctorReport): string {
    return [
      `agentwhy doctor · session ${report.sessionId}`,
      `format contract v${report.contractVersion}, verified against Claude Code ${report.verifiedAgainst}`,
      '',
      'Needs attention',
      ...this.#attention(report).map((item) => `${' '.repeat(SECTION_INDENT)}${item}`),
      '',
      ...sourcesSection(report),
      '',
      'Claude Code versions (lines)',
      ...countsTable(report.toolVersions, SECTION_INDENT),
      '',
      'Working directories (cwd)',
      ...table(
        [
          ['distinct', String(report.workingDirectories.distinct)],
          ['invalid', String(report.workingDirectories.invalid)],
        ],
        SECTION_INDENT,
      ),
      '',
      ...transcriptSection('Main session', report.main),
      '',
      ...transcriptSection('Subagents', report.subagents),
      '',
      ...metaSection(report),
      '',
      'Agent tool input keys',
      ...countsTable(report.agentToolInputKeys, SECTION_INDENT),
      '',
      'Denials by toolDenialKind',
      ...countsTable(report.denials.byKind, SECTION_INDENT),
      '',
      'Spilled result references',
      ...table(
        [
          ['referenced', String(report.toolResultReferences.referenced)],
          ['missing', String(report.toolResultReferences.missing)],
        ],
        SECTION_INDENT,
      ),
      '',
      'Task notifications delivered',
      ...table(
        [
          ['naming a delegation', String(report.taskNotifications.namingADelegation)],
          ['naming another call', String(report.taskNotifications.namingAnotherCall)],
          ['naming no call here', String(report.taskNotifications.namingNoCall)],
          ['naming nothing', String(report.taskNotifications.withoutCallId)],
        ],
        SECTION_INDENT,
      ),
      '',
    ].join('\n');
  }

  #attention(report: DoctorReport): readonly string[] {
    const findings = this.#attentionRules.flatMap((rule) => rule.findings(report));
    return findings.length > 0 ? findings : [NOTHING_TO_REPORT];
  }
}

function sourcesSection({ sources }: DoctorReport): string[] {
  const files = sources.subagentFiles;
  return [
    'Sources',
    ...table(
      [
        ['main transcript', sources.mainTranscript],
        ['subagents directory', sources.subagentsDirectory],
        ['tool-results directory', sources.toolResultsDirectory],
        ['subagent files', `total ${files.total} · with transcript ${files.withTranscript} · with meta ${files.withMeta}`],
        ['spilled result files', String(sources.toolResultFiles)],
        ['unrecognised entries', String(sources.unrecognisedEntries)],
      ],
      SECTION_INDENT,
    ),
  ];
}

function transcriptSection(title: string, stats: TranscriptStats): string[] {
  const { sidechain } = stats;
  return [
    title,
    ...table(
      [
        ['transcript files', `${stats.files} (${stats.unreadableFiles} unreadable)`],
        ['lines', `${stats.lines} (${stats.unparsableLines} unparsable)`],
        [
          'isSidechain',
          `true ${sidechain.true} · false ${sidechain.false} · absent ${sidechain.absent} · invalid ${sidechain.invalid}`,
        ],
        ['Agent calls', String(stats.agentToolUses)],
        ['denied calls', String(stats.deniedCalls)],
        ['unique toolu_ ids', String(stats.uniqueToolUseIds)],
        ['unique UUIDs', String(stats.uniqueUuids)],
      ],
      SECTION_INDENT,
    ),
    '  line types',
    ...countsTable(stats.lineTypes, SUBSECTION_INDENT),
    '  system subtypes',
    ...countsTable(stats.systemSubtypes, SUBSECTION_INDENT),
    '  tools',
    ...countsTable(stats.tools, SUBSECTION_INDENT),
    '  top-level keys',
    ...countsTable(stats.topLevelKeys, SUBSECTION_INDENT),
    '  keys on unknown line types',
    ...keysByTypeLines(stats.unknownLineTypeKeys),
  ];
}

function keysByTypeLines(keysByType: CountsByLabel): string[] {
  const entries = Object.entries(keysByType);
  if (entries.length === 0) return countsTable({}, SUBSECTION_INDENT);
  return entries.flatMap(([type, keys]) => [`${' '.repeat(SUBSECTION_INDENT)}${type}`, ...countsTable(keys, DETAIL_INDENT)]);
}

function metaSection({ meta }: DoctorReport): string[] {
  return [
    'meta.json',
    ...table(
      [['files', `${meta.files} (${meta.unparsableFiles} unparsable, ${meta.unreadableFiles} unreadable)`]],
      SECTION_INDENT,
    ),
    '  agentType',
    ...countsTable(meta.agentType, SUBSECTION_INDENT),
    '  spawnDepth (files per depth)',
    ...countsTable(meta.spawnDepth, SUBSECTION_INDENT),
    '  requestShape',
    ...countsTable(meta.requestShape, SUBSECTION_INDENT),
    '  keys',
    ...countsTable(meta.keys, SUBSECTION_INDENT),
  ];
}
