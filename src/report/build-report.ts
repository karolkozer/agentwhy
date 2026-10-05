// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { fileOperandsIn, programsIn } from '../core/access/command-line.ts';
import { everydayReach, printedLines, printsOnly, protectedAccesses, readsContent, readsContentBesideNames, type ProtectedAccess } from '../core/access/protected-access.ts';
import { stringsIn } from '../core/access/path-tokens.ts';
import { keyedLines } from '../core/access/protected-values.ts';
import { filesTracedIn, returnsOf, traceValues, type DelegationReturn, type TracedValues } from '../core/access/returns.ts';
import { valueUses, type ValueUse } from '../core/access/uses.ts';
import { wordsBeforeCalls, type WordsBefore } from '../core/access/words-before.ts';
import type { CapabilityQuestion, Gap } from '../core/completeness.ts';
import type { ContextKind } from '../core/context.ts';
import type { RuntimePermissions } from '../core/turn.ts';
import type { EvidenceRef } from '../core/evidence.ts';
import type { EventOutcome, ToolEvent } from '../core/event.ts';
import type { Policy } from '../core/policy/policy.ts';
import { displayPath, type ProjectRoot } from '../core/project-root.ts';
import type { Redacted } from '../core/redaction/redacted.ts';
import type { KeyedName, Redactor } from '../core/redaction/redactor.ts';
import type { SessionModel } from '../core/session-model.ts';
import { firstSentence } from '../shared/sentence.ts';
import type {
  AgentFlow,
  EverydayCall,
  EverydayFile,
  FindingStory,
  FlowStep,
  FlowStepCommon,
  GraphAgent,
  Headline,
  ReportAction,
  ReportAgent,
  ReportCapability,
  ReportDelegation,
  ReportRecorded,
  ReportFinding,
  ReportGap,
  ReportModel,
  ReportScope,
  FileStep,
  PrivateFile,
  ReturnStatement,
  SecretShapeFinding,
  SessionGraph,
  Tally,
  UseStatement,
  WroteBefore,
} from './report-model.ts';
import { NAMES_PER_FILE } from './report-model.ts';
import { refusedByOthers, type RefusedByOthers } from './refusals.ts';
import { filesRead } from './flow-reads.ts';

/**
 * Identifiers are shortened in a report (§7.3). Both ends are kept: a `toolu_01…` prefix is shared by every
 * call in a session, so a head-only abbreviation makes two different calls look like the same one.
 */
const SHORTEN_ABOVE = 20;
const HEAD = 10;
const TAIL = 4;

/** Programs that carry text rather than reach a file; naming them in a finding only adds noise. */
const NAMES_NOTHING = new Set(['echo', 'printf', 'true', 'false', ':', 'sleep', 'cd', 'export']);

const GAP_WORDS: Readonly<Record<Gap['kind'], string>> = {
  'session-missing': 'the session transcript itself could not be read, so nothing here is a finding',
  'source-missing': 'a source was absent or could not be read',
  'record-damaged': 'a record could not be parsed',
  'result-missing': 'a call has no result, so its outcome is unknown',
  'spilled-result-missing': 'a result points at a spilled file that is gone',
  'outcome-unrecognised': 'an outcome marker carried a value this version does not know',
  'relation-unresolved': 'identifiers did not allow a confident join, so no outcome was assigned',
  'result-incomplete': 'a text may not hold everything, so what is not in it cannot be said',
  'capability-absent': 'the record does not show all of this',
  'capability-unmeasured': 'whether the record shows all of this has not been measured',
};

/** The order a call's reached steps take when its files had different outcomes: the established one first. */
const OUTCOME_ORDER: readonly EventOutcome[] = ['succeeded', 'blocked', 'unknown'];

/** What a capability gap cannot answer, completing its words (`2026-09-27-what-codex-wrote.md` X23). */
const QUESTION_WORDS: Readonly<Record<CapabilityQuestion, string>> = {
  actions: 'which actions ran',
  access: 'what an action reached',
  'output-delivery': 'what reached the AI',
  'own-words': 'everything the AI wrote',
  reasoning: 'what the AI worked out before acting',
  refusals: 'whether an action was refused',
  permissions: 'which permissions were in force',
};

/**
 * Turns what happened into what can be said about it. Every string crosses the redaction boundary here, on the
 * way **into** the model - so the renderers below cannot leak, whatever they do (§5.4, mechanics rule 5).
 */
/** Which view is being produced, so the header can say so rather than leaving a reader to work it out. */
export interface ReportView {
  readonly share: boolean;
  readonly projectRoot: ProjectRoot;
}

const FULL_VIEW: ReportView = { share: false, projectRoot: { kind: 'absent' } };

export function buildReport(
  model: SessionModel,
  policy: Policy,
  redactor: Redactor,
  view: ReportView = FULL_VIEW,
): ReportModel {
  const accesses = protectedAccesses(model, policy);
  // The trace is built by the redactor, which owns this run's salt: what it holds means nothing outside this report.
  // One trace for the run: what came back and what an agent wrote before a call ask the same question of it.
  const traced = traceValues(model, accesses, (values) => redactor.trace(values));
  const returns = returnsOf(model, accesses, traced);
  const uses = valueUses(model, accesses, traced);
  // F57: which patterns a person asked only to be told about, so a finding under one says the agent was let read it.
  const told = new Set(policy.protected.filter((entry) => entry.mode === 'tell').map((entry) => entry.pattern));
  const findings = accesses.map((access) => toFinding(access, model, redactor, view, told.has(access.pattern)));
  const secretShapes = secretShapesIn(model, accesses, redactor, view);
  const delegations = model.delegations.map((delegation) => toDelegation(delegation, model, accesses, redactor, view));
  const gaps = gapsOf(model.gaps, returns);
  const attributed = new Set(model.delegations.map((delegation) => delegation.childAgentId));
  const unattributedAgents = model.agents
    .filter((agent) => agent.id !== model.sessionId && !attributed.has(agent.id))
    .map((agent) => toAgent(agent, model, accesses, redactor, view));

  const wordsBefore = wordsBeforeCalls(model);
  const stories = storiesOf(model, accesses, wordsBefore, traced, redactor, view);
  const statements = returns.map((entry) => toReturn(entry, model, redactor, view));
  // The graph and the flows are built before the tally, because one of its counts is read from them: how many
  // agents the contents of a protected file reached. That is the question the headline answers first, and every
  // other view of this session - the index among them - must answer it with the same number.
  const graph = graphOf(model, accesses, returns, uses, traced, redactor, view);
  const flows = flowsOf(model, accesses, uses, returns, wordsBefore, traced, redactor, view);
  const seen = contentsSeenIn(graph, flows);
  const printed = new Set(stories.filter((story) => story.read === true).map((story) => story.path as string)).size;
  const tally = { ...tallyOf(accesses, returns, uses, seen), ...(seen === 0 && printed > 0 ? { printedUnseen: printed } : {}) };

  return {
    headline: headlineOf(tally, coverageOf(model), redactor),
    tally,
    graph,
    stories,
    // The scope is built last: the redactor can only report what it did once everything has passed through it.
    scope: scopeOf(model, policy, redactor, view),
    summary: {
      agents: model.agents.length,
      delegations: model.delegations.length,
      actions: model.events.length,
      byOutcome: countOutcomes(model.events),
      findings: findings.length,
      secretShapes: secretShapes.length,
      unattributedAgents: unattributedAgents.length,
      tools: toolCounts(model.events),
    },
    mainAgent: model.events
      .filter((event) => event.agentId === model.sessionId)
      .sort((first, second) => first.sequence - second.sequence)
      .map((event) => toAction(event, model, accesses, redactor, view)),
    delegations,
    unattributedAgents,
    findings,
    secretShapes,
    returns: statements,
    uses: uses.map((use) => toUse(use, model, redactor, view)),
    flows,
    privateFiles: privateFilesOf(model, accesses, redactor),
    ...everydayFilesOf(model, accesses, policy, redactor, view),
    fileSteps: fileStepsOf(model, accesses, graph, policy, redactor),
    missing: gaps.map((gap) => redactor.term(missingWords(gap))),
    gaps,
    recorded: recordedOf(model, redactor, view),
  };
}

/**
 * What the runtime recorded beside the actions, across the redaction boundary (`2026-09-27-what-codex-wrote.md` X19-X23):
 * settings through the term and path doors, reviews by agent index and evidence, and every free text by its size only.
 */
