// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Policy } from '../../core/policy/policy.ts';
import type { Redacted } from '../../core/redaction/redacted.ts';
import { noStoreAnywhere, sessionKey, type SessionCatalogue, type SessionListing, type SessionSummary } from '../../core/session-catalogue.ts';
import type { EveryProjectListing, EveryProjectSessions } from '../../core/every-project-catalogue.ts';
import { splitBySince, type Since } from '../../core/session-filter.ts';
import type { EntryPoint } from '../../core/entry-point.ts';
import { recogniseAll, type SessionRecognition, type SessionTitles } from '../../core/session-titles.ts';
import type { Browser } from '../../ports/browser.ts';
import { isDirectory, type DirectoryReader } from '../../ports/directory-reader.ts';
import { textOrUndefined, type FileReader } from '../../ports/file-reader.ts';
import type { ReportShelf } from './report-shelf.ts';
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
import { checkOf, checkWithMarks, type IndexCheck, type NamedActions, type ProjectKind, type RowProject } from '../check/check-lines.ts';
import { checkByProject, marksOfProject, outOfProject, projectActions, projectRecords } from '../check/project-paths.ts';
import { recordMark, recordUnmark, type MarkAnswer } from '../check/mark-request.ts';
import type { LocalRequest, LocalResponse, LocalServer, Serving } from '../../ports/local-server.ts';
import type { Printer } from '../../ports/printer.ts';
import { indexHandler, type ChooseAnswer, type PastRunAnswer, type PlacesAnswer, type RemoveAsk, type SwitchFrom } from './serve/index-handler.ts';
import { movedPage } from './projects/moved-page.ts';
import { nearestProject } from '../../core/nearest-project.ts';
import type { FolderChooser } from '../../ports/folder-chooser.ts';
import type { PlaceChooser, PlaceKind } from '../../ports/place-chooser.ts';
import { translator, type Lang } from '../render/report-copy.ts';
import { hookComplete, readSettingsFile, uninstallableIn, type SettingsRead } from './settings-files.ts';
import { indexProjects } from './projects/index-projects.ts';
import type { ProjectCatalogue, ProjectListing } from '../../core/project-catalogue.ts';
import type { RemovedProjects } from '../../ports/removed-projects.ts';
import { NOT_A_PROJECT, type SetupUseCase } from '../../setup/project-setup.ts';
import { notAProject, type NotAProject } from '../../setup/not-a-project.ts';
import { inTemporarySpace } from './projects/temporary-space.ts';
import { inChatFolder } from '../../adapter/codex/contract/chat-folders.ts';
import { behind } from '../../setup/behind.ts';
import type { AgentwhyInvocation } from '../../ports/agentwhy-invocation.ts';
import { modeChange, onlyTakesOut, settingsChangeToSetup, type ToldListWriter } from './serve/settings-setup.ts';
import type { SettingsAnswer, SettingsChange } from './serve/settings-request.ts';
import { DEFAULT_THRESHOLD } from '../watch/agent-alert.ts';
import { DEFAULT_CHANNELS, DEFAULT_CLEAN, DEFAULT_CLEAN_EVERYWHERE, DEFAULT_SAID_AS } from '../watch/notice-choices.ts';
import type { NoticeSettings, NoticeSettingsView } from '../watch/notice-settings.ts';
import { actionsAfterMarks, markLines, marksInRange, standingMarks, type Mark, type MarkResult } from '../check/marks.ts';
import type { MarkReading, MarkStore } from '../../ports/mark-store.ts';
import type { ComputerScope, ComputerView } from '../../ports/computer-view.ts';
import type { CheckedStore } from '../../ports/checked-store.ts';
import type { OnboardingStore } from '../../ports/onboarding-store.ts';
import { finishOnboarding, type FinishAnswer } from './onboarding/finish-onboarding.ts';
import type { EverywhereAnswer, EverywhereChoices } from './onboarding/everywhere.ts';
import { welcomeIn, type WelcomeFacts } from './onboarding/welcome-decision.ts';
import { WHO_STEP } from './onboarding/onboarding-script.ts';
import { COMPUTER_SWITCH } from './onboarding/everywhere-address.ts';
import type { OnboardingChoices } from './onboarding/onboarding-changes.ts';
import { repositoryAbove } from './repository.ts';
import { pageStopped, quietlySaid, startSaid, type StartSaid, type TerminalView } from './render/start-words.ts';
import { PROJECT_HOOKS } from '../../adapter/codex/contract/hooks.ts';
import { codexCheckState } from '../../adapter/codex/settings/codex-check.ts';
import { codexRefuseIn } from '../../adapter/codex/settings/codex-hooks.ts';
import type { IndexEntry, IndexEverywhere, IndexFile, IndexHooks, IndexNotices, IndexOnboarding, IndexProjects, IndexReport, IndexRule, IndexSettings, SessionIndex, SettingsFile } from './session-index.ts';
import { projectDirectoryName } from '../../adapter/claude-code/contract/projects.ts';
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
  /**
   * Every project's conversations, for the computer's view (`.ai/plans/2026-10-06-everything-on-this-computer.md` step
   * 2, G11). Absent: the computer's view lists the home folder's own, as a run there always did.
   */
  readonly everyProject?: EveryProjectSessions;
  /**
   * The told lists of a project other than this run's (GD17): a conversation in the computer's view is read under its own
   * project's. Absent: every conversation is read under this run's lists (`tell`).
   */
  readonly tellIn?: (folder: string) => TellListPaths;
  readonly report: ReportUseCase;
  /**
   * V14, amended 2026-10-07: the reports every run of this process wrote, so a switch - to a project, to the computer's
   * view, back - copies a report drawn from exactly the same instead of reading its conversation again. Absent: none kept.
   */
  readonly shelf?: ReportShelf<GeneratedReport>;
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
   * Each project's own record of marks, for the computer's view (`everything-on-this-computer.md` step 2, GD18): a file
   * there is its project's, and so is its mark. Absent: the computer's view reads this run's record, by path alone.
   */
  readonly marksIn?: (folder: string) => MarkStore;
  /**
   * GD20, GD21: what the computer's page shows - what no set-up project's view does, or every project's - as the person
   * last chose it on its pages. Absent: it shows every project's, and offers no choice.
   */
  readonly computerView?: ComputerView;
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
  /**
   * The onboarding's computer-wide path (`.ai/specs/2026-10-05-protected-everywhere.md` G7-G10): what it starts from, and
   * the write its confirmation makes. Offered only where the onboarding is served. Absent: the path is not drawn.
   */
  readonly everywhere?: {
    now(): Promise<IndexEverywhere>;
    protect(choices: EverywhereChoices): Promise<EverywhereAnswer>;
    /** Anything of the computer setup there: one set up before its setup was recorded (GD26). */
    setUp?(): Promise<boolean>;
  };
  /**
   * GD26: the computer's own record that its setup was finished - written by any finished write of the computer's, and
   * taken back by its Uninstall, as a project's is by its own (W25a). The home folder's run opens the onboarding until it
   * is there. Absent: the home folder's run opens the computer's view, as it did.
   */
  readonly computerOnboarding?: OnboardingStore;
  /** What a person finds a session by on the page. Never read under `--share`. */
  readonly titles: SessionTitles;
  /** The person's projects, for the window the sidebar's card opens (`which-project.md` V9-V11). Absent: no window. */
  readonly projects?: ProjectCatalogue;
  /**
   * The projects this person took off their list (`remove-a-project-from-the-list` RM6): the record agentwhy keeps of
   * its own, read for every render and written when a row's trash is confirmed. Absent: nothing can be removed, and
   * every project the catalogue lists is drawn.
   */
  readonly removedProjects?: RemovedProjects;
  /**
   * A setup built for a folder other than this run's (RMD1), for taking agentwhy out of a project being removed from
   * the list. Only the composition root chooses implementations, so the run asks it for one. Absent: a removal writes
   * the record alone.
   */
  readonly setupIn?: (workingDirectory: string) => SetupUseCase;
  /** GD32: the told lists of another listed project, for a row's Track on the computer's page. Absent: none is written. */
  readonly tellListsIn?: (folder: string) => ToldListWriter;
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
  /** IP2: the computer's own window for the places a computer rule is for. Absent: a place is typed on the page. */
  readonly placeChooser?: PlaceChooser;
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

