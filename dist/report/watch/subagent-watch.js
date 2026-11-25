import { join } from 'node:path';
import { HOME_PREFIX, HOOK_INPUT, STOP, SUBAGENT_STOP, USER_PROMPT_SUBMIT } from '../../adapter/claude-code/contract/hooks.js';
import { SETTINGS_FILES } from '../../adapter/claude-code/contract/settings.js';
import { everywhereWatchEvents, pinnedOlderThan, runsKeySwap, runsOwnWatch, runsOwnWatchOn, watchInvocation, watchInvocationsOn } from '../../adapter/claude-code/settings/hook-entries.js';
import { blockNotice, chatNotice, terminalNotice } from '../../adapter/claude-code/hooks/hook-output.js';
import { parseJsonObject } from '../../shared/json.js';
import { parseStopInput } from '../../adapter/claude-code/hooks/stop-input.js';
import { parseSubagentStopInput } from '../../adapter/claude-code/hooks/subagent-stop-input.js';
import { withLateMessage } from '../../core/late-message.js';
import { FileAccessError } from '../../ports/file-access-error.js';
import { buildReport } from '../build-report.js';
import { choosePolicy, projectOfSettings } from '../choose-policy.js';
import { rulesOfConversation } from '../rules-elsewhere.js';
import { withProjects } from '../../core/policy/another-project.js';
import { alertOf, alerts, DEFAULT_THRESHOLD } from './agent-alert.js';
import { DEFAULT_CHANNELS, DEFAULT_CLEAN, DEFAULT_CLEAN_EVERYWHERE, DEFAULT_LANG, DEFAULT_SAID_AS, langOfLocale, } from './notice-choices.js';
import { CLAUDE_CODE_REQUESTS, reportCommand } from './render/instruction-words.js';
import { preferencesFor, readPreferences } from './preferences.js';
import { NOTICE_TITLE, withTitle } from './render/notice-words.js';
import { keysSeenIn } from './keys-seen.js';
import { toDoItems } from '../render/report-page/to-do.js';
import { openRequest } from '../../core/message/open-request.js';
import { OPEN_FROM_CHAT_SINCE } from '../../open-from-chat/open-from-chat.js';
import { openFromChatIn } from '../../open-from-chat/where-it-works.js';
import { runsAgentwhy } from '../start/settings-files.js';
import { parseUserPromptSubmitInput } from '../../adapter/claude-code/hooks/user-prompt-submit-input.js';
import { entryPointNamed } from '../../adapter/claude-code/discovery/transcript-tail.js';
// Where they live now: both the notice and the preferences that choose it name them, and neither owns the other.
export { CLEAN_MODES, DEFAULT_CHANNELS, DEFAULT_CLEAN, DEFAULT_CLEAN_EVERYWHERE, NOTICE_CHANNELS } from './notice-choices.js';
/**
 * The most a hook input is read to. The documented input is a few paths and the agent's last message; a megabyte of
 * message is already unusual, and past this the input is not held at all.
 */
const MAX_INPUT_BYTES = 16 * 1024 * 1024;
/**
 * What was last said about the session's own agent, kept under a name no agent has
 * (`the-agent-nobody-watches.md` R6): `alertOf` reads the whole transcript, so a value read in one turn is still
 * there in the next, and without this the same line would arrive after every turn for the rest of the session.
 */
const OWN_REACH_SAID = 'session:said';
/**
 * What the session has had said about it so far, kept under names no agent has, the way `OWN_REACH_SAID` is
 * (`the-agent-tells-you.md` R6, R7). `Stop` leaves them all where they are while it reads (B4j): a turn that finds
 * nothing new still has to know what earlier turns found, or a clean line would say "nothing reached" over a session
 * holding a value.
 */
const SESSION_COUNTS = 'session:counts';
/** That a clean line has been said once already, for the mode that says it once (R4). */
const CLEAN_SAID = 'session:clean';
/** That an unreadable preferences file has been said already: once a session, never after every turn (R24). */
const PREFERENCES_SAID = 'session:preferences';
/** That an agent which kept no record has been said already: once a session (`when-an-agent-finishes.md` R4a). */
const NO_RECORD_SAID = 'session:no-record';
/**
 * The ways into Claude Code that have a person reading, as `CLAUDE_CODE_ENTRYPOINT` names them - measured on the
 * terminal and on the editor extension (B9e2). `sdk-cli`, which is `claude -p`, is left out on purpose, and so is
 * any name this version has not seen. `claude-desktop`, the Claude desktop app, was measured too (B9e3): the agent's
 * message is shown there in the open, under folded rows for the hook's own words.
 */
const ATTENDED = ['cli', 'claude-vscode', 'claude-desktop'];
/**
 * Where the first quiet turn of a session is said by the agent as well as the line (R5, amended 2026-10-02 by the
 * maintainer): the Claude desktop app, which folds the line away (B9e3), and the VS Code extension, a flow the
 * maintainer wants the same. Not the terminal, where the line is in the open under the reply.
 */
const CLEAN_SAID_BY_AGENT = ['claude-desktop', 'claude-vscode'];
/** The records the display keeps about the session itself. None of them is an agent, and none is ever counted as one. */
const KEPT_NAMES = [OWN_REACH_SAID, SESSION_COUNTS, CLEAN_SAID, PREFERENCES_SAID, NO_RECORD_SAID];
/**
 * How many protected files the conversation came across by name alone, where that is all it did to any of them
 * (`the-chat-says-what-the-report-says.md` S20, `name`): read from the tally the row climbs, so the line says what the
 * row says - "Only saw a name". Nothing where a file's text reached an agent, a program opened one, or an attempt has no
 * known end: those keep the `reached` line, S20's `unknown` half waiting on an alert that says an attempt at all.
 */
function namesOnly(report) {
    const { tally } = report;
    const more = tally.contentsSeen > 0 || (tally.filesRead ?? 0) > 0 || (tally.filesOpened ?? 0) > 0 || tally.unknownAttempts > 0;
    return more || tally.filesReached === 0 ? undefined : tally.filesReached;
}
/**
 * The protected files a rule kept from the conversation, where that is what its row says - "Stopped": read from the
 * tally the row climbs, so nothing of a file's text reached an agent, no program opened one, no attempt has an end the
 * record does not give, and a rule refused every attempt (WS5). `own` the ones the session's own agent was kept from,
 * which it may be asked to say (R12b); `all` every one, which the line counts. Nothing where any of that does not hold.
 */
