// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * A port for a place where nobody can be asked. The served Settings view runs setup with its own confirm step as
 * the consent (R58, `interactive: false`), so a question here would be a question with no one at the other end:
 * it is refused loudly rather than answered with a guess.
 */
function unaskable(what) {
    const refuse = () => {
        throw new Error(`agentwhy tried to ask for ${what} where nobody can be asked.`);
    };
    return { choose: refuse, chooseMany: refuse, ask: refuse };
}
import { randomUUID } from 'node:crypto';
import { join, relative } from 'node:path';
import { TellLists, tellListPaths } from './report/private-files/tell-lists.js';
import { projectDirectoryName } from './adapter/claude-code/contract/projects.js';
import { ClaudeCodeCallFinder } from './adapter/claude-code/discovery/claude-code-call-finder.js';
import { ClaudeCodeSessionCatalogue } from './adapter/claude-code/discovery/claude-code-session-catalogue.js';
import { ClaudeCodeSessionDiscovery } from './adapter/claude-code/discovery/claude-code-session-discovery.js';
import { ClaudeCodeSessionTitles } from './adapter/claude-code/discovery/claude-code-session-titles.js';
import { ClaudeDesktopTitles } from './adapter/claude-code/discovery/claude-desktop-titles.js';
import { DESKTOP_SESSIONS } from './adapter/claude-code/contract/desktop-sessions.js';
import { ClaudeCodeProjectCatalogue } from './adapter/claude-code/discovery/claude-code-project-catalogue.js';
import { ClaudeCodeSessionSource } from './adapter/claude-code/events/claude-code-session-source.js';
import { ClaudeCodeProbe } from './adapter/claude-code/probe/claude-code-probe.js';
import { recogniseClaudeCode } from './adapter/claude-code/discovery/claude-code-recognition.js';
import { pluginPresence } from './adapter/claude-code/settings/plugin-state.js';
import { recogniseCodex } from './adapter/codex/discovery/codex-recognition.js';
import { CodexSessionDiscovery } from './adapter/codex/discovery/codex-session-discovery.js';
import { CodexSessionIndex } from './adapter/codex/discovery/codex-session-index.js';
import { CodexSessionCatalogue } from './adapter/codex/discovery/codex-session-catalogue.js';
import { CodexSessionTitles } from './adapter/codex/discovery/codex-session-titles.js';
import { codexOnThisComputer } from './adapter/codex/discovery/codex-on-this-computer.js';
import { CodexProjectCatalogue } from './adapter/codex/discovery/codex-project-catalogue.js';
import { SESSIONS_ROOT as CODEX_SESSIONS_ROOT, THREAD_NAMES } from './adapter/codex/contract/session.js';
import { CodexSessionSource } from './adapter/codex/events/codex-session-source.js';
import { SESSIONS_ROOT as COPILOT_SESSIONS_ROOT } from './adapter/copilot/contract/session.js';
import { copilotOnThisComputer } from './adapter/copilot/discovery/copilot-on-this-computer.js';
import { VsCodeChatDiscovery } from './adapter/copilot/discovery/vs-code-chats.js';
import { VsCodeChatCatalogue } from './adapter/copilot/discovery/vs-code-chat-catalogue.js';
import { VsCodeChatTitles } from './adapter/copilot/discovery/vs-code-chat-titles.js';
import { VsCodeProjectCatalogue } from './adapter/copilot/discovery/vs-code-project-catalogue.js';
import { copilotCheckState } from './adapter/copilot/settings/copilot-check.js';
import { recogniseCopilot } from './adapter/copilot/discovery/copilot-recognition.js';
import { CopilotProjectCatalogue } from './adapter/copilot/discovery/copilot-project-catalogue.js';
import { CopilotSessionCatalogue } from './adapter/copilot/discovery/copilot-session-catalogue.js';
import { CopilotSessionDiscovery } from './adapter/copilot/discovery/copilot-session-discovery.js';
import { CopilotSessionIndex } from './adapter/copilot/discovery/copilot-session-index.js';
import { CopilotSessionTitles } from './adapter/copilot/discovery/copilot-session-titles.js';
import { CopilotSessionSource } from './adapter/copilot/events/copilot-session-source.js';
import { CopilotSourceRouter, CopilotTitlesRouter, recogniseCopilotRecord, recogniseVsCodeChat } from './adapter/copilot/chat-log/copilot-source-router.js';
import { VsCodeChatSource } from './adapter/copilot/chat-log/vs-code-chat-source.js';
import { CopilotProbe } from './adapter/copilot/probe/copilot-probe.js';
import { CombinedProjectCatalogue } from './core/combined-project-catalogue.js';
import { CombinedSessionCatalogue } from './core/combined-session-catalogue.js';
import { EveryProjectCatalogue } from './core/every-project-catalogue.js';
import { ProviderTitles } from './core/provider-titles.js';
import { FormatSelectingReader } from './core/session-reader.js';
import { CodexProbe } from './adapter/codex/probe/codex-probe.js';
import { CommandRouter } from './cli/command-router.js';
import { CheckCliCommand } from './cli/commands/check-cli-command.js';
import { conversationOfTheAi, runByAnAi } from './cli/run-by-an-ai.js';
import { InitCliCommand } from './cli/commands/init-cli-command.js';
import { ProtectCliCommand } from './cli/commands/protect-cli-command.js';
import { RefuseCliCommand } from './cli/commands/refuse-cli-command.js';
import { CodexStopCliCommand } from './cli/commands/codex-stop-cli-command.js';
import { SessionStartCliCommand } from './cli/commands/session-start-cli-command.js';
import { codexTurnFormat } from './report/watch/codex-turn-format.js';
import { DetachedStart } from './report/start/detached-start.js';
import { FilePageServers } from './infrastructure/file-page-servers.js';
import { NodeDetachedRun } from './infrastructure/node-detached-run.js';
import { NodeBackgroundRun } from './infrastructure/node-background-run.js';
import { NodePageProbe } from './infrastructure/node-page-probe.js';
import { CodexTurnRefusals } from './adapter/codex/hooks/stop-refusals.js';
import { DoctorCliCommand } from './cli/commands/doctor-cli-command.js';
import { ReportCliCommand } from './cli/commands/report-cli-command.js';
import { SessionsCliCommand } from './cli/commands/sessions-cli-command.js';
import { MenuCliCommand } from './cli/commands/menu-cli-command.js';
import { StartCliCommand } from './cli/commands/start-cli-command.js';
import { NotifyCliCommand } from './cli/commands/notify-cli-command.js';
import { WatchCliCommand } from './cli/commands/watch-cli-command.js';
import { widthFor } from './cli/commands/report-usage.js';
import { Redactor } from './core/redaction/redactor.js';
import { SessionFormats } from './core/session-format.js';
import { SessionReport } from './report/session-report.js';
import { cardAnswers } from './cards/card-answers.js';
import { CardsCliCommand } from './cli/commands/cards-cli-command.js';
import { NodeAnswerSource } from './infrastructure/node-answer-source.js';
import { NodeLineStream } from './infrastructure/node-line-stream.js';
import { standingMarks } from './report/check/marks.js';
import { ServerAnswers } from './report/answers/server-answers.js';
import { ChatAnswerRenderer } from './report/render/chat/chat-answer-renderer.js';
import { WhyCliCommand } from './cli/commands/why-cli-command.js';
import { ProjectFingerprints } from './report/private-files/project-fingerprints.js';
import { NamesOnDisk } from './report/names-on-disk.js';
import { TextDigestRenderer } from './report/check/render/text-digest-renderer.js';
import { SessionCheck } from './report/check/session-check.js';
import { CommandRefusal } from './refuse/command-refusal.js';
import { KeyMessageCheck } from './message-check/key-message-check.js';
import { OpenFromChat } from './open-from-chat/open-from-chat.js';
import { refusalMemory } from './message-check/refusal-memory.js';
import { ShellCommandTrial } from './infrastructure/shell-command-trial.js';
import { SpawnServerTrial } from './infrastructure/spawn-server-trial.js';
import { CodexCard } from './setup/codex-card.js';
import { CodexMirror } from './setup/codex-mirror.js';
import { CopilotMirror } from './setup/copilot-mirror.js';
import { GlobalProtect } from './setup/global-protect.js';
import { Everywhere } from './report/start/onboarding/everywhere.js';
import { SessionStartNote } from './report/start/onboarding/session-start-note.js';
import { GlobalSetup } from './setup/global-setup.js';
import { ProjectSetup } from './setup/project-setup.js';
import { ReportPageRenderer } from './report/render/report-page/report-page-renderer.js';
import { ConversationsRenderer } from './report/start/conversations/conversations-renderer.js';
import { SettingsRenderer } from './report/start/settings/settings-renderer.js';
import { MonthRenderer } from './report/start/month/month-renderer.js';
import { ToFixRenderer } from './report/start/to-fix/to-fix-renderer.js';
import { projectName } from './report/start/app-nav.js';
import { welcomeIn } from './report/start/onboarding/welcome-decision.js';
import { SessionStart } from './report/start/session-start.js';
import { ReportShelf } from './report/start/report-shelf.js';
import { NoticeWordsRenderer } from './report/watch/render/notice-words.js';
import { NoticeSettings } from './report/watch/notice-settings.js';
import { preferencesFile } from './report/watch/preferences.js';
import { chosenLanguage } from './cli/chosen-language.js';
import { langOfLocale } from './report/watch/notice-choices.js';
import { SubagentWatch } from './report/watch/subagent-watch.js';
import { TextReportRenderer } from './report/render/text-report-renderer.js';
import { createDoctorAttentionRules } from './doctor/render/attention/doctor-attention-rules.js';
import { JsonDoctorRenderer } from './doctor/render/json-doctor-renderer.js';
import { TextDoctorRenderer } from './doctor/render/text-doctor-renderer.js';
import { SessionDoctor } from './doctor/session-doctor.js';
import { CodexDoctor } from './doctor/codex-doctor.js';
import { CopilotDoctor } from './doctor/copilot-doctor.js';
import { FormatSelectingDoctor } from './doctor/format-selecting-doctor.js';
import { CopilotTextDoctorRenderer } from './doctor/render/copilot-text-doctor-renderer.js';
import { CodexTextDoctorRenderer } from './doctor/render/codex-text-doctor-renderer.js';
import { NodeBrowser } from './infrastructure/node-browser.js';
import { SystemPlaceChooser } from './infrastructure/system-place-chooser.js';
import { OsascriptFolderChooser } from './infrastructure/osascript-folder-chooser.js';
import { PowershellFolderChooser } from './infrastructure/powershell-folder-chooser.js';
import { ClackAsker } from './infrastructure/clack-asker.js';
import { ClackChooser } from './infrastructure/clack-chooser.js';
import { ClackMultiChooser } from './infrastructure/clack-multi-chooser.js';
import { FileMarkStore } from './infrastructure/file-mark-store.js';
import { FileComputerView } from './infrastructure/file-computer-view.js';
import { FileCheckedStore } from './infrastructure/file-checked-store.js';
import { FileOnboardingStore } from './infrastructure/file-onboarding-store.js';
import { FileStartNoteStore } from './infrastructure/file-start-note-store.js';
import { FileRemovedProjects } from './infrastructure/file-removed-projects.js';
import { OnboardingRenderer } from './report/start/onboarding/onboarding-renderer.js';
import { NodeFileSystem } from './infrastructure/node-file-system.js';
import { realDirectory } from './infrastructure/real-directory.js';
import { NodeAgentwhyInvocation } from './infrastructure/node-agentwhy-invocation.js';
import { NodeLocalServer } from './infrastructure/node-local-server.js';
import { NodeTextInput } from './infrastructure/node-text-input.js';
import { StreamPrinter } from './infrastructure/stream-printer.js';
import { TerminalBanner } from './infrastructure/terminal-banner.js';
import { FileAlertStore } from './infrastructure/file-alert-store.js';
import { OsNotifier } from './infrastructure/os-notifier.js';
import { shellWord } from './shared/shell-word.js';
import { TAGLINE, terminalLogo } from './shared/terminal-logo.js';
import { leftAlone } from './core/guarded-places.js';
/** Where this person's answers about being told are kept. */
export function preferencesPath(environment) {
    return preferencesFile(environment.home);
}
/** Where the pages `start` writes lead to one another. */
const APP_LINKS = { conversations: 'index.html', toFix: 'to-fix.html', month: 'month.html', settings: 'settings.html', onboarding: 'onboarding.html' };
/**
 * The page server for a whole process (`.ai/specs/2026-09-27-which-project.md` V14, amended 2026-09-28): every project a
 * page switches to is served at the same address, so the pages of the one before still reach it.
 */
