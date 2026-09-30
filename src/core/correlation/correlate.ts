import { outcomeOfExecution } from '../access/recorded-effect.ts';
import { MAIN_AGENT_TYPE } from '../agent.ts';
import { capabilityGaps } from '../capability.ts';
import type { Completeness, Gap } from '../completeness.ts';
import { completenessOf } from '../completeness.ts';
import type { ContextRecord } from '../context.ts';
import type { Delegation, FollowUp } from '../delegation.ts';
import type { EventOutcome, EventResult, ToolEvent, ToolUseId } from '../event.ts';
import { projectRootOf } from '../project-root.ts';
import type { Review } from '../review.ts';
import type { SessionModel } from '../session-model.ts';
import type {
  CallRecord,
  DelegationCall,
  DelegationIndexEntry,
  DeliveredReportRecord,
  FollowUpCall,
  FollowUpIndexEntry,
  ResultRecord,
  SessionRecords,
} from '../session-records.ts';
import type { Turn } from '../turn.ts';
import { PLAIN_INVOCATION_SOURCE, WORD_BREAK } from '../../shared/plain-invocation.ts';

/**
 * Joins what an adapter read into the model, following spec §4.3 exactly: a result belongs to a call by the
 * call's own id, a delegation to the agent it started by the id of the call that started it, and **nothing is
 * ever joined by time** - there is no timestamp in these records to be tempted by.
 *
 * What cannot be joined confidently becomes a gap and gets no outcome (§4.3 rule 6), never a best guess.
 */
export function correlate(records: SessionRecords): SessionModel {
  const gaps: Gap[] = [...records.gaps];
  const resultsByCall = groupResults(records.results);
  const calls = new Set(records.calls.map((call) => call.id));

  for (const result of records.results) {
    if (!calls.has(result.callId)) gaps.push({ kind: 'relation-unresolved' });
  }

  const running = reportRunning(records, resultsByCall);
  const events = records.calls.filter((call) => call !== running).map((call) => toEvent(call, resultsByCall.get(call.id) ?? [], gaps));

  // §4.3 rule 2: a delegated agent joins to its delegation by the id of the call that started it.
  const indexByCall = indexDelegations(records.delegationIndex, gaps);
  const delegated = new Set(records.delegations.map((call) => call.callId));
  for (const entry of records.delegationIndex) {
    if (!delegated.has(entry.callId)) gaps.push({ kind: 'relation-unresolved', agentId: entry.agentId });
  }
  // R4 of `2026-09-15-where-the-value-went.md`: a delivered report joins the delegation its notification names, by that
  // call's id and nothing else. One naming any other call is no report of a delegation, and joins nothing.
  const joined = delegations(records, indexByCall);
  const byAgents = joinAgentReports(records, joined, gaps);
  const reportsByCall = groupReports([...records.deliveredReports, ...byAgents.reports]);
  // X17: later words join the delegation that started the agent they reached, by the id of the call that carried them.
  const { followUps, unjoined } = joinFollowUps(records.followUps, records.followUpIndex, records.delegations, joined, gaps);
  const delegationsOut = records.delegations.map((call) =>
    toDelegation(call, joined.get(call.callId), reportsByCall.get(call.callId) ?? [], followUps.get(call.callId) ?? [], gaps),
  );
  const turns = checkedTurns(records.turns, gaps);
  const contexts = [...records.contexts, ...unjoined, ...byAgents.unjoined];

  // A text that is not whole is a gap wherever it is (X10, X31): a result, a delivery, a message or a context.
  for (const event of events) {
    if (event.result !== undefined && event.result.completeness !== 'complete') gaps.push({ kind: 'result-incomplete', agentId: event.agentId });
  }
  for (const text of [...records.deliveries.map((delivery) => ({ ...delivery, agentId: delivery.recipientAgentId })), ...records.messages, ...contexts]) {
    if (text.completeness !== 'complete') gaps.push({ kind: 'result-incomplete', ...(text.agentId === undefined ? {} : { agentId: text.agentId }) });
  }
  gaps.push(...capabilityGaps(records.capabilities));

  return {
    sessionId: records.sessionId,
    provider: records.provider,
    projectRoot: projectRootOf(records.workingDirectories),
    agents: records.agents,
    delegations: delegationsOut,
    events,
    messages: records.messages,
    turns,
    reviews: records.reviews.map((review) => checkedReview(review, turns, gaps)),
    contexts,
    deliveries: records.deliveries,
    capabilities: records.capabilities,
    gaps,
    completeness: completenessOf(gaps),
  };
}

