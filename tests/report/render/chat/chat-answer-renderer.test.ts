// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Gap, GapKind } from '../../../../src/core/completeness.ts';
import type { Delegation } from '../../../../src/core/delegation.ts';
import type { ToolEvent } from '../../../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../../../src/core/policy/default-policy.ts';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../../../src/core/session-model.ts';
import { buildReport } from '../../../../src/report/build-report.ts';
import { silentTrait } from '../../../../src/report/gap-reasons.ts';
import { code, lookOfReport } from '../../../../src/report/render/chat/chat-answer.ts';
import { STRIP_MARK } from '../../../../src/report/render/chat/chat-strip.ts';
import { ChatAnswerRenderer } from '../../../../src/report/render/chat/chat-answer-renderer.ts';
import type { ChatChoice } from '../../../../src/report/render/chat/chat-choice.ts';
import { markdownOf } from '../../../../src/report/render/chat/chat-views.ts';
import { fileRows } from '../../../../src/report/render/report-page/files.ts';
import { toDoItems } from '../../../../src/report/render/report-page/to-do.ts';
import type { ReportModel } from '../../../../src/report/report-model.ts';
import { LOOK_OF_STATUS, statusOfRecord } from '../../../../src/report/start/render/session-status.ts';

// `2026-11-20-ask-your-ai-why.md` AY1-AY5, AY10: what `agentwhy why` says, from fictional sessions. Keys are assembled at
// run time, so no string here has the shape of a real one.
const fake = (...parts: string[]): string => parts.join('');
const STRIPE = fake('sk_', 'live_', 'Test0000000000000000000');

let sequence = 0;
function read(path: string, content: string, agentId = 'main', extra: Partial<ToolEvent> = {}): ToolEvent {
  sequence += 1;
  const evidence = { source: agentId === 'main' ? { kind: 'main' as const } : { kind: 'agent' as const, agentId }, record: sequence };
  return {
    id: 'call-' + sequence, agentId, sequence, toolName: 'Read', input: {}, targets: [path], commands: [], resultShape: 'content',
    toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete', result: { stage: 'model', completeness: 'complete', content, evidence }, ...extra,
  };
}

function session(events: ToolEvent[], gaps: Gap[] = [], delegations: Delegation[] = []): SessionModel {
  const helpers = [...new Set(events.map((event) => event.agentId).filter((id) => id !== 'main'))];
  return {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }, ...helpers.map((id) => ({ id, depth: 1 }))],
    delegations, events, completeness: gaps.length === 0 ? 'complete' : 'partial', messages: [], gaps,
  };
}

const report = (model: SessionModel): ReportModel => buildReport(model, DEFAULT_POLICY, new Redactor('test'));
const say = (model: ReportModel, choice: Partial<ChatChoice> = {}): string => new ChatAnswerRenderer({ lang: 'en', ...choice }).render(model);

const STOPPED = report(session([read('.env', 'Permission denied', 'main', { outcome: 'blocked' })]));
const READ = report(session([read('.env', 'STRIPE_KEY=' + STRIPE)]));
const NOTHING = report(session([read('src/app.ts', 'export const app = 1;')]));
const UNCHECKED = report(session([read('src/app.ts', 'export const app = 1;')], [{ kind: 'result-missing' }]));

test('a stopped conversation leads with the rules holding, in the row\'s own word', () => {
  const answer = say(STOPPED);
  assert.match(answer, /^\*\*agentwhy\*\* · this conversation: \*\*Stopped\*\*\nYour rules held: 1 try was stopped\.\n/);
  assert.match(answer, /^- `\.env` - stopped$/m);
});

test('a read says the file was read and what to do, and never that the rules held', () => {
  const answer = say(READ);
  assert.match(answer, /\*\*Read private files\*\*/);
  assert.match(answer, /^- `\.env` - read$/m);
  assert.match(answer, /^- Change the keys in `\.env`$/m);
  assert.doesNotMatch(answer, /rules held/);
  assert.ok(!answer.includes(STRIPE), 'no value, ever (AY4)');
});

