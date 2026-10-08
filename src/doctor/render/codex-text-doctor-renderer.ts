// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { CodexDoctorReport } from '../../adapter/codex/probe/codex-doctor-report.ts';
import type { Renderer } from '../../shared/renderer.ts';
import { countsTable, table } from '../../shared/text-table.ts';

const SECTION_INDENT = 2;

/**
 * The Codex section of `doctor` as text (`2026-09-27-what-codex-wrote.md` X26): what the files are, who wrote them, how
 * they join and what they can answer. Every label comes from the closed report, so nothing a record said is printed.
 */
export class CodexTextDoctorRenderer implements Renderer<CodexDoctorReport> {
  render(report: CodexDoctorReport): string {
    const { files, identity, tree, workingDirectories, order } = report;
    return [
      'agentwhy doctor · Codex',
      `format contract v${report.contractVersion}, verified against Codex ${report.verifiedAgainst.join(', ')}`,
      '',
      'Needs attention',
      ...attention(report).map((item) => `${' '.repeat(SECTION_INDENT)}${item}`),
      '',
      'Files',
      ...table(
        [
          ['found', String(files.found)],
          ['recognised as Codex sessions', String(files.recognised)],
          ['not a Codex session', String(files.unknownFormat)],
          ['could not be read', String(files.unreadable)],
          ['lines', `${report.lines.total} (${report.lines.unparsable} unparsable)`],
        ],
        SECTION_INDENT,
      ),
      '',
      'Codex versions (first session_meta)',
      ...countsTable(report.versions, SECTION_INDENT),
      '',
      'History modes',
      ...countsTable(report.historyModes, SECTION_INDENT),
      '',
      'Who started each thread',
      ...countsTable(report.origins, SECTION_INDENT),
      '',
      'Identity and tree',
      ...table(
        [
          ['ids one file holds', String(identity.uniqueIds)],
          ['files continuing their own thread', String(identity.continuations)],
          ['ids several files hold', `${identity.sharedIds} (${identity.filesSharingIds} files, joined to nothing)`],
          ['file name names another id', String(identity.fileNameDisagrees)],
          ['later session_meta lines', String(identity.laterMetadata)],
          ['conversations', String(tree.roots)],
          ['threads within them', String(tree.descendants)],
        ],
        SECTION_INDENT,
      ),
      '  unresolved relations',
      ...countsTable(tree.unresolved, SECTION_INDENT * 2),
      '',
      'Working directories and order',
      ...table(
        [
          ['files with several cwd', String(workingDirectories.filesWithSeveral)],
          ['files with no cwd', String(workingDirectories.filesWithNone)],
          ['ordinal lower than the line before', String(order.ordinalBackwards)],
          ['ordinal equal to the line before', String(order.ordinalRepeats)],
        ],
        SECTION_INDENT,
      ),
      '',
      'Line types',
      ...countsTable(report.lineTypes, SECTION_INDENT),
      '',
      'response_item types',
      ...countsTable(report.responseItems, SECTION_INDENT),
      '',
      'event_msg types',
      ...countsTable(report.events, SECTION_INDENT),
      '',
      'item_completed items',
      ...countsTable(report.items, SECTION_INDENT),
      '',
      'Action items by status',
      ...countsTable(report.itemStatuses, SECTION_INDENT),
      '',
      'Command shapes',
      ...countsTable(report.commandShapes, SECTION_INDENT),
      '',
      'What the files can answer (per file)',
      ...countsTable(report.capabilities, SECTION_INDENT),
      '',
    ].join('\n');
  }
}

/** What a reader should look at first: each an unknown or a join that did not hold, said by its count. */
function attention(report: CodexDoctorReport): readonly string[] {
  const unknown = (counts: Readonly<Record<string, number>>): number => counts['<unknown>'] ?? 0;
  const findings = [
    report.files.unknownFormat > 0 ? `${report.files.unknownFormat} file(s) are not Codex sessions and were not read` : '',
    report.files.unreadable > 0 ? `${report.files.unreadable} file(s) or folder(s) could not be read` : '',
    report.identity.sharedIds > 0 ? `${report.identity.sharedIds} session id(s) are held by more than one file; nothing joins them` : '',
    report.identity.fileNameDisagrees > 0 ? `${report.identity.fileNameDisagrees} file name(s) name another id than the file's own` : '',
    report.workingDirectories.filesWithSeveral > 0 ? `${report.workingDirectories.filesWithSeveral} file(s) carry more than one cwd` : '',
    report.order.ordinalBackwards > 0 ? `${report.order.ordinalBackwards} line(s) have a lower ordinal than the line before` : '',
    Object.values(report.tree.unresolved).some((n) => n > 0) ? 'some threads could not be joined to their conversation' : '',
    unknown(report.versions) > 0 ? `${unknown(report.versions)} file(s) were written by a Codex version this contract was not measured on` : '',
    unknown(report.historyModes) > 0 ? `${unknown(report.historyModes)} file(s) have an unknown history mode` : '',
    unknown(report.lineTypes) + unknown(report.responseItems) + unknown(report.events) + unknown(report.items) > 0
      ? 'records of a kind this contract does not know were counted as <unknown>'
      : '',
  ].filter((finding) => finding !== '');
  return findings.length > 0 ? findings : ['none'];
}