/**
 * The index entry each delegating call keeps, once its own record agrees (X16): an entry whose started agent names a
 * different parent contradicts the call, so neither is trusted.
 */
function delegations(
  records: SessionRecords,
  indexByCall: ReadonlyMap<ToolUseId, DelegationIndexEntry | undefined>,
): Map<ToolUseId, DelegationIndexEntry | undefined> {
  const joined = new Map<ToolUseId, DelegationIndexEntry | undefined>();
  for (const call of records.delegations) {
    const entry = indexByCall.get(call.callId);
    // The delegation keeps no agent; `toDelegation` names that as the gap it is, once.
    const contradicts = entry?.recordedParentAgentId !== undefined && entry.recordedParentAgentId !== call.parentAgentId;
    joined.set(call.callId, contradicts ? undefined : entry);
  }
  return joined;
}

/**
 * A report named by its agents joins the one delegation between them: the delegation whose agent sent it, made by the
 * agent that received it (X18). None, or more than one, and it joins nothing: its words stay with the recipient as
 * context another agent wrote, with a relation gap - never handed to a delegation by a guess.
 */
function joinAgentReports(
  records: SessionRecords,
  joined: ReadonlyMap<ToolUseId, DelegationIndexEntry | undefined>,
  gaps: Gap[],
): { readonly reports: DeliveredReportRecord[]; readonly unjoined: ContextRecord[] } {
  const reports: DeliveredReportRecord[] = [];
  const unjoined: ContextRecord[] = [];
  for (const report of records.agentReports) {
    const between = records.delegations.filter((delegation) =>
      delegation.parentAgentId === report.recipientAgentId && joined.get(delegation.callId)?.agentId === report.fromAgentId);
    const delegation = between.length === 1 ? between[0] : undefined;
    if (delegation === undefined) {
      gaps.push({ kind: 'relation-unresolved', agentId: report.recipientAgentId });
      unjoined.push({
        kind: 'conversation', author: 'another-agent', agentId: report.recipientAgentId, text: report.content, completeness: 'complete', evidence: report.evidence,
      });
      continue;
    }
    reports.push({ callId: delegation.callId, content: report.content, evidence: report.evidence });
  }
  return { reports, unjoined };
}

/**
 * Each follow-up joined to the one delegation that started the agent it reached, by that agent and by who sent it
 * (X17). A call whose agent is no child its sender started, or whose index entry is missing or doubled, is not a
 * follow-up: its words stay as an unjoined instruction of the sender, scanned, with a relation gap - never dropped, and
 * never handed to a helper by a guess.
 */
function joinFollowUps(
  calls: readonly FollowUpCall[],
  index: readonly FollowUpIndexEntry[],
  delegationCalls: readonly DelegationCall[],
  joined: ReadonlyMap<ToolUseId, DelegationIndexEntry | undefined>,
  gaps: Gap[],
): { readonly followUps: Map<ToolUseId, FollowUp[]>; readonly unjoined: ContextRecord[] } {
  // The agent each follow-up call reached; `undefined` where two entries name the call, since neither can be trusted.
  const reached = new Map<ToolUseId, string | undefined>();
  for (const entry of index) reached.set(entry.callId, reached.has(entry.callId) ? undefined : entry.agentId);

  const followUps = new Map<ToolUseId, FollowUp[]>();
  const unjoined: ContextRecord[] = [];
  for (const call of calls) {
    const agentId = reached.get(call.callId);
    const starting = agentId === undefined
      ? []
      : delegationCalls.filter((delegation) => delegation.parentAgentId === call.senderAgentId && joined.get(delegation.callId)?.agentId === agentId);
    const delegation = starting.length === 1 ? starting[0] : undefined;
    if (delegation === undefined) {
      gaps.push({ kind: 'relation-unresolved', agentId: call.senderAgentId });
      unjoined.push({
        kind: 'unjoined-instruction', author: 'agent', agentId: call.senderAgentId, text: call.text, completeness: 'complete', evidence: call.evidence,
      });
      continue;
    }
    const followUp: FollowUp = { id: call.callId, senderAgentId: call.senderAgentId, text: call.text, evidence: call.evidence };
    followUps.set(delegation.callId, [...(followUps.get(delegation.callId) ?? []), followUp]);
  }
  return { followUps, unjoined };
}

/**
 * One turn per `(agentId, id)`: a second record of the same turn contradicts the first, so neither is kept and the
 * relation is a gap - a turn is never picked by time or position.
 */
