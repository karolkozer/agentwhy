// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { ANSWER_SCOPES, isConversationAnswer } from '../report/answers/answer-kinds.js';
import { answerText } from '../report/answers/answer-text.js';
import { callIdIn } from '../report/answers/call-id.js';
import { idOf } from '../report/answers/short-names.js';
import { LANGS, translator } from '../report/render/report-copy.js';
import { ASKABLE, toolDescription, TOOL_INPUT } from './tool-description.js';
/**
 * Claude Code puts an MCP server's tools off behind its own tool search: the AI is then shown a tool's name alone, and reached for this
 * one only where it happened to look (CVB28). With this it is handed the tool whole, as CV2 needs.
 */
const ALWAYS_LOAD = 'anthropic/alwaysLoad';
const TERMINAL_LIMIT = 48_000;
/** The rows a list of conversations opens with. */
const NEWEST = 10;
const MIME = 'text/html;profile=mcp-app';
const NAME = /^#?([A-Za-z0-9-]{4,64})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UI_EXTENSION = 'io.modelcontextprotocol/ui';
const WHOLE_ID = /^(?:codex-|copilot-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * The plugin's own server for its card (`2026-11-24-talking-about-agentwhy.md` CVD12), one message in and one out: one tool, read-only,
 * and one card. The model is given the words; the data goes to the card in `_meta`, which the model is not handed (CVB20).
 */
export class CardMessages {
    #answers;
    #version;
    /** The conversations the lists of this session named, by their keys: another is asked about by the beginning of its id alone (CV7). */
    #named = new Map();
    /** Whether the app draws the card: Codex says so of itself, and its terminal draws none (CVB16). */
    #drawn = true;
    #codex = false;
    constructor(answers, version) {
        this.#answers = answers;
        this.#version = version;
    }
    /** The answer to one line, or nothing: a line that is no message, and one that asks for no answer. What it tells meanwhile asks for none. */
    async answer(line, tell) {
        const message = parsed(line);
        if (message === undefined || message.id === undefined)
            return undefined;
        const { id, method } = message;
        const result = await this.#result(method, message.params ?? {}, tell);
        return result === undefined
            ? { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } }
            : { jsonrpc: '2.0', id, result };
    }
    async #result(method, params, tell) {
        switch (method) {
            case 'initialize':
                this.#drawn = drawsCards(params);
                this.#codex = isCodex(params);
                return {
                    protocolVersion: typeof params['protocolVersion'] === 'string' ? params['protocolVersion'] : '2025-06-18',
                    capabilities: { tools: {}, resources: {} },
                    serverInfo: { name: 'agentwhy', version: this.#version },
                };
            case 'ping':
                return {};
            case 'tools/list':
                return { tools: [{ name: 'what_happened', title: 'What happened', description: toolDescription(this.#drawn), inputSchema: TOOL_INPUT,
                            annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }, _meta: { ...this.#meta(), [ALWAYS_LOAD]: true } }] };
            case 'resources/list':
                return { resources: [{ uri: this.#uri(), name: 'agentwhy', mimeType: MIME }] };
            case 'resources/templates/list':
                return { resourceTemplates: [] };
            case 'resources/read':
                return { contents: [{ uri: this.#uri(), mimeType: MIME, text: this.#answers.card(await this.#lang()), _meta: { ui: { prefersBorder: false } } }] };
            case 'tools/call':
                return params['name'] === 'what_happened' ? this.#call(params['arguments'], callIdOf(params['_meta']), codexThreadOf(params['_meta']), progressTo(params['_meta'], tell)) : refused();
            default:
                return undefined;
        }
    }
    /** One version, one name: an app keeps a card for as long as it knows its name (CVB15). */
    #uri() {
        return `ui://agentwhy/card-${this.#version}.html`;
    }
    /** The data of the terminal's card, of Claude Code's own. Codex hands it to a cell's code, which may print it to the model (CVB33). */
    #terminalMeta(answer) {
        return this.#codex ? {} : terminalMeta(answer);
    }
    #meta() {
        return { ui: { resourceUri: this.#uri() }, 'ui/resourceUri': this.#uri() };
    }
    #lang() {
        return this.#answers.lang().catch(() => 'en');
    }
    async #call(args, callId, thread, progress) {
        // The card stands in a chat: it is in the chat's language where agentwhy speaks it, and else in the one chosen for agentwhy.
        const said = isFields(args) ? args['lang'] : undefined;
        const lang = LANGS.find((one) => one === said) ?? (await this.#lang());
        const t = translator(lang);
        try {
            const asked = await this.#asked(args);
            if (asked === undefined)
                return refused();
            if (asked === 'many')
                return this.#said('okay', lang, t('an.named.many'));
            const { about, where, other } = asked;
            if (about === 'report')
                return await this.#report(lang, t, other?.scope ?? where, other?.key);
            if (isConversationAnswer(about)) {
                const self = other === undefined ? thread ?? (await this.#answers.self(callId)) : undefined;
                const answer = await this.#answers.conversation(other?.key ?? self, callId, lang);
                if (typeof answer === 'string')
                    return this.#said(about, lang, answer);
                // Asked of the running server whatever the question: its list is a tab of the card, and only a server that answers is a link.
                const list = await this.#answers.peek(other?.scope ?? this.#answers.here).catch(() => undefined);
                return await this.#shown(about, lang, answerText(answer, about, t, other), { conversation: answer, ...(other === undefined ? this.#listed(list) : {}) }, list, self, other);
            }
            const list = await this.#answers.list(where, { call: callId, newest: about === 'conversations' ? NEWEST : undefined, progress: progress === undefined ? undefined : (checked) => progress(checked, t('an.checked', { ...checked })) });
            if (typeof list === 'string')
                return this.#said(about, lang, t(list === 'starting' ? 'an.reading' : list === 'newer' ? 'an.newer' : 'an.noServer'));
            return await this.#shown(about, lang, answerText(list, about, t), this.#listed(list), list);
        }
        catch {
            // Whatever failed, its words may hold a path: none of them reach the chat.
            return this.#said('okay', lang, t('ch.failed'));
        }
    }
    async #report(lang, t, scope, key) {
        const page = await this.#answers.open(scope, key);
        if (page === undefined || page === 'starting')
            return this.#said('report', lang, t(page === undefined ? 'an.noServer' : 'an.report.starting'));
        const said = t(page.found ? 'an.report.fact' : 'an.report.missing');
        return this.#said('report', lang, `${said} ${page.url}`, { said, link: page.url, at: this.#answers.now(), ...(key === undefined ? {} : { key }) });
    }
    /** What was asked, checked against the closed lists before anything is read (AY5); `undefined` for anything else. */
    async #asked(args) {
        if (args === null || typeof args !== 'object')
            return undefined;
        const fields = args;
        const { here } = this.#answers;
        const about = ASKABLE.find((one) => one === fields['about']);
        const named = fields['where'] === undefined ? here : ANSWER_SCOPES.find((one) => one === fields['where']);
        if (about === undefined || named === undefined)
            return undefined;
        // The home folder is no project: there every list is this computer's.
        const where = here === 'computer' ? here : named;
        if (fields['conversation'] === undefined)
            return { about, where };
        const name = typeof fields['conversation'] === 'string' ? NAME.exec(fields['conversation'])?.[1] : undefined;
        if (name === undefined)
            return undefined;
        const found = this.#namedBy(name);
        if (found.length === 0) {
            // A conversation picked up again holds cards of an earlier list: what the pages list now is what they named.
            for (const scope of ANSWER_SCOPES)
                this.#listed(await this.#answers.peek(scope).catch(() => undefined));
        }
        const all = found.length > 0 ? found : this.#namedBy(name);
        if (all.length > 1)
            return 'many';
        if (all[0] !== undefined)
            return { about, where, other: all[0] };
        // A card's own conversation, whose page has stopped since: its report is opened by its whole id, which hands the AI nothing of it.
        return about === 'report' && WHOLE_ID.test(name) ? { about, where, other: { key: name, scope: where } } : undefined;
    }
    #namedBy(name) {
        const id = idOf(name);
        return [...this.#named.values()].filter((one) => idOf(one.key).startsWith(id));
    }
    #listed(list) {
        if (list === undefined)
            return {};
        for (const row of [...list.rows, ...(list.beside?.rows ?? [])]) {
            this.#named.set(row.key, { key: row.key, scope: list.scope, ...(row.title === undefined ? {} : { title: row.title }) });
        }
        return { list };
    }
    /** One sentence for an answer, to the model and to the card alike. */
    #said(about, lang, text, more = {}) {
        return { content: [{ type: 'text', text }], _meta: { ...this.#meta(), 'agentwhy/answer': { about, lang, said: text, ...more } } };
    }
    async #shown(about, lang, text, data, answered, self, other) {
        const address = answered === undefined ? undefined : await this.#answers.address(answered.scope).catch(() => undefined);
        return {
            content: [{ type: 'text', text, ...this.#terminalMeta({ about, lang, ...answerAsked(about, data), ...(other === undefined ? {} : { other: other.title === undefined ? {} : { title: other.title } }) }) }],
            _meta: {
                ...this.#meta(),
                'agentwhy/answer': {
                    about, lang, ...data,
                    ...(self === undefined ? {} : { self }),
                    ...(other === undefined ? {} : { key: other.key, ...(other.title === undefined ? {} : { title: other.title }) }),
                    // Where its pages are, and when they were there: a card stays in the chat longer than the page it links to runs.
                    ...(address === undefined ? {} : { pages: address, at: this.#answers.now() }),
                },
            },
        };
    }
}
/** The one answer asked for: the app's card turns from one to another by itself, the terminal's does not. */
const answerAsked = (about, { conversation, list }) => isConversationAnswer(about) ? { conversation: conversation === undefined ? undefined : toldOf(conversation) } : list === undefined ? {} : { list: drawnOf(about, list) };
/** A conversation with what the terminal's card draws of each moment: not the words before it, what it ran or its label, which are the app's. */
function toldOf(conversation) {
    const moments = conversation.steps.moments.map(({ wrote: _wrote, ran: _ran, label: _label, ...drawn }) => drawn);
    return { ...conversation, steps: { ...conversation.steps, moments } };
}
/** A list with what its card draws and nothing else: the limit below is for titles the person asked for. */
function drawnOf(about, list) {
    const rows = about === 'okay' || about === 'often' ? [] : about === 'conversations' ? list.rows.slice(0, list.recent) : list.rows.filter((row) => row.group === about);
    return { ...list, rows, ...(about === 'often' ? {} : { often: [] }), ...(list.beside === undefined ? {} : { beside: drawnOf(about, list.beside) }) };
}
/**
 * What the terminal's card is drawn from (CV13). Claude Code hands it a text block's own `_meta` and keeps that from the model; past about
 * 64 KiB over a result it drops them all, so a longer one is not sent and the words stand.
 */
function terminalMeta(answer) {
    return new TextEncoder().encode(JSON.stringify(answer)).length > TERMINAL_LIMIT ? {} : { _meta: { 'agentwhy/answer': answer } };
}
const refused = () => ({ content: [{ type: 'text', text: 'agentwhy does not answer that.' }], isError: true });
const isFields = (value) => value !== null && typeof value === 'object';
/** Which call this is, where the app says it: Claude Code does, and Codex, each in what it sends with the call. */
function callIdOf(meta) {
    if (!isFields(meta))
        return undefined;
    return callIdIn(meta['claudecode/toolUseId']) ?? (codexThreadOf(meta) === undefined ? undefined : callIdIn(meta['callId']));
}
/** The conversation a call of Codex's is in, by the name the page gives it; of no other app's, whose `threadId` is its own (CVB16). */
function codexThreadOf(meta) {
    if (!isFields(meta) || !isFields(meta['x-codex-turn-metadata']))
        return undefined;
    const thread = meta['threadId'];
    return typeof thread === 'string' && UUID.test(thread) ? `codex-${thread}` : undefined;
}
const isCodex = ({ clientInfo }) => isFields(clientInfo) && clientInfo['name'] === 'codex-mcp-client';
/** Codex's app says it draws such a card and its terminal says nothing; every other app is handed the card and its words alike. */
function drawsCards({ clientInfo, capabilities }) {
    if (!isCodex({ clientInfo }))
        return true;
    return isFields(capabilities) && isFields(capabilities['extensions']) && UI_EXTENSION in capabilities['extensions'];
}
/** How far a reading has got, told to an app that asked to be told (MCP's `progressToken`), and each time it got further. */
function progressTo(meta, tell) {
    const progressToken = meta !== null && typeof meta === 'object' ? meta['progressToken'] : undefined;
    if (tell === undefined || (typeof progressToken !== 'string' && typeof progressToken !== 'number'))
        return undefined;
    let reached = -1;
    return ({ read, of }, message) => {
        if (read <= reached)
            return;
        reached = read;
        tell({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken, progress: read, total: of, message } });
    };
}
function parsed(line) {
    try {
        const value = JSON.parse(line);
        return value !== null && typeof value === 'object' && typeof value.method === 'string' ? value : undefined;
    }
    catch {
        return undefined;
    }
}