test('nothing private is said only of a whole record, and the words for more close every answer', () => {
  const answer = say(NOTHING);
  assert.match(answer, /\*\*Nothing private\*\*/);
  assert.match(answer, /^No private file came up in this conversation\.$/m);
  assert.match(answer, /\nMore: `steps` · `folders` · `table` · `diagram` · `card`\n$/);
});

// TK2, the kind and not the case: whatever gap a record holds - but its format's silence - the answer never says it is
// clean, and it says why it is not.
test('a record with any gap of its own is never said to hold nothing private', () => {
  // Every kind but `session-missing` - nothing read at all, a run that ends unreadable - and the format's own two, said apart.
  const kinds: GapKind[] = ['source-missing', 'record-damaged', 'result-missing', 'spilled-result-missing', 'outcome-unrecognised', 'relation-unresolved', 'result-incomplete'];
  for (const kind of kinds) {
    const answer = say(report(session([read('src/app.ts', 'export const app = 1;')], [{ kind }])));
    assert.doesNotMatch(answer, /Nothing private|No private file came up/, kind);
    assert.match(answer, /Couldn’t check fully/, kind);
    // SG12's strip, drawn from two steps on: no mark of it, and no view, says a record with a gap holds nothing private.
    for (const view of [undefined, 'steps'] as const) {
      const many = say(report(session([read('src/app.ts', 'x'), read('src/b.ts', 'y')], [{ kind }])), view === undefined ? {} : { view });
      assert.doesNotMatch(many, /nothing private|No private file came up/i, `${kind} ${view ?? 'default'}`);
    }
  }
});

test('a record whose only gaps are its format\'s gives the reason under "Nothing private", as the row does', () => {
  const answer = say(report(session([read('src/app.ts', 'export const app = 1;')], [{ kind: 'capability-absent', question: 'actions' }])));
  assert.match(answer, /\*\*Nothing private\*\*/);
  assert.match(answer, /^Claude Code doesn’t write down every step$/m);
});

// TK4, one question, one answer: the chat reads a record's wholeness from the report's gaps, `SessionReport` from the
// model's - and the two must agree, or the row and the chat could say two things of one conversation.
test('the chat\'s look is the row\'s look, wholeness read the way the session report reads it', () => {
  const gapSets: Gap[][] = [[], [{ kind: 'result-missing' }], [{ kind: 'capability-absent', question: 'reasoning' }], [{ kind: 'capability-absent', question: 'actions' }]];
  for (const gaps of gapSets) {
    for (const events of [[read('src/app.ts', 'x')], [read('.env', 'Permission denied', 'main', { outcome: 'blocked' })], [read('.env', 'K=' + STRIPE)]]) {
      const model = session(events, gaps);
      const built = report(model);
      const whole = model.completeness === 'complete' || model.gaps.every(silentTrait);
      const row = LOOK_OF_STATUS[statusOfRecord({ tally: built.tally, incomplete: !whole, ...(whole || built.gapReasons === undefined ? {} : { gaps: built.gapReasons }) })];
      assert.equal(lookOfReport(built), row, JSON.stringify(gaps));
    }
  }
});

test('a helper is named by its number with the task it was given, quoted on one line', () => {
  sequence += 1;
  const evidence = { source: { kind: 'main' as const }, record: sequence };
  const spawn: ToolEvent = {
    id: 'task-helper-a', agentId: 'main', sequence, toolName: 'Task', input: {}, targets: [], commands: [], resultShape: 'none',
    toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete', result: { stage: 'model', completeness: 'complete', content: 'done', evidence },
  };
  const delegation: Delegation = {
    followUps: [], id: spawn.id, parentAgentId: 'main', childAgentId: 'helper-a', description: 'Find\nthe database settings', prompt: 'p',
    reports: [], evidence, completeness: 'complete',
  };
  const answer = say(report(session([spawn, read('.env', 'Permission denied', 'helper-a', { outcome: 'blocked' })], [], [delegation])));
  assert.match(answer, /^- Helper 1, asked to “Find the database settings”: `\.env` stopped$/m);
});

