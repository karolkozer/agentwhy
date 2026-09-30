import { parseArgs } from 'node:util';
import { parseSince, splitBySince, type Since } from '../../core/session-filter.ts';
import type { Redacted } from '../../core/redaction/redacted.ts';
import { sessionKey, type SessionCatalogue, type SessionSummary } from '../../core/session-catalogue.ts';
import { PROVIDER_NAMES } from '../../core/session-format.ts';
import { recogniseAll, type SessionTitles } from '../../core/session-titles.ts';
import type { Asker } from '../../ports/asker.ts';
import type { Chooser, Choice } from '../../ports/chooser.ts';
import type { ReportUseCase } from '../../report/report-use-case.ts';
import { table } from '../../shared/text-table.ts';
import type { CliCommand, CommandResult } from '../cli-command.ts';
import { EXIT_CODE } from '../exit-codes.ts';
import { EXIT_CODE_BY_OUTCOME } from './report-cli-command.ts';

export const SESSIONS_USAGE = `Usage: agentwhy sessions [--since <span | date>] [--no-interactive]

Lists the sessions Claude Code has kept for the current directory's project, newest first,
so that reporting on one does not require typing the path it is stored under.

At a terminal, with no --since, it first asks how far back to look - there can be a lot of
sessions - then the list can be chosen from: typing narrows it by title, date or id, the arrow
keys move, Enter opens a report on that session, Escape leaves. A title is the one Claude Code
gave the session, passed through the redactor. Piped or redirected it prints the table and
exits, unchanged, so that a script sees the same output either way.

  --since <span|date> only sessions last active since then: 7d, 12h, 2w, or 2026-09-01 (UTC).
                      Off a terminal, without it, every session is listed
  --no-interactive    asks for the table at a terminal too, every session, unfiltered
  -h, --help          this text
`;

/** What the range question decided: a range, "every session", or the person left without answering either. */
type RangePick = { readonly kind: 'since'; readonly since: Since } | { readonly kind: 'all' } | { readonly kind: 'left' };

const QUICK_RANGES: readonly { readonly label: string; readonly span: string }[] = [
  { label: 'Today', span: '1d' },
  { label: 'Last 7 days', span: '7d' },
  { label: 'Last 30 days', span: '30d' },
];

export interface SessionsDependencies {
  readonly catalogue: SessionCatalogue;
  readonly workingDirectory: string;
  readonly chooser: Chooser;
  /** Types the range when none of the quick choices fits. */
  readonly asker: Asker;
  /** Read only when a person is choosing: the table never pays for a title. */
  readonly titles: SessionTitles;
  readonly report: ReportUseCase;
  /** What `report` would be drawn at here: the terminal's width, decided in the shell like everything else about it. */
  readonly width: number;
  /**
   * Whether both streams are terminals. A command that behaves differently when it is being watched is not
   * scriptable, so this is the only thing that decides, and the shell is the only place that knows it.
   */
  readonly interactive: boolean;
  /** When the command started. A range is measured from it, so it is given rather than read. */
  readonly now: number;
}

/** `agentwhy sessions` - the answer to "which session did I mean?", and a way to act on the answer. */
export class SessionsCliCommand implements CliCommand {
  readonly name = 'sessions';
  readonly usage = SESSIONS_USAGE;
  readonly #dependencies: SessionsDependencies;