function recordedOf(model: SessionModel, redactor: Redactor, view: ReportView): ReportRecorded {
  const indexOf = (agentId: string | undefined): number => model.agents.findIndex((agent) => agent.id === agentId);
  const grouped = new Map<string, { permissions: RuntimePermissions; turns: number; agents: Set<number> }>();
  for (const turn of model.turns) {
    if (turn.permissions === undefined) continue;
    const key = JSON.stringify(turn.permissions);
    const group = grouped.get(key) ?? { permissions: turn.permissions, turns: 0, agents: new Set<number>() };
    group.turns += 1;
    if (indexOf(turn.agentId) >= 0) group.agents.add(indexOf(turn.agentId));
    grouped.set(key, group);
  }
  const capabilities = new Map<string, ReportCapability>();
  for (const record of model.capabilities) {
    const key = `${record.question} ${record.state}`;
    const known = capabilities.get(key);
    capabilities.set(key, { question: record.question, state: record.state, sources: (known?.sources ?? 0) + 1 });
  }
  const contexts: Record<ContextKind, number> = { code: 0, conversation: 0, 'unjoined-instruction': 0, 'orphan-output': 0 };
  for (const context of model.contexts) contexts[context.kind] += 1;

  return {
    permissions: [...grouped.values()].map(({ permissions, turns, agents }) => ({
      turns,
      agentIndexes: [...agents].sort((first, second) => first - second),
      ...(permissions.approval === undefined ? {} : { approval: redactor.term(permissions.approval) }),
      approver: permissions.approver,
      ...(permissions.sandbox === undefined ? {} : { sandbox: redactor.term(permissions.sandbox) }),
      network: permissions.network,
      readScopes: permissions.scopes.filter((scope) => scope.access === 'read').length,
      writeScopes: permissions.scopes.filter((scope) => scope.access === 'write').length,
      writablePaths: [...new Set(permissions.scopes.flatMap((scope) =>
        scope.access === 'write' && scope.target.kind === 'path' ? [redactor.path(scope.target.path)] : []))],
      complete: permissions.complete,
    })),
    reviews: model.reviews.map((review) => ({
      ...(indexOf(review.reviewedAgentId) < 0 ? {} : { reviewedAgentIndex: indexOf(review.reviewedAgentId) }),
      verdicts: review.verdicts.map((verdict) => ({
        outcome: verdict.outcome,
        turnKnown: verdict.turnId !== undefined,
        ...(verdict.risk === undefined ? {} : { risk: redactor.term(verdict.risk) }),
        ...(verdict.rationale === undefined ? {} : { rationaleSize: verdict.rationale.length }),
        evidence: redactor.term(describeEvidence(verdict.evidence, model, view)),
      })),
    })),
    capabilities: [...capabilities.values()],
    deliveries: model.deliveries.length,
    contexts,
  };
}

/**
 * What reading each protected file left behind (`specs/2026-09-23-the-report-page.md` M1, M2): the key formats and the
 * variable names in its text, by name only. A read is counted for a file only when it named that one protected file and
 * its result is that file's text; a read of two at once (`cat a.env b.env`) is given to neither, and both say so,
 * because telling their lines apart would be a guess.
 */
function privateFilesOf(model: SessionModel, accesses: readonly ProtectedAccess[], redactor: Redactor): PrivateFile[] {
  const found = new Map<string, { keys: string[]; names: Redacted[]; keyed: KeyedName[]; mixed: boolean }>();
  const named = new Map<string, Set<string>>();
  for (const access of accesses) {
    if (!found.has(access.path)) found.set(access.path, { keys: [], names: [], keyed: [], mixed: false });
    if (access.source !== 'input') continue;
    named.set(access.eventId, (named.get(access.eventId) ?? new Set()).add(access.path));
  }

  const printed = new Set(accesses.filter((access) => access.lines !== undefined).map((access) => access.eventId));

  for (const event of model.events) {
    const content = event.result?.content;
    const paths = [...(named.get(event.id) ?? [])];
    // H2, H6: a search says whose each line is, so its lines are read for their own file only, and never `mixed`.
    if (printed.has(event.id)) {
      for (const [path, lines] of printedLines(event, paths)) {
        const file = found.get(path);
        if (file !== undefined) readInto(file, lines.join('\n'), redactor);
      }
    }
    if (paths.length === 0 || content === undefined || event.outcome !== 'succeeded') continue;
    // SWO1: a file's text beside a directory's names - its `KEY=value` lines are the file's, the names are not.
    const besideNames = readsContentBesideNames(event);
    if (!besideNames && !readsContent(event)) continue;
    if (paths.length > 1) {
      for (const path of paths) (found.get(path) as { mixed: boolean }).mixed = true;
      continue;
    }
    const file = found.get(paths[0] as string);
    if (file !== undefined) readInto(file, besideNames ? keyedLines(content).join('\n') : content, redactor);
  }

  /*
   * One file, however its path was written. `ls` prints it relative and the Read tool names it absolute, and both are
   * shown the same: kept apart, the to-do list drew the same file twice (seen by the maintainer on 2026-10-02, a file
   * listed by `ls` and then read). Told apart by where they are, never by how a view shows them: the shared view shows
   * every file outside the project as the same words, and merging by those made several files one (found by review).
   */
  const shown = new Map<string, { path: Redacted; keys: Set<string>; names: Map<string, Redacted>; keyed: Map<string, KeyedName>; mixed: boolean }>();
  for (const [path, file] of found) {
    const where = displayPath(path, model.projectRoot);
    const into = shown.get(where) ?? { path: redactor.path(path), keys: new Set(), names: new Map(), keyed: new Map(), mixed: false };
    for (const key of file.keys) into.keys.add(key);
    for (const name of file.names) into.names.set(name, name);
    for (const line of file.keyed) into.keyed.set(JSON.stringify([line.name, line.key]), line);
    into.mixed ||= file.mixed;
    shown.set(where, into);
  }

  return [...shown.values()].map((file) => ({
    path: file.path,
    keys: [...file.keys].map((key) => redactor.term(key)),
    names: [...file.names.values()],
    keyed: [...file.keyed.values()].map((line) => ({ name: line.name, key: redactor.term(line.key) })),
    ...(file.mixed ? { mixed: true as const } : {}),
  }));
}

/** What one file's text shows, through the redactor (M2, M2a): key classes, variable names, keyed lines - never a value. */
function readInto(file: { keys: string[]; names: Redacted[]; keyed: KeyedName[] }, content: string, redactor: Redactor): void {
  for (const key of redactor.keyClassesIn(content)) if (!file.keys.includes(key)) file.keys.push(key);
  for (const name of redactor.keysIn(content)) {
    if (file.names.length < NAMES_PER_FILE && !file.names.includes(name)) file.names.push(name);
  }
  for (const line of redactor.keyedIn(content)) {
    if (file.keyed.length < NAMES_PER_FILE && !file.keyed.some((each) => each.name === line.name)) file.keyed.push(line);
  }
}

/**
 * Where each file of the session first came up (`the-order-it-went.md` OW1, OW2): the first action, in the page's order
 * of AIs - Your AI, then the helpers by their number - and in each AI's own record order, that reached it by any of the
 * ways its row was made. Files one action reached share its step, and keep the place the action gave them: named in it
 * first, then as its output printed them. Never ordered by time across AIs (invariant 3).
 */
