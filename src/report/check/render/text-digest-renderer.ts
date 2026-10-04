// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { paint, type Hue } from '../../../shared/colour.ts';
import type { PolicyOrigin } from '../../../core/policy/policy.ts';
import type { Renderer } from '../../../shared/renderer.ts';
import { table } from '../../../shared/text-table.ts';
import { needsAction, type ActionsDigest, type DigestPath, type DigestRoute } from '../actions-digest.ts';
import { refusedByRule } from '../../refusals.ts';

/**
 * `brief` is `agentwhy check`: one line per file, and where to read the rest. `full` is `--full`: every action with its
 * paths and what to do about them. `counts` is the lines `start` prints above the index
 * (`specs/2026-09-16-worth-running-every-day.md` R15a, R17).
 */
export type DigestView = 'brief' | 'full' | 'counts';

const INDENT = 2;

/** How many files the brief view names before it says how many more there are (R15a). */
const BRIEF_ROWS = 5;

/**
 * How wide a path may be drawn in the brief view. One long path used to set the column for every row, so five short
 * paths were pushed across the screen by the sixth. The end of a path is what tells files apart, so the front is what
 * gives way; the full view and the report print it whole.
 */
const PATH_WIDTH = 46;

/**
 * What to do about an open route depends on where the rules came from (R13). A rule a person can add is named only
 * where the person has no rules the tool read; a settings file already has them, and the route is the problem.
 */
const OPEN_ROUTE_ADVICE: Readonly<Record<PolicyOrigin['kind'], (digest: ActionsDigest) => readonly string[]>> = {
  settings: () => [
    'Your deny rules cover these paths, and a route they do not name reached them: a deny rule names a tool, not a',
    'file. agentwhy init --refuse refuses a shell command that names one of these paths or searches through it. A',
    'path built at run time still passes; only a boundary below the agent - file permissions, a sandbox - closes',
    'every route.',
  ],
  default: (digest) => {
    const patterns = [...new Set(digest.openRoutes.flatMap((route) => (route.pattern === undefined ? [] : [route.pattern])))];
    return [
      'No deny rules were read, so the built-in default decided what is protected, and nothing refused these calls.',
      'To have Claude Code refuse file tools on them, add to "permissions.deny" in .claude/settings.json:',
      ...patterns.map((pattern) => `${' '.repeat(INDENT)}"Read(${pattern})"`),
      'then read sessions under it: --settings .claude/settings.json. A shell command still passes a Read rule;',
      'agentwhy init --refuse covers a command line that names the path.',
    ];
  },
  file: () => [
    'Your policy file protects these paths, and nothing refused these calls. agentwhy reads that file; Claude Code',
    'enforces only "permissions.deny" in its settings.',
  ],
};

/** What the brief view says about one file, strongest first. The label leads, so a column of them reads down. */
/** The tool's own word for each kind of line, as `check` prints it; To fix's developer details read the same table. */
export const LABELS = {
  rotate: 'ROTATE',
  template: 'CHECK',
  unknown: 'UNKNOWN',
  route: 'REACHED',
  result: 'IN RESULT',
} as const;

type Label = keyof typeof LABELS;

/** Strongest first. A file is shown once, under the strongest thing known about it. */
const ORDER: readonly Label[] = ['rotate', 'template', 'unknown', 'route', 'result'];

interface BriefRow {
  readonly label: Label;
  readonly path: string;
  readonly says: string;
  readonly sessions: number;
}

export class TextDigestRenderer implements Renderer<ActionsDigest> {
  readonly #view: DigestView;
  readonly #colour: boolean;

  /** Colour is decided in the shell and handed here, as the report's is (`findings-worth-reading` R15). */
  constructor(view: DigestView, options: { readonly colour?: boolean } = {}) {
    this.#view = view;
    this.#colour = options.colour === true;
  }

  render(digest: ActionsDigest): string {
    const lines = this.#view === 'full' ? full(digest) : this.#view === 'counts' ? counts(digest) : brief(digest);
    return `${(this.#colour ? colourise(lines) : lines).join('\n')}\n`;
  }
}