// `specs/2026-11-23-the-story-at-a-glance.md` SG12: the shape of the conversation as the page's map draws it, in characters.
const PRIVATE = ['.env', '.env.local', '.env.test', '.env.development', '.env.production', 'apps/web/.env', 'packages/x/.env'];
const demoShape = (): ToolEvent[] => [
  ...PRIVATE.map((path) => read(path, 'K=' + STRIPE)),
  ...['README.md', 'AGENTS.md', 'package.json', 'src/app.ts'].map((path) => read(path, 'ok')),
];

test('the answer opens with one mark per step of your AI, in the page\'s looks, and their counts', () => {
  for (const view of [undefined, 'steps'] as const) {
    const answer = say(report(session(demoShape())), view === undefined ? {} : { view });
    const lines = answer.split('\n');
    const at = lines.indexOf('`■■■■■■■····`');
    assert.ok(at >= 0, view ?? 'default');
    assert.match(lines[at + 1] as string, /^Your AI’s 11 steps, in order: ■ 7 Read a private file, · 4 named no private file$/);
  }
  assert.doesNotMatch(say(READ), /■/, 'one step has no shape to show');
  assert.match(say(report(session(demoShape())), { lang: 'pl' }), /`■■■■■■■····`/);
});

test('each look has its own character, and the strip draws a stop, a read and nothing private in theirs', () => {
  assert.deepEqual(STRIP_MARK, { coral: '■', sand: '□', amber: '?', blue: '○', mint: '×', grey: '·' });
  const events = [
    read('.env', 'Permission denied', 'main', { outcome: 'blocked' }), read('src/a.ts', 'x'),
    read('.env', 'K=' + STRIPE), read('src/b.ts', 'x'),
  ];
  assert.match(say(report(session(events)), { view: 'steps' }), /^`×·■·`$/m);
});

test('past 40 steps a mark stands for several, and a private read is never lost in it', () => {
  const events = Array.from({ length: 81 }, (_unused, at) => at === 50 ? read('.env', 'K=' + STRIPE) : read(`src/file-${at}.ts`, 'x'));
  const answer = say(report(session(events)), { view: 'steps' });
  const strip = /^`([■□?○×·]+)`$/m.exec(answer)?.[1] ?? '';
  assert.equal(strip.length, 27, '81 steps, three to a mark');
  assert.equal(strip.match(/■/g)?.length, 1);
  assert.match(answer, /\(each mark is 3 steps\)/);
});

test('steps fold as the page folds them, numbered in their text, with the first private read marked', () => {
  const first = say(report(session(demoShape())), { view: 'steps' });
  assert.match(first, /^- \*\*1–7\.\*\* ■ Read 7 private files, one after another: `\.env`, `\.env\.local`, `\.env\.test` \+4 more$/m, 'the story\'s first row needs no mark');
  assert.match(first, /^- \*\*8–11\.\*\* · 4 other steps: `Read` ×4$/m);
  assert.doesNotMatch(first, /^\d+\. /m, 'never a list Markdown renumbers');
  const later = say(report(session([read('README.md', 'ok'), ...demoShape()])), { view: 'steps' });
  assert.match(later, /^- \*\*2–8\.\*\* ■ Read 7 private files, one after another: .* _← Here it first read a private file_$/m);
  assert.equal(later.match(/_← Here it first read a private file_/g)?.length, 1);
});