function fileStepsOf(model: SessionModel, accesses: readonly ProtectedAccess[], graph: SessionGraph, policy: Policy, redactor: Redactor): FileStep[] {
  const ranked = [graph.main, ...[...graph.agents].sort((a, b) => (a.ordinal ?? Infinity) - (b.ordinal ?? Infinity) || a.index - b.index)];
  const rank = new Map(ranked.map((agent, at) => [agent.index, at]));
  const agentIndex = new Map(model.agents.map((agent, index) => [agent.id, index]));
  const byEvent = new Map<string, string[]>();
  for (const access of accesses) byEvent.set(access.eventId, [...(byEvent.get(access.eventId) ?? []), access.path]);
  const delegating = new Set(model.delegations.map((delegation) => delegation.id));

  const events = model.events
    .filter((event) => event.toolKnown && !delegating.has(event.id) && agentIndex.has(event.agentId))
    .map((event) => ({ event, index: agentIndex.get(event.agentId) as number }))
    .sort((a, b) => (rank.get(a.index) ?? Infinity) - (rank.get(b.index) ?? Infinity) || a.index - b.index || a.event.sequence - b.event.sequence);

  const accessAt = new Map(accesses.map((access) => [access.eventId + '\u0000' + access.path, access]));
  // One step per file and thing done to it, the first of each: the page puts a row at the one its status came from.
  const found = new Map<string, FileStep>();
  for (const { event, index } of events) {
    const output = stringsIn(event.result?.content).join('\n');
    const reach = new Map(everydayReach(event, policy).map((one) => [one.path, one.how]));
    const paths = [...new Set([...(byEvent.get(event.id) ?? []), ...event.targets, ...reach.keys()])].filter((path) => path !== '');
    const operands = new Set(fileOperandsIn(event.commands));
    const howOf = (path: string): NonNullable<FileStep['how']> => {
      const access = accessAt.get(event.id + '\u0000' + path);
      if (event.outcome === 'blocked' || access?.outcome === 'blocked') return 'stopped';
      if (access?.outcome === 'unknown') return 'unknown';
      if (event.written !== undefined && event.targets.includes(path)) return 'changed';
      if ((access?.lines ?? 0) > 0 || reach.get(path) === 'read') return 'read';
      const opened = (event.resultShape === 'content' && event.targets.includes(path)) || (readsContent(event) && operands.has(path));
      return event.outcome === 'succeeded' && opened ? 'read' : 'named';
    };
    // Named in the action first, then in the order its output printed them.
    const placed = paths.map((path) => ({ path, at: output.indexOf(path) })).sort((a, b) => a.at - b.at);
    placed.forEach(({ path }, place) => {
      const shown = redactor.path(path);
      const how = howOf(path);
      if (!found.has(shown + '\u0000' + how)) found.set(shown + '\u0000' + how, { path: shown, agentIndex: index, step: event.sequence, place, how });
    });
  }
  return [...found.values()];
}

/** How many names only seen a page lists: `find .` in a real project prints thousands, and each would be a row. */
export const EVERYDAY_NAMES_LISTED = 200;

/**
 * EF8, EFD4: the calls kept per everyday file, for the window its row opens. Measured 2026-10-05: a story window is
 * ~25.6 KB of a page, so twenty entries is the most one row is worth; the rest are counted.
 */
export const EVERYDAY_CALLS_KEPT = 20;

/**
 * The files no protected pattern matches (M6): a known file tool whose result is the named file's text, or which writes
 * it - a call whose outcome was not recorded is left out, since a list of what the AI opened must not grow by what it
 * may have opened. Changed 2026-10-05 by the maintainer (P32): every other file of the session too, as a command and its
 * output show it (`everydayReach`) - read where a printer opened it, else a name only seen, which is never counted as
 * opened (P32a). Names past `EVERYDAY_NAMES_LISTED` are counted, not listed.
 */
function everydayFilesOf(
  model: SessionModel,
  accesses: readonly ProtectedAccess[],
  policy: Policy,
  redactor: Redactor,
  view: ReportView,
): { readonly everydayFiles: EverydayFile[]; readonly everydayNamesLeftOut?: number } {
  const RANK: Readonly<Record<EverydayFile['how'], number>> = { changed: 2, read: 1, stopped: 0, named: -1 };
  const guarded = new Set(accesses.map((access) => access.eventId + '\u0000' + access.path));
  const delegating = new Set(model.delegations.map((delegation) => delegation.id));
  const agentIndex = new Map(model.agents.map((agent, index) => [agent.id, index]));
  const files = new Map<string, { calls: number; how: EverydayFile['how']; reaches: EverydayCall[]; leftOut: number }>();

  // EF2: the call itself, beside the count it was kept as. Built from the event in hand - `didOfEvent` names what it
  // ran in the words a flow step uses, so one file's story reads the same whoever told it.
  const add = (path: string, how: EverydayFile['how'], event: ToolEvent): void => {
    const known = files.get(path) ?? { calls: 0, how, reaches: [] as EverydayCall[], leftOut: 0 };
    const index = agentIndex.get(event.agentId);
    // EF8: past the most a window is worth, the rest are counted rather than dropped in silence.
    if (index === undefined || known.reaches.length >= EVERYDAY_CALLS_KEPT) {
      if (index !== undefined) known.leftOut += 1;
    } else {
      known.reaches.push({
        agentIndex: index,
        did: redactor.term(didOfEvent(event)),
        outcome: event.outcome,
        evidence: redactor.term(describeEvidence(event.evidence, model, view)),
        ...atOf(event.evidence, view),
        how,
      });
    }
    files.set(path, {
      ...known,
      calls: known.calls + 1,
      how: RANK[how] > RANK[known.how] ? how : known.how,
    });
  };

  for (const event of model.events) {
    if (!event.toolKnown || delegating.has(event.id)) continue;
    const writes = event.written !== undefined;
    if (event.outcome !== 'unknown' && (writes || event.resultShape === 'content')) {
      const how: EverydayFile['how'] = event.outcome === 'blocked' ? 'stopped' : writes ? 'changed' : 'read';
      for (const path of new Set(event.targets)) {
        if (path !== '' && !guarded.has(event.id + '\u0000' + path)) add(path, how, event);
      }
    }
    // What a command and its output show of the rest, by the rules that find a protected path.
    for (const { path, how } of everydayReach(event, policy)) {
      if (!guarded.has(event.id + '\u0000' + path)) add(path, event.outcome === 'blocked' ? 'stopped' : how, event);
    }
  }

  const all = [...files];
  const named = all.filter(([, file]) => file.how === 'named');
  const listed = new Set(named.slice(0, EVERYDAY_NAMES_LISTED).map(([path]) => path));
  const everydayFiles = all.filter(([path, file]) => file.how !== 'named' || listed.has(path))
    .map(([path, file]) => ({
      path: redactor.path(path),
      calls: file.calls,
      how: file.how,
      // EFD1: a file whose name only was seen keeps the simple window, so its calls are not kept at all.
      ...(file.how === 'named' ? {} : { reaches: file.reaches }),
      ...(file.how !== 'named' && file.leftOut > 0 ? { reachesLeftOut: file.leftOut } : {}),
    }));
  const leftOut = named.length - listed.size;
  return { everydayFiles, ...(leftOut > 0 ? { everydayNamesLeftOut: leftOut } : {}) };
}

/**
 * A recognised key format in what came back - `S-shape` of §5.4. It is reported even when the call touched no
 * protected path: a secret exported in a shell profile sits in no `.env` file, so path matching is blind to it.
 */
function secretShapesIn(model: SessionModel, accesses: readonly ProtectedAccess[], redactor: Redactor, view: ReportView): SecretShapeFinding[] {
  // The private files each call named and reached; its result is their text only where it printed them and nothing else.
  const readPrivate = new Map<string, Set<string>>();
  for (const access of accesses) {
    if (access.source !== 'input' || access.outcome !== 'succeeded') continue;
    readPrivate.set(access.eventId, (readPrivate.get(access.eventId) ?? new Set()).add(access.path));
  }
  return model.events.flatMap((event) => {
    const content = event.result?.content;
    if (content === undefined) return [];

    const classes = redactor.classesIn(content);
    if (classes.length === 0) return [];
    const agentIndex = model.agents.findIndex((agent) => agent.id === event.agentId);
    return [
      {
        ...(agentIndex < 0 ? {} : { agentIndex }),
        tool: redactor.term(event.toolName),
        outcome: event.outcome,
        classes: classes.map((name) => redactor.term(name)),
        evidence: redactor.term(describeEvidence(event.result?.evidence ?? event.evidence, model, view)),
        ...(printsOnly(event, readPrivate.get(event.id) ?? new Set()) ? { inPrivateFile: true as const } : {}),
      },
    ];
  });
}

/**
 * What the agent wrote before this call, across the redaction boundary (`specs/2026-09-15-why-this-call.md` R6, R7). The
 * sentence is shown only when those words carried no traced value and the view is not the shared one; how much was
 * written, and before how many calls, is shown either way. The words are never introduced as a reason: judging an
 * instruction is the detector's work, behind the D1 gate.
 */
function wroteBefore(
  before: WordsBefore | undefined,
  model: SessionModel,
  traced: TracedValues,
  redactor: Redactor,
  view: ReportView,
): WroteBefore {
  const words = before?.words ?? [];
  // A block the record kept empty is not words, and is not nothing either: both are reported, each as itself.
  const spoken = words.filter((message) => message.text.trim() !== '');
  const texts = spoken.map((message) => message.text);
  const carried = filesTracedIn(texts, traced);
  const first = spoken[0];
  const quotable = first !== undefined && carried.length === 0 && !view.share;
  const sentence = quotable && first !== undefined ? firstSentence(first.text) : undefined;

  return {
    size: texts.reduce((total, text) => total + text.length, 0),
    blank: words.length - spoken.length,
    covers: before?.covers ?? 1,
    ...(sentence === undefined ? {} : { sentence: redactor.scan(sentence.text) }),
    ...(sentence === undefined || first === undefined ? {} : { kind: first.kind }),
    ...(sentence?.cut === true ? { cut: true as const } : {}),
    carried: [...new Set(carried.map((path) => redactor.path(path)))],
    evidence: redactor.term(
      first === undefined ? 'nothing before this call' : describeEvidence(first.evidence, model, view),
    ),
  };
}