/** live-pages L3, amended 2026-10-06: how old a refresh may be and still answer a page's ask. */
const FRESH_MS = 3_000;

/** R54: a page nobody has used for this long stops being served. */
const IDLE_MS = 30 * 60 * 1000;

/** RM10: the record is the person's own file; where it cannot be written, the project stays listed and the page says so. */
const RECORD_FAILED = 'The list of projects you removed couldn’t be written.';
/**
 * GD25: on the computer's page a mark is written to the record of the project its file is in, named by the page; one
 * that names no project this run lists is said, and nothing is written.
 */
const NO_SUCH_PROJECT: MarkAnswer = {
  outcome: 'mark-refused',
  output: 'This page could not tell which project the file is in, so nothing was marked. Reload the page and try again.\n',
};
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
    // `everything-on-this-computer.md` GD16: the home folder's run is the computer's, where the computer-wide path is
    // served - it is served with no conversation of its own (they are every project's), and opens on its own view.
    const computerScope = served && notHere === 'home' && welcome !== undefined && this.#dependencies.onboarding !== undefined && this.#dependencies.everywhere !== undefined;
    // GD26: the computer's view opens where the computer was set up; the onboarding, at the choice of a project or the
    // computer, where it was not - never set up, or uninstalled since.
    const computerSetUp = !computerScope || (await this.#computerSetUp());
    // Step 2, G11: the computer's view lists every project's conversations, each with the project it was held in.
    const everyProject = computerScope ? this.#dependencies.everyProject : undefined;
    const listNow = async (): Promise<SessionListing> =>
      everyProject === undefined ? catalogue.list(workingDirectory) : everyListing(await everyProject.list(), workingDirectory);
    const listing = await listNow();
    // AW1 (`the-address-opens-the-welcome`): an address asked for with `--serve` is opened by a person - the one an AI app
    // sends - so it names the page a browser this run opened would show. Not in an empty project (AW2): every empty
    // listing seen there came from a place that cannot see the person's conversations, whose address nobody can open.
    const anyConversation = listing.found && listing.sessions.length > 0;
    const opensWelcome = (!computerScope || !computerSetUp) && welcome !== undefined && (arrivedFrom === 'step' || ((options.open || (options.serve === true && anyConversation)) && welcome.opens));
    if ((!listing.found || listing.sessions.length === 0) && !opensWelcome && !computerScope) {
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
    const chosen = await choosePolicy(options, policyFiles, this.#dependencies.tell, this.#dependencies.home);
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
    // GD18: the computer's page reads every listed project's own record, each file keyed by its project - the same `.env`
    // in two projects is two files, with two marks. Nothing is marked from it: a mark is made in the project's own view.
    const marksIn = everyProject === undefined ? undefined : this.#dependencies.marksIn;
    let marksFrom = foldersOf(listing.sessions);
    const marksNow = async (): Promise<MarkReading> => {
      if (marksIn === undefined) return this.#dependencies.marks.read();
      const readings = await Promise.all(marksFrom.map(async (folder) => ({ folder, reading: await marksIn(folder).read() })));
      return {
        records: readings.flatMap(({ folder, reading }) => projectRecords(folder, reading.records)),
        skipped: readings.reduce((sum, { reading }) => sum + reading.skipped, 0),
        failed: readings.some(({ reading }) => reading.failed),
      };
    };
    /** What a report of a session is drawn with: its own project's marks, by the paths its report names. */
    const standingOf = (folder: string | undefined, standing: ReadonlyMap<string, Mark>): ReadonlyMap<string, Mark> =>
      marksIn === undefined || folder === undefined ? standing : marksOfProject(folder, standing);
    /** What the check groups a session's files by: their paths, or on the computer's page, each with its project. */
    const keyed = (session: { readonly project?: string; readonly actions: SessionActions }): SessionActions =>
      marksIn === undefined || session.project === undefined ? session.actions : projectActions(session.project, session.actions);
    const drawnByProject = (check: IndexCheck, kindOf: (folder: string) => ProjectKind | undefined = () => undefined): IndexCheck =>
      marksIn === undefined ? check : checkByProject(check, (folder) => rowProject(folder, this.#dependencies.home, kindOf(folder)));
    const standingAtStart = options.share ? new Map<string, Mark>() : standingMarks((await marksNow()).records);
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
    // GD32: what each listed folder is, as the page now drawn shows it - where a row's Block or Track is written.
    let kindsNow: ReadonlyMap<string, ProjectKind> | undefined;
    // V14: set once a page has moved to another project's run, so this one ends without a word of its own.
    let switchedAway = false;

    /** Every row and report from one listing, reusing what has not changed. A refusal is said as the one it is. */
    // R75, F57: the policy the reports are read under, as it is now. A file switched to Tell me or back to Block in
    // Settings changes what every report says about it, so a changed policy writes every report again.
    let policyNow = chosen.policy;
    // GD17: in the computer's view each conversation is read under its own project's rules and told lists, as that
    // project's own view reads it - chosen with every listing, as the run's own policy is, and kept by folder until the next.
    let policiesNow = new Map<string, Policy>();
    const policyOf = (session: SessionSummary): Policy => (session.project === undefined ? undefined : policiesNow.get(session.project.folder)) ?? policyNow;
    const choosePolicies = async (sessions: readonly SessionSummary[]): Promise<void> => {
      const tellIn = this.#dependencies.tellIn;
      if (everyProject === undefined || tellIn === undefined) return;
      const folders = new Map(sessions.flatMap((session) => (session.project === undefined ? [] : [[session.project.folder, session.project.looked] as const])));
      policiesNow = new Map(await Promise.all([...folders].map(async ([folder, looked]) => {
        // V10b: a folder the system guards is not looked into - the list a project keeps inside it is not read; the one
        // kept for it in the person's own agentwhy folder, and the computer's, are.
        const one = await choosePolicy(options, looked ? policyFiles : notInside(policyFiles, folder), tellIn(folder), this.#dependencies.home).catch(() => undefined);
        return [folder, one === undefined || 'errors' in one ? policyNow : one.policy] as const;
      })));
    };
    // V14, amended 2026-10-07: a report another run of this process drew from exactly the same - the conversation as it is
    // now, its rules, its marks, its title, its project - is copied, not read again. A page that cannot be copied is drawn.
    const shelf = options.share ? undefined : this.#dependencies.shelf;
    const drawOrCopy = async (session: SessionSummary, file: string, policy: Policy, page: ReportPageInput): Promise<GeneratedReport | PolicyRefused> => {
      const drawnFrom = JSON.stringify([session.modifiedAt, keyOf(policy), [...page.marks].sort(), page.served, page.title ?? null, page.project ?? null]);
      const shelved = shelf?.find(session.path, drawnFrom);
      const text = shelved === undefined ? undefined : await textOrUndefined(policyFiles, shelved.page);
      if (shelved !== undefined && text !== undefined) {
        try {
          await files.writeText(join(out, file), text);
          return shelved.report.kind === 'generated' ? { ...shelved.report, file } : shelved.report;
        } catch (error) {
          if (!(error instanceof FileAccessError)) throw error;
        }
      }
      const made = await this.#generate(session, out, file, options, policy, page);
      if (shelf !== undefined && made.kind === 'generated') shelf.keep(session.path, drawnFrom, join(out, file), made);
      return made;
    };
    const sync = async (sessions: readonly SessionSummary[], standing: ReadonlyMap<string, Mark>): Promise<string | undefined> => {
      const { inRange, outOfRange: older } = splitBySince(sessions, options.since.since);
      const generatedIds = new Set([...inRange, ...older.filter((session) => asked.has(sessionKey(session)))].map((session) => sessionKey(session)));
      await choosePolicies(sessions.filter((session) => generatedIds.has(sessionKey(session))));
      // A title is user content, and a shared page is one that leaves this machine: it is not even read. A session that
      // has grown may have a new last prompt, so its title is read again with it. Both desktop apps name a conversation
      // in a file of their own, seconds after it starts (`what-codex-wrote` §2.9, X28a; `claude-desktop-conversations`
      // CD5) - found by the maintainer, a row drawn in those seconds stayed untitled once its transcript stopped
      // changing - so a row with no title asks again. That ask is a lookup in the app's own names, read again only
      // where they changed; the adapter keeps an unchanged transcript's tail, so it is not read again (CD5).
      if (!options.share) {
        const stale = sessions.filter((session) => {
          // G12: the computer's view reads a title only for a conversation it reads. Every project's would be the end of
          // hundreds of transcripts, a megabyte each; a row out of range is found by its project and its day.
          if (everyProject !== undefined && !generatedIds.has(sessionKey(session))) return false;
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
          const policyKey = keyOf(policyOf(session));
          const file = options.share ? `session-${position + 1}.html` : `${sessionKey(session)}.html`;
          const marks = marksFor(session.modifiedAt, standingOf(session.project?.folder, standing));
          const kept = reports.get(sessionKey(session));
          const same = kept !== undefined && kept.file === file && kept.policy === policyKey && kept.marks === marksOn(kept.report, marks);
          // L4: only growth waits; a mark or a policy changed is the person's own doing, and shown at once.
          const growingTooSoon = same && elapsed !== undefined && kept.modifiedAt !== session.modifiedAt && elapsed() - kept.writtenAt < GROWING_MS;
          if (same && (kept.modifiedAt === session.modifiedAt || growingTooSoon)) {
            report = kept.report;
          } else {
            const made = await drawOrCopy(session, file, policyOf(session), {
              marks,
              served,
              title: titles.get(sessionKey(session))?.title,
              // GD25: on the computer's page a report's marks are written to its own project's record, named by id - and on
              // a project's own page it names that project, which changes nothing there and lets the two share a report.
              ...(served && !options.share ? { project: projectDirectoryName(session.project?.folder ?? workingDirectory) } : {}),
            });
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
          else nextRead.push({ id: sessionKey(session), name, modifiedAt: session.modifiedAt, actions: report.actions, ...(session.project === undefined ? {} : { project: session.project.folder }) });
        }
        nextEntries.push(entryOf(name, titles.get(sessionKey(session))?.title, session, report, this.#dependencies.home));
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

    // G7, GD12: the computer-wide path, wherever the onboarding is served - in the home directory too, where no project's
    // setup is - and never on a shared page. Finishing it is no project's setup, so it writes no onboarding record.
    const everywhereServed = served && welcome !== undefined && this.#dependencies.onboarding !== undefined && this.#dependencies.everywhere !== undefined;
    const everywhereWrite = !everywhereServed || this.#dependencies.everywhere === undefined ? undefined : async (choices: EverywhereChoices): Promise<EverywhereAnswer> => {
      const answer = await (this.#dependencies.everywhere as NonNullable<SessionStartDependencies['everywhere']>).protect(choices);
      // GD26: a finished write is the computer set up; its Uninstall takes that back, so the onboarding opens again.
      if (answer.outcome === 'finished') {
        const at = (this.#dependencies.clock ?? (() => this.#dependencies.now))();
        await (choices.uninstall === true ? this.#dependencies.computerOnboarding?.reset(at) : this.#dependencies.computerOnboarding?.add(at));
        // GD21, amended 2026-10-07 by the maintainer: a setup finished or taken out starts the computer's page again at its
        // default, Outside projects - the choice is remembered between, not across a setup.
        if (choices.finish === true || choices.uninstall === true) await this.#dependencies.computerView?.write('outside');
      }
      return answer;
    };

    /** The index and the digest's marks, from the record as it is now: once for the run, and after every served write. */
    const build = async () => {
      // Read before any line is drawn: a file marked done leaves the lists until a session after the mark reaches it (R35).
      const reading = await marksNow();
      const standing = standingMarks(reading.records);
      const after = read.map((session) => ({ ...session, actions: actionsAfterMarks(session.actions, session.modifiedAt, standingOf(session.project, standing)) }));
      // R60: after a write the view is re-read from the file, so the rules are read again here rather than kept
      // from the run. Every report was handed the policy chosen above and none of them is drawn again; this is
      // the Settings view alone, which is a control surface and has to show what the file now holds. A policy
      // that has since become unreadable leaves the run's own, rather than an empty list nobody wrote.
      const now_ = options.share ? chosen : await choosePolicy(options, policyFiles, this.#dependencies.tell, this.#dependencies.home).catch(() => chosen);
      const policy = ('errors' in now_ ? chosen : now_).policy;
      const project = options.share ? {} : await this.#settingsNow(workingDirectory, listing.sessions.some((session) => session.provider === 'codex'));
      // What this person chose to be told, for the panel that changes it. A shared page offers no choices at all.
      const notices = options.share ? undefined : await this.#noticesNow(computerScope);
      // F57: read again with every refresh, as the settings files are, so a switch shows what the list now holds.
      const told = options.share || this.#dependencies.tellLists === undefined ? undefined : await this.#dependencies.tellLists.read();
      // G7: the computer-wide path, read again with every refresh as the settings are, where its write is served - beside
      // the projects, not after them, since every served write waits on this rebuild.
      const [known, everywhere] = await Promise.all([
        this.#projectsNow(served && !options.share, workingDirectory),
        everywhereServed ? this.#dependencies.everywhere?.now() : undefined,
      ]);
      listed = known.listing;
      // GD20-GD22, GD27: what the computer's page shows - what no set-up project's view does, or the set-up projects' own, as
      // the person last chose - from the one listing and the one set of reports. A project taken off the list is in neither.
      const view = this.#dependencies.computerView;
      const kinds = everyProject === undefined || view === undefined ? undefined : this.#kindsOf(marksFrom, known.projects);
      const shownScope: ComputerScope | undefined = kinds === undefined ? undefined : (await view?.read()) ?? 'outside';
      kindsNow = kinds;
      const kindById = new Map([...(kinds ?? new Map<string, ProjectKind>())].map(([folder, kind]) => [projectDirectoryName(folder), kind]));
      // GD28: each conversation in one of the two, whole - a set-up project's in Projects, the rest in Outside projects. A
      // set-up project's conversation in Outside projects with only its files outside the folder drew its own files as
      // fixed, the To fix list holding none of them (found by the maintainer, 2026-10-07).
      const inScope = (scope: ComputerScope, kind: ProjectKind | undefined): boolean =>
        kind !== 'removed' && (scope === 'projects') === (kind === 'set-up');
      const entryIn = (scope: ComputerScope) => (entry: IndexEntry): boolean => inScope(scope, entry.project === undefined ? undefined : kindById.get(entry.project.id));
      const shownEntries = shownScope === undefined ? entries : entries.filter(entryIn(shownScope))
        .map((entry) => (entry.project === undefined ? entry : { ...entry, project: withKind(entry.project, kindById.get(entry.project.id)) }));
      const checked = shownScope === undefined ? after : after.filter((session) => inScope(shownScope, session.project === undefined ? undefined : kinds?.get(session.project)));
      const index: SessionIndex = {
        now,
        ...(this.#dependencies.timeZone === undefined ? {} : { timeZone: this.#dependencies.timeZone }),
        since: options.since.since,
        asked: options.since.asked,
        ...(options.share || computerScope ? {} : { project: workingDirectory }),
        ...(options.share || computerScope || this.#dependencies.home === undefined ? {} : { place: homeRelative(workingDirectory, this.#dependencies.home) }),
        ...(computerScope ? { scope: 'computer' as const } : {}),
        ...(options.share ? {} : { entryPoints }),
        ...(known.projects === undefined ? {} : { projects: known.projects }),
        shared: options.share,
        widen: widenTo(outOfRange, now),
        entries: shownEntries,
        ...(shownScope === undefined ? {} : {
          computerView: { shown: shownScope },
        }),
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
        ...(notHere === undefined || computerScope ? {} : { notAProject: notHere }),
        // W24, W25: the onboarding is served with this run - whether its intro plays, and that Settings may lead to it.
        // G7a: and whether this project is set up, which is what makes the fork the setup seen again.
        ...(welcome === undefined ? {} : { onboarding: { intro: welcome.intro, ...(welcome.atProject ? { atProject: true } : {}), ...(welcome.setUp ? { setUp: true } : {}) } satisfies IndexOnboarding }),
        // IP2: what the computer's own window can choose, for the page to offer it.
        ...(everywhere === undefined ? {} : { everywhere: computerScope && this.#dependencies.placeChooser?.kinds !== undefined ? { ...everywhere, places: this.#dependencies.placeChooser.kinds } : everywhere }),
        ...(read.length === 0 && reading.records.length === 0 && !reading.failed
          ? {}
          : {
              check: shownHistory(drawnByProject(checkWithMarks(checked.map((session): NamedActions => ({ name: session.name, actions: keyed(session) })), {
                standing,
                lines: markLines(reading.records),
                unreadable: reading.failed,
                nameOf: (id) => nameOfId.get(id),
                keepNotes: !options.share,
              }), (folder) => kinds?.get(folder)), (id) => shownScope === undefined || inScope(shownScope, kindById.get(id))),
            }),
      };
      const { done, reopened } = marksInRange(read.map(keyed), after.map(keyed), standing);
      const marks = standing.size === 0 && !reading.failed
        ? undefined
        : { done, reopened: reopened.map(({ path, result, at }) => ({ path: saidPath(path), result, at })), unreadable: reading.failed };
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
    /*
     * live-pages L3, amended 2026-10-06: every open page asks every 2 s whether its file changed, and every ask was a whole
     * refresh - on the computer's page, every project listed and five pages of megabytes drawn, again and again, so a
     * switch waited behind them (the maintainer: "ten switch wolno działa strasznie"). An ask is answered from a refresh
     * at most FRESH_MS old; a write never waits for that. `relist: false` draws the pages again from what the run holds,
     * reading nothing: a choice of what to show changes no conversation (GD21).
     */
    let refreshedAt = elapsed?.();
    const refresh = async (when: { readonly afterWrite: boolean; readonly relist?: boolean }): Promise<string | undefined> => {
      if (refreshing !== undefined && !when.afterWrite) return refreshing;
      if (!when.afterWrite && elapsed !== undefined && refreshedAt !== undefined && elapsed() - refreshedAt < FRESH_MS) return undefined;
      while (refreshing !== undefined) await refreshing;
      const running = (async (): Promise<string | undefined> => {
        const now_ = when.relist === false ? { found: false, sessions: [] } : await listNow();
        if (now_.found && now_.sessions.length > 0) {
          // A policy that cannot be read now leaves the one the pages were drawn under, rather than rules nobody chose.
          const again = await choosePolicy(options, policyFiles, this.#dependencies.tell, this.#dependencies.home).catch(() => undefined);
          if (again !== undefined && !('errors' in again)) policyNow = again.policy;
          marksFrom = foldersOf(now_.sessions);
          const refusal = await sync(now_.sessions, standingMarks((await marksNow()).records));
          if (refusal !== undefined) return refusal;
          reportsServed();
        }
        await writePages((await build()).index);
        refreshedAt = elapsed?.();
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
      // Step 4 (GD15): the computer's own view, the home folder's run - from a project's page, never from its own.
      if (id === COMPUTER_SWITCH) {
        const home = this.#dependencies.home;
        if (home === undefined || this.#dependencies.everywhere === undefined) return { failed: 'This run cannot show the computer\u2019s view.' };
        if (computerScope) return { failed: 'The computer\u2019s view is the one shown already.' };
        return switchToFolder(home, from);
      }
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
    // RM6-RM10: a project taken off this person's list, and - where the window's tick asked for it - agentwhy taken out
    // of that project, which is Settings' own Uninstall run for that folder (RMD1). The record is written last, so a
    // removal that could not finish leaves the project listed.
    const removedProjects = this.#dependencies.removedProjects;
    const removeProject = removedProjects === undefined ? undefined : async (ask: RemoveAsk): Promise<{ readonly message: string } | { readonly failed: string }> => {
      const project = listed?.projects.find((one) => one.id === ask.id);
      if (project === undefined) return { failed: 'That project is not one this page listed.' };
      if (relative(project.path, workingDirectory) === '') return { failed: 'That project is the one shown already.' };
      const taken = projectDirectoryName(project.path);
      const at = (this.#dependencies.clock ?? (() => this.#dependencies.now))();
      let said = '';
      const setupIn = this.#dependencies.setupIn;
      if (ask.uninstall === true && project.folder !== 'gone' && setupIn !== undefined) {
        // RM8: what to take out is read from that project's own settings files now, never sent by the page.
        const rules = await uninstallableIn(this.#dependencies.policyFiles, project.path);
        if (Object.keys(rules).length > 0) {
          const answer = await settingsChangeToSetup(setupIn(project.path), { change: 'uninstall', rules });
          if (answer.outcome !== 'written' && answer.outcome !== 'unchanged') return { failed: answer.output.trim() };
          said = answer.output.trim();
        }
      }
      if (!(await removedProjects.remove(taken, at))) return { failed: RECORD_FAILED };
      return { message: said };
    };
    // `2026-10-07-a-file-in-its-place.md` IP2: on the computer's page, the system's window for the places a computer rule is
    // for - each answered as the page shows it and as its rule is written (IP1): under the home `~/…`, elsewhere `//…`, a
    // folder with everything in it. The home itself and the root are no place to keep from an AI, and are left out.
    const places = this.#dependencies.placeChooser;
    const choosePlaces = !computerScope || places?.kinds === undefined ? undefined : async (lang: Lang, kind: PlaceKind): Promise<PlacesAnswer> => {
      const picked = await (places as PlaceChooser).choose(translator(lang)('set.add.windowPrompt'), kind, this.#dependencies.home);
      if ('cancelled' in picked) return { kind: 'cancelled' };
      if ('failed' in picked) return { kind: 'failed', reason: picked.failed };
      const home = this.#dependencies.home;
      const shown = picked.chosen.flatMap((one) => {
        if (one.path === '/' || (home !== undefined && relative(home, one.path) === '')) return [];
        const inHome = home !== undefined && one.path.startsWith(home.replace(/\/+$/, '') + '/');
        const name = inHome ? '~/' + one.path.slice(home.replace(/\/+$/, '').length + 1) : one.path;
        const written = (inHome ? name : '/' + one.path) + (one.folder ? '/**' : '');
        return [{ name, kind: one.folder ? 'folder' as const : 'file' as const, pattern: written }];
      });
      return shown.length === 0 ? { kind: 'cancelled' } : { kind: 'chosen', places: shown };
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
          // GD25: on the computer's page, a mark goes to the record of the project its file is in - the one that project's
          // own view reads - against the lines of that project's conversations alone.
          ...(marksIn === undefined
            ? {}
            : {
                markWhere: (project: string | undefined) => {
                  const folder = project === undefined ? undefined : marksFrom.find((one) => projectDirectoryName(one) === project);
                  if (folder === undefined) return undefined;
                  const own = read.filter((session) => session.project === folder).map((session) => ({ name: session.id, actions: session.actions }));
                  return { store: marksIn(folder), lines: checkOf(own).rows };
                },
              }),
          // GD32: on the computer's page, a row's Block or Track is written where its file's project keeps it - the project's
          // own settings and told lists, as its own page writes them - or, for a file of no project, the computer's.
          ...(marksIn === undefined
            ? {}
            : {
                computerSettings: (change: SettingsChange, project: string | undefined) => {
                  const folder = project === undefined ? undefined : marksFrom.find((one) => projectDirectoryName(one) === project);
                  return this.#computerSettings(change, folder, folder === undefined ? undefined : kindsNow?.get(folder), everywhereWrite);
                },
              }),
          // GD21: the choice between outside projects and all, kept, and every page drawn again with it.
          ...(everyProject === undefined || this.#dependencies.computerView === undefined
            ? {}
            : {
                view: async (scope: ComputerScope) => {
                  if (!(await (this.#dependencies.computerView as ComputerView).write(scope))) return false;
                  await refresh({ afterWrite: true, relist: false });
                  return true;
                },
              }),
          ...(finish === undefined ? {} : { finish }),
          ...(everywhereWrite === undefined ? {} : { everywhere: everywhereWrite }),
          ...(switchProject === undefined ? {} : { switchProject }),
          ...(removeProject === undefined ? {} : { removeProject }),
          ...(chooseFolder === undefined ? {} : { chooseFolder }),
          ...(choosePlaces === undefined ? {} : { choosePlaces }),
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
      /** GD25: on the computer's page, the record a mark of a project is written to, and the lines it is checked against. */
      readonly markWhere?: (project: string | undefined) => { readonly store: MarkStore; readonly lines: ReturnType<typeof checkOf>['rows'] } | undefined;
      /** GD32: on the computer's page, a row's Block or Track, written into the project its file is in. */
      readonly computerSettings?: (change: SettingsChange, project: string | undefined) => Promise<SettingsAnswer>;
      /** GD21: the computer's page's choice, kept. */
      readonly view?: (scope: ComputerScope) => Promise<boolean>;
      /** The onboarding's Finish (W15), where the onboarding is served. */
      readonly finish?: (choices: OnboardingChoices) => Promise<FinishAnswer>;
      /** The computer-wide path's confirmation (G7-G10), where the onboarding is served. */
      readonly everywhere?: (choices: EverywhereChoices) => Promise<EverywhereAnswer>;
      /** live-pages L1-L3: a served file's version now. */
      readonly versionOf: (name: string) => { readonly version: string; readonly conversations?: number } | undefined;
      /** which-project V14: another project shown in this tab, where the run can. */
      readonly switchProject?: (id: string, from: SwitchFrom) => Promise<{ readonly url: string } | { readonly failed: string }>;
      /** remove-a-project-from-the-list RM9: a project taken off the person's own list. */
      readonly removeProject?: (ask: RemoveAsk) => Promise<{ readonly message: string } | { readonly failed: string }>;
      /** which-project V12: the computer's folder window, where it has one. */
      readonly chooseFolder?: (lang: Lang, from: SwitchFrom) => Promise<ChooseAnswer>;
      /** a-file-in-its-place IP2: the computer's window for places, on the computer's page. */
      readonly choosePlaces?: (lang: Lang, kind: PlaceKind) => Promise<PlacesAnswer>;
      /** V14, amended: what a page of a project shown earlier in this process is told, by its token. */
      readonly pastRun?: (other: string, urlOf: (name: string) => string) => PastRunAnswer | undefined;
    },
  ): Promise<{ readonly url: string; readonly urlOf: (name: string) => string; readonly closed: Promise<void> } | undefined> {
    const { server, marks, policyFiles } = this.#dependencies;
    const { servable: served, options, rerender, fresh, include, finish, everywhere, versionOf } = run;
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
      ...(run.view === undefined ? {} : { view: run.view }),
      ...(run.removeProject === undefined ? {} : { removeProject: run.removeProject }),
      ...(run.chooseFolder === undefined ? {} : { chooseFolder: run.chooseFolder }),
      ...(run.choosePlaces === undefined ? {} : { choosePlaces: run.choosePlaces }),
      ...(run.pastRun === undefined ? {} : { pastRun: (other: string) => run.pastRun?.(other, (name) => `${serving.origin}/${token}/${name}`) }),
      origin: serving.origin,
      token,
      files: served,
      read: (name) => policyFiles.readText(name === 'index.html' ? indexPath : join(out, name)),
      mark: (request) => {
        if (run.markWhere === undefined) return recordMark(marks, lines(), request, { asked: options.since.asked, now: clock() });
        const where = run.markWhere(request.project);
        return where === undefined ? Promise.resolve(NO_SUCH_PROJECT) : recordMark(where.store, where.lines, request, { asked: options.since.asked, now: clock() });
      },
      unmark: (path, project) => {
        if (run.markWhere === undefined) return recordUnmark(marks, path, clock());
        const where = run.markWhere(project);
        return where === undefined ? Promise.resolve(NO_SUCH_PROJECT) : recordUnmark(where.store, path, clock());
      },
      // R58: the change becomes the `SetupOptions` the same flags would build, and runs through the same setup.
      // GD32: the computer's page writes a row's Block or Track alone, into that row's project; its own settings go
      // through `api/everywhere` and `api/notify`.
      ...(run.computerSettings !== undefined && !options.share ? { settings: run.computerSettings } : {}),
      ...(this.#dependencies.setup === undefined || options.share || (everywhere !== undefined && this.#notAProject(this.#dependencies.workingDirectory) === 'home')
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
      ...(everywhere === undefined ? {} : { everywhere }),
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
      home,
      workingDirectory,
      noProject,
      temporary,
      ...(this.#dependencies.removedProjects === undefined ? {} : { removed: this.#dependencies.removedProjects }),
      switchable: this.#dependencies.switchTo !== undefined,
      choosable: this.#dependencies.switchTo !== undefined && this.#dependencies.folderChooser?.available === true,
      removable: this.#dependencies.removedProjects !== undefined,
    });
    return { listing, projects: above === undefined ? known : { ...known, above } };
  }

  /**
   * GD32: a row's Block or Track from the computer's page. A file of a listed project - set up or not - is written into
   * that project, as its own page writes it: its settings through a setup built for its folder, its told list beside
   * them. Blocking in a project not set up runs agentwhy's check there, as Block on its own page does. A file of no
   * project (a chat's folder, the temporary space) is the computer's: its rule goes where the computer's rules are.
   * Nothing else is written from here: the page offers nothing else.
   */
  async #computerSettings(change: SettingsChange, folder: string | undefined, kind: ProjectKind | undefined, computer: ((choices: EverywhereChoices) => Promise<EverywhereAnswer>) | undefined): Promise<SettingsAnswer> {
    if (change.change !== 'mode' && change.change !== 'protect' && change.change !== 'unprotect') {
      return { outcome: 'refused', output: 'The computer’s page changes how a file is kept from your AI, and nothing else. The rest is in a project’s own Settings.' };
    }
    if (folder === undefined || kind === undefined) {
      return { outcome: 'refused', output: 'This page could not tell which project the file is in, so nothing was written. Reload the page and try again.' };
    }
    if (kind === 'removed') return { outcome: 'refused', output: 'This file’s project was taken off the list, so nothing was written.' };
    if (kind === 'none') {
      if (computer === undefined) return { outcome: 'refused', output: 'This file is in no project, and this run cannot write the computer’s rules.' };
      const answer = await computer(computerChoices(change));
      if (answer.outcome === 'refused') return { outcome: 'refused', output: answer.message };
      return answer.results.every((result) => result.written)
        ? { outcome: 'written', output: 'Written for the whole computer.' }
        : { outcome: 'unwritable', output: 'Not all of it could be written for the whole computer. Settings shows what holds the file now.' };
    }
    const { setupIn, tellListsIn } = this.#dependencies;
    if (setupIn === undefined || (change.change === 'mode' && tellListsIn === undefined)) {
      return { outcome: 'refused', output: 'This run cannot write another project’s settings. Open the project from the list of projects, and change it there.' };
    }
    const setup = setupIn(folder);
    return change.change === 'mode' ? modeChange(setup, (tellListsIn as (one: string) => ToldListWriter)(folder), change) : settingsChangeToSetup(setup, change);
  }

  /**
   * GD20, GD22: what each listed folder is, as the projects window knows it - no project at all (the home folder, a root,
   * the computer's temporary space, a Codex chat's folder), taken off the list (no row), set up, or not set up (or not
   * known to be: a folder gone, or one the system guards, is not looked into, and is the computer's to show).
   */
  #kindsOf(folders: readonly string[], projects: IndexProjects | undefined): ReadonlyMap<string, ProjectKind> {
    const { home, temporaryDirectory } = this.#dependencies;
    const rows = new Map((projects?.rows ?? []).map((row) => [row.id, row]));
    return new Map(folders.map((folder): [string, ProjectKind] => {
      if (this.#notAProject(folder) !== undefined || inTemporarySpace(folder, temporaryDirectory, home) || (home !== undefined && inChatFolder(folder, home))) return [folder, 'none'];
      const row = rows.get(projectDirectoryName(folder));
      if (row === undefined) return [folder, projects === undefined ? 'not-set-up' : 'removed'];
      return [folder, row.setUp === true ? 'set-up' : 'not-set-up'];
    }));
  }

  /**
   * GD26: whether the computer was set up - its record says so, or (a computer set up before the record existed) its
   * rules, told list or alerts are there, and the record is written now, silently, as N6 writes a project's. A record
   * that cannot be read is no guess either way: the computer's view opens, as W23 leaves a project's index.
   */
  async #computerSetUp(): Promise<boolean> {
    const { computerOnboarding, everywhere } = this.#dependencies;
    if (computerOnboarding === undefined) return true;
    const reading = await computerOnboarding.read();
    if (reading.here || reading.failed) return true;
    if ((await everywhere?.setUp?.()) !== true) return false;
    await computerOnboarding.add((this.#dependencies.clock ?? (() => this.#dependencies.now))());
    return true;
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
  /**
   * `computer`: the computer's page shows, and writes, the person's answers for everywhere they work - never an answer
   * keyed by the home folder, which would then answer for every project under it (GB9's latent edge).
   */
  async #noticesNow(computer = false): Promise<IndexNotices | undefined> {
    const { notices } = this.#dependencies;
    if (notices === undefined) return undefined;

    const view = await notices.view();
    const from = (key: 'on' | 'clean' | 'say' | 'notify'): 'project' | 'everywhere' | 'default' =>
      !computer && view.forProject[key] !== undefined ? 'project' : view.defaults[key] !== undefined ? 'everywhere' : 'default';
    const effective = computer ? view.defaults : view.effective;

    return {
      on: effective.on ?? DEFAULT_THRESHOLD,
      // GD23: the computer's own `watch` is quiet about a quiet turn unless asked, so its page starts this row off -
      // the answer `watch --everywhere` settles on, or the page would offer a line nobody is given.
      clean: effective.clean ?? (computer ? DEFAULT_CLEAN_EVERYWHERE : DEFAULT_CLEAN),
      say: effective.say ?? DEFAULT_SAID_AS,
      notify: effective.notify ?? DEFAULT_CHANNELS,
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
    page: ReportPageInput,
  ): Promise<GeneratedReport | PolicyRefused> {
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
      ...(page.project === undefined ? {} : { project: page.project }),
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
          ...(result.gaps === undefined ? {} : { gaps: result.gaps }),
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
  home: string | undefined,
): IndexEntry {
  const folder = session.project?.folder;
  return {
    name,
    provider: session.provider,
    ...(title === undefined ? {} : { title }),
    // Step 2: a row of the computer's page names the project it was held in, as the projects window names one.
    ...(folder === undefined ? {} : { project: rowProject(folder, home) }),
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
            ...(report.gaps === undefined ? {} : { gaps: report.gaps }),
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
export function filesOf(actions: SessionActions): readonly IndexFile[] {
  const strongest = new Map<string, IndexFile>();
  const add = (path: Redacted, kind: IndexFile['kind']): void => {
    if (!strongest.has(path as string)) strongest.set(path as string, { path, kind });
  };
  for (const file of actions.rotate) add(file.path, 'seen');
  for (const route of actions.openRoutes) add(route.path, 'named');
  for (const path of actions.onlyInResults) add(path, 'result');
  // F57a: a file the record shows was read, and that the person chose Track for, is told whatever else was tried on it.
  // `actionsOf` keeps a told path off every other list but `unknown`, so read after it, a search that matched nothing
  // made a tracked file read through `head` an unknown one, and its row asked for a fix (found 2026-10-05).
  for (const path of actions.told ?? []) add(path, 'told');
  for (const path of actions.unknown) add(path, 'unknown');
  return [...strongest.values()];
}

/**
 * Every project's conversations as one listing (G11), for the run that reads them as it reads one project's. It looked
 * in every project's place, so its `searched` is left to the projects window, which lists them.
 */
function everyListing(every: EveryProjectListing, workingDirectory: string): SessionListing {
  return { directory: workingDirectory, found: true, searched: [], sessions: every.sessions };
}

/**
 * V10b: a reader that does not look inside `folder` - a file there is read as one that could not be, so nothing asks the
 * person whether agentwhy may look - and reads every other path as `files` does.
 */
function notInside(files: FileReader, folder: string): FileReader {
  const inside = (path: string): boolean => {
    const between = relative(folder, path);
    return between === '' || (between !== '..' && !between.startsWith(`..${sep}`) && !isAbsolute(between));
  };
  return {
    readText: (path) => (inside(path) ? Promise.reject(new FileAccessError('unreadable', path)) : files.readText(path)),
    readLines: (path) => (inside(path)
      ? { [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new FileAccessError('unreadable', path)) }) }
      : files.readLines(path)),
  };
}

/** A session a report was read for: what the digest and a mark's lines are made from. */
interface ReadSession {
  readonly id: string;
  readonly name: string;
  readonly modifiedAt: number;
  readonly actions: SessionActions;
  /** The folder of the project it was held in, on the computer's page (GD18). */
  readonly project?: string;
}

/** The folders of every project a listing that spans projects holds, each once (GD18). */
function foldersOf(sessions: readonly SessionSummary[]): readonly string[] {
  return [...new Set(sessions.flatMap((session) => (session.project === undefined ? [] : [session.project.folder])))];
}

/** A project as a row of the computer's page names it (step 2, GD18): its id in the projects window, name and place. */
function rowProject(folder: string, home: string | undefined, kind?: ProjectKind): RowProject {
  return withKind({ id: projectDirectoryName(folder), name: projectName(folder), ...(home === undefined ? {} : { place: homeRelative(folder, home) }) }, kind);
}

/** GD20: a row names what its project is where that is why it is on the computer's page - no project, or not set up. */
function withKind(project: RowProject, kind: ProjectKind | undefined): RowProject {
  return kind === 'none' || kind === 'not-set-up' ? { ...project, kind } : project;
}

/** The history of marks as the chosen scope shows it: a mark of a project not shown is that project's. */
function shownHistory(check: IndexCheck, shown: (id: string) => boolean): IndexCheck {
  return check.history === undefined ? check : { ...check, history: check.history.filter((line) => line.project === undefined || shown(line.project.id)) };
}

/** A file as the terminal says it: its path, and on the computer's page the project it is in. */
function saidPath(key: string): string {
  const { folder, path } = outOfProject(key);
  return folder === undefined ? path : `${path} (${projectName(folder)})`;
}

/** What a report of a session is drawn with, beside the session and its policy. */
interface ReportPageInput {
  readonly marks: ReadonlyMap<string, MarkResult>;
  readonly served: boolean;
  readonly title: Redacted | undefined;
  /** GD25: the project, by id, a mark made on the page is written for. */
  readonly project?: string;
}

/** A report that was not written because its policy was refused - said as the one refusal it is. */
interface PolicyRefused {
  readonly kind: 'policy-refused';
  readonly output: string;
}

/** What `#generate` gives back for a session it wrote a report of, or tried to. */
export type GeneratedReport = (IndexReport & { readonly kind: 'generated' | 'failed' }) & {
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

/**
 * GD32: a row's change, for a file of no project, as the computer's confirmation sends it: a block in, a block out, or a
 * switch - one list's patterns out and the other's in, so a file is never left in neither.
 */
function computerChoices(change: Extract<SettingsChange, { readonly change: 'mode' | 'protect' | 'unprotect' }>): EverywhereChoices {
  if (change.change !== 'mode') return change.change === 'protect' ? { block: [change.pattern], tell: [] } : { block: [], tell: [], unblock: [change.pattern] };
  if (change.to === 'tell') return { block: [], tell: [...change.patterns], unblock: [...change.rules] };
  if (change.to === 'block') return { block: [...change.patterns], tell: [], untell: [...change.patterns] };
  return { block: [], tell: [], untell: [...change.patterns] };
}
