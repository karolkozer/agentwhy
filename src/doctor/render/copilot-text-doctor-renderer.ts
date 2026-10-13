// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { CopilotDoctorReport } from '../../adapter/copilot/probe/copilot-doctor-report.ts';
import type { Renderer } from '../../shared/renderer.ts';
import { countsTable, table } from '../../shared/text-table.ts';

const SECTION_INDENT = 2;

/**
 * The Copilot section of `doctor` as text (plan step 5): what the files are, which app and build wrote them, how their
 * records join and what they can answer. Every label comes from the closed report, so nothing a record said is printed.
 */
export class CopilotTextDoctorRenderer implements Renderer<CopilotDoctorReport> {
  render(report: CopilotDoctorReport): string {
    const { files, identity, calls, delegations, hooks } = report;
    return [
      'agentwhy doctor · Copilot',
      `format contract v${report.contractVersion}, verified against Copilot ${report.verifiedAgainst.join(', ')}`,
      '',
      'Needs attention',
      ...attention(report).map((item) => `${' '.repeat(SECTION_INDENT)}${item}`),
      '',
      'Files',
      ...table(
        [
          ['found', String(files.found)],
          ['recognised as Copilot sessions', String(files.recognised)],
          ['not a Copilot runtime session', String(files.unknownFormat)],
          ['folders with no events.jsonl', String(files.noEvents)],
          ['sessions with no message', String(files.noMessage)],
          ['could not be read', String(files.unreadable)],
          ['lines', `${report.lines.total} (${report.lines.unparsable} unparsable)`],
        ],
        SECTION_INDENT,
      ),
      '',
      'Copilot versions (session.start)',
      ...countsTable(report.versions, SECTION_INDENT),
      '',
      'Which app wrote them (workspace.yaml client_name)',
      ...countsTable(report.clients, SECTION_INDENT),
      '',
      'Identity and forks',
      ...table(
        [
          ['first line names another session than its folder', String(identity.folderDisagrees)],
          ['workspace.yaml names another folder', String(identity.projectDisagrees)],
          ['sessions that count a fork', String(identity.forkParents)],
          ["lines copied from a fork's parent", String(identity.linesFromParent)],
        ],
        SECTION_INDENT,
      ),
      '',
      'Record types',
      ...countsTable(report.recordTypes, SECTION_INDENT),
      '',
      'Record keys beyond the envelope',
      ...countsTable(report.recordKeys, SECTION_INDENT),
      '',
      'Tools',
      ...countsTable(report.tools, SECTION_INDENT),
      '',
      'Calls, by toolCallId',
      ...table(
        [
          ['started', String(calls.started)],
          ['completed', String(calls.completed)],
          ['stopped by a person', String(calls.stoppedByPerson)],
          ['no outcome recorded', String(calls.withoutOutcome)],
          ['completions naming no start', String(calls.completionsWithoutStart)],
        ],
        SECTION_INDENT,
      ),
      '',
      'What finished calls returned (failed: the tool ran and failed)',
      ...countsTable(report.results, SECTION_INDENT),
      '',
      'Who stopped a call',
      ...countsTable(report.refusals, SECTION_INDENT),
      '',
      'Subagents, by agentId',
      ...table(
        [
          ['subagent.started', String(delegations.started)],
          ['joined to the task call that started it', String(delegations.joinedToTask)],
          ['subagent calls joined', String(delegations.callsJoined)],
          ['subagent calls not joined', String(delegations.callsUnjoined)],
          ['read_agent naming a started agent', String(delegations.readAgentJoined)],
          ['read_agent naming none', String(delegations.readAgentUnjoined)],
        ],
        SECTION_INDENT,
      ),
      '',
      'Hooks, by hookInvocationId',
      ...table(
        [
          ['started and ended', String(hooks.joined)],
          ['started, never ended', String(hooks.startsWithoutEnd)],
          ['ended, never started', String(hooks.endsWithoutStart)],
        ],
        SECTION_INDENT,
      ),
      '',
      'What the files can answer (per file)',
      ...countsTable(report.capabilities, SECTION_INDENT),
      '',
    ].join('\n');
  }
}

/** What a reader should look at first: each an unknown or a join that did not hold, said by its count. */
function attention(report: CopilotDoctorReport): readonly string[] {
  const unknown = (counts: Readonly<Record<string, number>>): number => counts['<unknown>'] ?? 0;
  const findings = [
    report.files.unknownFormat > 0 ? `${report.files.unknownFormat} file(s) are not Copilot runtime sessions and were not read` : '',
    report.files.unreadable > 0 ? `${report.files.unreadable} file(s) or folder(s) could not be read` : '',
    report.identity.folderDisagrees > 0 ? `${report.identity.folderDisagrees} session(s) name another id than their folder` : '',
    report.identity.projectDisagrees > 0 ? `${report.identity.projectDisagrees} session(s) name two folders; no project is given` : '',
    unknown(report.versions) > 0 ? `${unknown(report.versions)} file(s) were written by a Copilot build outside the measured 1.0.x line` : '',
    unknown(report.recordTypes) + unknown(report.recordKeys) > 0 ? 'records of a shape this contract does not know were counted as <unknown>; those files answer nothing as measured' : '',
    unknown(report.tools) > 0 ? `${unknown(report.tools)} call(s) of a tool this contract does not know were read as unknown actions` : '',
    report.calls.withoutOutcome > 0 ? `${report.calls.withoutOutcome} call(s) have no recorded outcome` : '',
    report.calls.completionsWithoutStart > 0 ? `${report.calls.completionsWithoutStart} completion(s) name no call` : '',
    unknown(report.refusals) > 0 ? `${unknown(report.refusals)} call(s) were stopped in words this contract does not know` : '',
    report.delegations.callsUnjoined + report.delegations.readAgentUnjoined > 0 || report.delegations.joinedToTask < report.delegations.started
      ? 'some subagent records could not be joined to the call that started them'
      : '',
  ].filter((finding) => finding !== '');
  return findings.length > 0 ? findings : ['none'];
}
