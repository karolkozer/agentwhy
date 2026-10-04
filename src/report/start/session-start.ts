// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { dirname, join, relative, resolve } from 'node:path';
import type { Policy } from '../../core/policy/policy.ts';
import type { Redacted } from '../../core/redaction/redacted.ts';
import { noStoreAnywhere, sessionKey, type SessionCatalogue, type SessionSummary } from '../../core/session-catalogue.ts';
import { splitBySince, type Since } from '../../core/session-filter.ts';
import type { EntryPoint } from '../../core/entry-point.ts';
import { recogniseAll, type SessionRecognition, type SessionTitles } from '../../core/session-titles.ts';
import type { Browser } from '../../ports/browser.ts';
import { isDirectory, type DirectoryReader } from '../../ports/directory-reader.ts';
import type { FileReader } from '../../ports/file-reader.ts';
import { FileAccessError } from '../../ports/file-access-error.ts';
import type { FileWriter } from '../../ports/file-writer.ts';
import { contentVersion } from '../../shared/content-version.ts';
import { fileStamp } from '../../shared/file-stamp.ts';
import { printable } from '../../shared/printable.ts';
import type { Renderer } from '../../shared/renderer.ts';
import { digestOf, type ActionsDigest } from '../check/actions-digest.ts';
import type { SessionActions } from '../check/session-actions.ts';
import type { SessionStories } from '../render/report-page/file-story.ts';
import { homeRelative } from '../render/home-relative.ts';
import { projectName } from './app-nav.ts';
import type { TellListPaths, TellLists } from '../private-files/tell-lists.ts';
import { choosePolicy, policyRefusal } from '../choose-policy.ts';
import type { ReportUseCase } from '../report-use-case.ts';
import { checkOf, checkWithMarks, type NamedActions } from '../check/check-lines.ts';
import { recordMark, recordUnmark } from '../check/mark-request.ts';
import type { LocalRequest, LocalResponse, LocalServer, Serving } from '../../ports/local-server.ts';
import type { Printer } from '../../ports/printer.ts';
import { indexHandler, type ChooseAnswer, type PastRunAnswer, type SwitchFrom } from './serve/index-handler.ts';
import { movedPage } from './projects/moved-page.ts';
import { nearestProject } from '../../core/nearest-project.ts';
import type { FolderChooser } from '../../ports/folder-chooser.ts';
import { translator, type Lang } from '../render/report-copy.ts';
import { hookComplete, readSettingsFile, type SettingsRead } from './settings-files.ts';
import { indexProjects } from './projects/index-projects.ts';
import type { ProjectCatalogue, ProjectListing } from '../../core/project-catalogue.ts';
import { NOT_A_PROJECT, type SetupUseCase } from '../../setup/project-setup.ts';
import { notAProject, type NotAProject } from '../../setup/not-a-project.ts';
import { inTemporarySpace } from './projects/temporary-space.ts';
import { inChatFolder } from '../../adapter/codex/contract/chat-folders.ts';
import { behind } from '../../setup/behind.ts';
import type { AgentwhyInvocation } from '../../ports/agentwhy-invocation.ts';
import { modeChange, onlyTakesOut, settingsChangeToSetup } from './serve/settings-setup.ts';
import { DEFAULT_THRESHOLD } from '../watch/agent-alert.ts';
import { DEFAULT_CHANNELS, DEFAULT_CLEAN, DEFAULT_SAID_AS } from '../watch/notice-choices.ts';
import type { NoticeSettings, NoticeSettingsView } from '../watch/notice-settings.ts';
import { actionsAfterMarks, markLines, marksInRange, standingMarks, type Mark, type MarkResult } from '../check/marks.ts';
import type { MarkStore } from '../../ports/mark-store.ts';
import type { CheckedStore } from '../../ports/checked-store.ts';
import type { OnboardingStore } from '../../ports/onboarding-store.ts';
import { finishOnboarding, type FinishAnswer } from './onboarding/finish-onboarding.ts';
import { welcomeIn, type WelcomeFacts } from './onboarding/welcome-decision.ts';
import { WHO_STEP } from './onboarding/onboarding-script.ts';
import type { OnboardingChoices } from './onboarding/onboarding-changes.ts';
import { repositoryAbove } from './repository.ts';
import { pageStopped, quietlySaid, startSaid, type StartSaid, type TerminalView } from './render/start-words.ts';
import { PROJECT_HOOKS } from '../../adapter/codex/contract/hooks.ts';
import { codexCheckState } from '../../adapter/codex/settings/codex-check.ts';
import { codexRefuseIn } from '../../adapter/codex/settings/codex-hooks.ts';
import type { IndexEntry, IndexFile, IndexHooks, IndexNotices, IndexOnboarding, IndexProjects, IndexReport, IndexRule, IndexSettings, SessionIndex, SettingsFile } from './session-index.ts';
import { SETTINGS_FILES } from '../../adapter/claude-code/contract/settings.ts';
import { rulesReadByHooks } from '../../adapter/claude-code/settings/hook-entries.ts';
import type { AgentwhyHook, RulesRead } from '../../adapter/claude-code/settings/hook-entries.ts';
import { fileRulesIn, isDenied } from '../../adapter/claude-code/settings/deny-entries.ts';
import { fileRulePathOf, toPattern } from '../../adapter/claude-code/policy/deny-rules.ts';
import { nothingSavedHere } from '../nothing-saved-here.ts';

const DAY = 86_400_000;

/**
 * The patterns the page lists: the ones the policy read, and then any rule the project's own settings files hold
 * that the policy has no pattern for. The second set is what a change made on the page adds, and a run reading
 * the built-in list or a policy file cannot see it: without this, protecting a file wrote the rule and the list
 * came back looking exactly as it had, which reads as nothing having happened.
 */
function alsoProtected(patterns: readonly string[], mine: Readonly<Record<string, IndexRule>> | undefined): readonly string[] {
  if (mine === undefined) return patterns;
  const held = new Set(patterns);
  return [...patterns, ...Object.keys(mine).filter((pattern) => !held.has(pattern))];
}

/**
 * The width of a terminal report `start` never prints. Each session's report is run for its HTML, and the text
 * it also produces is discarded, so this only has to be a valid width.
 */
const DISCARDED_WIDTH = 100;

export interface StartOptions {
  readonly since: Since;
  readonly out?: string;
  /** Chosen once for the run, and that one policy is given to every report: the same rules read every session. */
  readonly policyPath?: string;
  readonly settingsPath?: string;
  readonly open: boolean;
  readonly share: boolean;
  /** Serve the page so a mark is recorded from it at once (R50). Default: when the page is opened. */
  readonly serve?: boolean;
  /**
   * A conversation, by its key, whose report is the page opened in place of the index
   * (`2026-10-02-said-where-the-person-is.md` SW10): what the agent runs when the person says yes to its report, so the
   * report opens beside every conversation and its "All conversations" leads somewhere. Written whatever the range.
   */
  readonly session?: string;
  /** Say where the page is, and nothing of what the reports found: the agent is the reader (SW11, as `report`'s R19). */
  readonly quiet?: boolean;
}

/**
 * `written` also covers a run in which nothing opened: the files are there, and that is what was asked for.
 * `refused` is a directory inside a repository, or a policy file that was refused.
 */
export type StartOutcome = 'written' | 'no-sessions' | 'refused' | 'unwritable';

export interface StartResult {
  readonly outcome: StartOutcome;
  readonly output: string;
}

export interface StartUseCase {
  run(options: StartOptions): Promise<StartResult>;
}