export function processServer() {
    return new NodeLocalServer();
}
/**
 * The reports of a whole process (V14, amended 2026-10-07): a switch to another project, to the computer's view, or back
 * copies a report another run drew from exactly the same, instead of reading its conversation again.
 */
export function processReports() {
    return new ReportShelf();
}
export function createCommandRouter(environment) {
    const files = new NodeFileSystem();
    // CT1, CT6: one walk of a project a run, its lines hashed with this run's salt and kept nowhere.
    const fingerprints = new ProjectFingerprints({ directories: files, files, salt: randomUUID() });
    // which-project V6: the home directory as a working directory is given, every link followed - read only to tell a
    // run started there. Every other use keeps `home` as the shell gave it.
    const realHome = realDirectory(environment.home);
    // J1-J3: how this agentwhy runs, for every hook written in this run and for the command `watch` offers.
    const invocation = new NodeAgentwhyInvocation({ script: environment.script, path: environment.path, platform: environment.platform });
    // `check` lists Claude Code's sessions alone: the Codex and Copilot specifications cover `doctor`, `report` and the pages
    // `start` serves, and nothing else (`.ai/plans/2026-09-29-what-codex-wrote.md` step 8's audit, and Copilot's CP23).
    // `watch` and every hook read Claude Code alone too, by their own source - Codex's Stop hook its own.
    const claudeCatalogue = new ClaudeCodeSessionCatalogue(files, environment.home);
    // XD7: the one registry that tells formats apart by content - Codex's strict first-line rule first - read by `doctor`,
    // `report`, `start` and `sessions`. One listing of Codex's root serves the catalogue and the reports it lists.
    const codexDiscovery = new CodexSessionDiscovery({ directories: files, files });
    const codexIndex = new CodexSessionIndex(codexDiscovery);
    const codexRoot = join(environment.home, ...CODEX_SESSIONS_ROOT);
    const codexCatalogue = new CodexSessionCatalogue({ index: codexIndex, directories: files, sessionsRoot: codexRoot });
    // Copilot's desktop app and CLI keep their sessions in one store, listed once for every list that asks at the same time.
    const copilotDiscovery = new CopilotSessionDiscovery({ directories: files, files });
    const copilotIndex = new CopilotSessionIndex(copilotDiscovery);
    const copilotRoot = join(environment.home, ...COPILOT_SESSIONS_ROOT);
    const copilotCatalogue = new CopilotSessionCatalogue({ index: copilotIndex, directories: files, files, sessionsRoot: copilotRoot });
    // VCD1: Copilot's chats in VS Code are Copilot's rows too, read from the log VS Code keeps of each.
    const vsCodeChats = new VsCodeChatDiscovery({ directories: files, files, home: environment.home, platform: environment.platform });
    // XD5: one list of a project's conversations for every AI, each row naming its AI.
    const catalogue = new CombinedSessionCatalogue([claudeCatalogue, codexCatalogue, copilotCatalogue, new VsCodeChatCatalogue(vsCodeChats)]);
    // CK6 with AO1: Codex is used on this computer where its `~/.codex` folder is - the one gate the setup and
    // Settings' Codex line ask, since the check agentwhy writes is the person's own, outside every project.
    const codexHere = () => codexOnThisComputer(files, environment.home);
    // AO14: the one trial run of the check before it is written into `~/.codex`, as Codex runs a hook, from a folder no
    // project is above. Absent `variables`, no trial can be made and the mirror writes nothing there.
    const codexTrial = environment.variables === undefined
        ? {}
        : { trial: new ShellCommandTrial({ platform: environment.platform, ...(environment.shell === undefined ? {} : { shell: environment.shell }), environment: environment.variables }) };
    const codexMirrorShared = { ...codexTrial, trialFolder: environment.temporaryDirectory, home: environment.home, codexOnThisComputer: codexHere, platform: environment.platform };
    // CCX1: round the check's setup, with the same files, chooser and folder to try a command in.
    const withCodexCard = (setup, chooser, interactive) => new CodexCard({
        setup, files, chooser, interactive, invocation, home: environment.home, codexOnThisComputer: codexHere, trialFolder: environment.temporaryDirectory,
        ...('trial' in codexTrial ? { serverTrial: new SpawnServerTrial(environment.variables ?? {}) } : {}),
    });
    // `copilot-blocks-too` CB9, CBD9: Copilot's check runs this agentwhy by its absolute paths - the Node running it and its
    // own script - never a name looked up on the `PATH` Copilot hands a hook (CB19), and is tried as Codex's is first.
    const copilotMirrorShared = {
        ...codexTrial,
        trialFolder: environment.temporaryDirectory,
        home: environment.home,
        copilotOnThisComputer: () => copilotOnThisComputer(files, environment.home),
        ...(environment.node === undefined || environment.script === undefined ? {} : { ownInvocation: `${shellWord(environment.node)} ${shellWord(environment.script)}` }),
    };
    const formats = new SessionFormats([
        { provider: 'codex', recognise: (input) => recogniseCodex(codexDiscovery, files, input) },
        // CP1a: the runtime's first line, never VS Code's transcript, which shares its type and producer; and VCD1, the log VS
        // Code keeps of a Copilot chat, by its own first line.
        {
            provider: 'copilot',
            recognise: recogniseCopilotRecord((input) => recogniseCopilot(files, files, input), (input) => recogniseVsCodeChat(files, files, input)),
        },
        { provider: 'claude-code', recognise: (input) => recogniseClaudeCode(files, input) },
    ]);
    const doctor = new FormatSelectingDoctor({
        formats,
        doctors: {
            codex: new CodexDoctor({
                probe: new CodexProbe({ discovery: codexDiscovery, directories: files, files }),
                renderers: { text: new CodexTextDoctorRenderer(), json: new JsonDoctorRenderer() },
            }),
            copilot: new CopilotDoctor({
                probe: new CopilotProbe({ directories: files, files }),
                renderers: { text: new CopilotTextDoctorRenderer(), json: new JsonDoctorRenderer() },
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
    const tellLists = new TellLists({ files, writer: files, paths: tell, home: environment.home });
    /*
     * `protected-everywhere.md` G1, G10, G17: the computer-wide writer stands beside `init`, not inside it - it writes one
     * file in the person's home directory and needs no project, which is the point of it - and then agentwhy's check into
     * Codex, which sees those rules only through it, by `init`'s own route with its trial and consent. `agentwhy protect`
     * and the onboarding's computer-wide path build it alike; only who can be asked differs.
     */
    const globalProtect = (chooser, interactive) => {
        const global = new GlobalSetup({ files, chooser, interactive, home: environment.home, invocation, platform: environment.platform });
        return new GlobalProtect({
            global,
            // Its rules to follow are the global file's, and it has no project to move entries out of: from the home folder
            // its "project" file would be the person's own.
            codex: new CodexMirror({
                // Never reached: `GlobalProtect` runs this mirror on its own (`--codex` and nothing else), which skips `setup`.
                setup: { run: async () => ({ outcome: 'unchanged', output: '' }) },
                files,
                chooser,
                interactive,
                workingDirectory: environment.home,
                invocation,
                ...codexMirrorShared,
                refuseRuns: () => global.holds(),
                migrate: false,
            }),
            codexOnThisComputer: codexHere,
        });
    };
    // One way of reading a report, drawn by the renderer each command chooses: the terminal's for `report`, the chat's for
    // `why` (`2026-11-20-ask-your-ai-why.md` AY1), so the two read the same and only say it differently.
    // A report reads its rules from a folder: the working one, or - for `why` - the project a conversation is kept under.
    const sessionReport = (createRenderer, workingDirectory = environment.workingDirectory) => new SessionReport({
        home: environment.home,
        reader: new FormatSelectingReader({
            formats,
            sources: {
                codex: new CodexSessionSource({ discovery: codexDiscovery, files, sessionsRoot: codexRoot, index: codexIndex }),
                'claude-code': new ClaudeCodeSessionSource({ discovery: new ClaudeCodeSessionDiscovery(files), files }),
                copilot: new CopilotSourceRouter({
                    runtime: new CopilotSessionSource({ directories: files, files }),
                    vsCode: new VsCodeChatSource({ files }),
                    isVsCodeChat: (input) => recogniseVsCodeChat(files, files, input),
                }),
            },
            whenUnavailable: 'claude-code',
        }),
        files,
        tell,
        fingerprints,
        names: new NamesOnDisk({ directories: files }),
        // A salt per run, so a pseudonym says "the same value" inside one report and nothing at all outside it.
        createRedactor: (projectRoot, share) => new Redactor(randomUUID(), projectRoot, share),
        createRenderer,
        htmlRenderer: new ReportPageRenderer(),
        // A record's time on the page is this machine's, as the days on Conversations are (the report page spec M4).
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        // CB10: a Copilot conversation's page promises a block only where agentwhy's check in Copilot runs.
        copilotCheck: () => copilotCheckState(files, files, environment.home),
        catalogue,
        workingDirectory,
        browser,
        temporaryDirectory: environment.temporaryDirectory,
        now: environment.now,
    });
    const report = sessionReport((options) => new TextReportRenderer(options.width, {
        ascii: options.ascii,
        full: options.full,
        colour: environment.colour && options.colour,
    }));
    // Its own salt: a pseudonym in a title means "the same value" within one list of sessions and nothing beyond it.
    // One process runs one command, so `start` and `sessions` never share a list; both AIs' titles are one list's.
    // Codex's are the names Codex gave its threads (`THREAD_NAMES`, measured 2026-09-30); a thread it named nothing - a
    // `codex exec` run - keeps the missing-title state rather than a message guessed at.
    const titleRedactor = new Redactor(randomUUID());
    // The Claude desktop app writes no `ai-title`; its own file names the conversation (`claude-desktop-conversations.md`
    // CD2). macOS and, since CDB5, Windows are the systems where that file's place is measured (CD6) - elsewhere nothing is
    // looked for. One reader for both lists below, so a file is read once however many lists ask (CD5).
    const desktopFolder = environment.platform === 'darwin' ? DESKTOP_SESSIONS.folder : environment.platform === 'win32' ? DESKTOP_SESSIONS.windowsFolder : undefined;
    const desktopTitles = desktopFolder === undefined
        ? undefined
        : new ClaudeDesktopTitles({ directories: files, files, folder: join(environment.home, ...desktopFolder) });
    const titles = new ProviderTitles({
        'claude-code': new ClaudeCodeSessionTitles({ transcripts: files, redactor: titleRedactor, ...(desktopTitles === undefined ? {} : { desktop: desktopTitles }) }),
        codex: new CodexSessionTitles({ files, directories: files, path: join(environment.home, ...THREAD_NAMES.file), redactor: titleRedactor }),
        // CPB35: the title the apps show, from `workspace.yaml`; where it was held from `client_name`; its last record's time.
        // VC5: a chat in VS Code by its own log - its title, a code editor, its last request's time.
        copilot: new CopilotTitlesRouter({
            runtime: new CopilotSessionTitles({ files, tails: files, redactor: titleRedactor }),
            vsCode: new VsCodeChatTitles({ discovery: vsCodeChats, redactor: titleRedactor }),
            isVsCodeChat: (input) => recogniseVsCodeChat(files, files, input),
        }),
    });
    // which-project V9-V11: the person's projects, for the window the sidebar's card opens. A title from another project
    // passes a redactor of its own, as this project's titles do.
    // A folder only Codex worked in is listed under the id Claude Code would give it, so a folder in both is one project
    // (decided 2026-09-29).
    // which-project V10b: on macOS, another project's folder where the system asks before an app reads is not looked into.
    const leaveAlone = environment.platform === 'darwin'
        ? (folder) => leftAlone(folder, environment.workingDirectory, environment.home)
        : undefined;
    const projects = new CombinedProjectCatalogue([
        new ClaudeCodeProjectCatalogue({ directories: files, transcripts: files, redactor: new Redactor(randomUUID()), home: environment.home, ...(leaveAlone === undefined ? {} : { leaveAlone }), ...(desktopTitles === undefined ? {} : { desktop: desktopTitles }) }),
        new CodexProjectCatalogue({ index: codexIndex, directories: files, sessionsRoot: codexRoot, projectId: projectDirectoryName, ...(leaveAlone === undefined ? {} : { leaveAlone }) }),
        new CopilotProjectCatalogue({
            index: copilotIndex, directories: files, sessionsRoot: copilotRoot, projectId: projectDirectoryName, redactor: new Redactor(randomUUID()),
            ...(leaveAlone === undefined ? {} : { leaveAlone }),
        }),
        // VC5: a folder only Copilot in VS Code worked in is a project too - the projects window, the computer's page.
        new VsCodeProjectCatalogue({
            discovery: vsCodeChats, directories: files, projectId: projectDirectoryName, redactor: new Redactor(randomUUID()),
            ...(leaveAlone === undefined ? {} : { leaveAlone }),
        }),
    ]);
    // One person's record of what they did about a file, beside nothing else and outside every project
    // (`worth-running-every-day` R33). The directory is named the way Claude Code names the project's sessions.
    const recordsOf = (folder) => join(environment.home, '.agentwhy', 'projects', projectDirectoryName(folder));
    const projectRecords = recordsOf(environment.workingDirectory);
    const marks = new FileMarkStore(join(projectRecords, 'marks.jsonl'));
    // Beside it, the conversations a person asked to check although they were older than a run (F55).
    const checked = new FileCheckedStore(join(projectRecords, 'checked.jsonl'));
    // Whether this person finished the onboarding, here and anywhere: one file for every project, since the intro plays
    // once per person (`.ai/specs/2026-09-24-onboarding.md` W21, N1, N2). Outside every project, as the marks are.
    const onboarding = new FileOnboardingStore(join(environment.home, '.agentwhy', 'onboarding.jsonl'), projectDirectoryName(environment.workingDirectory));
    // GD26: the computer's own line in the same record - a name no project's folder can have, which all start with a dash.
    const computerOnboarding = new FileOnboardingStore(join(environment.home, '.agentwhy', 'onboarding.jsonl'), 'this-computer');
    // Which projects this person took off their own list (`remove-a-project-from-the-list` RM6): one file for every
    // project, beside the record above, since the list is the person's and not a project's.
    const removedProjects = new FileRemovedProjects(join(environment.home, '.agentwhy', 'removed-projects.jsonl'));
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
    // R58 with RMD1: a page's change runs the setup a terminal runs, built for the folder it is about. Nothing here can
    // ask a question - the page's own confirm step is the consent - so the choosers are never reached and say so if they
    // ever are.
    const setupFor = (folder) => new CopilotMirror({
        setup: withCodexCard(new CodexMirror({
            setup: new ProjectSetup({
                files,
                chooser: unaskable('a choice'),
                hookChooser: unaskable('a list'),
                asker: unaskable('a question'),
                interactive: false,
                workingDirectory: folder,
                home: environment.home,
                realHome,
                invocation,
                platform: environment.platform,
            }),
            files,
            chooser: unaskable('a choice'),
            interactive: false,
            workingDirectory: folder,
            invocation,
            ...codexMirrorShared,
        }), unaskable('a choice'), false),
        files,
        chooser: unaskable('a choice'),
        interactive: false,
        workingDirectory: folder,
        ...copilotMirrorShared,
        // CB9, R7: a page writes Copilot's file only from Copilot's own window, whose confirmation names it - never as a
        // part of another write, whose window does not.
        onlyWhenNamed: true,
    });
    // G7-G10: the computer's rules from a page, whose confirmation window is the consent - nothing here can ask.
    const pageProtect = globalProtect(unaskable('a choice'), false);
    const start = new SessionStart({
        // PWO1: on Windows a project's `refuse` that does not cover `PowerShell` is half installed.
        platform: environment.platform,
        ...(pid === undefined
            ? {}
            : {
                pageServer: {
                    // PF7: the version too, so a later `--detach` of another agentwhy starts its own rather than handing this over.
                    write: async (url) => {
                        const version = await invocation.version();
                        await pageServers.write(thisProject, { url, pid, startedAt: Date.now(), ...(version === undefined ? {} : { version }) });
                    },
                    remove: () => pageServers.remove(thisProject, pid),
                },
            }),
        catalogue,
        // everything-on-this-computer step 2 (G11, GD17): the computer's view lists every project's conversations, each read
        // under its own project's told lists - the projects the window lists, each by the one-folder catalogue.
        everyProject: new EveryProjectCatalogue(projects, catalogue),
        tellIn: (folder) => tellListPaths(environment.home, folder),
        // GD18: a file on the computer's page is its project's, and its mark is read from that project's own record.
        marksIn: (folder) => new FileMarkStore(join(recordsOf(folder), 'marks.jsonl')),
        computerOnboarding,
        // GD21: what the computer's page shows, as the person last chose it - kept beside agentwhy's other records.
        computerView: new FileComputerView(join(environment.home, '.agentwhy', 'computer-view.json')),
        report,
        files,
        tell,
        tellLists,
        // live-pages L4: a clock that only moves forward, to space out reading a session the agent is still writing.
        elapsed: () => performance.now(),
        // `the-page-first` PR1: a served run stops waiting for its reading, and serves the page first.
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
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
        // G7-G10: the onboarding's computer-wide path; its confirmation is the consent, so nothing here can ask (R58).
        everywhere: new Everywhere({
            files,
            home: environment.home,
            platform: environment.platform,
            tellLists,
            protect: pageProtect,
            codexOnThisComputer: codexHere,
            invoke: () => invocation.find(),
            // AP9: agentwhy's Claude Code plugin, read for the computer's Alerts and the onboarding's computer step.
            plugin: () => pluginPresence(files, environment.home, environment.platform),
            // GD23: alerts in every project, from the computer's Alerts; its window is the consent.
            alerts: { on: () => pageProtect.alertsOn(), set: (on) => pageProtect.alerts(on, { yes: true }) },
            // RW14: the computer's check of shell commands, taken out by the computer's Uninstall with the rest.
            check: { on: () => pageProtect.refuseOn(), set: (on) => pageProtect.refuse(on, { yes: true }) },
        }),
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
        // a-file-in-its-place IP2: the system's own window for the places a computer rule is for.
        placeChooser: new SystemPlaceChooser(environment.platform),
        // R50-R54: the page `start` opens is served from the loopback address, behind a token only that page is given.
        server: environment.server ?? new NodeLocalServer(),
        ...(environment.reports === undefined ? {} : { shelf: environment.reports }),
        // R58: a change made in Settings runs through the same setup a terminal runs. Nothing here can ask a question:
        // the page's own confirm step is the consent, so the choosers are never reached and say so if they ever are.
        // nothing-updates-by-itself U2: the version this run is, beside the hooks' own, for the update notice.
        invocation,
        // codex-blocks-too CK5: every write of Claude Code's `refuse` - a switch, Finish blocking, the onboarding - writes
        // Codex's with it, in a project that uses Codex.
        setup: setupFor(environment.workingDirectory),
        // RMD1: the same setup, built for another listed project - for taking agentwhy out of it, and (GD32) for a row's
        // Block or Track on the computer's page, written into the project its file is in.
        setupIn: setupFor,
        // GD32: and that project's told lists, for a row's Track on the computer's page - beside its settings, as its own run's.
        tellListsIn: (folder) => new TellLists({ files, writer: files, paths: tellListPaths(environment.home, folder), home: environment.home }),
        removedProjects,
        // CK6, amended 2026-10-01: Settings' Codex line, in a project with no Codex conversation of its own.
        codexOnThisComputer: codexHere,
        // CB11: and Copilot's, in a project with no Copilot conversation of its own.
        copilotOnThisComputer: copilotMirrorShared.copilotOnThisComputer,
        // VC6: Copilot's chats in VS Code no row reads, counted for Conversations' line.
        vsCodeChats: async (folder) => (await vsCodeChats.list(folder)).unread,
        // AP9, AP12: agentwhy's Claude Code plugin, read for each project's Settings and its Uninstall.
        plugin: (project) => pluginPresence(files, environment.home, environment.platform, project),
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
        home: environment.home,
        createRenderer: (options) => new TextDigestRenderer(options.full ? 'full' : 'brief', { colour: environment.colour }),
        marks,
        workingDirectory: environment.workingDirectory,
        now: environment.now,
    });
    // What both hooks share - Claude Code's `watch` and Codex's Stop (`codex-says-it-too` CX1): the redactor, the words,
    // the store, the person's choices and how agentwhy runs. What differs is handed to each below.
    const alertStore = new FileAlertStore(environment.temporaryDirectory, environment.user);
    const watching = {
        files,
        tell,
        // Its own salt, as every report has: nothing it redacts means anything outside this one run.
        createRedactor: (projectRoot) => new Redactor(randomUUID(), projectRoot, false),
        words: (wayIn) => new NoticeWordsRenderer(wayIn),
        notifier: new OsNotifier(environment.platform),
        home: environment.home,
        // What one hook run leaves for the next: outside every project, and swept by age (`a-notice-in-the-conversation` R7).
        store: alertStore,
        // What a person chose about being told: their own file, outside every project, read on every run (R22, R25).
        preferencesPath: preferencesPath(environment),
        // R29: the language of a line nobody chose one for.
        ...(environment.locale === undefined ? {} : { locale: environment.locale }),
        invocation,
        fingerprints,
        // `2026-11-01-a-key-in-your-message.md` PKD9: the same hooks stop a person's message holding a key. PK4: whether `.env`
        // is closed to the AI where the message was written is what `refuse` answers for `cat .env` there, under the rules it
        // would apply - the project found above the folder and the computer's - so the words promise no more than holds.
        messages: new KeyMessageCheck({
            envBlocked: async (workingDirectory) => {
                // No hook input is read: the line is asked of the rules directly.
                const refusal = new CommandRefusal({
                    input: { readAll: async () => undefined },
                    files, directories: files, workingDirectory, home: environment.home, tell, tail: files,
                });
                return (await refusal.decideLine('cat .env', workingDirectory, { everywhere: true })).kind === 'refuse';
            },
            // PK10: the same store `watch` keeps a turn's alerts in, under a key of its own, so `Stop` never takes it for one.
            memory: refusalMemory(alertStore),
        }),
        // `2026-11-24-open-agentwhy-from-the-chat.md` RO4: the same hooks open agentwhy's page for a person who asked.
        opens: new OpenFromChat({ run: new NodeDetachedRun(environment.node ?? 'node', environment.script, environment.temporaryDirectory) }),
    };
    const codexWatch = new SubagentWatch({
        ...watching,
        source: new CodexSessionSource({ discovery: codexDiscovery, files, sessionsRoot: codexRoot, index: codexIndex }),
        input: new NodeTextInput(environment.input),
        turnFormat: codexTurnFormat(files, new CodexTurnRefusals(files), environment.home),
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
    const logo = () => new TerminalBanner(terminalLogo([TAGLINE], { colour: environment.colour, ascii: false }));
    const setupBanner = logo();
    // Registration order is the order `--help` lists them in, so the way in comes first.
    // PF3-PF6: the pages served from the background - the running server reused, else one started, else files.
    const detached = new DetachedStart({
        servers: pageServers,
        // PF7: a running server is reused only where its record names this agentwhy's version.
        version: () => invocation.version(),
        probe: new NodePageProbe(),
        background: new NodeBackgroundRun(environment.node ?? 'node', environment.script),
        browser,
        project: thisProject,
        files: start,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        clock: () => Date.now(),
        // AW1: the address `--detach` hands over names the welcome where this project is to meet it, as the address a
        // served run prints does. The same decision the run itself asks (W23), from the same record and settings files.
        welcome: {
            file: APP_LINKS.onboarding,
            project: projectName(environment.workingDirectory),
            opens: async () => (await welcomeIn(environment.workingDirectory, {
                store: onboarding,
                files,
                home: environment.home,
                realHome,
                now: () => Date.now(),
            })).opens,
        },
    });
    const callFinder = new ClaudeCodeCallFinder({ catalogue: claudeCatalogue, transcripts: files, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) });
    const start_ = new StartCliCommand({ start, detached, now: environment.now });
    const why = new WhyCliCommand({
        catalogue,
        // AYO7, AYD10, AYD12: a conversation the working folder does not list is looked for in Claude Code's store - the
        // skill is Claude Code's - in the folders above, then by its record's name, opening nothing to find it.
        elsewhere: { catalogue: claudeCatalogue, finder: claudeCatalogue },
        reportFor: (choice, folder) => sessionReport(() => new ChatAnswerRenderer(choice), folder),
        workingDirectory: environment.workingDirectory,
        // The language as `hide-keys` reads it - the folder's choice, then the system's, then English - with the reader
        // `watch`'s line is in (`chosenLanguage`), so the line and the answer beside it are in one language.
        lang: async (folder) => (await chosenLanguage((path) => files.readText(path), folder).catch(() => undefined)) ?? langOfLocale(environment.locale) ?? 'en',
        // AYO9: a view's command names no conversation; it is the one Claude Code says the AI is in.
        thisConversation: conversationOfTheAi(environment.variables),
        done: async (folder, lastActive) => {
            const { records } = await new FileMarkStore(join(recordsOf(folder), 'marks.jsonl')).read();
            return new Set([...standingMarks(records)].filter(([, mark]) => lastActive <= mark.at).map(([path]) => path));
        },
    });
    // RB7: a mark is the person's own word, so the command knows whether an AI ran it.
    const check_ = new CheckCliCommand({ check, now: environment.now, runByAnAi: runByAnAi(environment.variables, environment.inputIsTerminal) });
    const setupChooser = new ClackChooser(environment.input, environment.output, setupBanner);
    const init_ = new InitCliCommand(new CopilotMirror({
        setup: withCodexCard(new CodexMirror({
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
                platform: environment.platform,
            }),
            files,
            chooser: setupChooser,
            interactive: environment.interactive,
            workingDirectory: environment.workingDirectory,
            invocation,
            ...codexMirrorShared,
        }), setupChooser, environment.interactive),
        files,
        chooser: setupChooser,
        interactive: environment.interactive,
        workingDirectory: environment.workingDirectory,
        ...copilotMirrorShared,
    }));
    const protect_ = new ProtectCliCommand(globalProtect(setupChooser, environment.interactive));
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
        // Beside it, the one for the files no project holds (G1): it needs no project, and says so.
        protect_,
        sessions_,
        // What a person wants to be told, and where: the file the hook reads, changed from a terminal or from the page.
        new NotifyCliCommand({ settings: notices }),
        new ReportCliCommand(report, environment.columns),
        why,
        new CardsCliCommand({
            stream: new NodeLineStream(environment.input, environment.output),
            answers: cardAnswers({
                lang: async () => (await chosenLanguage((path) => files.readText(path), environment.workingDirectory).catch(() => undefined)) ?? langOfLocale(environment.locale) ?? 'en',
                why,
                atHome: relative(environment.home, environment.workingDirectory) === '',
                now: () => Date.now(),
                server: new ServerAnswers({
                    servers: pageServers,
                    keyOf: projectDirectoryName,
                    version: () => invocation.version(),
                    source: new NodeAnswerSource(),
                    run: new NodeDetachedRun(environment.node ?? 'node', environment.script, environment.temporaryDirectory),
                    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
                    elapsed: () => performance.now(),
                    project: environment.workingDirectory,
                    home: environment.home,
                }),
                // CVB22: a call says which it is; a server started before a `/clear` was told of the conversation before it.
                self: async (callId) => (callId === undefined ? undefined : await callFinder.conversationOf(callId, environment.workingDirectory).catch(() => undefined)) ?? conversationOfTheAi(environment.variables),
            }),
            version: () => invocation.version(),
            inputIsTerminal: environment.inputIsTerminal,
        }),
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
                // RW15: where a Codex command runs, from the end of its rollout.
                tail: files,
            }),
            interactive: environment.inputIsTerminal,
        }),
        new CodexStopCliCommand(codexWatch, environment.inputIsTerminal),
        // `2026-10-15-agentwhy-as-a-plugin.md` AP6: the plugin's `SessionStart` hook, one paragraph where nothing is set up.
        new SessionStartCliCommand(new SessionStartNote({
            input: new NodeTextInput(environment.input),
            files,
            home: environment.home,
            realHome,
            temporaryDirectory: environment.temporaryDirectory,
            onboardingOf: (project) => new FileOnboardingStore(join(environment.home, '.agentwhy', 'onboarding.jsonl'), project),
            computerOnboarding,
            told: new FileStartNoteStore(join(environment.home, '.agentwhy', 'plugin-said.jsonl')),
            now: () => Date.now(),
        }), environment.inputIsTerminal),
        // R73 stands (`a-page-not-a-file` PFD3): off a terminal a bare `agentwhy` opens nothing and serves nothing. But the
        // reader of that refusal is usually an AI agent asked to start agentwhy and send a link, and the usage alone left it
        // guessing: measured 2026-10-04 in three apps, one guessed `start --detach` and one gave up. So the refusal names it.
    ], environment.interactive ? start_ : undefined, 'There is no terminal here, so a bare agentwhy opens nothing and serves nothing.\n' +
        'To serve a page and return at once - what an agent asked to send someone a link needs - run:\n' +
        '  agentwhy start --detach');
}
