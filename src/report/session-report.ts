// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { gapReasons } from './gap-reasons.ts';
import { join } from 'node:path';
import { displayPath, insideProject, type ProjectRoot } from '../core/project-root.ts';
import type { Browser } from '../ports/browser.ts';
import type { Redactor } from '../core/redaction/redactor.ts';
import { sessionKey, type SessionCatalogue } from '../core/session-catalogue.ts';
import type { Provider } from '../core/session-format.ts';
import type { SessionReader } from '../core/session-reader.ts';
import { FileAccessError } from '../ports/file-access-error.ts';
import type { FileReader } from '../ports/file-reader.ts';
import type { FileWriter } from '../ports/file-writer.ts';
import { fileStamp } from '../shared/file-stamp.ts';
import type { Renderer } from '../shared/renderer.ts';
import { buildReport } from './build-report.ts';
import { actionsOf } from './check/session-actions.ts';
import { fileStory } from './render/report-page/file-story.ts';
import { listedFiles } from './render/report-page/files.ts';
import type { TellListPaths } from './private-files/tell-lists.ts';
import { choosePolicy, policyRefusal } from './choose-policy.ts';
import { computerRules, projectDenyRules } from './project-rules.ts';
import type { ReportModel } from './report-model.ts';
import type { ReportPage } from './render/report-page.ts';
import type { ReportOptions, ReportResult, ReportUseCase } from './report-use-case.ts';

export interface SessionReportDependencies {
  /**
   * The person's home directory, for the computer-wide settings a page's *Protected* has to account for
   * (`2026-10-05-protected-everywhere.md` G6): Claude Code reads them in every project (GB10), so a rule written
   * there refuses a file whatever project the session ran in.
   */
  readonly home: string;
  /** The lists of files a person asked only to be told about (F57), read with the policy wherever it is chosen. */
  readonly tell?: TellListPaths;
  /** Reads an input with the format its content names, whichever AI wrote it (XD7). */
  readonly reader: SessionReader;
  readonly files: FileReader & FileWriter;
  /**
   * A fresh redactor per run: its pseudonyms and its salt belong to one report and are useless outside it. It is
   * given the session's project root, because a displayed path is decided at the redaction boundary and nowhere
   * else - a renderer that worked it out for itself would be the one place the next renderer forgets.
   */
  readonly createRedactor: (projectRoot: ProjectRoot, share: boolean) => Redactor;
  /** The terminal renderer for one run: its width, its characters, and whether the view is the full one. */
  readonly createRenderer: (options: ReportOptions) => Renderer<ReportModel>;
  /** The page, not the model: what the run knows about where the file lands travels beside the analysis. */
  readonly htmlRenderer: Renderer<ReportPage>;
  readonly catalogue: SessionCatalogue;
  readonly workingDirectory: string;
  readonly browser: Browser;
  /** Where an HTML report goes when one was asked to be shown but not to be kept. */
  readonly temporaryDirectory: string;
  /** When the command started, so a shared temporary file is named after the moment rather than the session. */
  readonly now: number;
  /** The IANA time zone the page shows a record's time in (the report page spec M4). Absent means UTC. */
  readonly timeZone?: string;
}

/** Reads a session, decides under which policy to read it, and renders what can be said. */
export class SessionReport implements ReportUseCase {
  readonly #dependencies: SessionReportDependencies;

  constructor(dependencies: SessionReportDependencies) {
    this.#dependencies = dependencies;
  }