export interface SessionStartDependencies {
  /** The lists of files a person asked only to be told about (F57), read with the policy wherever it is chosen. */
  readonly tell?: TellListPaths;
  /**
   * PF2 of `2026-10-02-a-page-not-a-file.md`: a served run remembered as this project's running server, so that a
   * later `start --detach` - what the agent runs on a yes - opens its pages instead of starting another. Forgotten when
   * it stops. Absent: nothing is remembered.
   */
  readonly pageServer?: { write(url: string): Promise<void>; remove(): Promise<void> };
  /** The same lists, for the Settings view to show and its switch to write (F57). Absent: the switch is not offered. */
  readonly tellLists?: TellLists;
  /**
   * The setup a change in the served Settings view runs through (`worth-running-every-day` R58). Absent where a
   * run cannot write settings, and then the page's Settings view offers the command to copy instead (R61).
   */
  readonly setup?: SetupUseCase;
  /**
   * How this agentwhy runs, and its version: what tells the page that the project's hooks run an older release
   * (`nothing-updates-by-itself.md` U2). No request is made to know it (U3). Absent: no page is told of an update.
   */
  readonly invocation?: AgentwhyInvocation;
  /**
   * Whether Codex is used on this computer, which makes this project one that uses Codex for Settings' Codex line
   * (`codex-blocks-too` CK6, amended 2026-10-01). Absent: only the project's own signs are read.
   */
  readonly codexOnThisComputer?: () => Promise<boolean>;
  /**
   * What this person chose to be told when a turn ends, read for the Notifications panel and written by it
   * (`the-agent-tells-you.md` R26, R26a). Absent where this run has no such file to read - a shared page.
   */
  readonly notices?: NoticeSettings;
  readonly catalogue: SessionCatalogue;
  readonly report: ReportUseCase;
  readonly files: FileWriter;
  /** Reads the policy, once, before the run writes anything. */
  readonly policyFiles: FileReader;
  readonly directories: DirectoryReader;
  readonly browser: Browser;
  readonly renderer: Renderer<SessionIndex>;
  /**
   * Pages written beside `index.html` from the same model, by file name, and served with it. Each is rendered again
   * whenever the index is, so a change made on any of them shows on all of them.
   */
  readonly pages?: Readonly<Record<string, Renderer<SessionIndex>>>;
  /** The IANA time zone the page's days and times are read in (`SessionIndex.timeZone`). Absent means UTC. */
  readonly timeZone?: string;
  /** The counts `start` prints above the index (`specs/2026-09-16-worth-running-every-day.md` R17). */
  readonly digest: Renderer<ActionsDigest>;
  /** The person's record of what they did about a file (`worth-running-every-day` R33). */
  readonly marks: MarkStore;
  /**
   * The conversations a person asked to check although they were older than a run (F55): read here as in range, and
   * added to when the page asks for one. Absent: every run reads its range and nothing more, and nothing is remembered.
   */
  readonly checked?: CheckedStore;
  /**
   * The onboarding (`.ai/specs/2026-09-24-onboarding.md`): its page, the file it is written as, and the record that it
   * was finished. Written and served with every served run, so Settings can lead back to it (W25); opened in place of
   * the index only for a project nobody has set up (W23). Absent: it is neither written nor opened.
   */
  readonly onboarding?: { readonly page: Renderer<SessionIndex>; readonly file: string; readonly store: OnboardingStore };
  /** What a person finds a session by on the page. Never read under `--share`. */
  readonly titles: SessionTitles;
  /** The person's projects, for the window the sidebar's card opens (`which-project.md` V9-V11). Absent: no window. */
  readonly projects?: ProjectCatalogue;
  /**
   * Show another of the person's projects in this tab (`which-project.md` V14): the shell starts the run for that folder
   * and answers with its page's address once it serves. Absent: no project offers a way to it.
   */
  readonly switchTo?: (folder: string, since: string, from: SwitchFrom) => Promise<{ readonly url: string } | { readonly failed: string }>;
  /** This run was started for a page that switched to it (V14, V15): it opens no browser, and hands its address here. */
  readonly handedOver?: (url: string) => void;
  /**
   * Where that page asked from (V16). From the onboarding's project step the run opens its own onboarding at *Who*,
   * whatever W23 says - the person is in the middle of a setup; from the window, W23's page, the onboarding at *Who*.
   */
  readonly arrivedFrom?: SwitchFrom;
  /**
   * V14, amended 2026-09-28: the run says the token its pages carry once it serves, and every run of this process is
   * known by it after - so a page of a project shown earlier, reached with "Back", is told what happened and offered
   * the way back, at the address the process kept.
   */
  readonly served?: (token: string) => void;
  readonly pastRuns?: () => readonly { readonly token: string; readonly folder: string }[];
  /** The computer's own folder window (V12). Absent, or not available here: the list offers no **Choose a folder…**. */
  readonly folderChooser?: FolderChooser;
  readonly workingDirectory: string;
  /**
   * The person's home directory, so a page can say where the project is as `~/Projects/shop`
   * (`.ai/specs/2026-09-27-which-project.md` V1). Absent: the page names the folder and not where it is.
   */
  readonly home?: string;
  /** The same directory with every link followed, where `home` reaches it through one (`notAProject`). */
  readonly realHome?: string;
  readonly temporaryDirectory: string;
  /** When the run started, read once in the shell: every age on the page is measured from it. */
  readonly now: number;
  /** The loopback server a page is served from (R50). Absent: the page is only ever a file. */
  readonly server?: LocalServer;
  /** Says where the page is served before `start` waits on it. */
  readonly printer?: Printer;
  /**
   * How the terminal this run writes to is drawn on: the wordmark above the answer, and colour over it. Decided
   * in the shell like every other colour (`findings-worth-reading` R15); absent, nothing is drawn but the words.
   */
  readonly terminal?: TerminalView;
  /** The random path segment of a served page (R51). */
  readonly token?: () => string;
  /** The moment a mark made on a served page is recorded with, which is later than `now`. */
  readonly clock?: () => number;
  /**
   * Milliseconds on a clock that only moves forward, for spacing work out (`live-pages` L4). Absent: nothing is spaced,
   * and a session that grew is read again on the next refresh whenever that is.
   */
  readonly elapsed?: () => number;
}

/**
 * live-pages L4, LD2: a conversation that is still growing - the one the agent is working in - is read again at most
 * this often, however often its page asks. A 65 MB session takes about 0.85 s to read (`the-agent-tells-you` R28).
 */
const GROWING_MS = 5_000;

/** R54: a page nobody has used for this long stops being served. */
const IDLE_MS = 30 * 60 * 1000;
/** R52: a mark is a path and a note; nothing a page sends needs more. */
const MAX_BODY = 16 * 1024;

/**
 * `agentwhy start`: every session of this project on one page, and a report for each one inside the range.
 *
 * One run reads what the range selects - and the end of every listed transcript, for the title its row is found by -
 * and writes a directory of self-contained files. A page it opens is served from 127.0.0.1 behind a token until it
 * has been idle for a while, so a mark made on it is recorded at once (`worth-running-every-day` R50-R54, amending
 * spec §2); `--no-open`, `--no-serve` and `--share` write and return, and the page is then a file.
 */
export class SessionStart implements StartUseCase {
  readonly #dependencies: SessionStartDependencies;
  /** The version of the agentwhy running, read once a run (`nothing-updates-by-itself.md` U2). */
  #serving: Promise<string | undefined> | undefined;

  constructor(dependencies: SessionStartDependencies) {
    this.#dependencies = dependencies;
  }

