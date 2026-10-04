// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { CapabilityQuestion } from '../../../core/completeness.ts';
import { PROVIDER_NAMES } from '../../../core/session-format.ts';
import { SENTENCE_CAP } from '../../../shared/sentence.ts';
import { filesRead } from '../../flow-reads.ts';
import type { AgentFlow, FlowStep, GraphAgent, ReportAction, ReportModel, WroteBefore } from '../../report-model.ts';
import { actionsFor, escapeHtml as e } from '../html-report-components.ts';
import { inLanguages, type Translate } from '../report-copy.ts';
import { buildSessionView } from '../session-view.ts';
import { avatar } from '../ui/avatar.ts';
import { callout } from '../ui/callout.ts';
import { tag } from '../ui/tag.ts';

/**
 * What the earlier report said and the design file does not draw (the report page spec P60-P63): what the record cannot
 * tell, how the session was read, the key shapes results carried, and each AI's run step by step with what it wrote
 * before a call. In the earlier report's words - `gaps.*`, `scope.*`, `flow.*`, `use.*`, `wrote.*` - and none of its
 * markup.
 */

/** P60: the gaps the record has - the same test the earlier report's "What cannot be established?" made. */
export interface RecordGaps {
  readonly any: boolean;
  readonly unknown: readonly { readonly agent: GraphAgent; readonly action: ReportAction }[];
  readonly unresolved: readonly GraphAgent[];
  readonly missingDelegations: readonly (string | undefined)[];
}

export function recordGaps(report: ReportModel): RecordGaps {
  const view = buildSessionView(report);
  const unknown = [report.graph.main, ...report.graph.agents].flatMap((agent) =>
    actionsFor(agent, report).filter((action) => action.outcome === 'unknown').map((action) => ({ agent, action })));
  const unresolved = view.agents.filter((entry) => entry.unresolved).map((entry) => entry.agent);
  const missingDelegations = view.column.flatMap((entry) => (entry.kind === 'missing' ? [entry.delegation.description as string | undefined] : []));
  return {
    any: report.scope.completeness !== 'complete' || report.missing.length > 0 || unknown.length > 0 || unresolved.length > 0 || missingDelegations.length > 0,
    unknown,
    unresolved,
    missingDelegations,
  };
}

/** Your AI, "Helper 6", or an agent the report does not hold. */
function namesOf(report: ReportModel): (index: number | undefined, t: Translate) => string {
  const agents = new Map([report.graph.main, ...report.graph.agents].map((agent) => [agent.index, agent]));
  return (index, t) => {
    const agent = index === undefined ? undefined : agents.get(index);
    if (agent === undefined) return t('flow.someAgent');
    return agent.ordinal === undefined ? t('st.main') : t('st.helper', { ordinal: agent.ordinal });
  };
}

const section = (title: string, body: string): string => '<section class="rc-sect"><h3 class="rc-h">' + title + '</h3>' + body + '</section>';
const label = (key: string, vars: Record<string, string | number> = {}): string => inLanguages((t) => t(key, vars));

/** The questions a record may leave open, in the order the page asks them. */
const QUESTIONS: readonly CapabilityQuestion[] = ['actions', 'access', 'output-delivery', 'own-words', 'reasoning', 'refusals', 'permissions'];

/** One row of what is missing: what it is, what it changes, how many times, and - folded - which ones. */
function gapRow(key: string, count: number, which: readonly string[] = []): string {
  return '<li class="rc-row"><span class="rc-row-mark" aria-hidden="true"></span><div class="rc-row-main">' +
    '<div class="rc-row-t">' + label(key + '.t') + '</div><div class="rc-row-d">' + label(key + '.d') + '</div>' +
    (which.length === 0 ? '' : '<details class="rc-which"><summary>' + label('rec.gap.which') + '</summary><ul class="rc-list">' +
      which.map((one) => '<li>' + one + '</li>').join('') + '</ul></details>') +
    '</div>' + (count > 1 ? tag(label('rec.gap.times', { n: count }), 'grey', 'badge') : '') + '</li>';
}

/**
 * P61: the Record tab. An answer first - whether the record is complete - then each gap as a row that says what is
 * missing and what that changes, in the reader's language (`report.gaps`, never `missing`'s English lines); what the
 * format cannot show, once; how the conversation was checked, with every code folded under Technical details.
 */