  constructor(dependencies: SessionsDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(args: readonly string[]): Promise<CommandResult> {
    let values;
    try {
      ({ values } = parseArgs({
        args: [...args],
        options: {
          since: { type: 'string' },
          'no-interactive': { type: 'boolean', default: false },
          help: { type: 'boolean', short: 'h', default: false },
        },
        strict: true,
        allowPositionals: false,
      }));
    } catch (error) {
      return { kind: 'usage-error', message: error instanceof Error ? error.message : String(error), usage: this.usage };
    }

    if (values.help) return { kind: 'help', usage: this.usage };

    let since: Since | undefined;
    if (values.since !== undefined) {
      const parsed = parseSince(values.since, this.#dependencies.now);
      if ('error' in parsed) return { kind: 'usage-error', message: parsed.error, usage: this.usage };
      since = parsed;
    }

    const { catalogue, workingDirectory } = this.#dependencies;
    const listing = await catalogue.list(workingDirectory);

    // "Nothing here" and "looked in the wrong place" are different answers, and the second is far more likely
    // to be the truth when a path encoding is involved.
    if (!listing.found) {
      return {
        kind: 'completed',
        output:
          `No sessions are stored for this directory.\nLooked in ${listing.searched.map((place) => place.directory).join(' and ')}\n` +
          `agentwhy reads sessions Claude Code and Codex already keep, so either this directory has not been used with either yet, or it is not the one being worked in.\n` +
          `Use Claude Code or Codex here, then run agentwhy sessions again - or run agentwhy init now, to be protected in Claude Code before there is history to check.\n`,
        exitCode: EXIT_CODE.ok,
      };
    }
    if (listing.sessions.length === 0) {
      return { kind: 'completed', output: `That project has no sessions yet.\n${listing.directory}\n`, exitCode: EXIT_CODE.ok };
    }

    const interactive = this.#dependencies.interactive && !values['no-interactive'];
    // At a terminal, with no --since on the command line: asked before the list, because the list itself can be
    // the very thing too long to read (the reason this exists at all).
    if (interactive && since === undefined) {
      const picked = await this.#pickRange(listing.sessions.length);
      if (picked.kind === 'left') return { kind: 'completed', output: '', exitCode: EXIT_CODE.ok };
      if (picked.kind === 'since') since = picked.since;
      // 'all': since stays undefined, and every session is kept below.
    }

    const sessions = since === undefined ? listing.sessions : splitBySince(listing.sessions, since.since).inRange;
    if (since !== undefined && sessions.length === 0) {
      return { kind: 'completed', output: `No sessions of this project were active since ${since.asked}.\n`, exitCode: EXIT_CODE.ok };
    }

    return interactive ? this.#choose(sessions, since) : { kind: 'completed', output: render(sessions, since), exitCode: EXIT_CODE.ok };
  }

  /** R: how far back to look, asked before the list itself, because the list can be the thing too long to read. */
  async #pickRange(total: number): Promise<RangePick> {
    const { chooser, asker, now } = this.#dependencies;
    const rows: Choice[] = [
      ...QUICK_RANGES.map(({ label, span }) => ({ label, detail: `--since ${span}` })),
      { label: 'All sessions', detail: `${count(total)}, unfiltered` },
      { label: 'Type a date or span', detail: 'e.g. 2026-09-01, or 12h' },
    ];

    const at = await chooser.choose('How far back? There can be a lot of sessions.', rows);
    if (at === undefined) return { kind: 'left' };
    if (at === QUICK_RANGES.length) return { kind: 'all' };
    if (at < QUICK_RANGES.length) {
      const range = QUICK_RANGES[at];
      if (range === undefined) return { kind: 'left' };
      const parsed = parseSince(range.span, now);
      return 'error' in parsed ? { kind: 'left' } : { kind: 'since', since: parsed };
    }

    for (let question = 'Since when? 7d, 12h, 2w, or a date such as 2026-09-01'; ; ) {
      const typed = await asker.ask(question, '7d');
      if (typed === undefined || typed === '') return { kind: 'left' };
      const parsed = parseSince(typed, now);
      if (!('error' in parsed)) return { kind: 'since', since: parsed };
      question = `${parsed.error}. Try again, or leave it blank to go back`;
    }
  }

  /** The list, chosen from. Leaving without choosing is an ordinary way to finish, not a failure. */
  async #choose(sessions: readonly SessionSummary[], since: Since | undefined): Promise<CommandResult> {
    const { chooser, report, titles, width } = this.#dependencies;
    const titled = (await recogniseAll(titles, sessions)).map((recognised) => recognised.title);
    const heading = `${count(sessions.length)}${rangeWords(since)}, newest first. Type to narrow the list.`;

    const at = await chooser.choose(
      heading,
      sessions.map((session, position) => toChoice(session, titled[position])),
    );
    const chosen = at === undefined ? undefined : sessions[at];
    if (chosen === undefined) return { kind: 'completed', output: '', exitCode: EXIT_CODE.ok };

    const result = await report.run({
      input: chosen.path,
      ascii: false,
      full: false,
      // Printed at the terminal the list was chosen at; the shell still decides whether it may be coloured.
      colour: true,
      open: true,
      share: false,
      width,
    });
    return { kind: 'completed', output: result.output, exitCode: EXIT_CODE_BY_OUTCOME[result.outcome] };
  }
}

function count(sessions: number): string {
  return `${sessions} ${sessions === 1 ? 'session' : 'sessions'}`;
}

function rangeWords(since: Since | undefined): string {
  return since === undefined ? '' : ` active since ${since.asked}`;
}

function when(session: SessionSummary): string {
  return new Date(session.modifiedAt).toISOString().slice(0, 16).replace('T', ' ');
}

function delegations(session: SessionSummary): string {
  return session.delegations === 0 ? 'no delegations' : `${session.delegations} delegations`;
}

/**
 * The title when there is one, and the key either way: two sessions can carry the same title. Every row names the AI
 * that wrote it (`2026-09-27-what-codex-wrote.md` X28).
 */
function toChoice(session: SessionSummary, title: Redacted | undefined): Choice {
  const ai = PROVIDER_NAMES[session.provider];
  if (title === undefined) return { label: `untitled · ${sessionKey(session)}`, detail: `${ai} · ${when(session)} · ${delegations(session)}` };
  return { label: title, detail: `${ai} · ${when(session)} · ${delegations(session)} · ${session.id.slice(0, 8)}` };
}

function render(sessions: readonly SessionSummary[], since: Since | undefined): string {
  const rows = sessions.map((session, index): readonly [string, string] => [
    `${index === 0 ? '*' : ' '} ${sessionKey(session)}`,
    `${when(session)}  ${PROVIDER_NAMES[session.provider]}  ${delegations(session)}`,
  ]);

  return [
    `${count(sessions.length)}${rangeWords(since)}, newest first. \`agentwhy report\` reads the one marked *.`,
    '',
    ...table(rows, 2),
    '',
    'To read another: agentwhy report --input <the id above>',
    '',
  ].join('\n');
}