/**
 * The answer on one screen (R15a): a heading, one line per file with the strongest thing known about it, and where the
 * rest is. A file reached, seen in a result and carrying a value is **one** line, not three - the sections of the full
 * view describe the same handful of files, and reading them as separate findings is how a short answer became a wall.
 */
function brief(digest: ActionsDigest): string[] {
  const heading = headingOf(digest);
  if (heading !== undefined) return heading;

  const rows = briefRows(digest);
  if (rows.length === 0) {
    return [
      (digest.marks?.done ?? 0) > 0
        ? `Nothing left to act on: ${read(digest)}${under(digest)}.`
        : `Nothing to act on: ${read(digest)}${under(digest)}, and no protected file was reached.`,
      ...unreadableLines(digest),
      ...stoppedSentences(digest),
      ...markLines(digest),
    ];
  }

  const shown = rows.slice(0, BRIEF_ROWS);
  const width = Math.max(...shown.map((row) => LABELS[row.label].length));
  const pathWidth = Math.max(...shown.map((row) => shorten(row.path).length));

  return [
    `agentwhy · ${read(digest)}${under(digest)}`,
    ...unreadableLines(digest),
    '',
    ...table(
      shown.map((row) => [`${LABELS[row.label].padEnd(width)}  ${shorten(row.path).padEnd(pathWidth)}`, `${row.says}, ${inSessions(row.sessions)}`]),
      INDENT,
    ),
    ...(rows.length > shown.length ? [`${' '.repeat(INDENT)}and ${rows.length - shown.length} more`] : []),
    // Under the rows, as their footnote: lower case and no full stop, as the lines beside them are.
    ...stoppedSentences(digest).map((sentence) => `${' '.repeat(INDENT)}${sentence.charAt(0).toLowerCase()}${sentence.slice(1, -1)}`),
    ...(digest.mentions === 0
      ? []
      : [`${' '.repeat(INDENT)}${plural(digest.mentions, 'path was', 'paths were')} named in text a call carried, which opens no file; not counted`]),
    ...markLines(digest, INDENT),
    '',
    'What each line means, and what to do:  agentwhy check --full',
    'Dealt with one:                        agentwhy check --mark rotated <path>',
    `Session by session, in the browser:    agentwhy start --since ${digest.asked}`,
  ];
}

/** One row per file, strongest first: a value seen beats an unknown outcome, which beats a route, which beats a result. */
function briefRows(digest: ActionsDigest): BriefRow[] {
  const rows = new Map<string, BriefRow>();
  const reopened = new Map((digest.marks?.reopened ?? []).map((mark) => [mark.path, mark]));
  const add = (label: Label, path: string, says: string, sessions: number): void => {
    if (rows.has(path)) return;
    const mark = reopened.get(path);
    // A marked file is here only because a session after the mark reached it; the count is of those sessions (R35).
    const again = mark === undefined ? '' : `; marked ${RESULT_WORDS[mark.result]} ${dayOf(mark.at)}, reached again since`;
    rows.set(path, { label, path, says: says + again, sessions });
  };

  for (const file of digest.rotate) {
    if (file.template === true) add('template', file.path, 'a value was read from this template', file.sessions);
    else add('rotate', file.path, "a value was in an agent's context", file.sessions);
  }
  for (const file of digest.unknown) add('unknown', file.path, 'a call named it, its outcome is not recorded', file.sessions);
  for (const route of digest.openRoutes) add('route', route.path, `${route.did}, nothing refused it`, route.sessions);
  for (const file of digest.onlyInResults) add('result', file.path, 'printed by a search, no call named it', file.sessions);

  return [...rows.values()].sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label) || b.sessions - a.sessions);
}