export function recordTab(report: ReportModel): string {
  const gaps = recordGaps(report);
  const names = namesOf(report);
  const ai = e(PROVIDER_NAMES[report.scope.provider]);

  const missing = [
    ...report.gaps.filter((gap) => gap.question === undefined).map((gap) => gapRow('rec.gap.k.' + gap.kind, gap.count)),
    ...(gaps.unknown.length === 0 ? [] : [gapRow('rec.gap.unknown', gaps.unknown.length, gaps.unknown.map(({ agent, action }) =>
      inLanguages((t) => names(agent.index, t)) + ' · <code>' + e(action.tool) + '</code> · <code>' + e(action.evidence) + '</code>'))]),
    ...(gaps.unresolved.length === 0 ? [] : [gapRow('rec.gap.unresolved', gaps.unresolved.length,
      gaps.unresolved.map((agent) => inLanguages((t) => names(agent.index, t))))]),
    ...(gaps.missingDelegations.length === 0 ? [] : [gapRow('rec.gap.lost', gaps.missingDelegations.length,
      gaps.missingDelegations.map((description) => description === undefined ? label('missing.none') : e(description)))]),
  ];

  // What the format cannot show, from its gaps and from what its sources declared: said once, here, and the rest it
  // does show named in one line under it.
  const states = new Map<CapabilityQuestion, 'absent' | 'unmeasured' | 'supported'>();
  const note = (question: CapabilityQuestion, state: 'absent' | 'unmeasured' | 'supported'): void => {
    const known = states.get(question);
    if (known === 'absent' || (known === 'unmeasured' && state === 'supported')) return;
    states.set(question, state);
  };
  for (const gap of report.gaps) if (gap.question !== undefined) note(gap.question, gap.kind === 'capability-absent' ? 'absent' : 'unmeasured');
  for (const one of report.recorded.capabilities) note(one.question, one.state);
  const unseen = QUESTIONS.filter((question) => states.get(question) === 'absent')
    .concat(QUESTIONS.filter((question) => states.get(question) === 'unmeasured'));
  const shown = QUESTIONS.filter((question) => states.get(question) === 'supported');
  const cannotShow = unseen.length === 0 ? '' : '<h4 class="rc-h4">' + label('rec.cap.h') + '</h4>' +
    '<p class="rc-p rc-dim rc-narrow">' + label('rec.cap.lead', { ai }) + '</p><ul class="rc-rows">' +
    unseen.map((question) => '<li class="rc-row rc-row-cap"><div class="rc-row-main"><div class="rc-row-t">' + label('rec.cap.t.' + question) + '</div>' +
      '<div class="rc-row-d">' + label('rec.cap.d.' + question) + '</div></div>' +
      (states.get(question) === 'absent' ? tag(label('rec.cap.tag.absent'), 'amber') : tag(label('rec.cap.tag.unmeasured'), 'grey')) + '</li>').join('') + '</ul>' +
    (shown.length === 0 ? '' : '<p class="rc-p rc-dim">' + inLanguages((t) => t('rec.cap.shown', { ai, list: shown.map((question) => t('rec.q.' + question)).join(', ') })) + '</p>');

  const state = gaps.any ? 'gaps' : 'clean';
  const cannot = '<section class="rc-sect rc-answer">' + tag(label('rec.gap.tag.' + state), gaps.any ? 'amber' : 'grey') +
    '<h3 class="rc-title">' + label('rec.gap.title.' + state) + '</h3><p class="rc-lead">' + label('rec.gap.lead.' + state) + '</p>' +
    (missing.length === 0 ? '' : '<h4 class="rc-h4">' + label('rec.gap.missing') + '</h4><ul class="rc-rows">' + missing.join('') + '</ul>') +
    cannotShow + '<div class="rc-note">' + callout({ tone: 'grey', body: label('rec.note') }) + '</div></section>';

  const shapes = report.secretShapes.length === 0 ? '<p class="rc-p">' + label('rec.shapes.none') + '</p>'
    : '<ul class="rc-list">' + report.secretShapes.map((shape) => '<li><code>' + shape.classes.map((one) => e(one)).join(', ') + '</code> · ' +
      inLanguages((t) => names(shape.agentIndex, t)) + ' · ' + e(shape.tool) + ' · <code>' + e(shape.evidence) + '</code></li>').join('') + '</ul>';

  return '<div class="rc">' + cannot + howChecked(report) + recordedSection(report, names) + section(label('rec.shapes'), shapes) + '</div>';
}