function stoppedFrom(report) {
    const { tally } = report;
    const more = tally.contentsSeen > 0 || (tally.filesRead ?? 0) > 0 || (tally.filesOpened ?? 0) > 0 || tally.unknownAttempts > 0;
    if (more || tally.refusedAttempts === 0 || tally.refusedByOthers !== undefined)
        return undefined;
    const stops = report.stories.filter((story) => story.outcome === 'blocked');
    const all = [...new Set(stops.map((story) => story.path))];
    const own = [...new Set(stops.filter((story) => story.agentIndex === report.graph.main.index).map((story) => story.path))];
    return all.length === 0 ? undefined : { all, own };
}
/** WS5: remembered with the alert, so the turn's own line knows a rule did not refuse everything it counts. */
function notByRule(alert) {
    return alert.level === 'refused' && alert.refusedByOthers !== undefined ? { notByRule: true } : {};
}
/**
 * What the session had said about it before, plus what is being said now. Levels only, never what they were about. A
 * value from a file the person lets their AI read is counted apart: a later quiet turn must not call it a key (F57a).
 * Names seen alone are counted apart too (S20): the line said there was nothing to do, and "earlier your AI opened a
 * private file" would say otherwise - but it was said, so a later quiet turn is not the conversation's first.
 */
function countedWith(before, saying) {
    const told = (before?.told ?? 0) + saying.filter((alert) => alert.told === true).length;
    const data = (before?.data ?? 0) + saying.filter((alert) => alert.level === 'value' && alert.data === true).length;
    const named = (before?.named ?? 0) + saying.filter((alert) => alert.level === 'reached' && alert.named === true).length;
    const stopped = (before?.stopped ?? 0) + saying.filter((alert) => alert.stopped === true).length;
    return {
        values: (before?.values ?? 0) + saying.filter((alert) => alert.level === 'value' && alert.told !== true && alert.data !== true).length,
        reached: (before?.reached ?? 0) + saying.filter((alert) => alert.level === 'reached' && alert.told !== true && alert.named !== true).length,
        ...(told > 0 ? { told } : {}),
        ...(data > 0 ? { data } : {}),
        ...(named > 0 ? { named } : {}),
        ...(stopped > 0 ? { stopped } : {}),
    };
}
/** Whether a session has had anything said about it: a key, a private file opened, one it lets it read, names, or a stop. */
function anythingSaid(counts) {
    return counts.values > 0 || counts.reached > 0 || (counts.told ?? 0) > 0 || (counts.data ?? 0) > 0 || (counts.named ?? 0) > 0 ||
        (counts.stopped ?? 0) > 0;
}
/**
 * `agentwhy watch`: one finished agent, read the way `report` reads a session, and one notice about it
 * (`specs/2026-09-16-when-an-agent-finishes.md`). Every way it can fail to look is a notice saying so - never an
 * exception and never silence - because a hook that failed quietly reads exactly like an agent that did nothing.
 */