/**
 * The findings as numbers, counted once (`Tally`). Two rules decide every count here:
 *
 * - A **refused** attempt reached nothing, so it is never counted as a file that was reached. Saying "30 files
 *   were reached, and 3 attempts were refused" while the 3 sit inside the 30 is a sentence that misleads by
 *   arithmetic alone.
 * - "No call ever named it" means **no** call named it. A path that one command named and another only printed
 *   belongs to the named side; the result route is the one where nothing was there to inspect.
 */
function tallyOf(
  accesses: readonly ProtectedAccess[],
  returns: readonly DelegationReturn[],
  uses: readonly ValueUse[],
  contentsSeen: number,
): Tally {
  // X11: reached is what the record establishes. Counting every attempt that was not refused counted a missing file
  // `cat` failed on, and a call with no result, as a file reached.
  const reached = accesses.filter((access) => access.outcome === 'succeeded');
  const files = new Set(reached.map((access) => access.path));
  const named = new Set(reached.filter((access) => access.source === 'input').map((access) => access.path));
  const onlyThroughResult = [...files].filter((path) => !named.has(path)).length;

  return {
    contentsSeen,
    filesReached: files.size,
    onlyThroughResult,
    namedByCall: files.size - onlyThroughResult,
    refusedAttempts: accesses.filter((access) => access.outcome === 'blocked').length,
    ...othersAmong(accesses),
    unknownAttempts: accesses.filter((access) => access.outcome === 'unknown').length,
    valuesReturned: returns.filter((entry) => entry.strength === 'value').length,
    valuesWritten: returns.filter((entry) => entry.strength !== 'value' && entry.writtenFrom.length > 0).length,
    // Counted from the uses, not from the returns: the main agent returns to nobody, and it is the one agent
    // every session has. Counted per agent, because that is the question the agent's own panel answers.
    wroteInMessages: new Set(uses.filter(isInOwnWords).map((use) => use.agentId)).size,
    filesWrittenOnward: new Set(uses.filter(isWrittenOnward).flatMap((use) => use.targets ?? [])).size,
    valueUses: uses.length,
  };
}

/** WS3: who refused the refused ones among these, where it was not a rule - absent where a rule refused them all. */
function othersAmong(accesses: readonly ProtectedAccess[]): { readonly refusedByOthers?: RefusedByOthers } {
  const byOthers = refusedByOthers(accesses.filter((access) => access.outcome === 'blocked'));
  return byOthers === undefined ? {} : { refusedByOthers: byOthers };
}

/**
 * How many agents the contents of a protected file reached, by the same rule `session-view.ts` applies to draw
 * one: what a delegation returned, what an agent wrote of it, and every step of its flow that carried a value.
 * The two must keep agreeing - the report says "3 agents saw what is inside sensitive files" from that rule, and
 * a row of the index that says something else about the same session is a row that lies.
 */
function contentsSeenIn(graph: SessionGraph, flows: readonly AgentFlow[]): number {
  // The main agent is kept apart from the rest in the graph, and it is the one agent every session has: counting
  // only `graph.agents` said "no agent saw anything" of a session whose main agent saw everything.
  return [graph.main, ...graph.agents].filter((agent) => {
    if (agent.returned === 'value' || agent.wroteValue === true || agent.wroteOnward === true || agent.received !== undefined) return true;
    const flow = flows.find((one) => one.agentIndex === agent.index);
    return flow !== undefined && flow.steps.some((step) =>
      (step.kind === 'reached' && step.outcome === 'succeeded' && filesRead(step).length > 0) ||
      step.kind === 'received' ||
      step.kind === 'used' ||
      (step.kind === 'delegated' && step.strength === 'value'));
  }).length;
}

/**
 * The session as a shape. One node per agent, each carrying what it was asked and what it reached, ranked so
 * that a drawing which has room for four lanes draws the four that are worth drawing.
 *
 * This is deliberately not a list of delegations: a delegation is a call, and an agent that no call asked for
 * still ran and still reached things. The node is the agent, and a missing instruction is a fact about it.
 */
function graphOf(
  model: SessionModel,
  accesses: readonly ProtectedAccess[],
  returns: readonly DelegationReturn[],
  uses: readonly ValueUse[],
  traced: TracedValues,
  redactor: Redactor,
  view: ReportView,
): SessionGraph {
  // X10: an agent saw a value its model was handed, whichever call - if any the record names - it came from.
  const received = new Map<string, Set<string>>();
  for (const delivery of model.deliveries) {
    if (delivery.status !== 'confirmed') continue;
    const files = filesTracedIn([delivery.text], traced);
    if (files.length > 0) received.set(delivery.recipientAgentId, new Set([...(received.get(delivery.recipientAgentId) ?? []), ...files]));
  }
  const askedOf = new Map(
    model.delegations
      .filter((delegation) => delegation.childAgentId !== undefined && delegation.description !== undefined)
      .map((delegation) => [delegation.childAgentId ?? '', delegation.description ?? '']),
  );

  // The delegated agents in the order their positions run, which is the order both renderers number them in.
  const delegatedOrder = model.agents
    .map((agent, index) => ({ agent, index }))
    .filter(({ agent }) => agent.id !== model.sessionId)
    .map(({ index }) => index);

  const nodeOf = (agent: SessionModel['agents'][number]): GraphAgent => {
    const parents = model.delegations.filter((delegation) => delegation.childAgentId === agent.id);
    const parentIndex = parents.length === 1
      ? model.agents.findIndex((candidate) => candidate.id === parents[0]?.parentAgentId)
      : -1;
    const own = accesses.filter((access) => access.agentId === agent.id);
    const reached = own.filter((access) => access.outcome === 'succeeded');
    const files = [...new Set(reached.map((access) => access.path))];
    // What came back is the worse of the two routes, so it is what the node names when there is a choice.
    const worst = reached.find((access) => access.source === 'result')?.path ?? files[0];
    const asked = askedOf.get(agent.id);

    const index = model.agents.indexOf(agent);

    return {
      index,
      ...(agent.id === model.sessionId ? {} : { ordinal: delegatedOrder.indexOf(index) + 1 }),
      ...(agent.type === undefined ? {} : { type: redactor.term(agent.type) }),
      ...(parentIndex < 0 ? {} : { parentIndex }),
      label: redactor.term(
        agent.id === model.sessionId
          ? 'the session itself'
          : `${agentName(agent.id, model, view)}${agent.type === undefined ? '' : ` · ${agent.type}`}`,
      ),
      ...(asked === undefined ? {} : { askedTo: redactor.scan(asked) }),
      actions: model.events.filter((event) => event.agentId === agent.id).length,
      filesReached: files.length,
      refusedAttempts: own.filter((access) => access.outcome === 'blocked').length,
      ...othersAmong(own),
      ...(worst === undefined ? {} : { topPath: redactor.path(worst) }),
      ...returnedOf(returns, agent.id),
      ...(uses.some((use) => use.agentId === agent.id && isWrittenOnward(use)) ? { wroteOnward: true as const } : {}),
      ...(received.has(agent.id) ? { received: [...new Set([...(received.get(agent.id) ?? [])].map((path) => redactor.path(path)))] } : {}),
    };
  };

  const main = model.agents.find((agent) => agent.id === model.sessionId);

  return {
    main:
      main === undefined
        ? { index: -1, label: redactor.term('the session itself'), actions: 0, filesReached: 0, refusedAttempts: 0 }
        : nodeOf(main),
    agents: model.agents
      .filter((agent) => agent.id !== model.sessionId)
      .map(nodeOf)
      .sort(
        (first, second) =>
          second.filesReached - first.filesReached ||
          second.refusedAttempts - first.refusedAttempts ||
          second.actions - first.actions,
      ),
    totalAgents: model.agents.length,
  };
}

/** Whether the record shows every action that ran and what each reached: the weakest answer any of its sources gives. */
type Coverage = 'complete' | 'absent' | 'unmeasured';