/** P61, *How the session was read*: three facts in words, and every code - the rule, its source, the ID - folded. */
function howChecked(report: ReportModel): string {
  const { policy, redaction, sessionId, paths } = report.scope;
  const builtIn = policy.origin.startsWith('BUILT-IN DEFAULT');
  const level = policy.level === 'no-read' || policy.level === 'no-disclose' ? policy.level : 'other';
  const fact = (key: string, value: string, note = ''): string => '<div class="rc-fact"><dt>' + label(key) + '</dt><dd>' + value +
    (note === '' ? '' : '<span class="rc-fact-note">' + note + '</span>') + '</dd></div>';
  const counts = inLanguages((t) => t(builtIn ? 'rec.how.files.builtIn' : 'rec.how.files.own', {
    patterns: t('scope.patterns', { n: policy.patterns }), exceptions: t('scope.exceptions', { n: policy.exceptions }),
  }));
  const where = paths.shared
    ? label('scope.pathsShared') + ' ' + label('scope.root.' + paths.root + (paths.root === 'known' ? '' : 'Shared'), { n: paths.workingDirectories ?? 0 })
    : label('rec.how.root.' + paths.root, { n: paths.workingDirectories ?? 0 });
  const technical: readonly (readonly [string, string])[] = [
    ['rec.how.session', '<code>' + e(sessionId) + '</code>'], ['rec.how.level', '<code>' + e(policy.level) + '</code>'],
    ['rec.how.origin', '<code>' + e(policy.origin) + '</code>'],
    ['scope.ruleset', 'v' + redaction.rulesetVersion], ['scope.redactions', String(redaction.redactions)],
    ['scope.distinct', String(redaction.distinctValues)], ['scope.protected', String(redaction.protectedContents)],
    ['scope.missingClasses', redaction.missingClasses.length === 0 ? '' : redaction.missingClasses.map((one) => e(one)).join(', ')],
  ];
  return section(label('rec.how.h'), '<dl class="rc-facts">' +
    fact('rec.how.rule', label('rec.how.rule.' + level)) +
    fact('rec.how.files', counts, label('rec.how.files.note')) +
    fact('rec.how.paths', label(paths.shared ? 'rec.how.paths.shared' : 'rec.how.paths.full'), where) + '</dl>' +
    '<details class="rc-fold"><summary>' + label('scope.technical') + '</summary><dl class="rc-dl">' +
    technical.map(([key, value]) => '<dt>' + label(key) + '</dt><dd>' + (value === '' ? label('scope.none') : value) + '</dd>').join('') + '</dl></details>');
}

/**
 * What the AI's runtime recorded at the time (`2026-09-27-what-codex-wrote.md` X19-X23), beside how this report was read
 * and never in its place: the permissions in force by turn, and what its reviewer decided - on a turn, never on an
 * action. What the record can show is said once, in the tab's first card. Nothing a reviewer wrote is quoted. A record
 * that holds none of it has no section.
 */