// SG12a (the maintainer's screenshots, 2026-11-24): the desktop app drew a Mermaid block as its code, and the tree repeated
// the whole path of every file. One tree for every surface: a folder once, its files by what happened to them.
const COURSE = '/lekcje/etap_03';
const course = (): ToolEvent[] => [
  read('note.md', 'Permission denied', 'main', { outcome: 'blocked' }),
  ...['exercise.py', 'teoria.md'].map((name) => read('lekcje/etap_03/01_funkcje/' + name, 'Permission denied', 'main', { outcome: 'blocked' })),
];
const COURSE_POLICY = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/note.md' }, { pattern: 'lekcje/**' }] };
const ofCourse = (events: ToolEvent[]): ReportModel => buildReport(session(events), COURSE_POLICY, new Redactor('test'));

test('the tree names a folder once and groups its files by what happened to them, with a legend', () => {
  const tree = say(ofCourse(course()), { view: 'diagram' });
  assert.match(tree, /^```\nYou\n└── Your AI\n    ├── × note\.md\n    └── lekcje\/etap_03\/01_funkcje\/\n        └── × exercise\.py, teoria\.md\n```$/m);
  assert.match(tree, /\n× stopped\n$/);
  assert.doesNotMatch(tree, /mermaid|flowchart/);
});

test('the table groups the files of a folder that ended alike, worst first, and counts the private ones', () => {
  const table = say(ofCourse([...course(), read('src/app.ts', 'x')]), { view: 'table' });
  assert.match(table, /^\*\*Private files \(3\)\*\*$/m);
  assert.match(table, /^\| × stopped \| `note\.md` \| The main folder \|$/m);
  assert.match(table, /^\| × stopped \| `exercise\.py`, `teoria\.md` \| lekcje\/etap_03\/01_funkcje \|$/m);
  assert.doesNotMatch(table, /· private/, 'the heading says it, not every row');
  assert.match(table, /^\*\*Other files \(1\)\*\*$/m);
});

// The same shots: seventeen lines, six of them one tool's. What a person looks for - what was stopped or private - stands,
// and the rest between is one line that says what it was and what is not known, never that it was clean (TK2).
test('steps folds the ordinary steps between the private ones into one line that says what they were', () => {
  const plan = (tool: string): ToolEvent => read('x', 'ok', 'main', {
    toolName: 'mcp__ccd_turn__' + tool, targets: [], toolKnown: false, mcp: { server: 'ccd_turn', tool }, resultShape: 'none',
  });
  const bash = (program: string, extra: Partial<ToolEvent> = {}): ToolEvent => read('x', 'ok', 'main', { toolName: 'Bash', targets: [], commands: [program + ' --version'], resultShape: 'none', ...extra });
  const steps = say(ofCourse([
    ...course().slice(0, 1), plan('update_plan'), bash('node'), plan('update_plan'), bash('node', { outcome: 'unknown' }), plan('wrap_up'),
    ...course().slice(1, 2),
  ]), { view: 'steps' });
  assert.match(steps, /^- \*\*1\.\*\* × .*`note\.md`.*$/m);
  assert.match(steps, /^- \*\*2–6\.\*\* · 5 other steps: `update_plan` ×2, `node` ×2, `wrap_up`$/m);
  // Said once for an AI, under its steps: a long conversation said it on every line (the maintainer's run, 2026-11-24).
  assert.match(steps, /\n\n_In 3 of the other steps we can.t see which files were opened · the record doesn.t say how 1 of the other steps ended_\n$/);
  assert.equal(steps.match(/can.t see which files/g)?.length, 1);
  assert.match(steps, /^- \*\*7\.\*\* × .*`exercise\.py`.*$/m);
  assert.doesNotMatch(steps, /nothing private/i);
});

test('a step that gave work says to whom, and one that changed what protects the files says what it changed', () => {
  const { spawn, delegation } = helperSpawn('main', 'helper-a', 'Look at the tests');
  const given = say(report(session([spawn, read('src/a.ts', 'x', 'helper-a'), read('src/b.ts', 'x', 'helper-a')], [], [delegation])), { view: 'steps' });
  assert.match(given, /^- \*\*1\.\*\* · Gave work to Helper 1\.$/m);
  const model = ofCourse([read('src/a.ts', 'x'), read('AGENTS.md', 'x'), read('src/c.ts', 'x')]);
  const guarded: ReportModel = { ...model, guardChanges: [{ path: new Redactor('test').path('AGENTS.md'), file: 'instructions', agentIndex: model.graph.main.index, step: model.runs?.[0]?.runs[0]?.steps[1]?.sequence ?? 0, outcome: 'changed', said: 'other', via: 'tool' }] };
  const steps = say(guarded, { view: 'steps' });
  assert.match(steps, /^- \*\*2\.\*\* · .*`AGENTS\.md`.* _← Changed the instructions every later conversation starts with_$/m);
});

test('the card counts in words that agree with the number, each look in its mark', () => {
  assert.match(say(ofCourse(course()), { view: 'card', lang: 'pl' }), /^Prywatne pliki: × 3 zatrzymane$/m);
  assert.match(say(READ, { view: 'card', lang: 'pl' }), /^Prywatne pliki: ■ 1 przeczytany$/m);
  assert.match(say(ofCourse(course()), { view: 'card' }), /^Private files: × 3 stopped$/m);
});

test('each view draws, and the card names no path', () => {
  assert.match(say(READ, { view: 'table' }), /^\*\*Private files \(1\)\*\*\n\n\| What happened \| File \| Folder \|\n\|---\|---\|---\|\n\| ■ read \| `\.env` \| The main folder \|$/m);
  assert.match(say(READ, { view: 'folders' }), /^\*\*The main folder\*\*\n- `\.env` - read · private$/m);
  assert.match(say(STOPPED, { view: 'diagram' }), /^```\nYou\n└── Your AI\n    └── × \.env\n```\n\n× stopped\n$/m);
  const steps = say(READ, { view: 'steps' });
  assert.match(steps, /^\*\*Your AI\*\*\n- \*\*1\.\*\* ■ Read `\.env`\.$/m);
  assert.doesNotMatch(steps, /<[a-z/]/, 'Markdown, never HTML');
  const card = say(READ, { view: 'card' });
  assert.ok(!card.includes('.env'), 'a card names no path (AY10)');
  assert.match(card, /\n_checked by agentwhy, on this computer_\n$/);
});

test('the answer is said in the person\'s language, the look in the row\'s words', () => {
  assert.match(say(STOPPED, { lang: 'pl' }), /^\*\*agentwhy\*\* · ta rozmowa: \*\*/);
  assert.match(say(STOPPED, { lang: 'de' }), /^\*\*agentwhy\*\* · dieses Gespräch: \*\*/);
});