/**
 * X23: read from the declared capabilities, never from the absence of a record. `absent` outranks `unmeasured`: one source
 * known not to show it settles the question that an unmeasured one leaves open.
 */
function coverageOf(model: SessionModel): Coverage {
  const states = new Set(model.capabilities
    .filter((record) => record.question === 'actions' || record.question === 'access')
    .map((record) => record.state));
  return states.has('absent') ? 'absent' : states.has('unmeasured') ? 'unmeasured' : 'complete';
}

/**
 * The answer first. A reader who reads one line should learn whether anything the policy protects was reached,
 * and should not be left to work that out from a table of 65 rows.
 */
function headlineOf(tally: Tally, coverage: Coverage, redactor: Redactor): Headline {
  const { filesReached, onlyThroughResult, refusedAttempts, unknownAttempts } = tally;
  const refused = refusedAttempts === 0 ? '' : `, and ${refusedAttempts} ${refusedAttempts === 1 ? 'attempt was' : 'attempts were'} refused`;

  // An attempt whose effect is not established is never "nothing was reached", however the rest went (X11).
  if (filesReached === 0 && unknownAttempts > 0) {
    return {
      severity: 'attention',
      sentence: redactor.term(
        `No file this policy protects is known to have been reached, but ${unknownAttempts} ` +
          `${unknownAttempts === 1 ? 'attempt at one has' : 'attempts at them have'} no recorded outcome${refused}.`,
      ),
    };
  }
  // X23: a record that does not show every action that ran, or what each reached, is never a clean report - absent and
  // unmeasured said apart, in `GAP_WORDS`' words.
  if (filesReached === 0 && coverage !== 'complete') {
    return {
      severity: 'attention',
      sentence: redactor.term(
        'No file this policy protects is known to have been reached, but ' +
          (coverage === 'absent' ? 'the record does not show everything that ran' : 'whether the record shows everything that ran has not been measured') +
          `${refused}.`,
      ),
    };
  }
  if (filesReached === 0 && refusedAttempts === 0) {
    return { severity: 'clear', sentence: redactor.term('No file this policy protects was reached in this session.') };
  }
  // Every attempt refused: the policy held throughout, which is not the same news as nothing having happened.
  if (filesReached === 0) {
    return {
      severity: 'clear',
      sentence: redactor.term(
        `No file this policy protects was reached: ${refusedAttempts} ` +
          `${refusedAttempts === 1 ? 'attempt was' : 'attempts were'} refused, and nothing else came close.`,
      ),
    };
  }

  return {
    severity: 'attention',
    sentence: redactor.term(
      `${filesReached} ${filesReached === 1 ? 'file' : 'files'} this policy protects ` +
        `${filesReached === 1 ? 'was' : 'were'} reached` +
        `${onlyThroughResult === 0 ? '' : `, ${onlyThroughResult} of them without any call ever naming ${onlyThroughResult === 1 ? 'it' : 'them'}`}` +
        `${refusedAttempts === 0 ? '' : `, and ${refusedAttempts} further ${refusedAttempts === 1 ? 'attempt was' : 'attempts were'} refused`}` +
        `${unknownAttempts === 0 ? '' : `${refusedAttempts === 0 ? ', and' : ';'} ${unknownAttempts} further ${unknownAttempts === 1 ? 'attempt has' : 'attempts have'} no recorded outcome`}.` +
        returnedClause(tally) +
        onwardClause(tally),
    ),
    // Said out loud, because a number that is partly noise and does not say so is worse than no number.
    caveat: redactor.term(
      'A path named inside a shell command is counted as reached; some of those are mentions rather than openings.',
    ),
  };
}

/**
 * One line per path and route, carrying the chain: who reached it, what they had been asked to do, and how.
 * The instruction is the cause - it is the reason this project exists - so it is what the line leads with.
 */
function storiesOf(
  model: SessionModel,
  accesses: readonly ProtectedAccess[],
  wordsBefore: Map<string, WordsBefore>,
  traced: TracedValues,
  redactor: Redactor,
  view: ReportView,
): FindingStory[] {
  const byAgent = new Map(model.agents.map((agent) => [agent.id, agent]));
  const askedOf = new Map(
    model.delegations
      .filter((delegation) => delegation.childAgentId !== undefined && delegation.description !== undefined)
      .map((delegation) => [delegation.childAgentId ?? '', delegation.description ?? '']),
  );
  const grouped = new Map<string, ProtectedAccess[]>();
  for (const access of accesses) {
    const key = `${access.path}\u0000${access.source}\u0000${access.agentId}\u0000${access.outcome}`;
    grouped.set(key, [...(grouped.get(key) ?? []), access]);
  }

  return [...grouped.values()]
    .map((group) => {
      const access = group[0] as ProtectedAccess;
      const agent = byAgent.get(access.agentId);
      const asked = askedOf.get(access.agentId);

      const event = model.events.find((candidate) => candidate.id === access.eventId);
      // S3: read is the page's word - the call printed the file's text, or a search printed its lines.
      const read = access.source === 'input' && access.outcome === 'succeeded' && event !== undefined &&
        (readsContent(event) || readsContentBesideNames(event) || (access.lines ?? 0) > 0);

      return {
        ...(agent === undefined ? {} : { agentIndex: model.agents.indexOf(agent) }),
        path: redactor.path(access.path),
        source: access.source,
        outcome: access.outcome,
        ...(read ? { read: true as const } : {}),
        who:
          access.agentId === model.sessionId
            ? redactor.term('the session itself')
            : redactor.term(
                `${agentName(access.agentId, model, view)}${agent?.type === undefined ? '' : ` (${agent.type})`}`,
              ),
        ...(asked === undefined ? {} : { askedTo: redactor.scan(asked) }),
        did: redactor.term(didOf(access, model)),
        toolKnown: event?.toolKnown ?? false,
        evidence: redactor.term(describeEvidence(access.evidence, model, view)),
        occurrences: group.length,
        ...linesTotal(group),
        wrote: wroteBefore(wordsBefore.get(access.eventId), model, traced, redactor, view),
      };
    })
    .sort((first, second) => rank(first) - rank(second) || second.occurrences - first.occurrences);
}

/**
 * The most serious finding first, and the first one is what a page leads with. An agent that was given an
 * instruction and reached a file through what came back is the shape of the incident this project was built
 * from: the instruction explains it, and no call parameter would have shown it.
 *
 * A refusal ranks **last**. It is good news, and a page whose first line is good news answers "what happened?"
 * with the one thing that did not. The refusals are still counted in the tally, badged as the policy holding,
 * and listed in the table - they are placed, not hidden.
 */
function rank(story: FindingStory): number {
  if (story.outcome === 'blocked') return 6;
  if (story.outcome === 'unknown') return 5;
  if (story.askedTo !== undefined) return story.source === 'result' ? 0 : 1;
  return story.source === 'result' ? 2 : 3;
}

/** The tool, and for a shell the programs it ran - which is structure. The command text itself stays out (§7.3). */
function didOf(access: ProtectedAccess, model: SessionModel): string {
  const event = model.events.find((candidate) => candidate.id === access.eventId);
  return event === undefined ? access.toolName : didOfEvent(event);
}

function didOfEvent(event: ToolEvent): string {
  // Only programs that could have reached something: naming `echo` beside `grep` says nothing about the file.
  const programs = [...new Set(event.commands.flatMap(programsIn))]
    .filter((program) => !NAMES_NOTHING.has(program))
    .slice(0, 2);

  return programs.length === 0 ? event.toolName : `${event.toolName} (${programs.join(', ')})`;
}

function toolCounts(events: readonly ToolEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) counts[event.toolName] = (counts[event.toolName] ?? 0) + 1;
  return counts;
}

function scopeOf(model: SessionModel, policy: Policy, redactor: Redactor, view: ReportView): ReportScope {
  return {
    // A session id names a run on someone's machine and nothing a reader of a shared report can act on.
    sessionId: redactor.term(view.share ? 'not shown' : shorten(model.sessionId)),
    provider: model.provider,
    policy: {
      level: redactor.term(policy.level),
      origin: redactor.term(describeOrigin(policy, redactor)),
      patterns: policy.protected.length,
      exceptions: policy.allowed.length,
    },
    // A reader weighing "nothing was found" deserves to know what was not looked for. All three match classes
    // of §5.4 are implemented as of ruleset v2, so the list is empty and the line is not printed.
    redaction: { ...redactor.summary(), missingClasses: [] },
    completeness: model.completeness,
    ...timesOf(model, view),
    paths: {
      shared: view.share,
      root: view.projectRoot.kind,
      ...(view.projectRoot.kind === 'ambiguous' ? { workingDirectories: view.projectRoot.count } : {}),
    },
  };
}