function recordedSection(report: ReportModel, names: (index: number | undefined, t: Translate) => string): string {
  const { recorded } = report;
  if (recorded.permissions.length === 0 && recorded.reviews.length === 0) return '';
  const ai = e(PROVIDER_NAMES[report.scope.provider]);

  const permissions = recorded.permissions.map((group) => '<li>' + inLanguages((t) => [
    t('rec.perm.turns', { n: group.turns }),
    t('rec.perm.approval', { value: group.approval === undefined ? t('rec.value.none') : '<code>' + e(group.approval) + '</code>' }),
    t('rec.perm.approver', { value: t('rec.who.' + group.approver, { ai }) }),
    t('rec.perm.sandbox', { value: group.sandbox === undefined ? t('rec.value.none') : '<code>' + e(group.sandbox) + '</code>' }),
    t('rec.perm.network', { value: t('rec.net.' + group.network) }),
    t('rec.perm.scopes', { read: group.readScopes, write: group.writeScopes }),
  ].join(' · ')) +
    (group.writablePaths.length === 0 ? '' : '<br><span class="rc-dim">' + label('rec.perm.writable') + '</span> ' +
      group.writablePaths.map((path) => '<code>' + e(path) + '</code>').join(', ')) +
    (group.complete ? '' : '<br><span class="rc-dim">' + label('rec.perm.incomplete') + '</span>') + '</li>').join('');

  const verdicts = recorded.reviews.flatMap((review) => review.verdicts.map((verdict) => '<li>' + inLanguages((t) =>
    (verdict.outcome === 'unrecognised' ? t('rec.review.unrecognised')
      : verdict.turnKnown ? t('rec.review.allowed', { who: names(review.reviewedAgentIndex, t) }) : t('rec.review.allowedNoTurn')) +
    (verdict.risk === undefined ? '' : ' · ' + t('rec.review.risk', { risk: e(verdict.risk) })) +
    (verdict.rationaleSize === undefined ? '' : ' · ' + t('rec.review.why', { n: verdict.rationaleSize }))) +
    ' · <code>' + e(verdict.evidence) + '</code></li>')).join('');

  return section(label('rec.recorded', { ai }),
    '<p class="rc-p rc-dim">' + label('rec.recorded.note', { ai }) + '</p>' +
    (permissions === '' ? '' : '<ul class="rc-list">' + permissions + '</ul>') +
    (verdicts === '' ? '' : '<h4 class="rc-h4">' + label('rec.reviews', { ai }) + '</h4><ul class="rc-list">' + verdicts + '</ul>'));
}

/** P62: every AI's run, step by step, with every action it took folded under it. */
export function agentRuns(report: ReportModel): string {
  const names = namesOf(report);
  const runs = report.flows.map((flow) => run(flow, report, names)).join('');
  return '<section class="rc-runs"><div class="rc-runs-head"><h3 class="rc-h">' + label('steps.how') + '</h3>' +
    (runs === '' ? '' : '<p class="rc-p rc-dim rc-narrow">' + label('rec.runs.lead') + '</p><ul class="rc-key">' +
      (['coral', 'blue', 'amber', 'mint'] as const).map((tone) => '<li><span class="rc-key-dot rc-tone-' + tone + '" aria-hidden="true"></span>' +
        label('rec.runs.key.' + tone) + '</li>').join('') + '</ul>') + '</div>' +
    (runs === '' ? '<p class="rc-p">' + label('rec.runs.none') + '</p>' : runs) + '</section>';
}

function run(flow: AgentFlow, report: ReportModel, names: (index: number | undefined, t: Translate) => string): string {
  const named = new Set<string>();
  const agent = [report.graph.main, ...report.graph.agents].find((each) => each.index === flow.agentIndex);
  const actions = agent === undefined ? [] : actionsFor(agent, report);
  // P63, what-came-back R14: what came back from this AI, in the earlier report's sentences - never delivered is not
  // "could not be read" (where-the-value-went R5), and what it wrote in its own messages is said beside it (R4b).
  const cameBack = report.returns.filter((statement) => statement.agentIndex === flow.agentIndex).map((statement) =>
    '<p class="rc-p rc-came-' + statement.strength + '">' + inLanguages((t) => t(statement.awaited === true ? 'return.awaited' : statement.inferred === true ? 'return.crossed' : 'return.' + statement.strength, {
      files: returnFiles(t, statement.paths, statement.fileUncertain === true && statement.strength === 'value'),
      n: statement.filesReached,
      length: statement.reportLength ?? '?',
    }) + (statement.strength === 'value' || statement.writtenFrom.length === 0 ? '' : ' ' + t('return.written', {
      files: returnFiles(t, statement.writtenFrom, statement.fileUncertain === true),
    }))) + '</p>').join('');
  const steps = flow.steps.map((step) => {
    const html = stepHtml(step, named, names, flow.agentIndex, report);
    if ('files' in step) named.add(JSON.stringify(step.files));
    return html;
  });
  // The avatar says what the steps say: coral where one of them put a private file's text in front of this AI.
  const read = steps.some((html) => html.includes('rc-tone-coral'));
  return '<article class="rc-run" id="run-' + flow.agentIndex + '"><h4 class="rc-run-h">' +
    avatar(agent?.ordinal === undefined ? 'AI' : 'H' + agent.ordinal, read ? 'coral' : 'grey', 30) +
    '<span>' + inLanguages((t) => names(flow.agentIndex, t)) + '</span>' + tag(label('steps.count', { n: flow.steps.length }), 'grey', 'badge') + '</h4>' +
    (cameBack === '' ? '' : '<div class="rc-came"><div class="rc-step-title">' + label('rec.cameBack') + '</div>' + cameBack + '</div>') +
    '<ol class="rc-steps">' + steps.join('') + '</ol>' +
    (actions.length === 0 ? '' : '<details class="rc-which rc-every"><summary>' + label('rec.actions', { n: actions.length }) + '</summary><div class="rc-actions">' +
      actions.map((action) => '<div class="rc-action"><span class="rc-mono">' + action.sequence + '</span><span class="rc-mono">' + e(action.tool) + '</span>' +
        '<span class="rc-mono">' + (action.target === undefined ? '—' : e(action.target)) + '</span>' +
        tag(label('st.res.' + action.outcome), action.outcome === 'succeeded' ? 'mint' : action.outcome === 'blocked' ? 'grey' : 'coral') +
        '<span class="rc-mono rc-dim">' + e(action.evidence) + '</span></div>').join('') + '</div></details>') +
    '</article>';
}