  async run(options: StartOptions): Promise<StartResult> {
    const { catalogue, workingDirectory, temporaryDirectory, now, directories, files, policyFiles } = this.#dependencies;

    const listing = await catalogue.list(workingDirectory);
    const notHere = this.#notAProject(workingDirectory);
    // R50: whether the pages will be served is known before any is written, so a report can say where it may write.
    // A server that then fails to start leaves a page that tries, is refused by nothing, and hands over the command.
    const served = !options.share && (options.serve ?? options.open) && this.#dependencies.server !== undefined;
    // W23: whether this run opens the onboarding - decided before an empty listing answers, because a project with no
    // conversations yet is where setting up helps most, and its reader cannot run `init` (W1a).
    const welcome = served ? await this.#welcome(workingDirectory) : undefined;
    // which-project V16: a run the onboarding's project step switched to opens that project's onboarding, whatever W23
    // says - the person is in the middle of a setup, and the step chose this project for it.
    const arrivedFrom = this.#dependencies.arrivedFrom;
    // AW1 (`the-address-opens-the-welcome`): an address asked for with `--serve` is opened by a person - the one an AI app
    // sends - so it names the page a browser this run opened would show. Not in an empty project (AW2): every empty
    // listing seen there came from a place that cannot see the person's conversations, whose address nobody can open.
    const anyConversation = listing.found && listing.sessions.length > 0;
    const opensWelcome = welcome !== undefined && (arrivedFrom === 'step' || ((options.open || (options.serve === true && anyConversation)) && welcome.opens));
    if ((!listing.found || listing.sessions.length === 0) && !opensWelcome) {
      return {
        outcome: 'no-sessions',
        // Every place looked in, one per AI: "looked in the wrong place" is only answerable where each is named.
        // R28, amended 2026-10-01: at a terminal only - a run that would open a page keeps W1a's words, naming no command.
        output: noStoreAnywhere(listing) && notHere === undefined && !(served && options.open)
          ? nothingSavedHere(
            'Claude Code or Codex',
            listing.searched.map((place) => place.directory).join(' and '),
            'use Claude Code or Codex here, then run agentwhy start again - or run agentwhy init now, to be protected in Claude Code before there is history to check.',
          )
          : noSessions(listing.searched.map((place) => place.directory).join(' and ') || listing.directory, projectName(workingDirectory), served && options.open, welcome?.setUp === true, notHere),
      };
    }

    // Resolved against the working directory given, never against whatever the process happens to be standing in.
    const out = resolve(workingDirectory, options.out ?? join(temporaryDirectory, `agentwhy-start-${fileStamp(now)}`));

    // Chosen once and before anything is written: a refused file used to be found by the first report, after the
    // directory existed and with reports in it that no index would ever link or explain. Found by a review.
    const chosen = await choosePolicy(options, policyFiles, this.#dependencies.tell);
    if ('errors' in chosen) return { outcome: 'refused', output: policyRefusal(chosen.errors) };

    const repository = await repositoryAbove(out, directories);
    if (repository !== undefined) {
      return {
        outcome: 'refused',
        output:
          `Refusing to write inside a repository: ${out}\n` +
          `The files describe sessions and would be one commit away from being published. Choose a directory outside ${repository}.\n`,
      };
    }

    try {
      await files.ensureDirectory(out);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return { outcome: 'unwritable', output: `The directory could not be created: ${out}\n` };
    }

    // F55: a conversation a person once asked to check is read by every run after, as if it were in range - the button is
    // pressed once, not every morning. A list that cannot be read leaves the run its range, as it always had.
    const asked = new Set(this.#dependencies.checked === undefined ? [] : (await this.#dependencies.checked.read()).ids);
    // SW10: the conversation a run was asked to open is written however long ago it was active. Not recorded as checked.
    if (options.session !== undefined) asked.add(options.session);
    // M5: each report is drawn with the marks that still hold for its session. A shared page carries none (R37), and a
    // record that cannot be read leaves every file to do rather than guessing which were done (invariant 4).
    const standingAtStart = options.share ? new Map<string, Mark>() : standingMarks((await this.#dependencies.marks.read()).records);
    /*
     * R75: a served page is read again and again while the person keeps working - new conversations start, open ones
     * grow, and a file is marked done on another page. What the run knows is kept here and brought up to date each time
     * a page is read (`refresh`): a report is written again only where its session changed, or a mark on one of its own
     * files did, so reading an unchanged page costs a listing and nothing more.
     */
    let entries: IndexEntry[] = [];
    // Kept whole, marks not yet applied: the page is rendered again from these after a mark is made from it (R52).
    let read: ReadSession[] = [];
    let unreadable = 0;
    let nameOfId = new Map<string, string>();
    let outOfRange: SessionSummary[] = [];
    const reports = new Map<string, KeptReport>();
    // live-pages L1: the version of every served file, by name, as last written.
    const versions = new Map<string, string>();
    const elapsed = this.#dependencies.elapsed;
    const titles = new Map<string, { readonly modifiedAt: number } & SessionRecognition>();
    // which-project V4: where the listed conversations were held, counted from the same read as their titles.
    let entryPoints: Partial<Record<EntryPoint, number>> = {};
    // which-project V17: the projects as this run last listed them - the only ones a page may switch to, by their ids.
    let listed: ProjectListing | undefined;
    // V14: set once a page has moved to another project's run, so this one ends without a word of its own.
    let switchedAway = false;

    /** Every row and report from one listing, reusing what has not changed. A refusal is said as the one it is. */
    // R75, F57: the policy the reports are read under, as it is now. A file switched to Tell me or back to Block in
    // Settings changes what every report says about it, so a changed policy writes every report again.
    let policyNow = chosen.policy;
    const sync = async (sessions: readonly SessionSummary[], standing: ReadonlyMap<string, Mark>): Promise<string | undefined> => {
      const policyKey = keyOf(policyNow);
      const { inRange, outOfRange: older } = splitBySince(sessions, options.since.since);
      const generatedIds = new Set([...inRange, ...older.filter((session) => asked.has(sessionKey(session)))].map((session) => sessionKey(session)));
      // A title is user content, and a shared page is one that leaves this machine: it is not even read. A session that
      // has grown may have a new last prompt, so its title is read again with it. Both desktop apps name a conversation
      // in a file of their own, seconds after it starts (`what-codex-wrote` §2.9, X28a; `claude-desktop-conversations`
      // CD5) - found by the maintainer, a row drawn in those seconds stayed untitled once its transcript stopped
      // changing - so a row with no title asks again. That ask is a lookup in the app's own names, read again only
      // where they changed; the adapter keeps an unchanged transcript's tail, so it is not read again (CD5).
      if (!options.share) {
        const stale = sessions.filter((session) => {
          const known = titles.get(sessionKey(session));
          return known?.modifiedAt !== session.modifiedAt || known.title === undefined;
        });
        const read_ = await recogniseAll(this.#dependencies.titles, stale);
        stale.forEach((session, at) => titles.set(sessionKey(session), { modifiedAt: session.modifiedAt, ...read_[at] }));
      }

      const nextEntries: IndexEntry[] = [];
      const nextRead: ReadSession[] = [];
      const nextNames = new Map<string, string>();
      let nextUnreadable = 0;
      for (const [position, session] of sessions.entries()) {
        // A session is named by its key: its id for Claude Code, as always, and `codex-…` for Codex, so two AIs' equal ids
        // never share a row, a file or a cached report (`.ai/plans/2026-09-29-what-codex-wrote.md` step 5).
        const name = options.share ? `Session ${position + 1}` : sessionKey(session);
        nextNames.set(sessionKey(session), name);
        let report: GeneratedReport | { readonly kind: 'outside-range' } = { kind: 'outside-range' };
        if (generatedIds.has(sessionKey(session))) {
          const file = options.share ? `session-${position + 1}.html` : `${sessionKey(session)}.html`;
          const marks = marksFor(session.modifiedAt, standing);
          const kept = reports.get(sessionKey(session));
          const same = kept !== undefined && kept.file === file && kept.policy === policyKey && kept.marks === marksOn(kept.report, marks);
          // L4: only growth waits; a mark or a policy changed is the person's own doing, and shown at once.
          const growingTooSoon = same && elapsed !== undefined && kept.modifiedAt !== session.modifiedAt && elapsed() - kept.writtenAt < GROWING_MS;
          if (same && (kept.modifiedAt === session.modifiedAt || growingTooSoon)) {
            report = kept.report;
          } else {
            const made = await this.#generate(session, out, file, options, policyNow, { marks, served, title: titles.get(sessionKey(session))?.title });
            // Every report is handed the policy chosen above, so none reads a file of its own. Should one refuse all the
            // same, it is said as the one refusal it would be, never as a page of sessions that could not be read.
            if (made.kind === 'policy-refused') return made.output;
            const drawn = { file, modifiedAt: session.modifiedAt, policy: policyKey, marks: marksOn(made, marks) };
            reports.set(sessionKey(session), { ...drawn, report: made, writtenAt: elapsed?.() ?? 0 });
            // L1: a report's version is what it was drawn from - the same inputs draw the same page.
            if (made.kind === 'generated') versions.set(file, contentVersion(JSON.stringify(drawn)));
            report = made;
          }
        }
        // The digest counts what was analysed, whether or not its page could be written: a report whose file failed still
        // read the session, and a value to rotate in it must not vanish from the terminal because a disk was full.
        if (report.kind !== 'outside-range') {
          if (report.actions === undefined) nextUnreadable += 1;
          else nextRead.push({ id: sessionKey(session), name, modifiedAt: session.modifiedAt, actions: report.actions });
        }
        nextEntries.push(entryOf(name, titles.get(sessionKey(session))?.title, session, report));
      }

      entries = nextEntries;
      read = nextRead;
      unreadable = nextUnreadable;
      nameOfId = nextNames;
      entryPoints = countedBy(sessions.map((session) => titles.get(sessionKey(session))?.entryPoint));
      outOfRange = older.filter((session) => !asked.has(sessionKey(session)));
      return undefined;
    };

    const refused = await sync(listing.sessions, standingAtStart);
    if (refused !== undefined) return { outcome: 'refused', output: refused };

    // F55: a conversation this run left out, written when the page asks for it - by the same report, under the same
    // policy, with the marks as they stand now - and from then on counted as if the run had covered it.
    const include = async (name: string): Promise<{ readonly written: boolean; readonly said: string; readonly file?: string }> => {
      const session = outOfRange.find((each) => sessionKey(each) === name);
      if (session === undefined) return { written: false, said: `${name} is not a conversation this run left out.` };
      asked.add(sessionKey(session));
      const refusal = await refresh({ afterWrite: true });
      if (refusal !== undefined) return { written: false, said: refusal.trim() };
      const report = entries.find((entry) => entry.name === name)?.report;
      if (report?.kind !== 'generated') return { written: false, said: `${name} could not be read, so no report was written.` };
      // Remembered, so the next run reads it too. A list that cannot be written still leaves this page's report.
      const kept = await this.#dependencies.checked?.add(sessionKey(session), (this.#dependencies.clock ?? (() => this.#dependencies.now))());
      return {
        written: true,
        said: kept === false ? `The report of ${name} was written; it could not be remembered, so the next run will ask again.` : `The report of ${name} was written.`,
        file: report.file,
      };
    };

    /** The index and the digest's marks, from the record as it is now: once for the run, and after every served write. */
    const build = async () => {
      // Read before any line is drawn: a file marked done leaves the lists until a session after the mark reaches it (R35).
      const reading = await this.#dependencies.marks.read();
      const standing = standingMarks(reading.records);
      const after = read.map((session) => ({ ...session, actions: actionsAfterMarks(session.actions, session.modifiedAt, standing) }));
      // R60: after a write the view is re-read from the file, so the rules are read again here rather than kept
      // from the run. Every report was handed the policy chosen above and none of them is drawn again; this is
      // the Settings view alone, which is a control surface and has to show what the file now holds. A policy
      // that has since become unreadable leaves the run's own, rather than an empty list nobody wrote.
      const now_ = options.share ? chosen : await choosePolicy(options, policyFiles, this.#dependencies.tell).catch(() => chosen);
      const policy = ('errors' in now_ ? chosen : now_).policy;
      const project = options.share ? {} : await this.#settingsNow(workingDirectory, listing.sessions.some((session) => session.provider === 'codex'));
      // What this person chose to be told, for the panel that changes it. A shared page offers no choices at all.
      const notices = options.share ? undefined : await this.#noticesNow();
      // F57: read again with every refresh, as the settings files are, so a switch shows what the list now holds.
      const told = options.share || this.#dependencies.tellLists === undefined ? undefined : await this.#dependencies.tellLists.read();
      const known = await this.#projectsNow(served && !options.share, workingDirectory);
      listed = known.listing;
      const index: SessionIndex = {
        now,
        ...(this.#dependencies.timeZone === undefined ? {} : { timeZone: this.#dependencies.timeZone }),
        since: options.since.since,
        asked: options.since.asked,
        ...(options.share ? {} : { project: workingDirectory }),
        ...(options.share || this.#dependencies.home === undefined ? {} : { place: homeRelative(workingDirectory, this.#dependencies.home) }),
        ...(options.share ? {} : { entryPoints }),
        ...(known.projects === undefined ? {} : { projects: known.projects }),
        shared: options.share,
        widen: widenTo(outOfRange, now),
        entries,
        // The rules this run read, for the Settings view. The page says which policy it was rather than leaving
        // the question to the reports' own feet.
        settings: {
          level: policy.level,
          // A rule written into the project's own files after the run started is protected now and the hooks read
          // it, so it is in the list even where the policy this run read cannot see it - a pattern added here that
          // never appeared would read as an add that did nothing.
          protected: alsoProtected(policy.protected.map((entry) => entry.pattern), project.mine),
          allowed: policy.allowed,
          origin: policy.origin,
          ...(options.share ? {} : { out }),
          // R60: a switch shows what the file holds. A shared page names no machine and offers no switch, so it
          // carries no hook state either.
          ...project,
          ...(told === undefined ? {} : { told }),
          ...(notices === undefined ? {} : { notices }),
        },
        // which-project V6, V7: a run in the home directory or a root is in no project, and its pages say so.
        ...(notHere === undefined ? {} : { notAProject: notHere }),
        // W24, W25: the onboarding is served with this run - whether its intro plays, and that Settings may lead to it.
        ...(welcome === undefined ? {} : { onboarding: { intro: welcome.intro, ...(welcome.atProject ? { atProject: true } : {}) } satisfies IndexOnboarding }),
        ...(read.length === 0 && reading.records.length === 0 && !reading.failed
          ? {}
          : {
              check: checkWithMarks(after.map((session): NamedActions => ({ name: session.name, actions: session.actions })), {
                standing,
                lines: markLines(reading.records),
                unreadable: reading.failed,
                nameOf: (id) => nameOfId.get(id),
                keepNotes: !options.share,
              }),
            }),
      };
      const { done, reopened } = marksInRange(read.map((session) => session.actions), after.map((session) => session.actions), standing);
      const marks = standing.size === 0 && !reading.failed
        ? undefined
        : { done, reopened: reopened.map(({ path, result, at }) => ({ path, result, at })), unreadable: reading.failed };
      return { index, after, marks };
    };

    const indexPath = join(out, 'index.html');
    const onboarding = this.#dependencies.onboarding;
    // W1: the onboarding is a page like the others where it is served, and only there - it writes, so never as a file.
    const pages: [string, Renderer<SessionIndex>][] = [
      ...Object.entries(this.#dependencies.pages ?? {}),
      ...(welcome === undefined || onboarding === undefined ? [] : [[onboarding.file, onboarding.page] as [string, Renderer<SessionIndex>]]),
    ];
    // The page being written, so a failure names the one that failed rather than the index, which may already be there.
    let writing = indexPath;
    const writePages = async (index: SessionIndex): Promise<void> => {
      writing = indexPath;
      const rendered = this.#dependencies.renderer.render(index);
      await files.writeText(indexPath, rendered);
      versions.set('index.html', contentVersion(rendered));
      for (const [name, renderer] of pages) {
        writing = join(out, name);
        const page = renderer.render(index);
        await files.writeText(writing, page);
        versions.set(name, contentVersion(page));
      }
    };
    const first = await build();
    try {
      await writePages(first.index);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return { outcome: 'unwritable', output: `The index could not be written: ${writing}\n` };
    }

    const digest = digestOf(first.after.map((session) => session.actions), {
      asked: options.since.asked,
      sessionsUnreadable: unreadable,
      policyKind: chosen.policy.origin.kind,
      ...(first.marks === undefined ? {} : { marks: first.marks }),
    });

    // R75: what a served page may be sent grows with the conversations it lists.
    const servable = new Set(['index.html', ...pages.map(([name]) => name)]);
    const reportsServed = (): void => {
      for (const entry of entries) if (entry.report.kind === 'generated') servable.add(entry.report.file);
    };
    reportsServed();

    /*
     * R75: the conversations and the marks as they are now, drawn into every page. A page read while a refresh runs is
     * answered by that refresh; a write is not, because the refresh it would join began before the write - it waits,
     * then runs again. A listing that finds nothing now (a directory moved, a disk gone) leaves the conversations as
     * they were, and the pages are still drawn again: Settings shows what the files hold (R60), in a project with no
     * conversations yet too (W1a).
     */
    let refreshing: Promise<string | undefined> | undefined;
    const refresh = async (when: { readonly afterWrite: boolean }): Promise<string | undefined> => {
      if (refreshing !== undefined && !when.afterWrite) return refreshing;
      while (refreshing !== undefined) await refreshing;
      const running = (async (): Promise<string | undefined> => {
        const now_ = await catalogue.list(workingDirectory);
        if (now_.found && now_.sessions.length > 0) {
          // A policy that cannot be read now leaves the one the pages were drawn under, rather than rules nobody chose.
          const again = await choosePolicy(options, policyFiles, this.#dependencies.tell).catch(() => undefined);
          if (again !== undefined && !('errors' in again)) policyNow = again.policy;
          const refusal = await sync(now_.sessions, standingMarks((await this.#dependencies.marks.read()).records));
          if (refusal !== undefined) return refusal;
          reportsServed();
        }
        await writePages((await build()).index);
        return undefined;
      })();
      refreshing = running;
      try {
        return await running;
      } finally {
        if (refreshing === running) refreshing = undefined;
      }
    };

    // W15: Finish writes through the routes Settings writes with, reading the settings as the files hold them now. Never
    // in the home directory (which-project V7): nothing is set up there, and no `done` line is written for it.
    const { setup, notices } = this.#dependencies;
    const finish = welcome === undefined || notHere !== undefined || onboarding === undefined || setup === undefined || notices === undefined
      ? undefined
      : (choices: OnboardingChoices): Promise<FinishAnswer> => finishOnboarding({
          settingsNow: async () => (await build()).index.settings as IndexSettings,
          settings: (change) => settingsChangeToSetup(setup, change),
          // W12a: a file switched Block or Tell me is written as Settings' own switch writes it, told lists included.
          ...(this.#dependencies.tellLists === undefined ? {} : { mode: (change) => modeChange(setup, this.#dependencies.tellLists as TellLists, change) }),
          notify: (change) => notices.change(change),
          store: onboarding.store,
          clock: this.#dependencies.clock ?? (() => this.#dependencies.now),
        }, choices);

    // which-project V14, V17: another project, by the id this run listed it under, shown in this tab by a run of its own.
    const switchTo = this.#dependencies.switchTo;
    // V12: folders chosen in the computer's window, under ids this run gave them - so the page never names a path.
    const chosenFolders = new Map<string, string>();
    const switchToFolder = async (folder: string, from: SwitchFrom): Promise<{ readonly url: string } | { readonly failed: string }> => {
      if (switchTo === undefined) return { failed: 'This run cannot show another project.' };
      const answer = await switchTo(folder, options.since.asked, from);
      if ('url' in answer) switchedAway = true;
      return answer;
    };
    const switchProject = switchTo === undefined ? undefined : async (id: string, from: SwitchFrom): Promise<{ readonly url: string } | { readonly failed: string }> => {
      const chosen = chosenFolders.get(id);
      if (chosen !== undefined) return switchToFolder(chosen, from);
      const project = listed?.projects.find((one) => one.id === id);
      if (project === undefined || project.folder === 'gone' || this.#notAProject(project.path) !== undefined) return { failed: 'That project is not one this page listed.' };
      if (relative(project.path, workingDirectory) === '') return { failed: 'That project is the one shown already.' };
      // which-project V10b: a folder the system guards was not looked into while listing; it is now, because the person
      // picked it - so the system asks them, if at all, about something they did.
      if (project.folder === 'not-looked' && !(await isDirectory(this.#dependencies.directories, project.path))) return { failed: 'This folder isn’t there anymore.' };
      return switchToFolder(project.path, from);
    };
    // V12: a folder chosen in the computer's window - shown at once where it is a project or near none, and where it lies
    // inside a project or holds some, those are offered first, with the folder itself under an id of this run's.
    const chooser = this.#dependencies.folderChooser;
    const chooseFolder = switchTo === undefined || chooser === undefined || !chooser.available ? undefined : async (lang: Lang, from: SwitchFrom): Promise<ChooseAnswer> => {
      // Where the window starts: the folder this project lies in, where its neighbours are - or, in the home directory,
      // there. Both are on this disk, so it opens at once, not in a folder a cloud keeps (VB1).
      const startIn = notHere !== undefined ? this.#dependencies.home : dirname(workingDirectory);
      const picked = await chooser.choose(translator(lang)('proj.choosePrompt'), startIn);
      if ('cancelled' in picked) return { kind: 'cancelled' };
      if ('failed' in picked) return { kind: 'failed', reason: picked.failed };
      const not = this.#notAProject(picked.chosen);
      if (not !== undefined) return { kind: 'refused', not };
      if (relative(picked.chosen, workingDirectory) === '') return { kind: 'here' };
      const near = nearestProject(picked.chosen, listed ?? { projects: [], unreadable: 0 }, (path) => this.#notAProject(path) !== undefined);
      // Where each folder is, as the page says it (`~/Projects/my-app/src`): the page shows it and never sends it back.
      const placeOf = (path: string): { readonly place?: string } => this.#dependencies.home === undefined ? {} : { place: homeRelative(path, this.#dependencies.home) };
      if (near.kind === 'above' || near.kind === 'inside') {
        const id = `folder-${chosenFolders.size + 1}`;
        chosenFolders.set(id, picked.chosen);
        // The project shown is offered too, marked: on the onboarding's step choosing it goes on to Who in the page.
        return {
          kind: 'near',
          above: near.kind === 'above',
          chosen: { id, name: projectName(picked.chosen), ...placeOf(picked.chosen) },
          projects: (near.kind === 'above' ? [near.project] : near.projects.slice(0, 3)).map((project) => ({
            id: project.id,
            name: projectName(project.path),
            ...placeOf(project.path),
            ...(relative(project.path, workingDirectory) === '' ? { here: true as const } : {}),
          })),
        };
      }
      const shown = near.kind === 'itself' ? near.project.path : picked.chosen;
      const answer = await switchToFolder(shown, from);
      return 'url' in answer ? { kind: 'switched', url: answer.url, name: projectName(shown) } : { kind: 'failed', reason: answer.failed };
    };

    // V14, amended: the pages of a project this process showed before - reached by "Back" - are told it shows another,
    // and may ask for it again; the project shown again since sends them to this run's own pages.
    const pastRuns = this.#dependencies.pastRuns;
    const pastRun = switchTo === undefined || pastRuns === undefined ? undefined : (other: string, urlOf: (name: string) => string): PastRunAnswer | undefined => {
      const earlier = pastRuns().find((one) => one.token === other);
      if (earlier === undefined) return undefined;
      const home = this.#dependencies.home;
      const named = (folder: string) => ({ name: projectName(folder), ...(home === undefined ? {} : { place: homeRelative(folder, home) }) });
      // **Go to blog** is the page this run would open now (W23): its onboarding while nobody has set it up - at Who,
      // where a switch brought the person - and its conversations once someone has (the maintainer, 2026-09-29).
      const nowUrl = async (): Promise<string> => {
        const setUpNow = onboarding === undefined || (await this.#welcome(workingDirectory))?.opens !== true;
        return setUpNow ? urlOf('index.html') : urlOf(onboarding.file) + (arrivedFrom === undefined ? '' : `#${WHO_STEP}`);
      };
      return {
        same: relative(earlier.folder, workingDirectory) === '',
        page: async () => movedPage(named(earlier.folder), named(workingDirectory), await nowUrl()),
        back: () => switchToFolder(earlier.folder, 'window'),
      };
    };

    // R50: a page that was opened is served, so a mark made on it is recorded at once. Never a shared page (R37).
    const serving = !options.share && (options.serve ?? options.open)
      ? await this.#serve(out, indexPath, {
          servable,
          read: () => read,
          options,
          rerender: async () => {
            await refresh({ afterWrite: true });
          },
          fresh: async () => {
            await refresh({ afterWrite: false });
          },
          include,
          ...(finish === undefined ? {} : { finish }),
          ...(switchProject === undefined ? {} : { switchProject }),
          ...(chooseFolder === undefined ? {} : { chooseFolder }),
          ...(pastRun === undefined ? {} : { pastRun }),
          versionOf: (name) => {
            const version = versions.get(name);
            if (version === undefined) return undefined;
            return name === 'index.html' ? { version, conversations: entries.length } : { version };
          },
        })
      : undefined;
    // PF2: the address and its token, where a later `--detach` looks for a server to reuse. Never a shared page's.
    if (serving !== undefined && !options.share) await this.#dependencies.pageServer?.write(serving.urlOf(''));

    // W23: the onboarding is opened in place of the index where it is to be; the index otherwise, as it always was. A run
    // a page switched to opens it at *Who*: the project was chosen on the way here (which-project V16).
    // SW10: a conversation asked for by name is opened in its place - the person said yes to that report, not to a setup.
    const wanted = options.session === undefined ? undefined : reports.get(options.session);
    const sessionFile = wanted !== undefined && wanted.report.kind === 'generated' ? wanted.file : undefined;
    const openAt = sessionFile !== undefined ? (serving === undefined ? join(out, sessionFile) : serving.urlOf(sessionFile))
      : serving === undefined ? indexPath
        : opensWelcome && onboarding !== undefined ? serving.urlOf(onboarding.file) + (arrivedFrom === undefined ? '' : `#${WHO_STEP}`)
          : serving.url;
    // V15: a run a page switched to is shown in that page's tab, so it opens none of its own.
    const handedOver = this.#dependencies.handedOver;
    const opened = options.open && handedOver === undefined ? await this.#dependencies.browser.open(openAt) : true;
    const view = this.#dependencies.terminal ?? { colour: false, decorated: false };
    const said = options.quiet === true ? quietlySaid(openAt, opened && options.open, options.session === undefined || sessionFile !== undefined) : startSaid(
      {
        ...counted(entries, outOfRange.length, indexPath, first.index, opened),
        // which-project V3: the folder the run was for, said where the terminal says what it read.
        ...(options.share ? {} : { project: projectName(workingDirectory) }),
        asked: options.since.asked,
        digest: this.#dependencies.digest.render(digest),
        // Said where it happened: a page that was asked for and could not be served is what the next line is about.
        ...(serving === undefined && !options.share && (options.serve ?? options.open) && this.#dependencies.server !== undefined
          ? { servedAsFile: true }
          : {}),
        ...(serving === undefined ? {} : { url: openAt }),
        // AW3: "Opened" only where a browser or a page's tab shows it; an address handed on is said as one.
        ...(serving !== undefined && opensWelcome ? { welcome: options.open || handedOver !== undefined ? 'opened' as const : 'served' as const } : {}),
        // which-project V3: a switch says which project is shown now, and where it is.
        ...(handedOver === undefined || options.share ? {} : { nowShowing: this.#dependencies.home === undefined ? projectName(workingDirectory) : `${projectName(workingDirectory)} (${homeRelative(workingDirectory, this.#dependencies.home)})` }),
      },
      view,
    );
    if (serving === undefined) return { outcome: 'written', output: said };

    const printer = this.#dependencies.printer;
    printer?.write(said);
    handedOver?.(openAt);
    await serving.closed;
    await this.#dependencies.pageServer?.remove();
    // V14: a run a page moved away from ends quietly - the run it moved to has already said what it shows.
    if (switchedAway) return { outcome: 'written', output: '' };
    return { outcome: 'written', output: printer === undefined ? said : pageStopped(view) };
  }

  /**
   * Serves the directory this run wrote (R50-R54): the files it wrote by name, and the two writes a page can make.
   * `undefined` when there is no server, or it could not start - the page is then opened as a file, as before.
   */
  async #serve(
    out: string,
    indexPath: string,
    run: {
      /** The files the page may be sent, added to as conversations are (R75). */
      readonly servable: Set<string>;
      /** The sessions read, as they are now. */
      readonly read: () => readonly ReadSession[];
      readonly options: StartOptions;
      /** After a write: every page drawn again from what is on disk now. */
      readonly rerender: () => Promise<void>;
      /** Before a page is sent: the same, sharing a refresh already running (R75). */
      readonly fresh: () => Promise<void>;
      readonly include: (name: string) => Promise<{ readonly written: boolean; readonly said: string; readonly file?: string }>;
      /** The onboarding's Finish (W15), where the onboarding is served. */
      readonly finish?: (choices: OnboardingChoices) => Promise<FinishAnswer>;
      /** live-pages L1-L3: a served file's version now. */
      readonly versionOf: (name: string) => { readonly version: string; readonly conversations?: number } | undefined;
      /** which-project V14: another project shown in this tab, where the run can. */
      readonly switchProject?: (id: string, from: SwitchFrom) => Promise<{ readonly url: string } | { readonly failed: string }>;
      /** which-project V12: the computer's folder window, where it has one. */
      readonly chooseFolder?: (lang: Lang, from: SwitchFrom) => Promise<ChooseAnswer>;
      /** V14, amended: what a page of a project shown earlier in this process is told, by its token. */
      readonly pastRun?: (other: string, urlOf: (name: string) => string) => PastRunAnswer | undefined;
    },
  ): Promise<{ readonly url: string; readonly urlOf: (name: string) => string; readonly closed: Promise<void> } | undefined> {
    const { server, marks, policyFiles } = this.#dependencies;
    const { servable: served, options, rerender, fresh, include, finish, versionOf } = run;
    if (server === undefined) return undefined;
    const token = (this.#dependencies.token ?? (() => 'page'))();
    const clock = this.#dependencies.clock ?? (() => this.#dependencies.now);
    // The lines a mark is checked against are the check before marks, naming sessions by id (R52) - read at each mark,
    // since a conversation checked on request (F55), or one begun since the run (R75), brings lines of its own.
    const lines = (): ReturnType<typeof checkOf>['rows'] => checkOf(run.read().map((session) => ({ name: session.id, actions: session.actions }))).rows;
    // R75: a page is brought up to date before it is sent. A refresh that fails leaves the page as it last was - an
    // older page is still a page, and a request that failed over it would be none.
    const page = (request: LocalRequest): boolean =>
      request.method === 'GET' && request.path.startsWith(`/${token}/`) && (request.path.endsWith('.html') || request.path === `/${token}/`);

    let handle: ((request: LocalRequest) => Promise<LocalResponse>) | undefined;
    let serving: Serving;
    try {
      serving = await server.serve(
        async (request) => {
          if (handle === undefined) return { status: 503, type: 'text/plain', body: 'Starting.' };
          if (page(request)) await fresh().catch(() => undefined);
          return handle(request);
        },
        { idleMs: IDLE_MS, maxBody: MAX_BODY },
      );
    } catch {
      return undefined;
    }
    handle = indexHandler({
      // which-project V14, V18: the page moves to another project's run, and this server closes once it has the address.
      ...(run.switchProject === undefined ? {} : { switchProject: run.switchProject, switched: () => serving.close() }),
      ...(run.chooseFolder === undefined ? {} : { chooseFolder: run.chooseFolder }),
      ...(run.pastRun === undefined ? {} : { pastRun: (other: string) => run.pastRun?.(other, (name) => `${serving.origin}/${token}/${name}`) }),
      origin: serving.origin,
      token,
      files: served,
      read: (name) => policyFiles.readText(name === 'index.html' ? indexPath : join(out, name)),
      mark: (request) => recordMark(marks, lines(), request, { asked: options.since.asked, now: clock() }),
      unmark: (path) => recordUnmark(marks, path, clock()),
      // R58: the change becomes the `SetupOptions` the same flags would build, and runs through the same setup.
      ...(this.#dependencies.setup === undefined || options.share
        ? {}
        : {
            settings: async (change) => {
              // which-project V8: where no project is, a change that writes is refused before its first step, not at the
              // step that writes - by then a rule or a told list may already have been taken out (`onlyTakesOut`).
              const notOne = this.#notAProject(this.#dependencies.workingDirectory);
              if (notOne !== undefined && !onlyTakesOut(change)) return { outcome: 'refused', output: NOT_A_PROJECT[notOne] };
              const setup = this.#dependencies.setup as SetupUseCase;
              const lists = this.#dependencies.tellLists;
              // F57: a row's switch writes a told list as well as the settings files, so it goes where both are known.
              const answer = await (change.change === 'mode' && lists !== undefined ? modeChange(setup, lists, change) : settingsChangeToSetup(setup, change));
              // W25a: an uninstall that went through offers the onboarding again at the next run - the setup it made is gone.
              if (change.change === 'uninstall' && (answer.outcome === 'written' || answer.outcome === 'unchanged')) {
                await this.#dependencies.onboarding?.store.reset(clock());
              }
              return answer;
            },
          }),
      // R26a: the third thing the page writes, and the only one that touches no project. It goes through the same
      // use case `agentwhy notify` runs, so there is one set of rules for this file and two ways in.
      ...(this.#dependencies.notices === undefined || options.share
        ? {}
        : { notify: (change) => (this.#dependencies.notices as NoticeSettings).change(change) }),
      // F55: a report written on request becomes one of the files this server may serve. A shared page asks for none.
      ...(options.share
        ? {}
        : {
            include: async (name: string) => {
              const answer = await include(name);
              if (answer.file !== undefined) served.add(answer.file);
              return { written: answer.written, said: answer.said };
            },
          }),
      // W15: the onboarding's one request, where the onboarding is served (W1).
      ...(finish === undefined ? {} : { onboarding: finish }),
      rerender,
      versionOf,
    });
    // V14, amended: this run's pages are known by their token to every run of this process after it.
    this.#dependencies.served?.(token);
    const urlOf = (name: string): string => `${serving.origin}/${token}/${name}`;
    return { url: urlOf('index.html'), urlOf, closed: serving.closed };
  }

  /**
   * The onboarding, on a served run (W23, W24; N6): `undefined` where this run cannot serve it - no page, or nothing to
   * write through. It opens only for a project nobody has set up: never where the record says it was finished here or
   * cannot be read, nor where the project's settings cannot be read, since what runs is then not known. A project whose
   * `watch` hook already runs was set up before this page existed, and is recorded as such, silently, so that turning
   * alerts off later never brings the onboarding back.
   */
  async #welcome(workingDirectory: string): Promise<WelcomeFacts | undefined> {
    const { onboarding, setup, notices, policyFiles, home, realHome } = this.#dependencies;
    // The onboarding writes through both (W15), so a run without them names no page it could not finish.
    if (onboarding === undefined || setup === undefined || notices === undefined) return undefined;
    return welcomeIn(workingDirectory, {
      store: onboarding.store,
      files: policyFiles,
      ...(home === undefined ? {} : { home }),
      ...(realHome === undefined ? {} : { realHome }),
      now: this.#dependencies.clock ?? (() => this.#dependencies.now),
    });
  }

  /**
   * The person's projects, read again with every refresh as the settings are, since a project set up in another tab is
   * set up here too (V10). Only on a served page, which the window is drawn on, and never under `--share`.
   */
  async #projectsNow(wanted: boolean, workingDirectory: string): Promise<{ readonly projects?: IndexProjects; readonly listing?: ProjectListing }> {
    const { projects, home, onboarding, policyFiles } = this.#dependencies;
    if (!wanted || projects === undefined || home === undefined) return {};
    const listing = await projects.list();
    const noProject = (path: string): boolean => this.#notAProject(path) !== undefined;
    // V10b: a folder the ChatGPT app made for a chat with no project is a quick try too, and counted with them.
    const temporary = (path: string): boolean => inTemporarySpace(path, this.#dependencies.temporaryDirectory, home) || inChatFolder(path, home);
    // V20: a folder with no conversations of its own, inside a project that has them - where they are.
    const near = nearestProject(workingDirectory, listing, noProject);
    const above = near.kind === 'above' ? { id: near.project.id, within: relative(near.project.path, workingDirectory) } : undefined;
    const known = await indexProjects(listing, {
      files: policyFiles,
      ...(onboarding === undefined ? {} : { onboarding: onboarding.store }),
      home,
      workingDirectory,
      noProject,
      temporary,
      switchable: this.#dependencies.switchTo !== undefined,
      choosable: this.#dependencies.switchTo !== undefined && this.#dependencies.folderChooser?.available === true,
    });
    return { listing, projects: above === undefined ? known : { ...known, above } };
  }

  /** Why the working directory is not a project (V6), where the run was told the home directory to tell. */
  #notAProject(workingDirectory: string): NotAProject | undefined {
    const { home, realHome } = this.#dependencies;
    return home === undefined ? undefined : notAProject(workingDirectory, home, realHome);
  }

  /**
   * What the project's own settings file runs and protects, read the way `init` reads it: which hooks are
   * installed, and which of the run's protected patterns are deny rules this file holds - the only ones Settings
   * can take out again. A file that is absent leaves both switches off and nothing of its own protected; one that
   * cannot be parsed leaves Settings without controls at all, rather than with controls drawn from a guess.
   */
  /**
   * What holds now about being told, and which answer decides each (`the-agent-tells-you.md` R26). The panel shows
   * the answer in force rather than the file's raw contents: what a person wants to know is what will happen at the
   * end of their next turn, and which of their answers is the reason.
   */
  async #noticesNow(): Promise<IndexNotices | undefined> {
    const { notices } = this.#dependencies;
    if (notices === undefined) return undefined;

    const view = await notices.view();
    const from = (key: 'on' | 'clean' | 'say' | 'notify'): 'project' | 'everywhere' | 'default' =>
      view.forProject[key] !== undefined ? 'project' : view.defaults[key] !== undefined ? 'everywhere' : 'default';

    return {
      on: view.effective.on ?? DEFAULT_THRESHOLD,
      clean: view.effective.clean ?? DEFAULT_CLEAN,
      say: view.effective.say ?? DEFAULT_SAID_AS,
      notify: view.effective.notify ?? DEFAULT_CHANNELS,
      from: { on: from('on'), clean: from('clean'), say: from('say'), notify: from('notify') },
      path: view.path,
      unusable: view.unusable,
    };
  }

  async #settingsNow(workingDirectory: string, codexListed: boolean): Promise<{
    readonly hooks?: IndexHooks;
    readonly mine?: Readonly<Record<string, IndexRule>>;
    readonly held?: Readonly<Record<SettingsFile, readonly string[]>>;
  }> {
    const path = join(SETTINGS_FILES.directory, SETTINGS_FILES.local);
    const sharedPath = join(SETTINGS_FILES.directory, SETTINGS_FILES.shared);
    const local = await this.#settingsFile(join(workingDirectory, path));
    // The file this page writes by default is the one it cannot go on without: unreadable, there is no knowing
    // what a switch would be turning, so the view keeps its two lists and offers nothing (R62).
    if (local === 'unreadable') return {};
    // The committed file is the project's, and a project whose file cannot be parsed still has a local one that
    // can. Its rules then carry no control - the same as any rule this page did not write - rather than none of
    // the page's controls being drawn at all.
    const shared = await this.#settingsFile(join(workingDirectory, sharedPath));
    const readable = shared === 'unreadable' ? undefined : shared;

    // A hook installed in the committed file runs for this project as surely as one installed here, so the switch
    // is drawn from both files. Where both hold it, the local one is what a change would rewrite. A hook half
    // installed reads as off (`hookComplete`).
    const installed = (hook: AgentwhyHook): SettingsFile | false =>
      local !== undefined && hookComplete(local, hook) ? 'local'
        : readable !== undefined && hookComplete(readable, hook) ? 'shared'
          : false;

    const mine: Record<string, IndexRule> = {};
    const held: Record<SettingsFile, string[]> = { local: [], shared: [] };
    // The committed file first, so a pattern both files deny is named by the one a change to it would write.
    for (const [file, settings] of [['shared', readable], ['local', local]] as const) {
      if (settings === undefined) continue;
      // A pattern counts as a file's only where that file denies it for every tool `init` writes: half a pair is
      // a rule somebody wrote by hand, and `--unprotect` must not be offered for it.
      const paths = fileRulesIn(settings)
        .map((entry) => fileRulePathOf(entry))
        .filter((pattern): pattern is string => pattern !== undefined);
      // Keyed by what the policy lists the rule as protecting, because that is the list the rows are drawn from;
      // the rule itself is kept beside it, because that is the string `--unprotect` has to be given. A rule that
      // is only half a pair is kept too, and marked: it protects a file whatever wrote it, and the page said
      // nothing at all about one - not the rule, not the file, not even that the project had rules of its own.
      for (const rule of new Set(paths)) {
        mine[toPattern(rule)] = { file, rule, whole: isDenied(settings, rule) };
        held[file].push(toPattern(rule));
      }
    }
    // What each hook reads is in its own command; a hook not installed would be pointed where `init` points one
    // (R6): at the local file where it holds file rules, else at the shared one where that does, else nowhere.
    const pointed: RulesRead =
      local !== undefined && fileRulesIn(local).length > 0 ? 'local' : readable !== undefined && fileRulesIn(readable).length > 0 ? 'shared' : 'default';
    const readsOf = (hook: AgentwhyHook): RulesRead => {
      const file = installed(hook);
      const settings = file === 'local' ? local : file === 'shared' ? readable : undefined;
      return (settings === undefined ? undefined : rulesReadByHooks(settings).get(hook)) ?? pointed;
    };
    // U2: the version is this run's own, read once; the hooks are read from the files as they are now.
    this.#serving ??= this.#dependencies.invocation?.version() ?? Promise.resolve(undefined);
    const late = behind({ ...(local === undefined ? {} : { local }), ...(readable === undefined ? {} : { shared: readable }) }, await this.#serving);
    // AO3: Codex's state is read, never assumed - `on` only where agentwhy's check in the person's own Codex files is
    // verified as approved; `stale` where a check is written somewhere (the person's files unverified, or the old
    // project-level copy) and Codex may still ask; `off` where the project uses Codex (CK6) and nothing is written.
    const codexHooks = await this.#settingsFile(join(workingDirectory, PROJECT_HOOKS.directory, PROJECT_HOOKS.file));
    const check = this.#dependencies.home === undefined ? 'absent' : await codexCheckState(this.#dependencies.policyFiles, this.#dependencies.home);
    const legacy = typeof codexHooks === 'object' && codexRefuseIn(codexHooks) !== undefined;
    const codex = check === 'on' ? 'on'
      : check === 'stale' || legacy ? 'stale'
        : codexListed || codexHooks !== undefined || (await this.#dependencies.codexOnThisComputer?.()) === true ? 'off'
          : undefined;
    return {
      hooks: {
        watch: installed('watch'),
        refuse: installed('refuse'),
        reads: { watch: readsOf('watch'), refuse: readsOf('refuse') },
        path,
        sharedPath,
        ...(late === undefined ? {} : { behind: late }),
        ...(codex === undefined ? {} : { codex }),
      },
      mine,
      held: { local: [...new Set(held.local)], shared: [...new Set(held.shared)] },
    };
  }

  /**
   * One settings file as JSON: `undefined` where there is no such file - which is not a problem, it is a project
   * that has not written one - and `unreadable` where there is one and it does not parse, which is not something
   * to guess past.
   */
  async #settingsFile(path: string): Promise<SettingsRead> {
    return readSettingsFile(this.#dependencies.policyFiles, path);
  }

  async #generate(
    session: SessionSummary,
    out: string,
    file: string,
    options: StartOptions,
    policy: Policy,
    page: { readonly marks: ReadonlyMap<string, MarkResult>; readonly served: boolean; readonly title: Redacted | undefined },
  ): Promise<
    | ((IndexReport & { readonly kind: 'generated' | 'failed' }) & { readonly actions?: SessionActions; readonly stories?: SessionStories })
    | { readonly kind: 'policy-refused'; readonly output: string }
  > {
    const { share } = options;
    const result = await this.#dependencies.report.run({
      input: session.path,
      policy,
      htmlPath: join(out, file),
      ascii: false,
      full: false,
      colour: false,
      open: false,
      share,
      width: DISCARDED_WIDTH,
      // `a-way-back` R8: this run writes the index beside the report, so this report may offer the way back to it.
      withIndexLink: true,
      marks: page.marks,
      served: page.served,
      // P4: the title its row is found by, for "You asked". Never read under --share (above).
      ...(page.title === undefined ? {} : { title: page.title }),
    });

    if (result.outcome === 'policy-refused') return { kind: 'policy-refused', output: result.output };

    // A report that was not built, or not written, is a session the page must not link to as if it were. Asked of
    // the result, never of its text: the old check searched the report for "could not be written", and a task
    // description quoted in that report can contain those words. Found by a review.
    // Actions travel only with a session that was read: a report of an unreadable session has nothing to say about it.
    const analysed = result.outcome === 'session-unreadable' ? {} : result.actions === undefined ? {} : { actions: result.actions };
    return result.tally === undefined || result.outcome === 'session-unreadable' || result.htmlWritten !== true
      ? { kind: 'failed', ...analysed }
      : {
          kind: 'generated',
          file,
          tally: result.tally,
          incomplete: result.outcome === 'incomplete',
          ...analysed,
          // To fix opens the same "What happened" as this report, told once, here (T11a).
          ...(result.stories === undefined ? {} : { stories: result.stories }),
          ...(result.reached === undefined ? {} : { reached: result.reached }),
        };
  }
}

/**
 * One row of the index from what became of its session's report. The page is given what it renders, and the actions
 * stay with the digest they were collected for: the row lists the files it lists, and nothing else of what `check`
 * was told about them.
 */
function entryOf(
  name: string,
  title: Redacted | undefined,
  session: SessionSummary,
  report: (IndexReport & { readonly actions?: SessionActions }) | { readonly kind: 'outside-range' },
): IndexEntry {
  return {
    name,
    provider: session.provider,
    ...(title === undefined ? {} : { title }),
    modifiedAt: session.modifiedAt,
    delegations: session.delegations,
    report:
      report.kind === 'generated'
        ? {
            kind: 'generated',
            file: report.file,
            tally: report.tally,
            incomplete: report.incomplete,
            ...(report.actions === undefined ? {} : { files: filesOf(report.actions) }),
            ...(report.stories === undefined ? {} : { stories: report.stories }),
            ...(report.reached === undefined ? {} : { reached: report.reached }),
          }
        : report.kind === 'failed'
          ? { kind: 'failed' }
          : { kind: 'outside-range' },
  };
}

/**
 * The protected files of one session, each under the strongest thing known about it: its contents were seen, a
 * call named it, it only appeared in a result, or its outcome is not recorded. The same four the row's badge
 * climbs, so a row and the files under it never disagree.
 */
function filesOf(actions: SessionActions): readonly IndexFile[] {
  const strongest = new Map<string, IndexFile>();
  const add = (path: Redacted, kind: IndexFile['kind']): void => {
    if (!strongest.has(path as string)) strongest.set(path as string, { path, kind });
  };
  for (const file of actions.rotate) add(file.path, 'seen');
  for (const route of actions.openRoutes) add(route.path, 'named');
  for (const path of actions.onlyInResults) add(path, 'result');
  for (const path of actions.unknown) add(path, 'unknown');
  for (const path of actions.told ?? []) add(path, 'told');
  return [...strongest.values()];
}

/** A session a report was read for: what the digest and a mark's lines are made from. */
interface ReadSession {
  readonly id: string;
  readonly name: string;
  readonly modifiedAt: number;
  readonly actions: SessionActions;
}

/** What `#generate` gives back for a session it wrote a report of, or tried to. */
type GeneratedReport = (IndexReport & { readonly kind: 'generated' | 'failed' }) & {
  readonly actions?: SessionActions;
  readonly stories?: SessionStories;
};

/** A report written in this run, and what it was drawn from: kept until its session or a mark on its files changes. */
interface KeptReport {
  readonly file: string;
  readonly modifiedAt: number;
  /** `keyOf` the policy it was read under. */
  readonly policy: string;
  /** `marksOn` of the marks it was drawn with. */
  readonly marks: string;
  readonly report: GeneratedReport;
  /** When it was written, on the `elapsed` clock, so a growing session is read again at most every `GROWING_MS`. */
  readonly writtenAt: number;
}

/** A policy as one comparable value: what it protects, how, and its exceptions (F57). */
function keyOf(policy: Policy): string {
  return JSON.stringify([policy.level, policy.protected.map((entry) => [entry.pattern, entry.mode ?? 'block']).sort(), [...policy.allowed].sort()]);
}

/**
 * The marks a report shows, as one comparable value: only those on its own files. A file marked done on another page
 * changes the report of every session that reached it, and no other (R75).
 */
function marksOn(report: GeneratedReport, marks: ReadonlyMap<string, MarkResult>): string {
  const paths = report.actions === undefined ? [] : filesOf(report.actions).map((file) => file.path as string).sort();
  return JSON.stringify(paths.map((path) => [path, marks.get(path) ?? null]));
}

/**
 * The marks that hold for a session last active at `lastActive`: made at or after it, as `actionsAfterMarks` decides
 * which files leave the check (R35). A mark older than the session's last activity may have been reached since.
 */
function marksFor(lastActive: number, standing: ReadonlyMap<string, Mark>): ReadonlyMap<string, MarkResult> {
  return new Map([...standing].filter(([, mark]) => lastActive <= mark.at).map(([path, mark]) => [path, mark.result]));
}

/** How many conversations were held each way (which-project V4). One whose transcript said nothing is not counted. */
function countedBy(kinds: readonly (EntryPoint | undefined)[]): Partial<Record<EntryPoint, number>> {
  const counts: Partial<Record<EntryPoint, number>> = {};
  for (const kind of kinds) if (kind !== undefined) counts[kind] = (counts[kind] ?? 0) + 1;
  return counts;
}

/** The span that would bring the oldest listed session into range, in whole days - the command, not advice. */
function widenTo(outOfRange: readonly SessionSummary[], now: number): string {
  const oldest = Math.min(...outOfRange.map((session) => session.modifiedAt), now);
  const days = Math.max(Math.ceil((now - oldest) / DAY), 1);
  return `agentwhy start --since ${days}d`;
}

/** Where to go from a folder that is no project (which-project V7): the same words opened or not. */
const NOT_A_PROJECT_HERE: Readonly<Record<NotAProject, string>> = {
  home: 'You started agentwhy in your home folder, which isn\'t a project. Open your project\'s folder in your code editor\'s terminal, and run agentwhy there.\n',
  root: 'You started agentwhy at the root of a disk, which isn\'t a project. Open your project\'s folder in your code editor\'s terminal, and run agentwhy there.\n',
};

/**
 * An empty project, where the onboarding does not open (R28, amended by the onboarding's W1a). A run that would have
 * opened a page names no command: its reader cannot run one, and setting up is the onboarding's, which this project has
 * been through or cannot be offered. R28's text, with `init`, stays for a run asked not to open a page.
 */
function noSessions(directory: string, project: string, wouldOpen: boolean, setUp: boolean, notOne: NotAProject | undefined): string {
  // which-project V7: "work with your AI here" is the wrong way on from a folder that is no project, and so is `init`,
  // which refuses it (V8). Said where the onboarding's project step does not open to ask: a run that opens no page.
  if (notOne !== undefined) return NOT_A_PROJECT_HERE[notOne];
  if (wouldOpen) {
    // which-project V3: the folder by name, so a run started in the wrong one says which one it was.
    return (setUp ? 'You\'re set up. ' : '') + `There are no AI chats in ${printable(project)} yet. Work with your AI here, then run agentwhy again.\n`;
  }
  return `No sessions are stored for this directory, so there is nothing to list.\nLooked in ${directory}\n` +
    `agentwhy reads sessions Claude Code and Codex already keep, so either this directory has not been used with either yet, or it is not the one being worked in.\n` +
    `Use Claude Code or Codex here, then run agentwhy start again - or run agentwhy init now, to be protected in Claude Code before there is history to check.\n`;
}

/** What the run wrote, counted from what it wrote it about. The words are the renderer's; these are the numbers. */
function counted(
  entries: readonly IndexEntry[],
  older: number,
  indexPath: string,
  index: SessionIndex,
  opened: boolean,
): Omit<StartSaid, 'asked' | 'digest'> {
  return {
    listed: entries.length,
    generated: entries.filter((entry) => entry.report.kind === 'generated').length,
    failed: entries.filter((entry) => entry.report.kind === 'failed').length,
    older,
    widen: index.widen,
    indexPath,
    shared: index.shared,
    opened,
  };
}
