// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { paint } from '../../../shared/colour.js';
import { printable } from '../../../shared/printable.js';
import { PUBLIC_REPOSITORY } from '../../../shared/public-repository.js';
import { TAGLINE, terminalLogo } from '../../../shared/terminal-logo.js';
const INDENT = '  ';
/** The mark a heading carries, as the report draws it (§4.1). It stands beside the word, never instead of it. */
const HEADING = '▍';
/**
 * What `start --quiet` says (`2026-10-02-said-where-the-person-is.md` SW11): where the page is and whether it opened,
 * nothing a report found. Its reader is the agent that ran it because the person said yes to a report, as for `report
 * --quiet` (`the-agent-tells-you` R19). A conversation asked for and not found is said, never passed off as its report.
 */
export function quietlySaid(place, opened, found) {
    const where = printable(place);
    if (!found)
        return `That conversation was not found here, so all conversations were ${opened ? 'opened' : 'written'}: ${where}\n`;
    return opened ? `Opened: ${where}\n` : `Written: ${where}\n`;
}
/**
 * Everything `start` says about one run: the wordmark, then what the range needs, then where the page is. The
 * sentences are the ones this command has always printed - the heading and the indent are what group them, so a
 * person reading the terminal sees two answers rather than six lines in a row.
 */
export function startSaid(said, view) {
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
        ...(view.decorated ? ['', source(view)] : []),
    ];
    return `${lines.join('\n')}\n`;
}
/**
 * `.ai/specs/2026-11-23-where-the-code-is.md` WC4: where agentwhy's code is, the last thing a run says to a person at a
 * terminal - under the wordmark's own condition, so a pipe, a script and an AI's shell are given none of it (WCD2).
 */
function source(view) {
    return dim(`agentwhy is open source: its code and issues are at ${PUBLIC_REPOSITORY}`, view);
}
/** What is said when a served page stops, which is the whole output of a run that waited on one. */
export function pageStopped(view) {
    return `${dim('The page is no longer served.', view)}\n`;
}
/** The wordmark, and beside it what this run was: the tool, and the range it read. */
function masthead(said, view) {
    const listed = `${said.project === undefined ? '' : `${said.project} · `}${said.listed} ${said.listed === 1 ? 'session' : 'sessions'} listed · since ${said.asked}`;
    return terminalLogo([TAGLINE, listed], { colour: view.colour, ascii: false });
}
/** The digest as its renderer wrote it, coloured by nothing here: it paints its own lines (R14). */
function digestLines(digest) {
    const lines = digest.split('\n');
    return lines.at(-1) === '' ? lines.slice(0, -1) : lines;
}
function page(said, view) {
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
            ? [
                warn('The page could not be served, so it was opened as a file: marks made on it are copied as commands.', view),
                // PF4's way out, which `--detach` has always said and this run did not: a sandbox is the usual reason, and a
                // person reading a file cannot finish a setup or make a mark on it.
                dim('To open it live, run this command again outside the sandbox, or type npx @agentwhy/cli in a terminal.', view),
            ]
            : []),
        dim(said.shared
            ? 'Shared view: session ids and the project path are not shown, and nothing above the project root appears in any report.'
            : 'This directory describes the sessions it lists. Keep it where you would keep the transcripts.', view),
        ...(said.opened ? [] : [warn('Nothing on this machine opened the index.', view)]),
    ];
    return [heading('The page', view), ...rows.map((row) => `${INDENT}${row}`)];
}
function heading(words, view) {
    return view.colour ? `${paint(HEADING, 'indigo')}${paint(words, 'bold')}` : `${HEADING}${words}`;
}
function bold(text, view) {
    return view.colour ? paint(text, 'bold') : text;
}
function dim(text, view) {
    return view.colour ? paint(text, 'dim') : text;
}
function warn(text, view) {
    return view.colour ? paint(text, 'yellow') : text;
}