/** Files as chips; "or" between them where the transcript does not say which one a value came from (what-came-back R8). */
const chips = (t: Translate, paths: readonly string[], uncertain = false): string =>
  paths.map((path) => '<code class="rc-chip">' + e(path) + '</code>').join(uncertain && paths.length > 1 ? t('files.or') : ', ');

const programList = (programs: readonly string[] | undefined): string =>
  (programs ?? []).length === 0 ? '' : ' (' + (programs ?? []).map((program) => '<b>' + e(program) + '</b>').join(', ') + ')';

/** P62, P63: one step in the earlier report's sentences - its number, its kind, what it did, and where it leads. */
function stepHtml(step: FlowStep, named: ReadonlySet<string>, names: (index: number | undefined, t: Translate) => string, agentIndex: number, report: ReportModel): string {
  const link = (index: number | undefined): string => index === undefined ? '' :
    '<a class="rc-link" href="#run-' + index + '">' + inLanguages((t) => t('flow.openOther', { name: names(index, t) })) + '</a>';
  const uncertain = (index: number | undefined): boolean => report.returns.some((item) => item.agentIndex === index && item.fileUncertain === true);
  let title: string;
  let body: (t: Translate) => string;
  let after = '';
  // The number's colour is the step's meaning, in the palette's words: coral - a private file's text was in front of the
  // AI; blue - only its name; amber - not known; mint - stopped; grey - work passed between AIs.
  let tone: 'coral' | 'blue' | 'amber' | 'mint' | 'grey' = 'grey';
  switch (step.kind) {
    case 'asked':
      title = 'flow.kind.asked';
      body = (t) => step.askedTo === undefined ? t('flow.askedBare', { by: names(step.byAgentIndex, t) })
        : t('flow.asked', { by: names(step.byAgentIndex, t), asked: t('quote.open') + e(step.askedTo) + t('quote.close') });
      after = link(step.byAgentIndex);
      break;
    case 'reached': {
      // A traced value may be from any file the call reached; lines a search printed say whose they are.
      const read = filesRead(step).length > 0;
      // X10: a process's own output is not what the agent was handed, so its lacking the contents says nothing of that.
      const key = step.outcome === 'blocked' ? 'blocked' : step.outcome === 'unknown' ? 'unknown' : read ? 'value'
        : step.sources.includes('result') ? 'result' : step.processOutput === true ? 'printed' : 'input';
      tone = key === 'blocked' ? 'mint' : key === 'unknown' || key === 'printed' ? 'amber' : key === 'value' ? 'coral' : 'blue';
      title = step.outcome !== 'succeeded' ? 'flow.kind.reached.' + step.outcome
        : read ? 'flow.kind.reached.value' : step.sources.includes('result') ? 'flow.kind.reached.path' : 'flow.kind.reached.named';
      body = (t) => t('flow.reached.' + key, { did: '<b>' + e(step.did) + '</b>', files: chips(t, read ? filesRead(step) : step.files, step.carriedValue) });
      after = '<details class="rc-which rc-wrote"><summary>' + label('wrote.open') + '</summary><div class="rc-open">' + wroteBefore(step.wrote) + '</div></details>';
      break;
    }
    case 'received':
      title = 'flow.kind.received';
      tone = 'coral';
      body = (t) => t('flow.received', { files: chips(t, step.files, true) });
      break;
    case 'carried':
      title = 'flow.kind.carried';
      tone = 'coral';
      body = (t) => t(step.named.length === 0 ? 'flow.carriedBare' : 'flow.carried', { did: '<b>' + e(step.did) + '</b>', named: chips(t, step.named) });
      break;
    case 'used': {
      const same = named.has(JSON.stringify(step.files));
      const key = (step.landed === 'file' ? (step.intoProtected === true ? 'use.fileProtected' : 'use.file')
        : step.landed === 'command' ? (step.commits === true ? 'use.commit' : 'use.command') : 'use.' + step.landed) + (same ? '.same' : '');
      title = 'flow.kind.used.' + step.landed;
      tone = 'coral';
      body = (t) => t(key, { files: chips(t, step.files, step.fileUncertain === true), targets: chips(t, step.targets ?? []), programs: programList(step.programs) }) +
        (step.after !== undefined ? ' ' + t('flow.after', { n: step.after }) : step.source === 'none' ? ' ' + t('use.source.none') : '');
      break;
    }
    case 'delegated':
      title = 'flow.kind.delegated';
      tone = step.strength === 'value' ? 'coral' : 'grey';
      body = (t) => t('flow.delegated.' + (step.awaited === true ? 'awaited' : step.inferred === true ? 'crossed' : step.strength), {
        agent: names(step.toAgentIndex, t), files: returnFiles(t, step.files, uncertain(step.toAgentIndex) && step.strength === 'value'),
      });
      after = link(step.toAgentIndex);
      break;
    case 'returned':
      title = 'flow.kind.returned';
      tone = step.strength === 'value' ? 'coral' : 'grey';
      body = (t) => t('flow.returned.' + (step.awaited === true ? 'awaited' : step.inferred === true ? 'crossed' : step.strength), {
        agent: names(step.toAgentIndex, t), files: returnFiles(t, step.files, uncertain(agentIndex) && step.strength === 'value'),
      });
      after = link(step.toAgentIndex);
      break;
  }
  const times = step.count > 1 ? '<b class="rc-times">' + step.count + ' ×</b> ' : '';
  // The links to another AI's run stay beside the step's words; what it wrote before and where it is in the record are
  // one row of pills, and an open one takes the row's width.
  const links = after.startsWith('<a') ? after : '';
  const wrote = links === '' ? after : '';
  return '<li class="rc-step rc-' + step.kind + (step.broken === true ? ' rc-broken' : '') + '"><span class="rc-n rc-tone-' + tone + '">' + step.number + '</span>' +
    '<div class="rc-step-body"><div class="rc-step-title">' + label(title) + '</div><p class="rc-p rc-step-text">' + inLanguages((t) => times + body(t)) + '</p>' + links +
    '<div class="rc-tools">' + wrote + '<details class="rc-which"><summary>' + label('flow.records', { n: step.evidence.length }) + '</summary><div class="rc-open"><code class="rc-refs">' +
    step.evidence.map((ref) => e(ref)).join(' → ') + '</code></div></details></div></div></li>';
}