/**
 * M4: the first and the last time any recorded call was written - a span to show, never an order: the earliest and the
 * latest are read, nothing is sorted by them (architecture invariant 3). A shared report says when nothing happened.
 */
function timesOf(model: SessionModel, view: ReportView): { readonly times?: { readonly first: number; readonly last: number } } {
  if (view.share) return {};
  const times = model.events.flatMap((event) => [event.evidence.at, event.result?.evidence.at]).filter((at): at is number => at !== undefined);
  return times.length === 0 ? {} : { times: { first: Math.min(...times), last: Math.max(...times) } };
}

/** M4: the time a record was written, where it has one and the report may say it - never in a shared report. */
function atOf(evidence: EvidenceRef, view: ReportView): { readonly at?: number } {
  return view.share || evidence.at === undefined ? {} : { at: evidence.at };
}

/**
 * In words, because "default" printed as a value reads like a decision someone took.
 *
 * The file it names is a path on the same machine as every other path in the report, so it goes through the
 * same door. It used to be concatenated straight in, which left `--share --policy /Users/someone/…` printing
 * an account name in a report whose whole promise is that it does not.
 */
function describeOrigin(policy: Policy, redactor: Redactor): string {
  const { origin } = policy;
  if (origin.kind === 'file') return `policy file ${redactor.path(origin.path)}`;
  if (origin.kind === 'settings') {
    const path = redactor.path(origin.path);
    return `deny rules of ${path} — ${origin.used} used, ${origin.ignored} ignored as command patterns`;
  }
  return 'BUILT-IN DEFAULT — no policy file was given';
}

function toDelegation(
  delegation: SessionModel['delegations'][number],
  model: SessionModel,
  accesses: readonly ProtectedAccess[],
  redactor: Redactor,
  view: ReportView,
): ReportDelegation {
  const events = model.events
    .filter((event) => event.agentId === delegation.childAgentId)
    .sort((first, second) => first.sequence - second.sequence);
  const parentAgentIndex = model.agents.findIndex((agent) => agent.id === delegation.parentAgentId);
  const childAgentIndex = model.agents.findIndex((agent) => agent.id === delegation.childAgentId);

  return {
    id: redactor.term(view.share ? `${model.delegations.indexOf(delegation) + 1}` : shorten(delegation.id)),
    ...(parentAgentIndex < 0 ? {} : { parentAgentIndex }),
    ...(childAgentIndex < 0 ? {} : { childAgentIndex }),
    evidence: redactor.term(describeEvidence(delegation.evidence, model, view)),
    ...(delegation.requestedType === undefined ? {} : { agentType: redactor.term(delegation.requestedType) }),
    ...(delegation.depth === undefined ? {} : { depth: delegation.depth }),
    // §7.3: the full text of a prompt does not go into a report. The short description does, scanned, and the
    // instruction is reported by its size. Quoting the fragment a finding rests on needs a finding to rest on,
    // and that is the detector's - until then, a report that quoted everything would be the leak it warns about.
    ...(delegation.description === undefined ? {} : { description: redactor.scan(delegation.description) }),
    ...(delegation.prompt === undefined ? {} : { instructionSize: delegation.prompt.length }),
    laterInstructions: delegation.followUps.map((followUp) => ({
      size: followUp.text.length,
      evidence: redactor.term(describeEvidence(followUp.evidence, model, view)),
    })),
    actions: events.map((event) => toAction(event, model, accesses, redactor, view)),
    completeness: delegation.completeness,
  };
}

/** An agent nobody can say was asked for. Its actions are still evidence, so they are shown. */
function toAgent(
  agent: SessionModel['agents'][number],
  model: SessionModel,
  accesses: readonly ProtectedAccess[],
  redactor: Redactor,
  view: ReportView,
): ReportAgent {
  return {
    agentIndex: model.agents.indexOf(agent),
    id: redactor.term(agentName(agent.id, model, view)),
    ...(agent.type === undefined ? {} : { type: redactor.term(agent.type) }),
    ...(agent.depth === undefined ? {} : { depth: agent.depth }),
    actions: model.events
      .filter((event) => event.agentId === agent.id)
      .sort((first, second) => first.sequence - second.sequence)
      .map((event) => toAction(event, model, accesses, redactor, view)),
  };
}

function toAction(
  event: ToolEvent,
  model: SessionModel,
  accesses: readonly ProtectedAccess[],
  redactor: Redactor,
  view: ReportView,
): ReportAction {
  const touched = accesses.find((access) => access.eventId === event.id);

  return {
    sequence: event.sequence,
    tool: redactor.term(event.toolName),
    outcome: event.outcome,
    // What the call was pointed at: the protected path when there was one, and otherwise nothing - the full
    // parameters are transcript content and do not belong in a report (§7.3).
    ...(touched === undefined ? {} : { target: redactor.path(touched.path) }),
    evidence: redactor.term(describeEvidence(event.evidence, model, view)),
    ...atOf(event.evidence, view),
  };
}

/** H10: how many lines of one file a group of calls printed, or nothing where none did. */
function linesTotal(group: readonly ProtectedAccess[]): { lines?: number } {
  const total = group.reduce((sum, access) => sum + (access.lines ?? 0), 0);
  return total === 0 ? {} : { lines: total };
}

/** H5: the files of one call whose lines a search printed, with how many - redacted, as every path of a step is. */
function linesIn(group: readonly ProtectedAccess[], redactor: Redactor): { lines?: { path: Redacted; count: number }[] } {
  const printed = group.filter((access) => (access.lines ?? 0) > 0).map((access) => ({ path: redactor.path(access.path), count: access.lines as number }));
  return printed.length === 0 ? {} : { lines: printed };
}

function toFinding(access: ProtectedAccess, model: SessionModel, redactor: Redactor, view: ReportView, told: boolean): ReportFinding {
  return {
    path: redactor.path(access.path),
    source: access.source,
    outcome: access.outcome,
    tool: redactor.term(access.toolName),
    pattern: redactor.term(access.pattern),
    evidence: redactor.term(describeEvidence(access.evidence, model, view)),
    ...(told ? { told: true as const } : {}),
  };
}

/**
 * R11: the headline carries the strongest fact. A value that came back is stronger than the reach it follows; failing
 * that, a value an agent wrote into its own messages is, because the session's transcript now keeps it - which is all
 * the motivating case's transcript records of its incident. A path or a report that came back is weaker than the
 * reach already said, so it changes nothing here.
 */
function returnedClause(tally: Tally): string {
  const { valuesReturned, valuesWritten } = tally;
  if (valuesReturned === 1) return " An agent's answer carried a value from one of them back to the agent that started it.";
  if (valuesReturned > 1) {
    return ` In ${valuesReturned} delegations, an agent's answer carried a value from one of them back to the agent that started it.`;
  }
  if (valuesWritten === 1) {
    return " An agent wrote a value from one of them into its own messages, which the session's transcript now keeps.";
  }
  if (valuesWritten > 1) {
    return ` Agents in ${valuesWritten} delegations wrote a value from one of them into their own messages, which the session's transcript now keeps.`;
  }
  return '';
}

/**
 * where-the-value-went R11: a value put into a file that is not protected leads. Uses in words, commands, prompts and
 * other calls do not change the headline, and neither does a write into a protected file - editing configuration.
 */
function onwardClause({ filesWrittenOnward, valuesReturned }: Tally): string {
  if (filesWrittenOnward === 0) return '';
  // After a value came back the sentence before names it, and "the same value" is the plainer way to say it again.
  const subject = valuesReturned > 0 ? 'The same value' : 'A value from one of them';
  return filesWrittenOnward === 1
    ? ` ${subject} was also written into a file that is not protected.`
    : ` ${subject} was also written into ${filesWrittenOnward} files that are not protected.`;
}

function isWrittenOnward(use: ValueUse): boolean {
  return use.landed === 'file' && use.intoProtected !== true;
}

/** R7: an agent's own words, of either kind - the words the transcript keeps whether or not anything came back. */
function isInOwnWords(use: ValueUse): boolean {
  return use.landed === 'said' || use.landed === 'reasoning';
}

