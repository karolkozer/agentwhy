// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { paint } from '../../../shared/colour.ts';
import { printable } from '../../../shared/printable.ts';
import { TAGLINE, terminalLogo } from '../../../shared/terminal-logo.ts';

/**
 * How the terminal `start` writes to is drawn on. Both are decided once, in the shell, as every other colour
 * decision is (`specs/2026-09-15-findings-worth-reading.md` R15); nothing here looks at a stream.
 */
export interface TerminalView {
  readonly colour: boolean;
  /**
   * Stdout is a terminal, so the wordmark is drawn above the answer. A run whose output is piped into a file or
   * read by a script keeps the words alone: nobody looks at block letters in a log.
   */
  readonly decorated: boolean;
}

/** What one `start` run has to say for itself, before any of it is written as words. */
export interface StartSaid {
  /**
   * The project's folder name, as the sidebar shows it (`.ai/specs/2026-09-27-which-project.md` V3): the one fact that
   * says which folder the run was for. Absent under `--share`, which names no project.
   */
  readonly project?: string;
  /** Every session of the project the page lists, in range or not: what the masthead says the run is about. */
  readonly listed: number;
  readonly asked: string;
  readonly generated: number;
  readonly failed: number;
  readonly older: number;
  /** The command that would bring the older sessions into range. */
  readonly widen: string;
  readonly indexPath: string;
  readonly shared: boolean;
  readonly opened: boolean;
  /** The counts of R17, as the digest renderer wrote them. Written above the page, unchanged. */
  readonly digest: string;
  /** Where the page is served from (R50), when it is. */
  readonly url?: string;
  /** A page that was to be served and could not be, so it was opened as a file instead. */
  readonly servedAsFile?: boolean;
  /**
   * A page switched to this project (`.ai/specs/2026-09-27-which-project.md` V3, V14): which one is shown now, and where
   * it is - "blog (~/Projects/blog)".
   */
  readonly nowShowing?: string;
  /**
   * The onboarding was opened in place of the index (`.ai/specs/2026-09-24-onboarding.md` W23), or its address printed
   * for a person to open (`.ai/specs/2026-10-01-the-address-opens-the-welcome.md` AW3).
   */
  readonly welcome?: 'opened' | 'served';
}

const INDENT = '  ';

/** The mark a heading carries, as the report draws it (§4.1). It stands beside the word, never instead of it. */
const HEADING = '▍';

/**
 * What `start --quiet` says (`2026-10-02-said-where-the-person-is.md` SW11): where the page is and whether it opened,
 * nothing a report found. Its reader is the agent that ran it because the person said yes to a report, as for `report
 * --quiet` (`the-agent-tells-you` R19). A conversation asked for and not found is said, never passed off as its report.
 */
export function quietlySaid(place: string, opened: boolean, found: boolean): string {
  const where = printable(place);
  if (!found) return `That conversation was not found here, so all conversations were ${opened ? 'opened' : 'written'}: ${where}\n`;
  return opened ? `Opened: ${where}\n` : `Written: ${where}\n`;
}

/**
 * Everything `start` says about one run: the wordmark, then what the range needs, then where the page is. The
 * sentences are the ones this command has always printed - the heading and the indent are what group them, so a
 * person reading the terminal sees two answers rather than six lines in a row.
 */
export function startSaid(said: StartSaid, view: TerminalView): string {
  // Found by a review: the folder's name is the first of a project's own words this command prints, and a folder can
  // arrive with a clone, so it is shown as a title is.
  const shown = {
    ...said,
    ...(said.project === undefined ? {} : { project: printable(said.project) }),
    ...(said.nowShowing === undefined ? {} : { nowShowing: printable(said.nowShowing) }),
  };
  const lines = [
    ...(view.decorated ? [...masthead(shown, view), ''] : []),
    ...digestLines(shown.digest),
    '',
    ...page(shown, view),
  ];
  return `${lines.join('\n')}\n`;
}

/** What is said when a served page stops, which is the whole output of a run that waited on one. */
export function pageStopped(view: TerminalView): string {
  return `${dim('The page is no longer served.', view)}\n`;
}

/** The wordmark, and beside it what this run was: the tool, and the range it read. */
function masthead(said: StartSaid, view: TerminalView): string[] {
  const listed = `${said.project === undefined ? '' : `${said.project} · `}${said.listed} ${said.listed === 1 ? 'session' : 'sessions'} listed · since ${said.asked}`;
  return terminalLogo([TAGLINE, listed], { colour: view.colour, ascii: false });
}

/** The digest as its renderer wrote it, coloured by nothing here: it paints its own lines (R14). */
function digestLines(digest: string): string[] {
  const lines = digest.split('\n');
  return lines.at(-1) === '' ? lines.slice(0, -1) : lines;
}

function page(said: StartSaid, view: TerminalView): string[] {
  const rows = [
    ...(said.nowShowing === undefined ? [] : [bold(`Now showing ${said.nowShowing}.`, view)]),
    // W1a: a project with no conversations yet is set up from the onboarding; there is no report to count.
    said.listed === 0 ? `There are no AI chats in ${said.project ?? 'this folder'} yet.` : `${said.generated} ${said.generated === 1 ? 'report' : 'reports'} and an index written.`,
    `${dim('Index:', view)} ${bold(said.indexPath, view)}`,
    ...(said.failed === 0
      ? []
      : [warn(`${said.failed} ${said.failed === 1 ? 'session' : 'sessions'} inside the range could not be read; the index says which.`, view)]),
    ...(said.older === 0
      ? []
      : [
          `${dim(`${said.older} older ${said.older === 1 ? 'session is' : 'sessions are'} listed but not generated. To include them:`, view)} ${bold(said.widen, view)}`,
        ]),
    ...(said.url === undefined
      ? []
      : [
          `${dim('Serving the page at', view)} ${bold(said.url, view)}`,
          dim('A mark made on it is recorded at once. It stops after 30 minutes with no request, or with Ctrl+C.', view),
        ]),
    ...(said.welcome === 'opened' ? [`Opened the welcome page, to set agentwhy up for ${said.project ?? 'this project'}.`] : []),
    ...(said.welcome === 'served' ? [`That address opens the welcome page, to set agentwhy up for ${said.project ?? 'this project'}.`] : []),
    ...(said.servedAsFile === true
      ? [warn('The page could not be served, so it was opened as a file: marks made on it are copied as commands.', view)]
      : []),
    dim(
      said.shared
        ? 'Shared view: session ids and the project path are not shown, and nothing above the project root appears in any report.'
        : 'This directory describes the sessions it lists. Keep it where you would keep the transcripts.',
      view,
    ),
    ...(said.opened ? [] : [warn('Nothing on this machine opened the index.', view)]),
  ];

  return [heading('The page', view), ...rows.map((row) => `${INDENT}${row}`)];
}

function heading(words: string, view: TerminalView): string {
  return view.colour ? `${paint(HEADING, 'indigo')}${paint(words, 'bold')}` : `${HEADING}${words}`;
}

function bold(text: string, view: TerminalView): string {
  return view.colour ? paint(text, 'bold') : text;
}

function dim(text: string, view: TerminalView): string {
  return view.colour ? paint(text, 'dim') : text;
}

function warn(text: string, view: TerminalView): string {
  return view.colour ? paint(text, 'yellow') : text;
}