function returnFiles(t: Translate, paths: readonly string[], uncertain: boolean): string {
  const files = paths.map((path) => '<code>' + e(path) + '</code>');
  return files.join(uncertain && files.length > 1 ? t('files.or') : ', ');
}

/** P62, why-this-call R6-R8: the agent's one sentence, quoted as its own, or the fact in its place. */
function wroteBefore(wrote: WroteBefore): string {
  const covers = wrote.covers > 1 ? '<p class="rc-p rc-dim">' + label('wrote.covers', { n: wrote.covers }) + '</p>' : '';
  if (wrote.sentence !== undefined) {
    const sentence = wrote.sentence;
    return '<div class="rc-quote-head">' + label(wrote.kind === 'said' ? 'wrote.head.said' : 'wrote.head.reasoning') + '</div>' +
      '<blockquote class="rc-quote">' + inLanguages((t) => t('quote.open') + e(sentence) + t('quote.close')) + '</blockquote>' +
      (wrote.cut === true ? '<p class="rc-p rc-dim">' + label('wrote.cut', { n: SENTENCE_CAP }) + '</p>' : '') + covers;
  }
  const files = wrote.carried.map((path) => '<code>' + e(path) + '</code>').join(', ');
  const said = wrote.carried.length > 0 ? label('wrote.carried', { files })
    : wrote.size === 0 ? (wrote.blank > 0 ? label('wrote.blank', { n: wrote.blank }) : label('wrote.none')) : label('wrote.size', { n: wrote.size });
  return '<p class="rc-p">' + said + '</p>' + covers;
}