function checkedTurns(turns: readonly Turn[], gaps: Gap[]): Turn[] {
  const key = (turn: Turn): string => JSON.stringify([turn.agentId, turn.id]);
  const counts = new Map<string, number>();
  for (const turn of turns) counts.set(key(turn), (counts.get(key(turn)) ?? 0) + 1);
  const doubled = new Set<string>();
  for (const turn of turns) {
    if ((counts.get(key(turn)) ?? 0) < 2 || doubled.has(key(turn))) continue;
    doubled.add(key(turn));
    gaps.push({ kind: 'relation-unresolved', agentId: turn.agentId });
  }
  return turns.filter((turn) => !doubled.has(key(turn)));
}

/**
 * A verdict keeps the turn it names only when that is a turn of the reviewed agent (X20). A missing one is a review of no
 * known turn, which the report says; one naming a turn the agent does not have is unlinked, with a gap in the reviewer's
 * own source.
 */
function checkedReview(review: Review, turns: readonly Turn[], gaps: Gap[]): Review {
  const known = new Set(turns.filter((turn) => turn.agentId === review.reviewedAgentId).map((turn) => turn.id));
  return {
    ...review,
    verdicts: review.verdicts.map((verdict) => {
      if (verdict.turnId === undefined || known.has(verdict.turnId)) return verdict;
      gaps.push({ kind: 'relation-unresolved', source: verdict.evidence.source });
      const { turnId: _unlinked, ...unlinked } = verdict;
      return unlinked;
    }),
  };
}

/**
 * The call that is running this very report, where the session's own agent ran it: the session's last call, with no
 * result yet, and nothing in it but `agentwhy report` and its flags. Its result cannot be in the record while the report
 * is being drawn - the result is this report - so it is no gap, and a report opened from the conversation reads the
 * same as one opened from Conversations a moment later. Anything more on the line (a pipe, a second command, a
 * redirect) is a call like any other, and one with no result stays unknown.
 */
function reportRunning(records: SessionRecords, results: ReadonlyMap<ToolUseId, readonly ResultRecord[]>): CallRecord | undefined {
  const main = records.agents.find((agent) => agent.type === MAIN_AGENT_TYPE);
  if (main === undefined) return undefined;
  // A sequence counts one transcript's calls, so the last call is the main transcript's own.
  const last = records.calls.filter((call) => call.agentId === main.id)
    .reduce<CallRecord | undefined>((latest, call) => (latest === undefined || call.sequence > latest.sequence ? call : latest), undefined);
  if (last === undefined || results.has(last.id)) return undefined;
  return last.commands.length === 1 && AGENTWHY_REPORT.test(last.commands[0] ?? '') ? last : undefined;
}

/**
 * `agentwhy report` with flags and plain values only: no shell operator, quote, substitution or second line. agentwhy
 * is named by the same pattern a hook's invocation is read with, because the agent is asked to run it the way the hook
 * does (`the-agent-tells-you.md` R18): a copy of its own would drift, and a report opened from the chat would show a
 * gap. Found by a review: any word holding agentwhy passed, so another script's missing result was dropped too. Words
 * are split where a shell splits them, on a space or a tab: a line break passed for one, and so did a second command.
 */
const AGENTWHY_REPORT = new RegExp(`^[ \\t]*(?:${PLAIN_INVOCATION_SOURCE})${WORD_BREAK}report(?:${WORD_BREAK}[\\w@%+=:,./~-]+)*[ \\t]*$`);

/**
 * Retries are separate calls with separate ids (§4.3 rule 7), so two results for one id is not a retry - it is
 * an ambiguity, and picking one of them would hand the event a confident outcome it has not earned. They are
 * kept together and the event is left without one.
 */
function groupResults(results: readonly ResultRecord[]): Map<ToolUseId, ResultRecord[]> {
  const byCall = new Map<ToolUseId, ResultRecord[]>();

  for (const result of results) {
    const existing = byCall.get(result.callId);
    if (existing === undefined) byCall.set(result.callId, [result]);
    else existing.push(result);
  }
  return byCall;
}

function groupReports(reports: readonly DeliveredReportRecord[]): Map<ToolUseId, DeliveredReportRecord[]> {
  const byCall = new Map<ToolUseId, DeliveredReportRecord[]>();

  for (const report of reports) {
    const existing = byCall.get(report.callId);
    if (existing === undefined) byCall.set(report.callId, [report]);
    else existing.push(report);
  }
  return byCall;
}