  async run(options: ReportOptions): Promise<ReportResult> {
    const policy = options.policy === undefined ? await choosePolicy(options, this.#dependencies.files, this.#dependencies.tell, this.#dependencies.home) : { policy: options.policy };
    if ('errors' in policy) return { outcome: 'policy-refused', output: policyRefusal(policy.errors) };

    const { reader, createRedactor, createRenderer, htmlRenderer, files } = this.#dependencies;
    const input = await this.#input(options);
    if ('message' in input) return { outcome: 'no-session', output: input.message };

    const read = await reader.read(input.path);
    // X2: a file neither AI's format recognises is read by neither, and saying so beats a report of nothing.
    if (read.kind === 'unknown-format') {
      return { outcome: 'no-session', output: `No session to report on: ${input.path} is neither a Claude Code session nor a Codex session.\n` };
    }
    const { model } = read;
    // One redactor for the whole run, so the same value carries the same pseudonym in both renderings.
    const report = buildReport(model, policy.policy, createRedactor(model.projectRoot, options.share), {
      share: options.share,
      projectRoot: model.projectRoot,
      home: this.#dependencies.home,
    });

    // `--open` needs a file, so asking to see a report is asking to write one; without `--html` it is written
    // somewhere temporary rather than into whatever directory the command was run from.
    const htmlPath =
      options.htmlPath ??
      (options.open ? join(this.#dependencies.temporaryDirectory, this.#temporaryName(model.sessionId, model.provider, options.share)) : undefined);
    // M3: what the project's own settings deny now, read from the project the session ran in, so a row can say whether
    // Claude Code would refuse the file. Only a page is drawn from it; the report itself is the session's.
    // G15: the computer's own rules beside them, read at the same time.
    const [denied, everywhere] = htmlPath === undefined
      ? [undefined, undefined]
      : await Promise.all([
        projectDenyRules(files, model.projectRoot.kind === 'known' ? model.projectRoot.path : this.#dependencies.workingDirectory, this.#dependencies.home),
        computerRules(files, this.#dependencies.home, this.#dependencies.tell?.pathsFor(undefined).computer),
      ]);
    const written =
      htmlPath === undefined
        ? undefined
        : await this.#write(
            htmlPath,
            htmlRenderer.render({
              report,
              withIndexLink: options.withIndexLink === true,
              ...(options.marks === undefined ? {} : { marks: options.marks }),
              ...(options.served === true ? { served: true } : {}),
              ...(options.project === undefined || options.share ? {} : { project: options.project }),
              ...(options.title === undefined || options.share ? {} : { title: options.title }),
              ...(denied === undefined ? {} : { denied }),
              ...(everywhere === undefined || (everywhere.blocked.length === 0 && everywhere.told.length === 0) ? {} : { everywhere }),
              ...(this.#dependencies.timeZone === undefined ? {} : { timeZone: this.#dependencies.timeZone }),
            }),
            files,
            whereFor(htmlPath, options.share, model.projectRoot),
          );
    const shown = written?.ok === true && options.open ? await this.#show(htmlPath ?? '') : '';
    // A session that could not be read at all must not exit 0 with a report saying nothing was found: a typo in
    // a path would read as a clean bill of health. `doctor` exits 1 on the same input, and so does this.
    const unreadable = model.gaps.some((gap) => gap.kind === 'session-missing');

    const actions = actionsOf(report);
    const told = [...new Set([...actions.rotate.map((file) => file.path as string), ...actions.unknown.map(String)])];
    // Why the record is not whole, for the row that says it could not be checked fully (the maintainer, 2026-10-07).
    const gaps = model.completeness === 'complete' ? undefined : gapReasons(model.gaps);

    return {
      outcome: unreadable ? 'session-unreadable' : model.completeness === 'complete' ? 'complete' : 'incomplete',
      tally: report.tally,
      actions,
      stories: { sessionId: report.scope.sessionId, files: new Map(told.map((path) => [path, fileStory(report, path)])) },
      reached: listedFiles(report),
      ...(gaps === undefined ? {} : { gaps }),
      ...(written === undefined ? {} : { htmlWritten: written.ok }),
      /*
       * The summary comes out whatever else was asked for (§7.5) - unless silence was asked for by name. `--quiet`
       * leaves where the report is and takes the findings out, for the one caller that is not a person reading a
       * terminal: an agent running this because the person said yes to opening it (R19).
       */
      output:
        options.quiet === true
          // The blank line before it separated the message from a summary that is no longer there.
          ? `${written?.message ?? ''}${shown}`.replace(/^\n+/, '')
          : `${createRenderer(options).render(report)}${written?.message ?? ''}${shown}`,
    };
  }

  /**
   * Which session to read. Given one, that one; otherwise the newest of this project, named in the output so
   * nobody has to guess which session they are looking at.
   */
  async #input(options: ReportOptions): Promise<{ path: string } | { message: string }> {
    const { catalogue, workingDirectory } = this.#dependencies;

    if (options.input !== undefined) {
      // `agentwhy sessions` ends with "report --input <the id above>", so an id of this project is taken as the session
      // it names - matched whole, never as a prefix. Anything holding a separator, or not an id listed here, is a path.
      // A session is named by its key (`codex-…` for Codex), or by its bare id where only one AI holds that id.
      if (!/[\\/]/.test(options.input)) {
        const sessions = (await catalogue.list(workingDirectory)).sessions;
        const byKey = sessions.find((session) => sessionKey(session) === options.input);
        const byId = sessions.filter((session) => session.id === options.input);
        if (byKey !== undefined) return { path: byKey.path };
        if (byId.length === 1 && byId[0] !== undefined) return { path: byId[0].path };
        if (byId.length > 1) {
          // Two AIs' sessions are told apart by their keys; two of one AI's - a copied file - only by their paths.
          const ais = new Set(byId.map((session) => session.provider)).size;
          return {
            message: `${byId.length} sessions hold the id ${options.input}.\n` +
              (ais > 1 ? 'Name it by its key, as agentwhy sessions lists it, or by its path.\n' : 'Name it by its path.\n'),
          };
        }
      }
      return { path: options.input };
    }

    const listing = await catalogue.list(workingDirectory);
    const newest = listing.sessions[0];

    if (newest === undefined) {
      return {
        message: `No session of this project to report on.\nLooked in ${listing.directory}\nGive one with --input, or run: agentwhy sessions\n`,
      };
    }
    return { path: newest.path };
  }

  /**
   * Opening is best effort and never changes the outcome: a machine with no opener still has the file, and its
   * path has already been printed. Saying nothing happened beats a command that looks like it failed.
   */
  async #show(path: string): Promise<string> {
    return (await this.#dependencies.browser.open(path)) ? '' : `Nothing on this machine opened it.\n`;
  }

  /**
   * Whether the file is there, and what to tell the reader. The two are reported apart because a caller has to
   * act on the first: deciding from the message alone once meant opening a file that had not been written,
   * since there is a message either way.
   */
  async #write(
    path: string,
    html: string,
    files: FileWriter,
    where: string | undefined,
  ): Promise<{ ok: boolean; message: string }> {
    const place = where === undefined ? '; the shared view does not print where' : ` to ${where}`;
    try {
      await files.writeText(path, html);
      return { ok: true, message: `\nHTML report written${place}\n` };
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      // The analysis still stands; only the file did not get written, and saying so beats failing silently.
      return { ok: false, message: `\nThe HTML report could not be written${place}\n` };
    }
  }

  /**
   * A file shown and not kept. The full view names it after its session, so a second look finds the same file.
   * The shared view names it after the moment: a file name is printed, and in that view the id is not shown.
   */
  #temporaryName(sessionId: string, provider: Provider, share: boolean): string {
    return share ? `agentwhy-shared-${fileStamp(this.#dependencies.now)}.html` : `agentwhy-${sessionKey({ id: sessionId, provider })}.html`;
  }
}

/**
 * Where a file went, as the view may say it. The full view says it as written. The shared view says it relative to
 * the project where the file is inside one, and not at all where it is not.
 *
 * **Corrected 2026-09-14 after a review:** `--share --open` printed the temporary file's absolute path, and the
 * file was named after the session - both things the shared view promises not to show.
 */
function whereFor(path: string, share: boolean, root: ProjectRoot): string | undefined {
  if (!share) return path;
  return insideProject(path, root) ? displayPath(path, root) : undefined;
}
