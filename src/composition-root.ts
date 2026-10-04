// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * A port for a place where nobody can be asked. The served Settings view runs setup with its own confirm step as
 * the consent (R58, `interactive: false`), so a question here would be a question with no one at the other end:
 * it is refused loudly rather than answered with a guess.
 */
function unaskable(what: string): Chooser & MultiChooser & Asker {
  const refuse = (): never => {
    throw new Error(`agentwhy tried to ask for ${what} where nobody can be asked.`);
  };
  return { choose: refuse, chooseMany: refuse, ask: refuse };
}

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { TellLists, tellListPaths } from './report/private-files/tell-lists.ts';
import { projectDirectoryName } from './adapter/claude-code/contract/projects.ts';
import { ClaudeCodeSessionCatalogue } from './adapter/claude-code/discovery/claude-code-session-catalogue.ts';
import { ClaudeCodeSessionDiscovery } from './adapter/claude-code/discovery/claude-code-session-discovery.ts';
import { ClaudeCodeSessionTitles } from './adapter/claude-code/discovery/claude-code-session-titles.ts';
import { ClaudeDesktopTitles } from './adapter/claude-code/discovery/claude-desktop-titles.ts';
import { DESKTOP_SESSIONS } from './adapter/claude-code/contract/desktop-sessions.ts';
import { ClaudeCodeProjectCatalogue } from './adapter/claude-code/discovery/claude-code-project-catalogue.ts';
import { ClaudeCodeSessionSource } from './adapter/claude-code/events/claude-code-session-source.ts';
import { ClaudeCodeProbe } from './adapter/claude-code/probe/claude-code-probe.ts';
import { recogniseClaudeCode } from './adapter/claude-code/discovery/claude-code-recognition.ts';
import { recogniseCodex } from './adapter/codex/discovery/codex-recognition.ts';
import { CodexSessionDiscovery } from './adapter/codex/discovery/codex-session-discovery.ts';
import { CodexSessionIndex } from './adapter/codex/discovery/codex-session-index.ts';
import { CodexSessionCatalogue } from './adapter/codex/discovery/codex-session-catalogue.ts';
import { CodexSessionTitles } from './adapter/codex/discovery/codex-session-titles.ts';
import { codexOnThisComputer } from './adapter/codex/discovery/codex-on-this-computer.ts';
import { CodexProjectCatalogue } from './adapter/codex/discovery/codex-project-catalogue.ts';
import { SESSIONS_ROOT as CODEX_SESSIONS_ROOT, THREAD_NAMES } from './adapter/codex/contract/session.ts';
import { CodexSessionSource } from './adapter/codex/events/codex-session-source.ts';
import { CombinedProjectCatalogue } from './core/combined-project-catalogue.ts';
import { CombinedSessionCatalogue } from './core/combined-session-catalogue.ts';
import { ProviderTitles } from './core/provider-titles.ts';
import { FormatSelectingReader } from './core/session-reader.ts';
import type { CodexDoctorReport } from './adapter/codex/probe/codex-doctor-report.ts';
import { CodexProbe } from './adapter/codex/probe/codex-probe.ts';
import { CommandRouter } from './cli/command-router.ts';
import { CheckCliCommand } from './cli/commands/check-cli-command.ts';
import { InitCliCommand } from './cli/commands/init-cli-command.ts';
import { RefuseCliCommand } from './cli/commands/refuse-cli-command.ts';
import { CodexStopCliCommand } from './cli/commands/codex-stop-cli-command.ts';
import { codexTurnFormat } from './report/watch/codex-turn-format.ts';
import { DetachedStart } from './report/start/detached-start.ts';
import { FilePageServers } from './infrastructure/file-page-servers.ts';
import { NodeBackgroundRun } from './infrastructure/node-background-run.ts';
import { NodePageProbe } from './infrastructure/node-page-probe.ts';
import { CodexTurnRefusals } from './adapter/codex/hooks/stop-refusals.ts';
import { DoctorCliCommand } from './cli/commands/doctor-cli-command.ts';
import { ReportCliCommand } from './cli/commands/report-cli-command.ts';
import { SessionsCliCommand } from './cli/commands/sessions-cli-command.ts';
import { MenuCliCommand } from './cli/commands/menu-cli-command.ts';
import { StartCliCommand } from './cli/commands/start-cli-command.ts';
import { NotifyCliCommand } from './cli/commands/notify-cli-command.ts';
import { WatchCliCommand } from './cli/commands/watch-cli-command.ts';
import { widthFor } from './cli/commands/report-usage.ts';
import type { ProjectRoot } from './core/project-root.ts';
import { Redactor } from './core/redaction/redactor.ts';
import { SessionFormats } from './core/session-format.ts';
import { SessionReport } from './report/session-report.ts';
import { TextDigestRenderer } from './report/check/render/text-digest-renderer.ts';
import { SessionCheck } from './report/check/session-check.ts';
import { CommandRefusal } from './refuse/command-refusal.ts';
import { ShellCommandTrial } from './infrastructure/shell-command-trial.ts';
import { CodexMirror } from './setup/codex-mirror.ts';
import { ProjectSetup } from './setup/project-setup.ts';
import { ReportPageRenderer } from './report/render/report-page/report-page-renderer.ts';
import { ConversationsRenderer } from './report/start/conversations/conversations-renderer.ts';
import { SettingsRenderer } from './report/start/settings/settings-renderer.ts';
import { MonthRenderer } from './report/start/month/month-renderer.ts';
import { ToFixRenderer } from './report/start/to-fix/to-fix-renderer.ts';
import type { AppLinks } from './report/start/app-nav.ts';
import { SessionStart } from './report/start/session-start.ts';
import { NoticeWordsRenderer } from './report/watch/render/notice-words.ts';
import { NoticeSettings } from './report/watch/notice-settings.ts';
import { SubagentWatch } from './report/watch/subagent-watch.ts';
import { TextReportRenderer } from './report/render/text-report-renderer.ts';
import { createDoctorAttentionRules } from './doctor/render/attention/doctor-attention-rules.ts';
import { JsonDoctorRenderer } from './doctor/render/json-doctor-renderer.ts';
import { TextDoctorRenderer } from './doctor/render/text-doctor-renderer.ts';
import { SessionDoctor } from './doctor/session-doctor.ts';
import { CodexDoctor } from './doctor/codex-doctor.ts';
import { FormatSelectingDoctor } from './doctor/format-selecting-doctor.ts';
import { CodexTextDoctorRenderer } from './doctor/render/codex-text-doctor-renderer.ts';
import { NodeBrowser } from './infrastructure/node-browser.ts';
import { OsascriptFolderChooser } from './infrastructure/osascript-folder-chooser.ts';
import { PowershellFolderChooser } from './infrastructure/powershell-folder-chooser.ts';
import type { Asker } from './ports/asker.ts';
import type { Chooser } from './ports/chooser.ts';
import type { MultiChooser } from './ports/multi-chooser.ts';
import { ClackAsker } from './infrastructure/clack-asker.ts';
import { ClackChooser } from './infrastructure/clack-chooser.ts';
import { ClackMultiChooser } from './infrastructure/clack-multi-chooser.ts';
import { FileMarkStore } from './infrastructure/file-mark-store.ts';
import { FileCheckedStore } from './infrastructure/file-checked-store.ts';
import { FileOnboardingStore } from './infrastructure/file-onboarding-store.ts';
import { OnboardingRenderer } from './report/start/onboarding/onboarding-renderer.ts';
import { NodeFileSystem } from './infrastructure/node-file-system.ts';
import { realDirectory } from './infrastructure/real-directory.ts';
import { NodeAgentwhyInvocation } from './infrastructure/node-agentwhy-invocation.ts';
import { NodeLocalServer } from './infrastructure/node-local-server.ts';
import type { LocalServer } from './ports/local-server.ts';
import { NodeTextInput } from './infrastructure/node-text-input.ts';
import { StreamPrinter } from './infrastructure/stream-printer.ts';
import { TerminalBanner } from './infrastructure/terminal-banner.ts';
import { FileAlertStore } from './infrastructure/file-alert-store.ts';
import { OsNotifier } from './infrastructure/os-notifier.ts';
import { TAGLINE, terminalLogo } from './shared/terminal-logo.ts';
import { leftAlone } from './core/guarded-places.ts';