export class SubagentWatch {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    /**
     * One hook run, whichever event it was. `Stop` says what the turn remembered; anything else is read as the
     * `SubagentStop` this command began as. The event is read from the input rather than from a flag (R5), because
     * the first attempt at measuring this put the probe on the wrong event and nothing ran at all.
     */
    async run(options) {
        const text = await this.#dependencies.input.readAll(MAX_INPUT_BYTES);
        if (text === undefined)
            return this.announce({ kind: 'not-checked', reason: 'input' }, options.channels ?? DEFAULT_CHANNELS, options.plugin);
        const format = this.#dependencies.turnFormat;
        // PK7: a person's message steps aside only for a copy that runs on that event too - a project, or a person's own
        // computer-wide `watch`, set up before the event was written checks no message, and nothing else would.
        const promptEvent = parseJsonObject(text)?.[USER_PROMPT_SUBMIT.fields.event] === USER_PROMPT_SUBMIT.event ? USER_PROMPT_SUBMIT.event : undefined;
        // GD23: one turn is never alerted twice - a project that runs its own `watch` is watched by it, under its own rules.
        // AP5: one turn is never said twice - the plugin's copy steps aside for the person's own.
        if (options.everywhere === true && format === undefined &&
            ((await this.#watchesItself(directoryIn(text), promptEvent)) || (options.plugin === true && (await this.#personWatchesEverywhere(promptEvent))))) {
            // RO2: a copy pinned to a release before the phrase checks the message and cannot open anything, so this one does that alone.
            const output = promptEvent === undefined || (await this.#answersThePhrase(directoryIn(text), options)) ? '' : await this.#opened(text, options);
            return { notice: { kind: 'quiet' }, output };
        }
        // PKD9: a person's message, before it is sent - stopped where it holds a key, and silent in every other case, a
        // failure included (PK6, PKD5): a check that could not run must not cost a person the message, nor a line under it.
        // An input of this event it cannot use is no `Stop` either, and is answered with nothing. The person's choices are
        // read only to word a refusal: most messages hold no key.
        if (promptEvent !== undefined) {
            const prompt = format === undefined ? parseUserPromptSubmitInput(text) : format.readPrompt(text);
            if (!('message' in prompt))
                return { notice: { kind: 'quiet' }, output: '' };
            const lang = async () => (await this.#settle(options, directoryIn(text))).lang;
            // PK11: Claude Code tells a hook its way in; Codex's is the rollout's first line. Asked only of a first message refused.
            const entryPoint = this.#dependencies.entryPoint;
            const heldIn = format === undefined
                ? async () => (entryPoint === undefined ? undefined : entryPointNamed(entryPoint))
                : () => format.heldIn(text);
            const checked = (await this.#dependencies.messages?.answer(prompt.message, lang, heldIn).catch(() => '')) ?? '';
            // RO5: what is kept from an earlier refusal is said first. A message that is refused is no phrase (RO1), so never both.
            const output = [checked, await this.#opened(text, options)].filter((part) => part !== '').join('\n\n');
            return { notice: { kind: 'quiet' }, output };
        }
        // Where the session runs decides which project's answers apply, and it is on every input this hook is given.
        const settled = { ...(await this.#settle(options, directoryIn(text))), wayIn: await this.#wayIn(text, options) };
        // CX2, CK13: a command agentwhy stopped this turn is the turn's message, and nothing else is asked of the agent. Looked
        // for before the turn is read: it needs the turn and its rollout alone, as the Stop hook it replaced did, so a `Stop`
        // without a session id (CKB12) still says it. Its continuation finds nothing.
        if (format !== undefined) {
            const stopped = await format.stoppedIn(text);
            if (stopped.length > 0) {
                const paths = [...new Set(stopped.map((one) => one.path))];
                const folds = await this.#answerAskedBack(format, text, settled);
                return { notice: { kind: 'quiet' }, output: blockNotice(format.requests.stopped(paths, settled.lang, folds), '') };
            }
            // CX9, after the refusals: a command agentwhy refused is said wherever the hook ran, but outside a project the
            // person set up, nothing else is - a user-level hook fires in every conversation, the app's scratch folders too.
            if (!(await format.watchedHere(text)))
                return { notice: { kind: 'quiet' }, output: '' };
        }
        const stop = format === undefined ? parseStopInput(text) : format.readStop(text);
        if (!('unusable' in stop))
            return this.#sayWhatTheTurnFound(stop.turn, await this.#rulesFor(settled, text));
        // CX1, §4 of its specification: another AI's hook says what `Stop` says, and nothing for any other event.
        if (format !== undefined)
            return { notice: { kind: 'quiet' }, output: '' };
        const { notice, agent } = await this.#noticeFor(text, settled);
        if (await this.#saidBefore(notice, agent))
            return { notice: { kind: 'quiet' }, output: '' };
        await this.#remember(notice, agent, settled);
        return this.#announced(notice, settled.channels, settled.wayIn);
    }
    /** CT8: the same evidence the report reads, for the same root and policy. */
    async #fingerprintsOf(projectRoot, policy) {
        const fingerprints = await this.#dependencies.fingerprints?.of(projectRoot, policy);
        return fingerprints === undefined ? {} : { fingerprints };
    }
    /**
     * `2026-10-12-the-whole-answer-after-a-stop.md` WA1-WA3: whether a stopped command's request asks the answer back -
     * only in an app that folds the turn away (CXB5), and only where no key and no private data reached the conversation,
     * every value traced being from a file the person tracks, as told's repeat carries. The whole conversation, not the
     * turn: an answer may repeat what an earlier turn read. A `Stop` naming no session (CKB12), a reader that cannot be
     * read, or a conversation that cannot be looked at keeps the one short sentence - what cannot be read is never taken
     * for clean.
     */
    async #answerAskedBack(format, text, settled) {
        const stop = format.readStop(text);
        if ('unusable' in stop)
            return false;
        if ((await format.readerOf(stop.turn)).foldsTurn !== true)
            return false;
        const read = await this.#reportOf(stop.turn, await this.#rulesFor(settled, text));
        if (read === undefined)
            return false;
        const told = toldFiles(read.report);
        return valuesFrom(read.report).every((path) => told.has(path));
    }
    /**
     * An agent that kept no record is said once a session (R4a). The Claude desktop app finishes one after many of its
     * turns (B4g), and the same sentence after each is a line a person learns to skip. Said once is still said
     * (invariant 4), and recorded before it is said, so a hook that fires again stays quiet - and so does one that fires
     * at the same moment, or while the turn's `Stop` is still reading the conversation (B4j). A session the input does not
     * name has no "once", and hears it every time.
     */
    async #saidBefore(notice, agent) {
        if (notice.kind !== 'no-record' || agent?.sessionId === undefined)
            return false;
        return !(await this.#dependencies.store.rememberOnce(agent.sessionId, { agentId: NO_RECORD_SAID, level: 'no-record', words: '' }));
    }
    /**
     * CX5: where the hook is another AI's and no flag named the rules, the project's own, found from where it ran - the
     * rules Claude Code's hooks read there, so one list is read by both (CK2).
     */
    async #rulesFor(settled, text) {
        const format = this.#dependencies.turnFormat;
        if (format === undefined || settled.policyPath !== undefined || settled.settingsPath !== undefined)
            return settled;
        const settingsPath = await format.settingsFor(text);
        return settingsPath === undefined ? settled : { ...settled, settingsPath };
    }
    /**
     * One question at a time, in the order R24 sets: the flag if it was written, then this project's answer, then this
     * person's, then what this tool does when nobody has said anything. A file that cannot be read answers nothing and
     * is remembered as unusable - the run still happens, on the built-in answers, because a hook that refused to work
     * over a settings file is a hook that stops watching.
     */
    async #settle(options, directory) {
        const { files, preferencesPath } = this.#dependencies;
        const read = readPreferences(await textOf(files, preferencesPath));
        const chosen = read.kind === 'read' ? preferencesFor(read.preferences, directory) : {};
        return {
            ...options,
            on: options.on ?? chosen.on ?? DEFAULT_THRESHOLD,
            // GD23: the computer's own run is quiet about a quiet turn unless asked; a project's own says it once.
            clean: options.clean ?? chosen.clean ?? (options.everywhere === true ? DEFAULT_CLEAN_EVERYWHERE : DEFAULT_CLEAN),
            channels: options.channels ?? chosen.notify ?? DEFAULT_CHANNELS,
            say: options.say ?? chosen.say ?? DEFAULT_SAID_AS,
            // Chosen on the page or with `notify --lang`, then the system's, then English: never a flag, since no hook
            // command line has one.
            lang: chosen.lang ?? langOfLocale(this.#dependencies.locale) ?? DEFAULT_LANG,
            preferencesUnusable: read.kind === 'unusable',
            ...(directory === undefined ? {} : { folder: directory }),
        };
    }
    /**
     * RO7 (`2026-11-24-open-agentwhy-from-the-chat.md`): the plugin's copy names the report as the plugin opens it (APO7);
     * else the phrase, where this AI answers it and a person is known to be reading (RO3); else Claude Code's line names
     * the command this hook is run with, and Codex's none (CX6).
     */
    async #wayIn(text, options) {
        if (options.plugin === true)
            return { kind: 'plugin' };
        const { files, home, invocation, projectDirectory, turnFormat: format } = this.#dependencies;
        if (await this.#attended(text)) {
            const here = await openFromChatIn({ files, home, invoke: await invocation.find(), plugin: false }, projectDirectory ?? directoryIn(text)).catch(() => undefined);
            if (format === undefined ? here?.claudeCode : here?.codex)
                return { kind: 'phrase' };
        }
        return format === undefined ? { kind: 'command', command: await this.#invocation() } : { kind: 'none' };
    }
    /** RO3: a person is known to be reading this conversation - the one test for saying the phrase and for answering it. */
    async #attended(text) {
        const { turnFormat: format, entryPoint } = this.#dependencies;
        if (format !== undefined)
            return (await format.readerOfPrompt(text)).attended;
        return entryPoint !== undefined && ATTENDED.includes(entryPoint);
    }
    async announce(notice, channels, plugin) {
        return this.#announced(notice, channels, plugin === true ? { kind: 'plugin' } : { kind: 'command', command: await this.#invocation() });
    }
    async #announced(notice, channels, wayIn) {
        const words = this.#dependencies.words(wayIn).render(notice);
        // The system notification is shown by this process; whether it was accepted changes nothing a hook could act on.
        if (words !== '' && channels.includes('os'))
            await this.#dependencies.notifier.notify(NOTICE_TITLE, words);
        return { notice, output: channels.includes('terminal') ? terminalNotice(NOTICE_TITLE, words) : '' };
    }
    /**
     * At `Stop`: what the turn's delegated agents left behind, and what the session's own agent reached itself - the
     * one agent with no `SubagentStop` of its own (`the-agent-nobody-watches.md` R2). Said once, and then not again
     * unless it changes.
     */
    async #sayWhatTheTurnFound(turn, options) {
        const format = this.#dependencies.turnFormat;
        // Taking clears the store, so a run that cannot show the words must not take them: they are shown as the line in the
        // conversation, or as a system notification (`when-an-agent-finishes.md` R15a).
        const chat = options.channels.includes('chat');
        if (!chat && !options.channels.includes('os'))
            return { notice: { kind: 'quiet' }, output: '' };
        // What is said once a conversation is remembered under the conversation, which is the session: a thread Codex continues
        // in a second file keeps its id (XD10). CX8 as amended 2026-10-10: no longer the threads Codex titled alike - the
        // maintainer asked one question in the desktop app and the terminal, Codex titled both the same, and the second to
        // finish heard nothing of the tracked file it had read, the first having been told.
        const conversation = turn.sessionId;
        const { store } = this.#dependencies;
        const own = await this.#ownReach(turn, options);
        const reach = own.kind === 'alert' ? own.alert : undefined;
        // Taken once the conversation is read, which takes seconds on a long one, and only what the turn says: what was said
        // once stays where it is. Cleared before the reading and written back after, it was not there for a helper that
        // finished in between, and "once per chat" was said at the end of every such turn; and a run that was ended while it
        // read took with it what was said and what nobody had been told yet (B4j).
        const remembered = await store.take(conversation, KEPT_NAMES);
        const kept = new Map(remembered.map((alert) => [alert.agentId, alert]));
        const said = kept.get(OWN_REACH_SAID);
        const delegated = remembered.filter((alert) => !KEPT_NAMES.includes(alert.agentId));
        if (reach !== undefined)
            await store.remember(conversation, { ...reach, agentId: OWN_REACH_SAID });
        // A turn nobody looked at, or one that opened a file nobody asked to hear about (R6a), changes nothing that was
        // said: forgotten there, the same finding was a new one to the turn after it, which blocked a second time (R10).
        else if (own.kind === 'nothing')
            await store.forget(conversation, OWN_REACH_SAID);
        const fresh = reach !== undefined && reach.words !== said?.words ? [reach] : [];
        // HR3: a helper whose reads the turn's alert says is said there, once.
        const covered = new Set(own.kind === 'alert' ? own.helpers ?? [] : []);
        const saying = [...fresh, ...delegated.filter((alert) => !covered.has(alert.agentId))];
        // A clean line said once is let go on a turn with a finding, on purpose: the next quiet turn then says what the
        // session holds (R4, R6). Nowhere else - a continuation that says nothing (`2026-11-05-a-key-in-what-it-read.md`
        // KRO10: the first quiet line was asked of the agent again after every turn) or a turn nobody looked at leaves it.
        if (saying.length > 0 && own.kind !== 'not-looked' && own.kind !== 'unsaid')
            await store.forget(conversation, CLEAN_SAID);
        // What this session has had said about it, this turn included.
        const counts = countedWith(kept.get(SESSION_COUNTS)?.counts, saying);
        if (saying.length > 0 && anythingSaid(counts)) {
            await store.remember(conversation, { agentId: SESSION_COUNTS, level: 'counts', words: '', counts });
        }
        /*
         * A turn this run could not look at is not a quiet turn, and must never be said as one: every way of failing to
         * look is silence on this event (`the-agent-nobody-watches` R9), and a clean line over a reading that did not
         * happen is the one sentence this tool must never write. Nor is a turn that opened a private file the person did
         * not ask to hear about (R6a): the clean line says no private file was opened.
         */
        // R13: the turn a block caused is the agent saying what was found, and a quiet line after it - "nothing new now,
        // earlier a key was read" - repeats it, in the chat and as a notification. Only something new is said there.
        const notice = saying.length > 0
            ? { kind: 'turn', remembered: saying }
            : own.kind === 'not-looked' || turn.active
                ? { kind: 'quiet' }
                : (await this.#preferencesNotice(conversation, options)) ??
                    (own.kind === 'unsaid' ? { kind: 'quiet' } : await this.#cleanNotice(conversation, options, counts, own.kind === 'nothing' ? own.keys : undefined));
        await this.#notifyTurn(notice, fresh, options);
        if (!chat)
            return { notice, output: '' };
        // The other two channels carry a title of their own; a line in the conversation has none, so it says who speaks.
        const words = this.#dependencies.words(options.wayIn).render(notice);
        const files = own.kind === 'alert' ? own.files : [];
        const reader = await this.#readerOf(turn);
        const requests = format?.requests ?? CLAUDE_CODE_REQUESTS;
        const found = own.kind === 'alert' ? own.found : 'keys';
        if (this.#agentSpeaks(turn, options, fresh, reader, requests[found] !== undefined ? found : undefined)) {
            const command = reportCommand(format === undefined ? turn.sessionId : format.sessionKey(turn.sessionId), await this.#invocation());
            const asked = requests[found] ?? requests.keys;
            return { notice, output: blockNotice(asked(files, command, options.lang, reader.foldsTurn === true), withTitle(words)) };
        }
        if (this.#agentSaysClean(turn, options, notice, reader)) {
            const keys = notice.kind === 'clean' ? notice.keys : undefined;
            return { notice, output: blockNotice(requests.quiet(options.lang, reader.foldsTurn === true, keys, options.wayIn.kind === 'phrase'), withTitle(words)) };
        }
        return { notice, output: chatNotice(withTitle(words)) };
    }
    /**
     * The end of a turn as a system notification, where one was chosen (`when-an-agent-finishes.md` R15a): the Claude
     * desktop app shows no line in the conversation (B4h), and this is what reaches a person there. Only what this turn
     * adds: a delegated agent's notice went out on it when that agent finished, so where the conversation is told as
     * well, the new part is the turn's own reach or the line of a quiet turn. Without the conversation it is the whole turn.
     */
    async #notifyTurn(notice, fresh, options) {
        const { channels } = options;
        if (!channels.includes('os'))
            return;
        const shown = notice.kind !== 'turn' || !channels.includes('chat')
            ? notice
            : fresh.length > 0 ? { kind: 'turn', remembered: fresh } : { kind: 'quiet' };
        const words = this.#dependencies.words(options.wayIn).render(shown);
        if (words !== '')
            await this.#dependencies.notifier.notify(NOTICE_TITLE, words);
    }
    /**
     * Whether this turn's finding is said by the session's own agent rather than as a line (R9-R14). Every condition
     * is a measurement or a reason written down beside it, and all of them must hold:
     *
     * - **a value is being said now, for the first time, by the session's own agent** - the only level the agent
     *   speaks for (R8, R12b), and only where it is the one who found it. `fresh` holds the own-reach alert alone,
     *   never a delegated agent's: the instruction tells the agent "you read this file in this conversation" (R12,
     *   R12b), which is false, and checkable as false, of a file only a delegated subagent reached. A delegated
     *   agent's finding still reaches the person, as the line `saying` renders - just never as a claim this agent is
     *   asked to make about its own context. The finding was recorded as said before this is asked, because `Stop`
     *   fires twice for one turn (B8a), so the same finding never blocks twice (R10);
     * - **the person asked for it**, or asked for nothing and has the default (R8);
     * - **this is not already a continuation a block caused** - `stop_hook_active` read `true` there (B9c, R13);
     * - **a person is reading** - the entry point is one measured attended (B9e2, R14). One this version does not
     *   know, or none at all, gets the line: a scripted run continued by a block prints an answer it never asked for.
     *
     * One more, for an app that shows no line (`codex-says-it-too` CX10, CXB4, CXB7): a reach the person asked to hear of
     * (`on: reached`) is asked of the agent there too - said as what the record holds, a name or a read with nothing
     * traced (`found`) - because a line in such an app reaches nobody, and the person asked.
     */
    #agentSpeaks(turn, options, fresh, reader, found) {
        const unseenReach = reader.showsLine === false && (found === 'named' || found === 'opened') && fresh.some((alert) => alert.level === 'reached' && alert.told !== true);
        // 2026-10-10: a stop the session's own agent met is said by it, in every interface measured as read by a person.
        const ownStop = found === 'blocked' && fresh.some((alert) => alert.stopped === true);
        return (fresh.some((alert) => alert.level === 'value' || alert.told === true) || unseenReach || ownStop) &&
            options.say === 'agent' &&
            !turn.active &&
            reader.attended;
    }
    /**
     * Who reads the session (R14, R5): for Claude Code, the entry point its hooks are handed (B9e2, B9e3); for another
     * AI, what its own record says (`codex-says-it-too` CX4).
     */
    async #readerOf(turn) {
        const format = this.#dependencies.turnFormat;
        if (format !== undefined)
            return format.readerOf(turn);
        const { entryPoint } = this.#dependencies;
        return {
            attended: entryPoint !== undefined && ATTENDED.includes(entryPoint),
            quietSaidByAgent: entryPoint !== undefined && CLEAN_SAID_BY_AGENT.includes(entryPoint),
        };
    }
    /**
     * Whether the first quiet turn of a session is said by the agent too (R5, amended 2026-10-02): the line that says the
     * watch is running and nothing has been opened - never a later quiet turn, never one over an earlier finding (R6),
     * never every turn - where the person left `say` at `agent`, outside a continuation (R13), and in an interface the
     * maintainer asked it for (`CLEAN_SAID_BY_AGENT`). The line was marked said before this is asked, so it blocks once.
     */
    #agentSaysClean(turn, options, notice, reader) {
        return notice.kind === 'clean' && notice.first && !anythingSaid(notice.counts) &&
            options.say === 'agent' &&
            !turn.active &&
            reader.quietSaidByAgent;
    }
    /**
     * AP5: whether the person's own `~/.claude/settings.json` runs the computer's `watch` on both its events, as GD23 counts
     * it on. A file that cannot be read runs nothing anybody can know of, so the plugin's copy speaks: never two silences.
     */
    async #personWatchesEverywhere(event) {
        const { files, home, invocation } = this.#dependencies;
        const settings = parseJsonObject((await textOf(files, join(home, SETTINGS_FILES.directory, SETTINGS_FILES.shared))) ?? '');
        if (settings === undefined)
            return false;
        const events = everywhereWatchEvents(settings, await invocation.find());
        // PK7: a message is the person's copy's only where that copy runs on it.
        if (event !== undefined)
            return events.has(event);
        return events.has(SUBAGENT_STOP.event) && events.has(STOP.event);
    }
    /**
     * Whether the project this hook runs for runs `watch` from its own settings (GD23) - the folder Claude Code names
     * (`CLAUDE_PROJECT_DIR`), else the one the session ran in. The person's own settings, read in the home folder, are the
     * computer's, and the computer's `watch` there is not a project's.
     */
    async #watchesItself(folder, event) {
        const { files, projectDirectory, invocation } = this.#dependencies;
        const project = projectDirectory ?? folder;
        if (project === undefined)
            return false;
        const invoke = await invocation.find();
        for (const name of [SETTINGS_FILES.local, SETTINGS_FILES.shared]) {
            const settings = parseJsonObject((await textOf(files, join(project, SETTINGS_FILES.directory, name))) ?? '');
            if (settings !== undefined && (event === undefined ? runsOwnWatch(settings, invoke) : runsOwnWatchOn(settings, event, invoke)))
                return true;
        }
        return false;
    }
    /**
     * RO2: whether a copy this one steps aside for answers the phrase - one not pinned to a release before it. Every copy
     * ahead is asked: the project's own, and for the plugin's the person's too.
     */
    async #answersThePhrase(folder, options) {
        const { files, home, projectDirectory, invocation } = this.#dependencies;
        const invoke = await invocation.find();
        const project = projectDirectory ?? folder;
        const ahead = [
            ...(project === undefined ? [] : [SETTINGS_FILES.local, SETTINGS_FILES.shared].map((name) => [join(project, SETTINGS_FILES.directory, name), 'own'])),
            ...(options.plugin === true ? [[join(home, SETTINGS_FILES.directory, SETTINGS_FILES.shared), 'everywhere']] : []),
        ];
        for (const [path, scope] of ahead) {
            const settings = parseJsonObject((await textOf(files, path)) ?? '');
            const running = settings === undefined ? [] : watchInvocationsOn(settings, USER_PROMPT_SUBMIT.event, scope, invoke);
            if (running.some((one) => !pinnedOlderThan(one, OPEN_FROM_CHAT_SINCE)))
                return true;
        }
        return false;
    }
    /**
     * RO2-RO4: agentwhy's page, for a person whose whole message asked for it - in the project they wrote it in, else the
     * computer's own (ROD8). Nothing where nobody is known to be reading: a script never starts a server (PFD3).
     */
    async #opened(text, options) {
        const { opens, turnFormat: format, files, home, projectDirectory } = this.#dependencies;
        if (opens === undefined)
            return '';
        const prompt = format === undefined ? parseUserPromptSubmitInput(text) : format.readPrompt(text);
        if (!('message' in prompt))
            return '';
        const { message } = prompt;
        const request = openRequest(message.text, message.pastes);
        if (request === undefined)
            return '';
        try {
            if (!(await this.#attended(text)))
                return '';
            const own = projectDirectory ?? message.workingDirectory;
            const project = format !== undefined ? await format.projectOf(text) : own !== undefined && (await setUpIn(files, own)) ? own : undefined;
            const plugin = options.plugin === true;
            if (project === undefined)
                return await opens.answer({ request: 'page', folder: home, plugin });
            const key = message.sessionId === undefined ? undefined : format === undefined ? message.sessionId : format.sessionKey(message.sessionId);
            return await opens.answer({ request, folder: project, ...(key === undefined ? {} : { sessionKey: key }), plugin });
        }
        catch {
            return '';
        }
    }
    /**
     * How the agent is to run agentwhy: the way the `Stop` hook running now does, read from the project's settings -
     * the local file first, the one `init` writes. Found by a measurement (B9d): the offer named `agentwhy`, which was on
     * no path in that project, and the command failed with exit 126. Where no settings say, or say it in anything but
     * plain words, the way this hook's own process was started (`a-hook-runs-what-you-ran.md` J6).
     */
    async #invocation() {
        const { files, projectDirectory, invocation } = this.#dependencies;
        if (projectDirectory === undefined)
            return invocation.find();
        for (const name of [SETTINGS_FILES.local, SETTINGS_FILES.shared]) {
            const settings = parseJsonObject((await textOf(files, join(projectDirectory, SETTINGS_FILES.directory, name))) ?? '');
            const running = settings === undefined ? undefined : watchInvocation(settings);
            if (running !== undefined)
                return running;
        }
        return invocation.find();
    }
    /**
     * That the person's choices could not be read (R24): said once a session, on a turn with nothing else to say, and
     * never as a block. Without it a broken file reads exactly like choices that were honoured - the person who set
     * `off` and still hears a line, or set `every-turn` and hears nothing, would have no way to know why.
     */
    async #preferencesNotice(conversation, options) {
        if (!options.preferencesUnusable)
            return undefined;
        const first = await this.#dependencies.store.rememberOnce(conversation, { agentId: PREFERENCES_SAID, level: 'preferences', words: '' });
        return first ? { kind: 'preferences-unusable' } : undefined;
    }
    /**
     * A turn that found nothing, where that is worth saying (R4-R6). It is the one notice that reports no finding, so
     * it is held to two things: it never speaks where the person asked for silence, and it never says a session is
     * clean when an earlier turn of it was not - what the turn found and what the session holds are said apart.
     */
    async #cleanNotice(conversation, options, counts, seen) {
        const mode = options.clean;
        if (mode === 'off')
            return { kind: 'quiet' };
        // Said once means once.
        const first = mode === 'once' && (await this.#dependencies.store.rememberOnce(conversation, { agentId: CLEAN_SAID, level: 'clean', words: '' }));
        if (mode === 'once' && !first)
            return { kind: 'quiet' };
        // KR11: only the first line says keys, and only one that says no earlier finding, which the words put first.
        const keys = first && !anythingSaid(counts) ? await seen?.() : undefined;
        return { kind: 'clean', first, counts, lang: options.lang, ...(keys === undefined ? {} : { keys }) };
    }
    /**
     * `2026-11-05-a-key-in-what-it-read.md` KR11: the keys the conversation's tools returned, where the project the hook runs for
     * hides keys from its AI - the switch's entry on `PostToolUse` in its own settings. Another AI's hook asks it as that AI's own
     * hook does, from the turn's folder (`2026-11-09-codex-hides-keys.md` CHD1, CHO4: one switch, the same line); nothing where
     * the switch is off: the line is then what it was (KR10).
     */
    async #keysSeen(model, folder) {
        const format = this.#dependencies.turnFormat;
        if (format !== undefined) {
            if (folder === undefined || format.keysHiddenAt === undefined)
                return undefined;
            return (await format.keysHiddenAt(folder)) ? keysSeenIn(model) : undefined;
        }
        const { files, projectDirectory } = this.#dependencies;
        const project = projectDirectory ?? folder;
        if (project === undefined)
            return undefined;
        for (const name of [SETTINGS_FILES.local, SETTINGS_FILES.shared]) {
            const settings = parseJsonObject((await textOf(files, join(project, SETTINGS_FILES.directory, name))) ?? '');
            if (settings !== undefined && runsKeySwap(settings))
                return keysSeenIn(model);
        }
        return undefined;
    }
    /**
     * The session's report, read from the primary transcript the input names and nothing else (R3), with the policy and
     * evidence `report` reads; nothing where it cannot be read.
     */
    async #reportOf(turn, options) {
        const { source, files, createRedactor, home } = this.#dependencies;
        if (turn.transcriptPath === undefined)
            return undefined;
        const policy = await choosePolicy(options, files, this.#dependencies.tell, this.#dependencies.home);
        if ('errors' in policy)
            return undefined;
        const read = await source.read(expandHome(turn.transcriptPath, home));
        if (read.gaps.some((gap) => gap.kind === 'session-missing'))
            return undefined;
        // B8b: the turn's last words are on the input, and B4c measured the same words missing from disk at hook time.
        const model = turn.lastMessage === undefined ? read : withLateMessage(read, read.sessionId, turn.lastMessage);
        // `2026-10-12-a-read-outside-the-project.md` RX4: each file under the rules of the project it is in too, as the report
        // reads it (RW7) - the line called a file the report said was blocked one the person lets their AI read (RXB2).
        const own = options.settingsPath === undefined ? undefined : projectOfSettings(options.settingsPath);
        const elsewhere = await rulesOfConversation(files, home, model, own, options.folder ?? home);
        const rules = withProjects(policy.policy, elsewhere.projects);
        const report = buildReport(model, rules, createRedactor(model.projectRoot), {
            share: false, projectRoot: model.projectRoot, home: this.#dependencies.home, ...(await this.#fingerprintsOf(model.projectRoot, rules)),
        });
        return { report, model };
    }
    /**
     * What the session's own agent reached, read from the session's report (`#reportOf`). Every way of failing to look is
     * silence here, not a notice: at the end of every turn, a line saying it could not look would arrive for the rest of
     * the session, and `check` finds the same thing without a hook.
     */
    async #ownReach(turn, options) {
        const renderer = this.#dependencies.words(options.wayIn);
        const read = await this.#reportOf(turn, options);
        if (read === undefined)
            return { kind: 'not-looked' };
        const { report, model } = read;
        const alert = alertOf(report, report.graph.main.index);
        /*
         * `2026-10-11-a-helper-read-is-said.md` HR1, HR4: where the conversation's own agent read no private file and its
         * helpers read only tracked ones, the turn is told as S1 tells the agent's own - in Codex too, which raises no hook
         * when a helper finishes. Found on the maintainer's round of that day: the Codex desktop app and its panel said
         * nothing, Claude Code's terminal "CHECK: 2 agents reached protected files". Whatever the agent's own level: a
         * helper's read makes it `reached` at least, and a value from a blocked file never gets here (HR6).
         */
        const byHelpers = this.#toldReadBy(report) === undefined ? toldReadByHelpers(report, model) : undefined;
        if (byHelpers !== undefined) {
            const words = renderer.render({ kind: 'told', lang: options.lang });
            return {
                kind: 'alert',
                alert: { agentId: OWN_REACH_SAID, level: 'reached', words, told: true },
                files: byHelpers.files,
                found: 'helperTold',
                helpers: byHelpers.agents,
            };
        }
        /*
         * S1 of `the-chat-says-what-the-report-says`: a read of files the person tracks is `told` at every threshold -
         * choosing Tell me is asking to be told, and only switching alerts off silences it. Asked before the threshold,
         * because a tracked read without a traced value is `reached`, which the default threshold never says: the person
         * heard "no value found", in English, over a read they had asked to hear about - and in the ChatGPT/Codex app,
         * which shows no plain line, nothing at all (seen by the maintainer, 2026-10-02).
         */
        if (alert !== undefined && (alert.level === 'value' || alert.level === 'reached')) {
            const readByMain = this.#toldReadBy(report);
            if (readByMain !== undefined) {
                const words = renderer.render({ kind: 'told', lang: options.lang });
                return {
                    kind: 'alert',
                    alert: { agentId: OWN_REACH_SAID, level: alert.level, words, ...notByRule(alert), told: true },
                    files: readByMain,
                    found: 'told',
                };
            }
        }
        /*
         * 2026-10-10, the maintainer ("A", and "musi być, że agentwhy, tak jak Codex"): a conversation a rule kept from
         * protected files, and that reached no more of them, is said at every threshold - its row says "Stopped", and Codex's
         * agent says agentwhy stopped it (CX2). Said by the session's own agent where it was the one stopped, as Codex's is;
         * a stop only a helper met is the line alone (R12b). A refusal by auto mode or the person is no rule of agentwhy's,
         * and keeps the threshold (WS5).
         */
        // Codex says its stops from its rollout, before the turn is read (CX2), and said again here they would be twice.
        const stops = alert === undefined || this.#dependencies.turnFormat !== undefined ? undefined : stoppedFrom(report);
        if (alert !== undefined && stops !== undefined) {
            const words = renderer.render({ kind: 'stopped', count: stops.all.length, lang: options.lang });
            return {
                kind: 'alert',
                alert: { agentId: OWN_REACH_SAID, level: 'refused', words, stopped: true },
                files: stops.own.length > 0 ? stops.own : stops.all,
                found: stops.own.length > 0 ? 'blocked' : 'keys',
            };
        }
        // A refusal opened nothing, so a clean line stays true over it; a reach did, so it does not (R6a).
        if (alert !== undefined && alert.level === 'reached' && !alerts(alert.level, options.on))
            return { kind: 'unsaid' };
        if (alert === undefined || !alerts(alert.level, options.on))
            return { kind: 'nothing', keys: () => this.#keysSeen(model, options.folder) };
        const opened = readFrom(report, report.graph.main.index);
        if (alert.level !== 'value') {
            // S20 `name`: a conversation that only came across names is said as its row says it, with nothing to do.
            const names = alert.level === 'reached' ? namesOnly(report) : undefined;
            const words = names === undefined ? renderer.render({ kind: 'alert', alert }) : renderer.render({ kind: 'names', count: names, lang: options.lang });
            // CX10: what the conversation's own record holds of the reach - read by the page's word (S3), or a name alone - so an
            // app that shows no line can ask the agent to say that much, and no more than the record establishes (R12b).
            const stories = report.stories.filter((story) => story.agentIndex === report.graph.main.index && (story.read === true || story.outcome === 'succeeded'));
            const reached = [...new Set(stories.map((story) => story.path))];
            const found = alert.level === 'reached' && reached.length > 0 ? (stories.some((story) => story.read === true) ? 'opened' : 'named') : 'keys';
            return {
                kind: 'alert',
                alert: { agentId: OWN_REACH_SAID, level: alert.level, words, ...notByRule(alert), ...(names === undefined ? {} : { named: true }) },
                files: reached.length > 0 ? reached : opened,
                found,
            };
        }
        const found = foundIn(report, opened);
        const { what } = found;
        const words = renderer.render(what === 'told' ? { kind: 'told', lang: options.lang } : { kind: 'read', what, lang: options.lang });
        const remembered = what === 'told' ? { told: true } : what === 'data' ? { data: true } : {};
        return { kind: 'alert', alert: { agentId: OWN_REACH_SAID, level: alert.level, words, ...notByRule(alert), ...remembered }, files: found.files, found: what };
    }
    /**
     * The files the session's own agent read where every one is tracked (S1, `told`): their paths, or nothing where any
     * is blocked - one blocked file among them keeps the stronger words - or where nothing was read at all. Read from
     * the stories, by the page's word for read (S3): a call that printed the file's text, never a name seen in a
     * listing, never a write, and never a delegated agent's read (R12b).
     *
     * Nor where a value the conversation holds came from a file the person blocks (`2026-10-11-a-helper-read-is-said.md`
     * HR6): a key grepped from a blocked `.env` beside a tracked file read was said as "nothing needs to change" - the
     * tracked file's words over the blocked one's, which `foundIn` never lets stand.
     */
    #toldReadBy(report) {
        const main = report.graph.main.index;
        const read = [...new Set(report.stories
                .filter((story) => story.agentIndex === main && story.read === true)
                .map((story) => story.path))];
        if (read.length === 0)
            return undefined;
        const told = toldFiles(report);
        return read.every((path) => told.has(path)) && valuesFrom(report).every((path) => told.has(path)) ? read : undefined;
    }
    /**
     * What `chat` does at `SubagentStop`: keep the words for the end of the turn, because this event discards a
     * `systemMessage` (B4d, B4f) and the agent's last text is not on disk for anyone to read later (B4c).
     */
    async #remember(notice, agent, options) {
        if (!options.channels.includes('chat'))
            return;
        if (notice.kind !== 'alert' && notice.kind !== 'not-checked' && notice.kind !== 'no-record')
            return;
        // Without a session there is no conversation to speak in; the immediate channels said it if they were asked to.
        if (agent?.sessionId === undefined)
            return;
        const words = this.#dependencies.words(options.wayIn).render(notice);
        if (words === '')
            return;
        // A reason it could not look is remembered under the reason, so a hook that fires again says it once (R8). An agent
        // that kept no record is one that could not be checked, and is counted as one where a turn sums several.
        const which = notice.kind === 'alert'
            ? { agentId: agent.agentId, level: notice.alert.level, ...notByRule(notice.alert) }
            : { agentId: `not-checked:${notice.kind === 'no-record' ? 'no-record' : notice.reason}`, level: 'not-checked' };
        await this.#dependencies.store.remember(agent.sessionId, { ...which, words });
    }
    async #noticeFor(text, options) {
        const { source, files, createRedactor, home } = this.#dependencies;
        const parsed = parseSubagentStopInput(text);
        if ('unusable' in parsed)
            return { notice: { kind: 'not-checked', reason: 'input' } };
        const { agent } = parsed;
        const policy = await choosePolicy(options, files, this.#dependencies.tell, this.#dependencies.home);
        if ('errors' in policy)
            return { notice: { kind: 'not-checked', reason: 'policy' }, agent };
        const read = await source.read(expandHome(agent.transcriptPath, home));
        if (read.gaps.some((gap) => gap.kind === 'session-missing'))
            return { notice: { kind: 'not-checked', reason: 'session' }, agent };
        // R9: the last words the hook was handed, which B4c measured as not yet on disk on 4 of 4 agents.
        const model = agent.lastMessage === undefined ? read : withLateMessage(read, agent.agentId, agent.lastMessage);
        // R3: by the id the hook names, and by nothing else.
        const agentIndex = model.agents.findIndex((candidate) => candidate.id === agent.agentId);
        if (agentIndex < 0 && (await leftNoRecord(files, agent, home)))
            return { notice: { kind: 'no-record', lang: options.lang }, agent };
        if (agentIndex < 0 || model.agents[agentIndex]?.id === model.sessionId) {
            return { notice: { kind: 'not-checked', reason: 'agent-not-found' }, agent };
        }
        const report = buildReport(model, policy.policy, createRedactor(model.projectRoot), {
            share: false, projectRoot: model.projectRoot, home: this.#dependencies.home, ...(await this.#fingerprintsOf(model.projectRoot, policy.policy)),
        });
        const alert = alertOf(report, agentIndex);
        if (alert === undefined)
            return { notice: { kind: 'not-checked', reason: 'agent-not-found' }, agent };
        // HR3: a helper that touched only tracked files is said once, by the end of the turn (HR1) - never "ROTATE" over a
        // file the person lets their AI read, as Claude Code's VS Code extension said of a course's lesson.
        if (onlyTracked(report, agentIndex))
            return { notice: { kind: 'quiet' }, agent };
        return { notice: alerts(alert.level, options.on) ? { kind: 'alert', alert } : { kind: 'quiet' }, agent };
    }
}
/**
 * The protected files a value in this session was **read from** by one agent - not every file the session touched,
 * and not every file another agent in the same session touched. The instruction tells the agent "you read these",
 * and a session checks that against its own context and argues with a claim that does not hold (R12b): a file only
 * a delegated subagent reached is a file this agent never read, naming it is the same false sentence as naming a
 * file the session only wrote a value into. Found by the first test of this, on a session that read `.env` and
 * wrote into `.env.production`.
 */