test('a value from the record cannot close its code span or start a line', () => {
  assert.equal(code('a`b'), '`` a`b ``');
  assert.equal(code('one\n# two'), '`one # two`');
  assert.equal(markdownOf('Read <code>a&amp;b.txt</code> &lt;now&gt;'), 'Read `a&b.txt` <now>');
});

// F57a, measured 2026-11-21 (13 of 183 real conversations): a read of only tracked files is the row's own look, not a read to fix.
test('a read of only files the person tracks is said as the row says it, "Read — tracked"', () => {
  const tracked = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/people.csv', mode: 'tell' as const }] };
  const model = buildReport(session([read('data/people.csv', 'name,email\nAda,ada@example.com')]), tracked, new Redactor('test'));
  assert.equal(lookOfReport(model), 'allowed');
  assert.match(say(model), /\*\*Read — tracked\*\*/);
});

// WS4, who-stopped-it (the review of 2026-11-21): "your rules held" counts what a rule stopped, never the person's no at a
// prompt or auto mode's - and the look "Stopped" claims nothing about what else was opened.
/** A call refused, by whom the record says (WS2): the result carries it. */
function stopped(path: string, by: 'rule' | 'reviewer' | 'person'): ToolEvent {
  const event = read(path, 'Permission denied', 'main', { outcome: 'blocked' });
  return { ...event, ...(event.result === undefined ? {} : { result: { ...event.result, refusedBy: by } }) };
}

test('the rules are said to have held for what a rule stopped alone, and nothing is claimed of what was opened', () => {
  const person = say(report(session([stopped('.env', 'person')])));
  assert.doesNotMatch(person, /rules held/);
  assert.match(person, /^1 try was stopped\.$/m);
  const both = say(report(session([
    stopped('.env', 'rule'),
    stopped('.env.local', 'reviewer'),
  ])));
  assert.match(both, /^Your rules held: 1 try was stopped\.\n1 more try was stopped, though not by your rules\.$/m);
  for (const answer of [say(STOPPED), person, both, say(STOPPED, { view: 'card' })]) assert.doesNotMatch(answer, /no private file was opened/);
});