// The only module that chooses implementations and wires them together; everything else receives what it needs
// through its constructor. New commands and output formats are registered here, without changing existing code.
/** Where the shell is standing. The composition root may not ask `process` itself, so it is told. */
export interface Environment {
  readonly workingDirectory: string;
  readonly home: string;
  /** Which opener to call for a file. Read here rather than asked for, because only the shell touches `process`. */
  readonly platform: string;
  /** Where a report goes when someone asked to see one and not to keep one (§7.5). Never the working directory. */
  readonly temporaryDirectory: string;
  /**
   * Which account this process runs as, or `undefined` where the platform has no such notion. Read in the shell,
   * like `platform`, and used by the one store that writes into the shared temporary directory.
   */
  readonly user: number | undefined;
  /** Both streams are terminals, so a person is watching and can answer. Decided in the shell and nowhere else. */
  readonly interactive: boolean;
  /** Stdout is a terminal, so what is drawn for a person - the wordmark above an answer - is drawn. */
  readonly terminal: boolean;
  /** Standard input alone is a terminal, so nothing is piping into this process - a hook never runs it that way. */
  readonly inputIsTerminal: boolean;
  /**
   * Stdout is a terminal and `NO_COLOR` is not set, so a report may be coloured. `--no-color` and `--ascii` can still
   * turn it off; nothing can turn it on.
   */
  readonly colour: boolean;
  /** How wide the terminal is, or `undefined` where stdout is not one. Read in the shell, like `colour`. */
  readonly columns: number | undefined;
  readonly input: NodeJS.ReadStream;
  readonly output: NodeJS.WriteStream;
  /** The moment the command started, read once in the shell so that every range and age is measured from it. */
  readonly now: number;
  /** Which way into Claude Code ran a hook, or `undefined` where nothing said (`the-agent-tells-you.md` B9e2). */
  readonly entryPoint?: string | undefined;
  /** The system's locale (`pl_PL.UTF-8`), or `undefined` where none is set (`the-agent-tells-you.md` R29). */
  readonly locale?: string | undefined;
  /** The project a hook runs for (`CLAUDE_PROJECT_DIR`), or `undefined` outside a hook (`the-agent-tells-you.md` R18). */
  readonly projectDirectory?: string | undefined;
  /** The script this process runs, as it was started (`argv[1]`): half of how this agentwhy runs (`a-hook-runs-what-you-ran.md` J2). */
  readonly script?: string | undefined;
  /** The process's `PATH`: the other half (J2). */
  readonly path?: string | undefined;
  /**
   * The person's shell (`$SHELL`) and this process's environment, for the one trial run setup makes of the check it is
   * about to write into `~/.codex`, run as Codex runs a hook (`2026-10-02-codex-approves-its-own-hook.md` AO14). Absent:
   * no trial can be made, and nothing is written there.
   */
  readonly shell?: string | undefined;
  readonly variables?: Readonly<Record<string, string | undefined>> | undefined;
  /** This process, which a page server it runs is remembered under (`2026-10-02-a-page-not-a-file.md` PF2). */
  readonly pid?: number | undefined;
  /** The Node that runs this process, which starts agentwhy again in the background (PF3). */
  readonly node?: string | undefined;
  /**
   * Show another project in the tab a page is open in (`.ai/specs/2026-09-27-which-project.md` V14): the shell starts
   * `start` for that folder in this process and answers with its page's address. Absent where nothing can be shown so.
   */
  readonly switchTo?: (folder: string, since: string, from: 'step' | 'window') => Promise<{ readonly url: string } | { readonly failed: string }>;
  /** This run was started for a page that switched to it: it opens no browser, and hands its page's address here. */
  readonly handedOver?: (url: string) => void;
  /** Where that page asked from - the onboarding's project step, or the window - so the run opens the page it should (V16). */
  readonly arrivedFrom?: 'step' | 'window';
  /** The run says the token its pages carry, once it serves; `pastRuns` is every run this process has served so. */
  readonly served?: (token: string) => void;
  readonly pastRuns?: () => readonly { readonly token: string; readonly folder: string }[];
  /** The page server every run of this process shares (V14, amended): absent, this run has one of its own. */
  readonly server?: LocalServer;
}