/**
 * HR1: the files the conversation's helpers read, where its own agent read none and every one they read is tracked, with
 * the helpers that read them - by the page's word for read (S3). `undefined` where a helper read a blocked file, or none
 * read anything: those are said as before.
 */
function toldReadByHelpers(report, model) {
    // Asked only where the agent's own reads say nothing (`#toldReadBy`): a read of its own is then of a file not tracked,
    // which the check below turns away.
    const reads = report.stories.filter((story) => story.read === true);
    if (reads.length === 0)
        return undefined;
    const told = toldFiles(report);
    const files = [...new Set(reads.map((story) => story.path))];
    // HR6: a value from a blocked file is said in the blocked file's words, whoever found it.
    if (!files.every((path) => told.has(path)) || !valuesFrom(report).every((path) => told.has(path)))
        return undefined;
    const agents = [...new Set(reads.flatMap((story) => {
            const id = story.agentIndex === undefined ? undefined : model.agents[story.agentIndex]?.id;
            return id === undefined ? [] : [id];
        }))];
    return { files, agents };
}
/**
 * HR3: this agent read a private file, and every one it touched - read, named or stopped from - is one the person tracks:
 * the end of the turn says it (HR1). One that read none is said as before.
 */
function onlyTracked(report, agentIndex) {
    const told = toldFiles(report);
    const touched = report.stories.filter((story) => story.agentIndex === agentIndex);
    return touched.length > 0 && touched.some((story) => story.read === true) && touched.every((story) => told.has(story.path)) &&
        readFrom(report, agentIndex).every((path) => told.has(path));
}
/** The files the person tracks among those the conversation touched (F57). */
function toldFiles(report) {
    return new Set(report.findings.filter((finding) => finding.told === true).map((finding) => finding.path));
}
/** HR6: every file a value traced in the conversation was read from - used, written, or carried back by a helper. */
function valuesFrom(report) {
    return [...new Set([
            ...report.uses.flatMap((use) => use.files),
            ...report.returns.flatMap((statement) => [...(statement.strength === 'value' ? statement.paths : []), ...statement.writtenFrom]),
        ])];
}
/**
 * What the files the conversation read held (`the-chat-says-what-the-report-says.md` S1): `told` where every one is a
 * file the person lets their AI read (F57); else the strongest kind among the others, as the report's to-do list says it -
 * keys, then a template, then private data - with the files of that kind alone, the rest being the report's. A tracked
 * file beside a blocked one keeps the blocked one's words, the safer of the two. A file the list does not hold is said as
 * keys, the words used for every value before S1.
 */