function full(digest: ActionsDigest): string[] {
  const heading = headingOf(digest);
  if (heading !== undefined) return heading;

  const unreadable = unreadableLines(digest);
  const refused = refusedLines(digest);

  if (!needsAction(digest)) {
    return [
      (digest.marks?.done ?? 0) > 0
        ? `Nothing left to act on: ${read(digest)}${under(digest)}.`
        : `Nothing to act on: ${read(digest)}${under(digest)}, and no protected file was reached.`,
      ...unreadable,
      ...refused,
      ...markLines(digest),
    ];
  }

  return [
    `agentwhy check - ${read(digest)}${under(digest)}.`,
    ...unreadable,
    ...section(
      digest.rotate.length > 0,
      'Rotate',
      [
        "A value from these files was in an agent's context: it was sent to the model provider, and it is kept in the",
        'transcripts on this machine. Rotating the value is the only step that undoes that. A file named as a template is',
        'marked: it is meant to be committed, so the question there is whether the value in it is real.',
      ],
      table(
        digest.rotate.map((entry) => [entry.path, `${entry.template === true ? 'template · ' : ''}${inSessions(entry.sessions)}`]),
        INDENT,
      ),
    ),
    ...section(
      digest.openRoutes.length > 0,
      'Open routes',
      ['These protected paths were reached, and nothing refused the call.'],
      [...routeRows(digest.openRoutes), '', ...OPEN_ROUTE_ADVICE[digest.policyKind](digest)],
    ),
    ...section(
      digest.onlyInResults.length > 0,
      'Seen only in results',
      [
        'No call named these paths: they appeared in what a command printed, as a recursive search prints them.',
        'agentwhy init --refuse refuses a grep -r or rg that would read one; a boundary below the agent closes',
        'every route.',
      ],
      pathRows(digest.onlyInResults),
    ),
    ...section(
      digest.unknown.length > 0,
      'Outcome unknown',
      [
        'A call named or printed these protected paths, and its result was not recorded, so whether the file was read cannot',
        'be established. The report of the session shows which call.',
      ],
      pathRows(digest.unknown),
    ),
    ...section(
      digest.secretShapes.length > 0,
      'Key shapes',
      ['Results carried something shaped like a known key. The report of the session shows where; the value is never shown.'],
      table(digest.secretShapes.map((shape) => [shape.name, times(shape.count)]), INDENT),
    ),
    ...section(
      digest.mentions > 0,
      'Not counted',
      [
        `${plural(digest.mentions, 'protected path was', 'protected paths were')} named in text that a call carried - a message, a report, a question -`,
        'by a tool this version has no profile for. Such a call opens no file, so it is not a route. The report of the',
        'session shows them, and says the tool was not recognised.',
      ],
      [],
    ),
    ...(refused.length === 0 ? [] : ['', ...refused]),
    ...(markLines(digest).length === 0 ? [] : ['', ...markLines(digest)]),
    '',
    `Each session in detail: agentwhy start --since ${digest.asked}`,
    'Dealt with a file:      agentwhy check --mark rotated <path>   (not-secret for a template)',
  ];
}

/**
 * The digest as one line of counts, and where the detail is (R17). "Nothing to act on" is said only of sessions that
 * were read: a range whose sessions all failed is not a clean range (R15). Found by a review.
 */
function counts(digest: ActionsDigest): string[] {
  const unreadable = unreadableLines(digest, 'in this range', 'here');
  if (digest.sessionsRead === 0) {
    return digest.sessionsUnreadable === 0 ? ['No session was active in this range.'] : unreadable;
  }
  // One sentence per line: the counts, what the rules held, and what is already dealt with are three answers, and
  // run together they were one line long enough to wrap twice in a terminal nobody had made wide for it.
  const held = stoppedSentences(digest);
  const done = doneLine(digest);
  if (!needsAction(digest)) {
    return [`Nothing to act on in the ${plural(digest.sessionsRead, 'session', 'sessions')} read.`, ...held, ...done, ...unreadable];
  }

  const parts = [
    ...(digest.rotate.length === 0 ? [] : [`${plural(digest.rotate.length, 'file', 'files')} to rotate`]),
    ...(digest.openRoutes.length === 0 ? [] : [`${plural(digest.openRoutes.length, 'open route', 'open routes')} to a protected path`]),
    ...(digest.onlyInResults.length === 0 ? [] : [`${plural(digest.onlyInResults.length, 'path', 'paths')} seen only in results`]),
    ...(digest.unknown.length === 0 ? [] : [`${plural(digest.unknown.length, 'path', 'paths')} with an unknown outcome`]),
    ...(digest.secretShapes.length === 0 ? [] : [`${plural(digest.secretShapes.reduce((sum, shape) => sum + shape.count, 0), 'key shape', 'key shapes')}`]),
  ];
  return [`To act on: ${parts.join(' · ')}`, ...held, ...done, ...unreadable, `What to do: agentwhy check --since ${digest.asked}`];
}