/** A second index entry for one call is the same kind of ambiguity: neither entry can be trusted to be the one. */
function indexDelegations(
  entries: readonly DelegationIndexEntry[],
  gaps: Gap[],
): Map<ToolUseId, DelegationIndexEntry | undefined> {
  const byCall = new Map<ToolUseId, DelegationIndexEntry | undefined>();

  for (const entry of entries) {
    if (byCall.has(entry.callId)) {
      gaps.push({ kind: 'relation-unresolved', agentId: entry.agentId });
      byCall.set(entry.callId, undefined);
      continue;
    }
    byCall.set(entry.callId, entry);
  }
  return byCall;
}

function toEvent(call: CallRecord, results: readonly ResultRecord[], sessionGaps: Gap[]): ToolEvent {
  const own: Gap[] = [];
  const result = results.length === 1 ? results[0] : undefined;
  const outcome = results.length > 1 ? unresolved(call.agentId, own) : outcomeOf(call, result, call.agentId, own);

  sessionGaps.push(...own);
  const event: ToolEvent = {
    id: call.id,
    agentId: call.agentId,
    sequence: call.sequence,
    toolName: call.toolName,
    input: call.input,
    targets: call.targets,
    commands: call.commands,
    resultShape: call.resultShape,
    toolKnown: call.toolKnown,
    ...(call.printsMatches === true ? { printsMatches: true as const } : {}),
    ...(call.written === undefined ? {} : { written: call.written }),
    outcome,
    ...(result?.execution === undefined ? {} : { execution: result.execution }),
    ...(call.turnId === undefined ? {} : { turnId: call.turnId }),
    evidence: call.evidence,
    completeness: completenessOf(own),
  };
  return result === undefined ? event : { ...event, result: toResult(result) };
}

function unresolved(agentId: string, own: Gap[]): EventOutcome {
  own.push({ kind: 'relation-unresolved', agentId });
  return 'unknown';
}

function outcomeOf(call: CallRecord, result: ResultRecord | undefined, agentId: string, own: Gap[]): EventOutcome {
  if (result === undefined) {
    own.push({ kind: 'result-missing', agentId });
    return 'unknown';
  }
  if (result.attributionAmbiguous === true) return unresolved(agentId, own);
  if (result.spilledResultMissing === true) {
    own.push({ kind: 'spilled-result-missing', agentId });
    return 'unknown';
  }
  if (result.denial !== undefined) {
    // An unrecognised marker is UNKNOWN, never BLOCKED: the field is typed, its vocabulary is not documented.
    if (result.denial.recognised) return 'blocked';
    own.push({ kind: 'outcome-unrecognised', agentId });
    return 'unknown';
  }
  // X11: where the runtime recorded running the call, the record establishes access only as far as a profile says.
  if (result.execution !== undefined) {
    if (result.execution.status === 'unrecognised') {
      own.push({ kind: 'outcome-unrecognised', agentId });
      return 'unknown';
    }
    const outcome = outcomeOfExecution(call, result.execution);
    // An effect the record does not establish is a gap, so that no report built on it reads as whole (X11).
    if (outcome === 'unknown') own.push({ kind: 'capability-absent', question: 'access', agentId });
    return outcome;
  }
  return 'succeeded';
}

function toResult(result: ResultRecord): EventResult {
  return {
    ...(result.content === undefined ? {} : { content: result.content }),
    ...(result.denial === undefined ? {} : { denialKind: result.denial.kind }),
    ...(result.launchNotice === true ? { launchNotice: true } : {}),
    stage: result.stage,
    completeness: result.completeness,
    evidence: result.evidence,
  };
}

function toDelegation(
  call: DelegationCall,
  entry: DelegationIndexEntry | undefined,
  reports: readonly DeliveredReportRecord[],
  followUps: readonly FollowUp[],
  sessionGaps: Gap[],
): Delegation {
  const own: Gap[] = [];
  // No index entry means the agent it started cannot be named. The delegation still happened, and saying so is
  // the point: a delegation that vanishes from the report because its index is missing is the worse failure.
  if (entry === undefined) own.push({ kind: 'relation-unresolved', agentId: call.parentAgentId });

  sessionGaps.push(...own);
  const completeness: Completeness = completenessOf(own);

  return {
    id: call.callId,
    parentAgentId: call.parentAgentId,
    ...(entry === undefined ? {} : { childAgentId: entry.agentId }),
    ...(entry?.requestedType === undefined ? {} : { requestedType: entry.requestedType }),
    ...(entry?.depth === undefined ? {} : { depth: entry.depth }),
    ...(call.prompt === undefined ? {} : { prompt: call.prompt }),
    ...(call.description === undefined ? {} : { description: call.description }),
    reports: reports.map(({ content, evidence }) => ({ content, evidence })),
    followUps,
    evidence: call.evidence,
    completeness,
  };
}