export const RECORD_VIEW_STYLE = String.raw`
.rc{display:flex;flex-direction:column;gap:28px}
.rc-sect,.rc-runs{border-radius:16px;background:var(--card);border:1px solid var(--white-09);padding:22px 24px}
.rc-runs{margin-top:28px;display:flex;flex-direction:column;gap:22px}
.rc-runs-head .rc-h{margin-bottom:6px}
.rc-key{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:8px 18px;font-size:13px;color:var(--text-2)}
.rc-key li{display:flex;align-items:center;gap:7px}
.rc-key-dot{width:10px;height:10px;border-radius:50%}
.rc-key-dot.rc-tone-coral{background:var(--coral)}.rc-key-dot.rc-tone-blue{background:var(--blue)}.rc-key-dot.rc-tone-amber{background:var(--amber)}.rc-key-dot.rc-tone-mint{background:var(--mint)}
.rc-h{margin:0 0 12px;font-size:17px;font-weight:650}
.rc-answer>.tag{margin-bottom:12px}
.rc-title{margin:0 0 8px;font-size:22px;line-height:1.3;font-weight:650;letter-spacing:-0.01em}
.rc-lead{margin:0 0 6px;max-width:680px;font-size:15px;line-height:1.55;color:var(--text-2)}
.rc-narrow{max-width:680px}
.rc-rows{list-style:none;margin:0 0 10px;padding:0;border:1px solid var(--white-07);border-radius:12px;background:var(--panel);overflow:hidden}
.rc-row{display:flex;align-items:flex-start;gap:14px;padding:14px 16px}
.rc-row+.rc-row{border-top:1px solid var(--white-07)}
.rc-row-mark{flex:none;width:8px;height:8px;margin-top:7px;border-radius:50%;background:var(--amber)}
.rc-row-main{flex:1;min-width:0}
.rc-row-t{font-size:15px;font-weight:600;color:var(--text)}
.rc-row-d{margin-top:2px;font-size:14px;line-height:1.5;color:var(--text-2)}
.rc-row>.tag{flex:none;margin-top:1px}
.rc-which{margin-top:8px}
.rc-which>summary{display:inline-flex;cursor:pointer;list-style:none;font-size:13px;font-weight:600;color:var(--text-soft);padding:4px 12px;border-radius:999px;border:1px solid var(--white-14)}
.rc-which>summary::-webkit-details-marker{display:none}
.rc-which>summary:hover{border-color:var(--white-32)}
.rc-which[open]>summary{margin-bottom:8px}
.rc-note{margin-top:18px}
.rc-facts{margin:0;display:flex;flex-direction:column}
.rc-fact{display:grid;grid-template-columns:minmax(160px,220px) minmax(0,1fr);gap:6px 24px;padding:12px 0;border-top:1px solid var(--white-07)}
.rc-fact:first-child{border-top:0;padding-top:0}
.rc-fact dt{font-size:13px;font-weight:600;color:var(--text-3);padding-top:2px}
.rc-fact dd{margin:0;font-size:15px;line-height:1.5;color:var(--text)}
.rc-fact-note{display:block;margin-top:4px;max-width:680px;font-size:14px;line-height:1.5;color:var(--text-3)}
@media (max-width:640px){.rc-sect,.rc-runs{padding:18px 16px}.rc-fact{grid-template-columns:1fr;gap:2px}.rc-row-cap{flex-direction:column;gap:8px}.rc-dl{grid-template-columns:1fr}}
.rc-h4{margin:18px 0 8px;font-size:14px;font-weight:650;color:var(--text-soft)}
.rc-p{margin:0 0 8px;font-size:14.5px;line-height:1.55;color:var(--text)}
.rc-p code,.rc-list code{font-family:var(--mono);font-size:13px}
.rc-dim{color:var(--text-3)}
.rc-list{margin:0 0 8px;padding-left:20px;font-size:14px;line-height:1.6}
.rc-fold>summary{cursor:pointer;font-size:13.5px;font-weight:600;color:var(--text-2);margin:6px 0}
.rc-dl{display:grid;grid-template-columns:minmax(160px,auto) 1fr;gap:6px 18px;margin:8px 0 0;font-size:14px}
.rc-dl dt{color:var(--text-3)}.rc-dl dd{margin:0;font-family:var(--mono);font-size:13px}
.rc-run{border-top:1px solid var(--white-07);padding-top:20px}
.rc-run-h{margin:0 0 16px;display:flex;align-items:center;gap:10px;font-size:16px;font-weight:650}
.rc-steps{list-style:none;margin:0 0 14px;padding:0;display:flex;flex-direction:column}
.rc-step{position:relative;display:grid;grid-template-columns:30px minmax(0,1fr);gap:14px;padding-bottom:22px}
.rc-step:last-child{padding-bottom:4px}
.rc-step:not(:last-child)::before{content:"";position:absolute;left:14px;top:34px;bottom:4px;border-left:2px solid var(--white-08)}
.rc-broken:not(:last-child)::before{border-left-style:dashed;border-left-color:var(--amber-35)}
.rc-n{width:30px;height:30px;border-radius:50%;font-size:12.5px;font-weight:700;display:flex;align-items:center;justify-content:center;border:1px solid transparent}
.rc-tone-coral{background:var(--coral-16);color:var(--coral-text);border-color:var(--coral-35)}.rc-tone-blue{background:var(--blue-16);color:var(--blue)}
.rc-tone-amber{background:var(--amber-12);color:var(--amber);border-color:var(--amber-35)}.rc-tone-mint{background:var(--mint-12);color:var(--mint)}
.rc-tone-grey{background:var(--white-06);color:var(--text-2)}
.rc-step-body{min-width:0;padding-top:4px}
.rc-step .rc-step-title{font-size:15px;font-weight:600;color:var(--text);margin-bottom:3px}
.rc-step-text{max-width:820px;color:var(--text-2)}
.rc-step-text b{color:var(--text);font-weight:600}
.rc-tools{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.rc-tools>.rc-which{margin-top:0}
.rc-tools>.rc-which[open]{flex-basis:100%}
.rc-open{padding:12px 14px;border-radius:10px;background:var(--panel);border:1px solid var(--white-07)}
.rc-open>:last-child{margin-bottom:0}
.rc-every{margin-top:4px}
.rc-step-title{font-size:13px;font-weight:600;color:var(--text-2);margin-bottom:4px}
.rc-times{color:var(--coral-text)}
.rc-chip{font-family:var(--mono);font-size:12.5px;color:var(--text);background:var(--white-07);border:1px solid var(--white-10);border-radius:6px;padding:1px 6px}
.rc-link{display:inline-block;margin:2px 0 4px;font-size:13.5px;font-weight:600;color:var(--coral-text)}
.rc-refs{display:block;font-family:var(--mono);font-size:12.5px;color:var(--text-3);overflow-wrap:anywhere}
.rc-quote-head{font-size:13px;font-weight:600;color:var(--text-3);margin:8px 0 4px}
.rc-quote{margin:0 0 8px;padding:8px 14px;border-left:2px solid var(--white-18);font-size:14.5px;line-height:1.55;color:var(--text-soft)}
.rc-came{margin:0 0 12px;padding:12px 14px;border-radius:12px;background:var(--panel);border:1px solid var(--white-07)}
.rc-actions{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.rc-action{display:grid;grid-template-columns:40px minmax(120px,0.8fr) minmax(0,1.5fr) 110px minmax(0,1fr);gap:12px;align-items:center;font-size:13px}
.rc-mono{font-family:var(--mono);font-size:12.5px;overflow-wrap:anywhere}
`;