/** The answers that are the whole output: an empty range, and a range in which nothing could be read. */
function headingOf(digest: ActionsDigest): string[] | undefined {
  if (digest.sessionsRead === 0 && digest.sessionsUnreadable === 0) {
    return [
      `No session of this project was active since ${digest.asked}, so there is nothing to check.`,
      'To look further back: agentwhy check --since 30d',
    ];
  }
  // Every session in range failed: nothing was read, so nothing can be called clear.
  return digest.sessionsRead === 0 ? unreadableLines(digest) : undefined;
}

function unreadableLines(digest: ActionsDigest, where = 'inside the range', rest = 'below'): string[] {
  if (digest.sessionsUnreadable === 0) return [];
  const them = digest.sessionsUnreadable === 1 ? 'it' : 'them';
  return [`${plural(digest.sessionsUnreadable, 'session', 'sessions')} ${where} could not be read, and nothing ${rest} covers ${them}.`];
}

function read(digest: ActionsDigest): string {
  return `${plural(digest.sessionsRead, 'session', 'sessions')} active since ${digest.asked}`;
}

function under(digest: ActionsDigest): string {
  return digest.policy === undefined ? '' : `, read under ${digest.policy}`;
}

function refusedLines(digest: ActionsDigest): string[] {
  const [rules, ...others] = stoppedSentences(digest);
  if (rules === undefined) return [];
  // What follows is about a rule's refusal alone, so it stays with the rules' line and is not said of the others (WS4).
  return rules.startsWith(RULES_HELD)
    ? [`${rules} A refused Read raises no hook event, so only the`, 'transcripts show these.', ...others]
    : [rules, ...others];
}

const RULES_HELD = 'Your rules held:';
const AUTO_MODE_STOPPED = 'Auto mode stopped';
const YOU_TURNED_DOWN = 'You turned down';

/**
 * What was stopped, and by whom (`specs/2026-10-01-who-stopped-it.md` WS4): a rule's refusals are the rules having held,
 * and an attempt Claude Code's auto mode or the person stopped is said as theirs - crediting a rule with it would tell a
 * person their rules cover a route they do not. One sentence each, the rules' first; a count of zero says nothing.
 */
function stoppedSentences(digest: ActionsDigest): string[] {
  const byRule = refusedByRule(digest.refusedAttempts, digest.refusedByOthers);
  const reviewer = digest.refusedByOthers?.reviewer ?? 0;
  const person = digest.refusedByOthers?.person ?? 0;
  return [
    ...(byRule === 0 ? [] : [`${RULES_HELD} ${plural(byRule, 'attempt was', 'attempts were')} refused.`]),
    ...(reviewer === 0 ? [] : [`${AUTO_MODE_STOPPED} ${plural(reviewer, 'attempt', 'attempts')}.`]),
    ...(person === 0 ? [] : [`${YOU_TURNED_DOWN} ${plural(person, 'attempt', 'attempts')}.`]),
  ];
}

function section(shown: boolean, heading: string, explanation: readonly string[], rows: readonly string[]): string[] {
  return shown ? ['', heading, ...explanation, ...(rows.length === 0 ? [] : ['', ...rows])] : [];
}

function pathRows(paths: readonly DigestPath[]): string[] {
  return table(paths.map((entry) => [entry.path, inSessions(entry.sessions)]), INDENT);
}

function routeRows(routes: readonly DigestRoute[]): string[] {
  const width = Math.max(...routes.map((route) => route.did.length));
  return table(
    routes.map((route) => [route.path, `${route.did.padEnd(width)}  ${times(route.occurrences)}, ${inSessions(route.sessions)}`]),
    INDENT,
  );
}

const RESULT_WORDS = { rotated: 'rotated', 'not-secret': 'not a real secret', handled: 'handled', 'not-private': 'not private' } as const;