/**
 * Where a person's answers about being told are kept (`the-agent-tells-you.md` R22): one file, beside the marks,
 * under the directory this tool already owns in their home - outside every project, and so outside every repository.
 */
export function preferencesPath(environment: Pick<Environment, 'home'>): string {
  return join(environment.home, '.agentwhy', 'notices.json');
}

/** Where the pages `start` writes lead to one another. */
const APP_LINKS = { conversations: 'index.html', toFix: 'to-fix.html', month: 'month.html', settings: 'settings.html', onboarding: 'onboarding.html' } satisfies AppLinks;

/**
 * The page server for a whole process (`.ai/specs/2026-09-27-which-project.md` V14, amended 2026-09-28): every project a
 * page switches to is served at the same address, so the pages of the one before still reach it.
 */
export function processServer(): LocalServer {
  return new NodeLocalServer();
}

export function createCommandRouter(environment: Environment): CommandRouter {
  const files = new NodeFileSystem();
  // which-project V6: the home directory as a working directory is given, every link followed - read only to tell a
  // run started there. Every other use keeps `home` as the shell gave it.
  const realHome = realDirectory(environment.home);
  // J1-J3: how this agentwhy runs, for every hook written in this run and for the command `watch` offers.
  const invocation = new NodeAgentwhyInvocation({ script: environment.script, path: environment.path, platform: environment.platform });
  // `check` lists Claude Code's sessions alone: the Codex specification covers `doctor`, `report` and the pages `start`
  // serves, and nothing else (`.ai/plans/2026-09-29-what-codex-wrote.md` step 8's audit). `watch` and every hook read
  // Claude Code alone too, by their own source.
  const claudeCatalogue = new ClaudeCodeSessionCatalogue(files, environment.home);
  // XD7: the one registry that tells formats apart by content - Codex's strict first-line rule first - read by `doctor`,
  // `report`, `start` and `sessions`. One listing of Codex's root serves the catalogue and the reports it lists.
  const codexDiscovery = new CodexSessionDiscovery({ directories: files, files });
  const codexIndex = new CodexSessionIndex(codexDiscovery);
  const codexRoot = join(environment.home, ...CODEX_SESSIONS_ROOT);
  const codexCatalogue = new CodexSessionCatalogue({ index: codexIndex, directories: files, sessionsRoot: codexRoot });
  // XD5: one list of a project's conversations for both AIs, each row naming its AI.
  const catalogue = new CombinedSessionCatalogue([claudeCatalogue, codexCatalogue]);
  // CK6 with AO1: Codex is used on this computer where its `~/.codex` folder is - the one gate the setup and
  // Settings' Codex line ask, since the check agentwhy writes is the person's own, outside every project.
  const codexHere = (): Promise<boolean> => codexOnThisComputer(files, environment.home);
  // AO14: the one trial run of the check before it is written into `~/.codex`, as Codex runs a hook, from a folder no
  // project is above. Absent `variables`, no trial can be made and the mirror writes nothing there.
  const codexTrial = environment.variables === undefined
    ? {}
    : { trial: new ShellCommandTrial({ platform: environment.platform, ...(environment.shell === undefined ? {} : { shell: environment.shell }), environment: environment.variables }) };
  const codexMirrorShared = { ...codexTrial, trialFolder: environment.temporaryDirectory, home: environment.home, codexOnThisComputer: codexHere };
  const formats = new SessionFormats([
    { provider: 'codex', recognise: (input) => recogniseCodex(codexDiscovery, files, input) },
    { provider: 'claude-code', recognise: (input) => recogniseClaudeCode(files, input) },
  ]);
  const doctor = new FormatSelectingDoctor({
    formats,
    doctors: {
      codex: new CodexDoctor({
        probe: new CodexProbe({ discovery: codexDiscovery, directories: files, files }),
        renderers: { text: new CodexTextDoctorRenderer(), json: new JsonDoctorRenderer<CodexDoctorReport>() },
      }),
      'claude-code': new SessionDoctor({
        discovery: new ClaudeCodeSessionDiscovery(files),
        probe: new ClaudeCodeProbe(files),
        renderers: {
          text: new TextDoctorRenderer(createDoctorAttentionRules()),
          json: new JsonDoctorRenderer(),
        },
      }),
    },
    whenUnavailable: 'claude-code',
  });

  // One opener, so a report and an index are shown the same way.
  const browser = new NodeBrowser(environment.platform);
  // F57: the files a person asked only to be told about, read with the policy by every command that chooses one, so
  // an alert, a report and a refusal never read the same file differently.
  const tell = tellListPaths(environment.home, environment.workingDirectory);
  const tellLists = new TellLists({ files, writer: files, paths: tell });

  const report = new SessionReport({
    reader: new FormatSelectingReader({
      formats,
      sources: {
        codex: new CodexSessionSource({ discovery: codexDiscovery, files, sessionsRoot: codexRoot, index: codexIndex }),
        'claude-code': new ClaudeCodeSessionSource({ discovery: new ClaudeCodeSessionDiscovery(files), files }),
      },
      whenUnavailable: 'claude-code',
    }),
    files,
    tell,
    // A salt per run, so a pseudonym says "the same value" inside one report and nothing at all outside it.
    createRedactor: (projectRoot, share) => new Redactor(randomUUID(), projectRoot, share),
    createRenderer: (options) =>
      new TextReportRenderer(options.width, {
        ascii: options.ascii,
        full: options.full,
        colour: environment.colour && options.colour,
      }),
    htmlRenderer: new ReportPageRenderer(),
    // A record's time on the page is this machine's, as the days on Conversations are (the report page spec M4).
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    catalogue,
    workingDirectory: environment.workingDirectory,
    browser,
    temporaryDirectory: environment.temporaryDirectory,
    now: environment.now,
  });

  // Its own salt: a pseudonym in a title means "the same value" within one list of sessions and nothing beyond it.
  // One process runs one command, so `start` and `sessions` never share a list; both AIs' titles are one list's.
  // Codex's are the names Codex gave its threads (`THREAD_NAMES`, measured 2026-09-30); a thread it named nothing - a
  // `codex exec` run - keeps the missing-title state rather than a message guessed at.
  const titleRedactor = new Redactor(randomUUID());
  // The Claude desktop app writes no `ai-title`; its own file names the conversation (`claude-desktop-conversations.md`
  // CD2). macOS is the one system where that file's place is measured (CD6, CDD4) - elsewhere nothing is looked for.
  // One reader for both lists below, so a file is read once however many lists ask (CD5).
  const desktopTitles = environment.platform === 'darwin'
    ? new ClaudeDesktopTitles({ directories: files, files, folder: join(environment.home, ...DESKTOP_SESSIONS.folder) })
    : undefined;
  const titles = new ProviderTitles({
    'claude-code': new ClaudeCodeSessionTitles({ transcripts: files, redactor: titleRedactor, ...(desktopTitles === undefined ? {} : { desktop: desktopTitles }) }),
    codex: new CodexSessionTitles({ files, directories: files, path: join(environment.home, ...THREAD_NAMES.file), redactor: titleRedactor }),
  });
  // which-project V9-V11: the person's projects, for the window the sidebar's card opens. A title from another project
  // passes a redactor of its own, as this project's titles do.
  // A folder only Codex worked in is listed under the id Claude Code would give it, so a folder in both is one project
  // (decided 2026-09-29).
  // which-project V10b: on macOS, another project's folder where the system asks before an app reads is not looked into.
  const leaveAlone = environment.platform === 'darwin'
    ? (folder: string): boolean => leftAlone(folder, environment.workingDirectory, environment.home)
    : undefined;
  const projects = new CombinedProjectCatalogue([
    new ClaudeCodeProjectCatalogue({ directories: files, transcripts: files, redactor: new Redactor(randomUUID()), home: environment.home, ...(leaveAlone === undefined ? {} : { leaveAlone }), ...(desktopTitles === undefined ? {} : { desktop: desktopTitles }) }),
    new CodexProjectCatalogue({ index: codexIndex, directories: files, sessionsRoot: codexRoot, projectId: projectDirectoryName, ...(leaveAlone === undefined ? {} : { leaveAlone }) }),
  ]);

  // One person's record of what they did about a file, beside nothing else and outside every project
  // (`worth-running-every-day` R33). The directory is named the way Claude Code names the project's sessions.
  const projectRecords = join(environment.home, '.agentwhy', 'projects', projectDirectoryName(environment.workingDirectory));
  const marks = new FileMarkStore(join(projectRecords, 'marks.jsonl'));
  // Beside it, the conversations a person asked to check although they were older than a run (F55).
  const checked = new FileCheckedStore(join(projectRecords, 'checked.jsonl'));
  // Whether this person finished the onboarding, here and anywhere: one file for every project, since the intro plays
  // once per person (`.ai/specs/2026-09-24-onboarding.md` W21, N1, N2). Outside every project, as the marks are.
  const onboarding = new FileOnboardingStore(join(environment.home, '.agentwhy', 'onboarding.jsonl'), projectDirectoryName(environment.workingDirectory));

  // One set of rules for the preferences file, with two ways in: this command, and the page's Notifications panel.
  const notices = new NoticeSettings({
    files,
    writer: files,
    path: preferencesPath(environment),
    workingDirectory: environment.workingDirectory,
  });

  // PF2: the page server running for this project, remembered in the person's own folder under the project's key.
  const pageServers = new FilePageServers(join(environment.home, '.agentwhy'));
  const thisProject = projectDirectoryName(environment.workingDirectory);
  const pid = environment.pid;

  const start = new SessionStart({
    ...(pid === undefined
      ? {}
      : {
          pageServer: {
            write: (url: string) => pageServers.write(thisProject, { url, pid, startedAt: Date.now() }),
            remove: () => pageServers.remove(thisProject, pid),
          },
        }),
    catalogue,
    report,
    files,
    tell,
    tellLists,
    // live-pages L4: a clock that only moves forward, to space out reading a session the agent is still writing.
    elapsed: () => performance.now(),
    policyFiles: files,
    directories: files,
    browser,
    // The Conversations page is the index; To fix, This month and Settings are pages of their own, on the UI kit.
    // The earlier page they were views of is gone (`.ai/plans/2026-09-23-to-fix-redesign.md` step 4).
    renderer: new ConversationsRenderer(APP_LINKS),
    pages: {
      [APP_LINKS.month]: new MonthRenderer(APP_LINKS),
      [APP_LINKS.toFix]: new ToFixRenderer(APP_LINKS),
      [APP_LINKS.settings]: new SettingsRenderer(APP_LINKS),
    },
    // Days and times on the page are this machine's (`for-people-who-build-with-ai.md` O2).
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    digest: new TextDigestRenderer('counts', { colour: environment.colour }),
    marks,
    checked,
    // The first page a project's first served run opens (W23), and written with every served run (W25).
    onboarding: { page: new OnboardingRenderer(APP_LINKS), file: APP_LINKS.onboarding, store: onboarding },
    titles,
    projects,
    // which-project V14, V15: another project shown in the same tab, by a run the shell starts beside this one.
    ...(environment.switchTo === undefined ? {} : { switchTo: environment.switchTo }),
    ...(environment.handedOver === undefined ? {} : { handedOver: environment.handedOver }),
    ...(environment.arrivedFrom === undefined ? {} : { arrivedFrom: environment.arrivedFrom }),
    ...(environment.served === undefined ? {} : { served: environment.served }),
    ...(environment.pastRuns === undefined ? {} : { pastRuns: environment.pastRuns }),
    // V12: the computer's own folder window - macOS's, measured (VB1), or Windows', not yet (VB7). Elsewhere none.
    folderChooser: environment.platform === 'win32' ? new PowershellFolderChooser(environment.platform) : new OsascriptFolderChooser(environment.platform),
    // R50-R54: the page `start` opens is served from the loopback address, behind a token only that page is given.
    server: environment.server ?? new NodeLocalServer(),
    // R58: a change made in Settings runs through the same setup a terminal runs. Nothing here can ask a question:
    // the page's own confirm step is the consent, so the choosers are never reached and say so if they ever are.
    // nothing-updates-by-itself U2: the version this run is, beside the hooks' own, for the update notice.
    invocation,
    // codex-blocks-too CK5: every write of Claude Code's `refuse` - a switch, Finish blocking, the onboarding - writes
    // Codex's with it, in a project that uses Codex.
    setup: new CodexMirror({
      setup: new ProjectSetup({
        files,
        chooser: unaskable('a choice'),
        hookChooser: unaskable('a list'),
        asker: unaskable('a question'),
        interactive: false,
        workingDirectory: environment.workingDirectory,
        home: environment.home,
        realHome,
        invocation,
      }),
      files,
      chooser: unaskable('a choice'),
      interactive: false,
      workingDirectory: environment.workingDirectory,
      invocation,
      ...codexMirrorShared,
    }),
    // CK6, amended 2026-10-01: Settings' Codex line, in a project with no Codex conversation of its own.
    codexOnThisComputer: codexHere,
    // R26a: the panel that says what a person is told, writing the one file outside every project.
    notices,
    printer: new StreamPrinter(environment.output),
    // The wordmark above the answer, and colour over it: both decided in the shell, neither read from a stream here.
    terminal: { colour: environment.colour, decorated: environment.terminal },
    token: () => randomUUID(),
    clock: () => Date.now(),
    workingDirectory: environment.workingDirectory,
    home: environment.home,
    realHome,
    temporaryDirectory: environment.temporaryDirectory,
    now: environment.now,
  });

  const check = new SessionCheck({
    catalogue: claudeCatalogue,
    report,
    files,
    tell,
    createRenderer: (options) => new TextDigestRenderer(options.full ? 'full' : 'brief', { colour: environment.colour }),
    marks,
    workingDirectory: environment.workingDirectory,
    now: environment.now,
  });

  // What both hooks share - Claude Code's `watch` and Codex's Stop (`codex-says-it-too` CX1): the redactor, the words,
  // the store, the person's choices and how agentwhy runs. What differs is handed to each below.
  const watching = {
    files,
    tell,
    // Its own salt, as every report has: nothing it redacts means anything outside this one run.
    createRedactor: (projectRoot: ProjectRoot) => new Redactor(randomUUID(), projectRoot, false),
    renderer: new NoticeWordsRenderer(),
    notifier: new OsNotifier(environment.platform),
    home: environment.home,
    // What one hook run leaves for the next: outside every project, and swept by age (`a-notice-in-the-conversation` R7).
    store: new FileAlertStore(environment.temporaryDirectory, environment.user),
    // What a person chose about being told: their own file, outside every project, read on every run (R22, R25).
    preferencesPath: preferencesPath(environment),
    // R29: the language of a line nobody chose one for.
    ...(environment.locale === undefined ? {} : { locale: environment.locale }),
    invocation,
  };
  const codexWatch = new SubagentWatch({
    ...watching,
    source: new CodexSessionSource({ discovery: codexDiscovery, files, sessionsRoot: codexRoot, index: codexIndex }),
    input: new NodeTextInput(environment.input),
    turnFormat: codexTurnFormat(files, new CodexTurnRefusals(files), join(environment.home, ...THREAD_NAMES.file), environment.home),
  });

  const watch = new SubagentWatch({
    ...watching,
    source: new ClaudeCodeSessionSource({ discovery: new ClaudeCodeSessionDiscovery(files), files }),
    input: new NodeTextInput(environment.input),
    // R14: the agent is asked to speak only where a person is reading, and the entry point is what says so.
    ...(environment.entryPoint === undefined ? {} : { entryPoint: environment.entryPoint }),
    // R18: the agent runs agentwhy the way this project's hook does; J6: else the way this hook was started.
    ...(environment.projectDirectory === undefined ? {} : { projectDirectory: environment.projectDirectory }),
  });

  // Drawn above the first question each of these commands asks, and not again: one banner per command.
  const logo = (): TerminalBanner => new TerminalBanner(terminalLogo([TAGLINE], { colour: environment.colour, ascii: false }));
  const setupBanner = logo();

  // Registration order is the order `--help` lists them in, so the way in comes first.
  // PF3-PF6: the pages served from the background - the running server reused, else one started, else files.
  const detached = new DetachedStart({
    servers: pageServers,
    probe: new NodePageProbe(),
    background: new NodeBackgroundRun(environment.node ?? 'node', environment.script),
    browser,
    project: thisProject,
    files: start,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    clock: () => Date.now(),
  });
  const start_ = new StartCliCommand({ start, detached, now: environment.now });
  const check_ = new CheckCliCommand({ check, now: environment.now });
  const setupChooser = new ClackChooser(environment.input, environment.output, setupBanner);
  const init_ = new InitCliCommand(
    new CodexMirror({
      setup: new ProjectSetup({
        files,
        chooser: setupChooser,
        hookChooser: new ClackMultiChooser(environment.input, environment.output, setupBanner),
        asker: new ClackAsker(environment.input, environment.output, setupBanner),
        interactive: environment.interactive,
        workingDirectory: environment.workingDirectory,
        home: environment.home,
        realHome,
        invocation,
      }),
      files,
      chooser: setupChooser,
      interactive: environment.interactive,
      workingDirectory: environment.workingDirectory,
      invocation,
      ...codexMirrorShared,
    }),
  );
  // One banner for both ports this command can ask through - the range question, then the list - so it is drawn once.
  const sessionsBanner = logo();
  const sessions_ = new SessionsCliCommand({
    catalogue,
    workingDirectory: environment.workingDirectory,
    chooser: new ClackChooser(environment.input, environment.output, sessionsBanner),
    asker: new ClackAsker(environment.input, environment.output, sessionsBanner),
    titles,
    report,
    width: widthFor(environment.columns),
    interactive: environment.interactive,
    now: environment.now,
  });

  // `agentwhy menu`: the few things to do here, in the order most people want them.
  const menu = new MenuCliCommand({
    chooser: new ClackChooser(environment.input, environment.output, logo()),
    printer: new StreamPrinter(environment.output),
    interactive: environment.interactive,
    // Named by what a person gets, with the command beside it. `start` leads while `check`'s rows are unmeasured
    // (spec §5): a page carries a row that turns out to be a mention far better than a list in a terminal does.
    entries: [
      { label: 'Open the last 7 days of sessions', detail: 'agentwhy start', command: start_ },
      { label: 'List what to rotate or check', detail: 'agentwhy check', command: check_ },
      { label: 'Open one session', detail: 'agentwhy sessions', command: sessions_ },
      // The hint carries the words a person searches by - the list filters on both, and "settings" is what
      // this is called out loud, while `init` is what the command is called.
      { label: 'Set up protection for this project', detail: "agentwhy init · what agents can do, what's protected", command: init_ },
    ],
  });

  // R72-R73: a bare `agentwhy` opens the page, and only where a person is there to see it. With no terminal there is
  // no such command, so the router's usage error stands and nothing is opened or served.
  return new CommandRouter([
    start_,
    menu,
    // Then the command a person runs every day, and the one that sets a project up to be told without asking.
    check_,
    init_,
    sessions_,
    // What a person wants to be told, and where: the file the hook reads, changed from a terminal or from the page.
    new NotifyCliCommand({ settings: notices }),
    new ReportCliCommand(report, environment.columns),
    new DoctorCliCommand(doctor),
    // Last: it is run by a hook, not by a person looking for where to begin.
    new WatchCliCommand({ watch, interactive: environment.inputIsTerminal }),
    new RefuseCliCommand({
      refusal: new CommandRefusal({
        input: new NodeTextInput(environment.input),
        files,
        directories: files,
        workingDirectory: environment.workingDirectory,
        home: environment.home,
        tell,
      }),
      interactive: environment.inputIsTerminal,
    }),
    new CodexStopCliCommand(codexWatch, environment.inputIsTerminal),
  ], environment.interactive ? start_ : undefined);
}