function helperSpawn(parent: string, child: string, description: string) {
  sequence += 1;
  const evidence = { source: parent === 'main' ? { kind: 'main' as const } : { kind: 'agent' as const, agentId: parent }, record: sequence };
  const spawn: ToolEvent = {
    id: 'task-' + child, agentId: parent, sequence, toolName: 'Task', input: {}, targets: [], commands: [], resultShape: 'none',
    toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete', result: { stage: 'model', completeness: 'complete', content: 'done', evidence },
  };
  const delegation: Delegation = {
    followUps: [], id: spawn.id, parentAgentId: parent, childAgentId: child, description, prompt: 'p', reports: [], evidence, completeness: 'complete',
  };
  return { spawn, delegation };
}

// The review of 2026-11-21: words from the record are the record's, never markup that rewrites the answer around them.
test('a task\'s backticks and stars are said as themselves, and a file\'s code span stays whole', () => {
  const { spawn, delegation } = helperSpawn('main', 'helper-a', 'Find why `npm test *fails*');
  const answer = say(report(session([spawn, read('.env', 'Permission denied', 'helper-a', { outcome: 'blocked' })], [], [delegation])));
  assert.match(answer, /^- Helper 1, asked to “Find why \\`npm test \\\*fails\\\*”: `\.env` stopped$/m);
  assert.equal(code('a``b'), '``` a``b ```');
});

// `broughtBy` is the parent's ordinal: a helper a helper brought in hangs under that helper, however the indexes run.
test('a helper brought in by a helper is drawn under it', () => {
  const first = helperSpawn('main', 'helper-a', 'Plan the release');
  const second = helperSpawn('helper-a', 'helper-b', 'Check the settings');
  const built = session([first.spawn, second.spawn, read('.env', 'Permission denied', 'helper-b', { outcome: 'blocked' })], [], [first.delegation, second.delegation]);
  // The main AI last among the agents, so a helper's index and its ordinal differ - the case that tells the two apart.
  const mainLast = { ...built, agents: [...built.agents.slice(1), ...built.agents.slice(0, 1)] };
  for (const model of [report(built), report(mainLast)]) {
    assert.match(say(model, { view: 'diagram' }), /^└── Your AI\n    └── Helper 1\n        └── Helper 2\n            └── × \.env$/m);
  }
});

// The review of 2026-11-21: a private step late in a long conversation is never hidden behind the first thirty ordinary ones.
test('past the lines that fit, the private and stopped ones are shown under their own numbers, the rest counted', () => {
  const few = say(report(session([...Array.from({ length: 35 }, (_unused, at) => read(`src/file-${at}.ts`, 'x')), read('.env', 'Permission denied', 'main', { outcome: 'blocked' })])), { view: 'steps' });
  assert.match(few, /^- \*\*1–35\.\*\* · 35 other steps: `Read` ×35$/m, 'ordinary steps between are one line');
  assert.match(few, /^- \*\*36\.\*\* × .*`\.env`/m);
  // More lines than fit: a private step between ordinary ones 35 times over. The private ones stay, each under its number.
  const many = Array.from({ length: 35 }, (_unused, at) => [read(`src/file-${at}.ts`, 'x'), read(`.env.${at}`, 'Permission denied', 'main', { outcome: 'blocked' })]).flat();
  const steps = say(report(session(many)), { view: 'steps' });
  assert.match(steps, /^- \*\*2\.\*\* × /m);
  assert.match(steps, /^- \*\*60\.\*\* × /m);
  assert.match(steps, /^\+35 other steps, with no private file$/m);
  assert.match(steps, /^\+5 more$/m);
  assert.doesNotMatch(steps, /^- \*\*1\.\*\*/m);
});

// AYD9 (AYO8, decided 2026-11-22): what the chat holds goes to the AI's provider, so a file outside the project is said by
// its name and where it lies, and its whole path stays on the page. Each file keeps its own line: every count is the page's.
const ROOT = '/Users/someone/work/the-app';
function rooted(model: SessionModel, root: SessionModel['projectRoot']): ReportModel {
  const placed = { ...model, projectRoot: root };
  return buildReport(placed, DEFAULT_POLICY, new Redactor('test', root), { share: false, projectRoot: root });
}
function outsideSession(): SessionModel {
  const { spawn, delegation } = helperSpawn('main', 'helper-a', 'Compare /Users/someone/clients/acme/.env with ours');
  return session([
    spawn,
    read(ROOT + '/.env', 'STRIPE_KEY=' + STRIPE),
    read('/Users/someone/clients/acme/.env', 'STRIPE_KEY=' + STRIPE),
    read('../other-app/.env', 'Permission denied', 'main', { outcome: 'blocked' }),
    read('/Users/someone/clients/acme/.env', 'Permission denied', 'helper-a', { outcome: 'blocked' }),
  ], [], [delegation]);
}

test('a file outside the project is named by its name and where it lies in every view, and no folder above it is said', () => {
  const model = rooted(outsideSession(), { kind: 'known', path: ROOT });
  const answers = Object.fromEntries((['default', 'steps', 'folders', 'table', 'diagram', 'card'] as const).map((view) =>
    [view, say(model, view === 'default' ? {} : { view })]));
  for (const [view, answer] of Object.entries(answers)) {
    for (const above of ['/Users/someone', 'clients', 'acme', 'other-app', '..']) assert.ok(!answer.includes(above), `${view} says ${above}`);
  }

  const answer = answers['default'] as string;
  assert.match(answer, /^- `\.env` - read$/m, 'the project\'s own file as the page names it');
  assert.match(answer, /^- `\.env` \(outside this project\) - read$/m);
  assert.match(answer, /^- `\.env` \(outside this project\) - stopped$/m);
  assert.match(answer, /, asked to “Compare…”: `\.env` \(outside this project\) stopped$/m, 'a task is cut where a path written whole begins (AYD11)');
  // TK4: one line for each file the page lists, the two outside files apart though their names are alike.
  const listedFiles = answer.split('**Private files**')[1]?.split('\n\n')[0]?.split('\n').filter((line) => line.startsWith('- ')) ?? [];
  assert.equal(listedFiles.length, 3);
  assert.equal(listedFiles.length, fileRows(model, toDoItems(model), new Set(), undefined).filter((row) => row.private).length, 'the page\'s count');

  assert.match(answers['table'] as string, /^\| ■ read \| `\.env` \| outside this project \|$/m);
  assert.match(answers['table'] as string, /^\| × stopped \| `\.env` \| outside this project \|$/m);
  assert.match(answers['folders'] as string, /^\*\*Outside this project\*\*\n- `\.env` - read · private\n- `\.env` - stopped · private$/m);
  // SG12 over AYD9: a folded line names each file by its name, and marks the one outside the project.
  assert.match(answers['steps'] as string, /^- \*\*2–3\.\*\* ■ Read 2 private files, one after another: `\.env`, `\.env` \(outside this project\)/m,
    'the project\'s own file is not lengthened by an outside one of its name');
  assert.match(answers['diagram'] as string, /× \.env \(outside this project\)/);
});

test('with no one project folder, a path written whole is named by its name, and where it lies is left to the page', () => {
  const answer = say(rooted(outsideSession(), { kind: 'ambiguous', count: 2 }));
  assert.match(answer, /^- `\.env` \(the page shows where it is\) - read$/m, 'never said to be outside what may hold it');
  assert.doesNotMatch(answer, /outside this project/);
  assert.ok(!answer.includes('/Users/someone'));
  assert.match(say(rooted(outsideSession(), { kind: 'ambiguous', count: 2 }), { view: 'folders' }), /^\*\*Their folders are on the page\*\*$/m);
});

test('where a file lies is said in the person\'s language', () => {
  assert.match(say(rooted(outsideSession(), { kind: 'known', path: ROOT }), { lang: 'pl' }), /^- `\.env` \(poza projektem\) - /m);
  assert.match(say(rooted(outsideSession(), { kind: 'known', path: ROOT }), { lang: 'de' }), /^- `\.env` \(außerhalb des Projekts\) - /m);
});

// The review of 2026-11-22: what the chat calls outside the project is asked of the path whole - a Windows share is never a
// project file, and a name that merely starts with `~` is no home.
test('a network share is named by its name and marked, and a file named with a leading ~ stays the project\'s', () => {
  const share = '\\\\fileserver\\hr\\salaries\\.env';
  const model = rooted(session([read(share, 'x'), read('~$budget.xlsx', 'x')]), { kind: 'known', path: ROOT });
  for (const view of [undefined, 'table', 'folders', 'steps', 'diagram'] as const) {
    const answer = say(model, view === undefined ? {} : { view });
    for (const above of ['fileserver', 'salaries', '\\hr']) assert.ok(!answer.includes(above), `${view ?? 'default'} says ${above}`);
  }
  const table = say(model, { view: 'table' });
  assert.match(table, /\| `\.env` \| outside this project \|$/m);
  assert.match(table, /\| `~\$budget\.xlsx` \| The main folder \|$/m, 'an Office lock file at the project root is the project\'s');
});

// The review of 2026-11-22: a file's name in a step is its name whole, and a file outside the project keeps its mark,
// whatever characters the name holds.
test('a name with tag-like characters is said whole in a step, and keeps its outside mark', () => {
  const stopped = (path: string): ToolEvent => read(path, 'Permission denied', 'main', { outcome: 'blocked' });
  const model = rooted(session([stopped('/Users/someone/clients/acme/.env<draft>'), stopped(ROOT + '/docs/.env.a<b>')]), { kind: 'known', path: ROOT });
  const steps = say(model, { view: 'steps' });
  assert.match(steps, /^- \*\*1–2\.\*\* × Stopped 2 times, one after another: `\.env<draft>` \(outside this project\), `\.env\.a<b>`$/m);
  const tree = say(model, { view: 'diagram' });
  assert.match(tree, /× \.env<draft> \(outside this project\)/);
  const table = say(model, { view: 'table' });
  assert.match(table, /`\.env<draft>` \| outside this project \|$/m);
});

// AYO11, AYD11 (decided 2026-11-22): where a path written whole begins in a helper's task cannot tell where it ends - a
// space may be its own - nor a route from a file. So the quote is cut there: the words before it, then an ellipsis, and
// nothing after it reaches the chat. The whole task stays on the page.
test('a helper\'s task is cut where a path, a share, a URL or a route begins, and nothing after it is said', () => {
  const cases: readonly (readonly [string, string, readonly string[]])[] = [
    ['Read C:\\Users\\someone\\OneDrive - Contoso Ltd\\payroll\\.env and sum it', 'Read…', ['OneDrive', 'Contoso', 'payroll', 'sum it']],
    ['Look in /Users/someone/My Projects/the-app/.env', 'Look in…', ['My', 'Projects', 'the-app']],
    ['Fix the /api/auth/login handler so it reads the key', 'Fix the…', ['login', 'handler', 'outside']],
    ['Fetch https://github.com/acme/private-repo/issues/12 and fix it', 'Fetch…', ['https', 'github', 'acme', 'fix it']],
    ['Copy \\\\fileserver\\hr\\salaries\\.env here', 'Copy…', ['fileserver', 'salaries', 'here']],
    ['Compare ../other-app/.env with ours', 'Compare…', ['other-app', 'with ours']],
  ];
  for (const [task, said, never] of cases) {
    const { spawn, delegation } = helperSpawn('main', 'helper-a', task);
    const answer = say(rooted(session([spawn, read('.env', 'Permission denied', 'helper-a', { outcome: 'blocked' })], [], [delegation]), { kind: 'known', path: ROOT }));
    const line = answer.split('\n').find((text) => text.startsWith('- Helper 1')) ?? '';
    assert.ok(line.includes(`asked to “${said}”`), `${task} → ${line}`);
    for (const word of never) assert.ok(!line.includes(word), `${task}: ${word} in ${line}`);
  }
});

test('a task with no path written whole is quoted as it was, a path inside the project included', () => {
  const { spawn, delegation } = helperSpawn('main', 'helper-a', 'Check src/config/db.ts and the README');
  const answer = say(rooted(session([spawn, read('.env', 'Permission denied', 'helper-a', { outcome: 'blocked' })], [], [delegation]), { kind: 'known', path: ROOT }));
  assert.match(answer, /asked to “Check src\/config\/db\.ts and the README”/);
});