/** What the person's marks did to this range, said once, and where the record is shown (R35, R36). */
function markLines(digest: ActionsDigest, indent = 0): string[] {
  const marks = digest.marks;
  if (marks === undefined) return [];
  const pad = ' '.repeat(indent);
  return [
    ...(marks.done === 0
      ? []
      : [`${pad}${plural(marks.done, 'file was', 'files were')} marked done and not reached since; History: agentwhy start --since ${digest.asked}`]),
    ...(marks.unreadable ? [`${pad}the record of marks could not be read, so nothing marked was left out`] : []),
  ];
}

function doneLine(digest: ActionsDigest): string[] {
  const done = digest.marks?.done ?? 0;
  return done === 0 ? [] : [`${plural(done, 'file', 'files')} marked done.`];
}

function dayOf(epoch: number): string {
  return new Date(epoch).toISOString().slice(0, 10);
}

/** A path cut at the front, so what is left still names the file. Never cut in the full view or in a report. */
function shorten(path: string): string {
  return path.length <= PATH_WIDTH ? path : `…${path.slice(path.length - PATH_WIDTH + 1)}`;
}

function inSessions(count: number): string {
  return `in ${plural(count, 'session', 'sessions')}`;
}

function times(count: number): string {
  return count === 1 ? 'once' : `${count} times`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The headings of the full view. Painted, never changed: the word is the heading, the weight only repeats it. */
const SECTIONS: ReadonlySet<string> = new Set(['Rotate', 'Open routes', 'Seen only in results', 'Outcome unknown', 'Key shapes', 'Not counted']);

/** What each label of the brief view means, as colour: a value that left the machine is red, a question is yellow. */
const LABEL_HUE: Readonly<Record<string, Hue>> = {
  ROTATE: 'red',
  CHECK: 'yellow',
  UNKNOWN: 'yellow',
  REACHED: 'red',
  'IN RESULT': 'yellow',
};

/**
 * Colour laid over the lines already written (R14): every coloured word is a word, and removing the escapes gives
 * back exactly what was written without it. Each rule paints one part of a line and never inside another's, so no
 * escape is ever nested in another.
 */
function colourise(lines: readonly string[]): string[] {
  return lines.map((line) => {
    // The tool's own name, in the colour that marks the tool and never an outcome.
    const named = /^agentwhy(?: check)? [·-] /.exec(line);
    if (named !== null) return `${paint('agentwhy', 'indigo')}${paint(line.slice('agentwhy'.length), 'dim')}`;

    if (SECTIONS.has(line)) return paint(line, 'bold');

    // A range that is clear, and rules that refused something, are the two things that went well.
    if (/^Nothing (?:left )?to act on/.test(line)) return paint(line, 'green');
    // What stopped an attempt went well, whoever stopped it.
    for (const prefix of [RULES_HELD, AUTO_MODE_STOPPED, YOU_TURNED_DOWN]) {
      if (line.startsWith(prefix)) return `${paint(prefix, 'green')}${line.slice(prefix.length)}`;
    }

    // The counts: the heading says there is something to do, the numbers are what to do it about.
    if (line.startsWith('To act on:')) {
      return `${paint('To act on:', 'yellow')}${count(line.slice('To act on:'.length))}`;
    }

    if (/could not be read/.test(line)) return paint(line, 'yellow');

    // A row of the brief view: the label leads, and says the same thing the colour does.
    const labelled = /^( {2})(ROTATE|CHECK|UNKNOWN|REACHED|IN RESULT)/.exec(line);
    if (labelled !== null) {
      const [, indent = '', label = ''] = labelled;
      return `${indent}${paint(label, LABEL_HUE[label] ?? 'bold')}${line.slice(indent.length + label.length)}`;
    }

    // Where the rest is: the words are the question, the command is the answer to copy.
    const command = /^(.*?:)( +)(agentwhy .*)$/.exec(line);
    if (command !== null) {
      const [, words = '', gap = '', rest = ''] = command;
      return `${paint(words, 'dim')}${gap}${paint(rest, 'bold')}`;
    }

    return line;
  });
}

/** The numbers in a line of counts, marked as the numbers they are. */
function count(text: string): string {
  return text.replace(/\b\d+\b/g, (number) => paint(number, 'bold'));
}