/** R9: where the value landed crosses the boundary; the value, the words and the command line never do. */
function toUse(use: ValueUse, model: SessionModel, redactor: Redactor, view: ReportView): UseStatement {
  const agentIndex = model.agents.findIndex((agent) => agent.id === use.agentId);
  const paths = (list: readonly string[]): Redacted[] => [...new Set(list.map((path) => redactor.path(path)))];

  return {
    ...(agentIndex < 0 ? {} : { agentIndex }),
    files: paths(use.files),
    ...(use.fileUncertain === true ? { fileUncertain: true as const } : {}),
    landed: use.landed,
    ...(use.targets === undefined ? {} : { targets: paths(use.targets), intoProtected: use.intoProtected === true }),
    ...(use.programs === undefined ? {} : { programs: use.programs.map((program) => redactor.term(program)), commits: use.commits === true }),
    source: use.source,
    ...(use.sourceTargets === undefined ? {} : { sourceTargets: paths(use.sourceTargets) }),
    evidence: redactor.term(describeEvidence(use.evidence, model, view)),
  };
}

/** The strongest of what came back from this agent, and whether it wrote a value that did not, for its node (R12). */
function returnedOf(
  returns: readonly DelegationReturn[],
  agentId: string,
): { readonly returned?: 'value' | 'path'; readonly wroteValue?: true } {
  const own = returns.filter((entry) => entry.agentId === agentId);
  const returned = own.some((entry) => entry.strength === 'value')
    ? 'value'
    : own.some((entry) => entry.strength === 'path')
      ? 'path'
      : undefined;
  const wrote = returned !== 'value' && own.some((entry) => entry.writtenFrom.length > 0);

  return { ...(returned === undefined ? {} : { returned }), ...(wrote ? { wroteValue: true as const } : {}) };
}

/** A return across the redaction boundary: files through the path door, agents by index, and no text of it (R10). */
function toReturn(entry: DelegationReturn, model: SessionModel, redactor: Redactor, view: ReportView): ReturnStatement {
  const agentIndex = model.agents.findIndex((agent) => agent.id === entry.agentId);
  const parentAgentIndex = model.agents.findIndex((agent) => agent.id === entry.parentAgentId);

  return {
    ...(agentIndex < 0 ? {} : { agentIndex }),
    ...(parentAgentIndex < 0 ? {} : { parentAgentIndex }),
    strength: entry.strength,
    // Two files outside the project are one category in the shared view, and saying it twice says nothing more.
    paths: [...new Set(entry.paths.map((path) => redactor.path(path)))],
    writtenFrom: [...new Set(entry.writtenFrom.map((path) => redactor.path(path)))],
    ...(entry.fileUncertain === true ? { fileUncertain: true as const } : {}),
    filesReached: entry.filesReached,
    ...(entry.reportLength === undefined ? {} : { reportLength: entry.reportLength }),
    ...(entry.awaited === true ? { awaited: true as const } : {}),
    evidence: redactor.term(describeEvidence(entry.evidence, model, view)),
  };
}

/**
 * What could not be established, counted by kind. R9: a return that could not be read is a gap, and is said among the
 * others - apart from one that was never delivered (where-the-value-went R5), since "could not be read" would name the
 * wrong cause.
 */
function gapsOf(gaps: readonly Gap[], returns: readonly DelegationReturn[]): ReportGap[] {
  const counted = new Map<string, ReportGap>();
  for (const gap of gaps) {
    // A capability gap is counted with its question: "the record does not say which actions ran" is a different gap
    // from "... what reached the AI", and one count for both would say neither.
    const key = gap.kind + ' ' + (gap.question ?? '');
    const known = counted.get(key);
    counted.set(key, { kind: gap.kind, ...(gap.question === undefined ? {} : { question: gap.question }), count: (known?.count ?? 0) + 1 });
  }
  const unknown = returns.filter((entry) => entry.strength === 'unknown');
  const awaited = unknown.filter((entry) => entry.awaited === true).length;
  const unreadable = unknown.length - awaited;
  return [
    ...counted.values(),
    ...(unreadable === 0 ? [] : [{ kind: 'answer-unread' as const, count: unreadable }]),
    ...(awaited === 0 ? [] : [{ kind: 'answer-awaited' as const, count: awaited }]),
  ];
}

function missingWords(gap: ReportGap): string {
  if (gap.kind === 'answer-unread') return `${gap.count} × an agent's answer could not be read, so what was in it is unknown`;
  if (gap.kind === 'answer-awaited') return `${gap.count} × an agent ran in the background and its answer never arrived, so what was in it is unknown`;
  const words = gap.question === undefined ? GAP_WORDS[gap.kind] : `${GAP_WORDS[gap.kind]}: ${QUESTION_WORDS[gap.question]}`;
  return `${gap.count} × ${words}`;
}

function countOutcomes(events: readonly ToolEvent[]): Readonly<Record<EventOutcome, number>> {
  return {
    succeeded: events.filter((event) => event.outcome === 'succeeded').length,
    blocked: events.filter((event) => event.outcome === 'blocked').length,
    unknown: events.filter((event) => event.outcome === 'unknown').length,
  };
}

function describeEvidence(evidence: EvidenceRef, model: SessionModel, view: ReportView): string {
  const { source } = evidence;
  const where = source.kind === 'main'
    ? 'session'
    : source.kind === 'agent'
      ? `agent ${agentName(source.agentId, model, view)}`
      // A reviewer is no agent of the session: it is named by its place among the reviews, never by its id (X19).
      : `review ${model.reviews.findIndex((review) => review.id === source.reviewId) + 1}`;
  return `${where} record ${evidence.record}`;
}

/**
 * How an agent is named. Shortened in the full view; in the shared one, the position it already occupies on the
 * page (R6). An identifier names a run on someone's machine, an ordinal names a row in this report - and the
 * ordinal is what a reader is pointing at anyway when they say "agent 6".
 */
function agentName(id: string, model: SessionModel, view: ReportView): string {
  if (!view.share) return shorten(id);

  const index = model.agents.findIndex((agent) => agent.id === id);
  // An agent the report does not hold is still an agent: saying so beats printing an id or printing nothing.
  return index < 0 ? 'not in this report' : `${index}`;
}

function shorten(identifier: string): string {
  if (identifier.length <= SHORTEN_ABOVE) return identifier;
  return `${identifier.slice(0, HEAD)}…${identifier.slice(-TAIL)}`;
}

/** A step before it is numbered and collapsed: where it sits, what it says, and what a later use may name it by. */
interface RawStep {
  readonly at: number;
  /** Two consecutive steps with one signature say the same thing, and collapse (agent-flow R3). */
  readonly signature: string;
  /** How a use's source names this step: the record of a result it returned, or the delegation. */
  readonly keys: readonly string[];
  readonly evidence: EvidenceRef;
  readonly programs?: readonly string[];
  readonly commits?: boolean;
  /** A step that makes no flow on its own: an agent that was only asked has nothing to show. */
  readonly alone?: true;
  readonly build: (
    common: FlowStepCommon,
    merged: { readonly programs: readonly string[]; readonly commits: boolean },
    afterOf: (key: string) => number | undefined,
  ) => FlowStep;
}

const FIRST = Number.MIN_SAFE_INTEGER;
const LAST = Number.MAX_SAFE_INTEGER;

/**
 * Every agent's flow (`specs/2026-09-15-agent-flow.md` R1-R6): what it did with protected files and values, in the order
 * of its own records, with consecutive steps that say the same thing collapsed (R3, §5.1). Built here, before the
 * boundary, because the order lives in records a renderer never sees. A delegation is a step that names another agent;
 * no step of one agent is ever placed among another's.
 */