function foundIn(report, opened) {
    const told = new Set(report.findings.filter((finding) => finding.told === true).map((finding) => finding.path));
    if (opened.length > 0 && opened.every((file) => told.has(file)))
        return { what: 'told', files: opened };
    const items = new Map(toDoItems(report).map((item) => [item.path, item]));
    const kindOf = (file) => {
        const item = items.get(file);
        return item === undefined ? 'keys' : item.template ? 'template' : item.kind;
    };
    const blocked = opened.filter((file) => !told.has(file));
    for (const what of ['keys', 'template', 'data']) {
        const files = blocked.filter((file) => kindOf(file) === what);
        if (files.length > 0)
            return { what, files };
    }
    return { what: 'keys', files: opened };
}
function readFrom(report, agentIndex) {
    return [...new Set([
            ...report.uses.filter((use) => use.agentIndex === agentIndex).flatMap((use) => use.files),
            ...report.returns
                .filter((statement) => statement.agentIndex === agentIndex)
                .flatMap((statement) => [...(statement.strength === 'value' ? statement.paths : []), ...statement.writtenFrom]),
        ])];
}
/** The working directory the hook input names, whichever event it was: what decides which project's answers apply. */
function directoryIn(text) {
    const input = parseJsonObject(text);
    const directory = input?.[HOOK_INPUT.fields.workingDirectory];
    return typeof directory === 'string' && directory !== '' ? directory : undefined;
}
/** Whether agentwhy runs in this folder, from its two settings files (`runsAgentwhy`). */
async function setUpIn(files, folder) {
    const read = [SETTINGS_FILES.local, SETTINGS_FILES.shared].map(async (name) => parseJsonObject((await textOf(files, join(folder, SETTINGS_FILES.directory, name))) ?? ''));
    return runsAgentwhy(await Promise.all(read));
}
/** A file that is not there is not a file that failed: both are `undefined`, and `readPreferences` tells them apart. */
async function textOf(files, path) {
    try {
        return await files.readText(path);
    }
    catch {
        return undefined;
    }
}
/**
 * Whether a finished agent kept no record at all: the input names its own file, and the file is not there (R4a, B4g).
 * One line is read, enough to know the file exists. A file that cannot be read, or an input that names none, is not
 * this - it stays an agent that was not found (R4).
 */
async function leftNoRecord(files, agent, home) {
    if (agent.agentTranscriptPath === undefined)
        return false;
    const lines = files.readLines(expandHome(agent.agentTranscriptPath, home))[Symbol.asyncIterator]();
    try {
        await lines.next();
        return false;
    }
    catch (error) {
        if (error instanceof FileAccessError)
            return error.failure === 'not-found';
        throw error;
    }
    finally {
        await lines.return?.();
    }
}
/** A path the hooks reference writes with a leading `~/` in its examples: expanded, never read as relative. */
function expandHome(path, home) {
    return path.startsWith(HOME_PREFIX) ? join(home, path.slice(HOME_PREFIX.length)) : path;
}