function flowsOf(
  model: SessionModel,
  accesses: readonly ProtectedAccess[],
  uses: readonly ValueUse[],
  returns: readonly DelegationReturn[],
  wordsBefore: Map<string, WordsBefore>,
  traced: TracedValues,
  redactor: Redactor,
  view: ReportView,
): AgentFlow[] {
  const events = new Map(model.events.map((event) => [event.id, event]));
  const indexOf = (agentId: string): number | undefined => {
    const index = model.agents.findIndex((agent) => agent.id === agentId);
    return index < 0 ? undefined : index;
  };
  const paths = (list: readonly string[]): Redacted[] => [...new Set(list.map((path) => redactor.path(path)))];
  const raw = new Map<string, RawStep[]>();
  const push = (agentId: string, step: RawStep): void => {
    const list = raw.get(agentId);
    if (list === undefined) raw.set(agentId, [step]);
    else list.push(step);
  };

  // A call that reached, or was refused, a protected file - one step for the call and each outcome its files had. X11: a
  // search whose own outcome is unknown reached what it printed, and only attempted the rest, so one outcome for the
  // whole call would say the tally's "reached" of none of them. The established step comes first, so a use after the
  // call's result follows it.
  const byEvent = new Map<string, ProtectedAccess[]>();
  for (const access of accesses) byEvent.set(access.eventId, [...(byEvent.get(access.eventId) ?? []), access]);
  const byOutcome = [...byEvent].flatMap(([eventId, all]) =>
    OUTCOME_ORDER.map((outcome) => [eventId, outcome, all.filter((access) => access.outcome === outcome)] as const)
      .filter(([, , group]) => group.length > 0));
  for (const [eventId, outcome, group] of byOutcome) {
    const event = events.get(eventId);
    const first = group[0];
    if (event === undefined || first === undefined) continue;
    const files = [...new Set(group.map((access) => access.path))].sort();
    const sources = [...new Set(group.map((access) => access.source))].sort();
    const did = didOf(first, model);
    // Repeats merge into their first call, so a search that printed lines is never merged into one that printed names.
    const printed = group.filter((access) => access.lines !== undefined).map((access) => `${access.path}=${access.lines}`).sort();
    push(event.agentId, {
      at: event.evidence.record,
      signature: ['reached', did, sources.join(','), outcome, files.join(','), printed.join(',')].join('\u0000'),
      keys: event.result === undefined ? [] : [`result ${event.result.evidence.record}`],
      evidence: event.evidence,
      build: (common) => ({
        ...common,
        ...(outcome === 'unknown' ? { broken: true as const } : {}),
        kind: 'reached',
        did: redactor.term(did),
        toolKnown: event.toolKnown,
        files: paths(files),
        sources,
        outcome,
        // X10: a value in what a process printed is in the record, not in the agent's context, until something shows it was
        // handed to the agent's model.
        carriedValue: event.result?.content !== undefined && event.result.stage === 'model' && traced.trace.foundIn(event.result.content).size > 0,
        ...linesIn(group, redactor),
        viaCommand: event.commands.length > 0,
        ...(event.result !== undefined && event.result.stage !== 'model' ? { processOutput: true as const } : {}),
        wrote: wroteBefore(wordsBefore.get(eventId), model, traced, redactor, view),
      }),
    });
  }

  // X10: output an agent's model was handed that no call of its returned, holding a value from a protected file - the
  // agent read that file, and the step names no call it came from, since the record joins it to none.
  for (const delivery of model.deliveries) {
    if (delivery.status !== 'confirmed') continue;
    const files = filesTracedIn([delivery.text], traced).sort();
    if (files.length === 0) continue;
    push(delivery.recipientAgentId, {
      at: delivery.evidence.record,
      signature: ['received', files.join(',')].join('\u0000'),
      keys: [],
      evidence: delivery.evidence,
      build: (common) => ({ ...common, kind: 'received', files: paths(files) }),
    });
  }

  // A result that reached nothing protected, but carried a value a use came after (where-the-value-went R8).
  const carried = new Set<string>();
  for (const use of uses) {
    if (use.source !== 'unprotected' || use.sourceRecord === undefined) continue;
    const record = use.sourceRecord;
    if (carried.has(`${use.agentId} ${record}`)) continue;
    carried.add(`${use.agentId} ${record}`);
    const event = model.events.find((candidate) => candidate.agentId === use.agentId && candidate.result?.evidence.record === record);
    if (event === undefined) continue;
    push(use.agentId, {
      at: record,
      signature: `carried ${record}`,
      keys: [`result ${record}`],
      evidence: event.result?.evidence ?? event.evidence,
      build: (common) => ({ ...common, kind: 'carried', did: redactor.term(didOfEvent(event)), named: paths(event.targets) }),
    });
  }

  for (const use of uses) {
    const sourceKey = use.source === 'returned'
      ? `delegation ${use.sourceDelegationId ?? ''}`
      : use.sourceRecord === undefined ? undefined : `result ${use.sourceRecord}`;
    const onto = use.targets ?? [];
    push(use.agentId, {
      at: use.evidence.record,
      signature: ['used', use.landed, use.files.join(','), onto.join(','), String(use.intoProtected === true), use.source, sourceKey ?? ''].join('\u0000'),
      keys: [],
      evidence: use.evidence,
      ...(use.programs === undefined ? {} : { programs: use.programs }),
      ...(use.commits === undefined ? {} : { commits: use.commits }),
      build: (common, merged, afterOf) => {
        const after = sourceKey === undefined ? undefined : afterOf(sourceKey);
        return {
          ...common,
          kind: 'used',
          landed: use.landed,
          files: paths(use.files),
          ...(use.fileUncertain === true ? { fileUncertain: true as const } : {}),
          ...(use.targets === undefined ? {} : { targets: paths(use.targets), intoProtected: use.intoProtected === true }),
          ...(use.landed === 'command' ? { programs: merged.programs.map((program) => redactor.term(program)), commits: merged.commits } : {}),
          source: use.source,
          ...(after === undefined ? {} : { after }),
        };
      },
    });
  }

  for (const entry of returns) {
    const delegation = model.delegations.find((candidate) => candidate.id === entry.delegationId);
    const child = indexOf(entry.agentId);
    const parent = indexOf(entry.parentAgentId);
    const came = {
      strength: entry.strength,
      ...(entry.awaited === true ? { awaited: true as const } : {}),
    ...(entry.inferred === true ? { inferred: true as const } : {}),
      ...(entry.inferred === true ? { inferred: true as const } : {}),
      files: paths(entry.strength === 'value' || entry.strength === 'path' ? entry.paths : []),
      ...(entry.strength === 'unknown' ? { broken: true as const } : {}),
    };
    push(entry.parentAgentId, {
      at: delegation?.evidence.record ?? entry.evidence.record,
      signature: `delegated ${entry.delegationId}`,
      keys: [`delegation ${entry.delegationId}`],
      evidence: delegation?.evidence ?? entry.evidence,
      build: (common) => ({ ...common, ...came, kind: 'delegated', ...(child === undefined ? {} : { toAgentIndex: child }) }),
    });
    push(entry.agentId, {
      at: LAST,
      signature: `returned ${entry.delegationId}`,
      keys: [],
      evidence: entry.evidence,
      build: (common) => ({ ...common, ...came, kind: 'returned', ...(parent === undefined ? {} : { toAgentIndex: parent }) }),
    });
  }

  for (const delegation of model.delegations) {
    if (delegation.childAgentId === undefined) continue;
    const parent = indexOf(delegation.parentAgentId);
    push(delegation.childAgentId, {
      at: FIRST,
      signature: `asked ${delegation.id}`,
      keys: [],
      evidence: delegation.evidence,
      alone: true,
      build: (common) => ({
        ...common,
        kind: 'asked',
        ...(parent === undefined ? {} : { byAgentIndex: parent }),
        ...(delegation.description === undefined ? {} : { askedTo: redactor.scan(delegation.description) }),
      }),
    });
  }

  return model.agents.flatMap((agent, agentIndex): AgentFlow[] => {
    const steps = [...(raw.get(agent.id) ?? [])].sort((first, second) => first.at - second.at);
    if (steps.every((step) => step.alone === true)) return [];

    const groups: { first: RawStep; last: RawStep; count: number; programs: Set<string>; commits: boolean; keys: string[] }[] = [];
    for (const step of steps) {
      const previous = groups.at(-1);
      if (previous !== undefined && previous.first.signature === step.signature) {
        previous.last = step;
        previous.count += 1;
        for (const program of step.programs ?? []) previous.programs.add(program);
        previous.commits = previous.commits || step.commits === true;
        previous.keys.push(...step.keys);
      } else {
        groups.push({ first: step, last: step, count: 1, programs: new Set(step.programs ?? []), commits: step.commits === true, keys: [...step.keys] });
      }
    }

    const numbers = new Map<string, number>();
    groups.forEach((group, index) => {
      for (const key of group.keys) if (!numbers.has(key)) numbers.set(key, index + 1);
    });
    const recordOf = (step: RawStep): Redacted => redactor.term(describeEvidence(step.evidence, model, view));

    return [{
      agentIndex,
      steps: groups.map((group, index) =>
        group.first.build(
          {
            number: index + 1,
            count: group.count,
            evidence: group.count > 1 ? [recordOf(group.first), recordOf(group.last)] : [recordOf(group.first)],
            ...atOf(group.first.evidence, view),
          },
          { programs: [...group.programs], commits: group.commits },
          (key) => numbers.get(key),
        ),
      ),
    }];
  });
}
