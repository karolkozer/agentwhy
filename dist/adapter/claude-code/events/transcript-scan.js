// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { addsPlaceholder, keysWrittenOver } from '../../../core/redaction/placeholder-write.js';
import { isKeySwapNotice, PLACEHOLDER_WRITE_OPENS } from '../../../core/redaction/swap-keys.js';
import { HOOK_CONTEXT_LINE } from '../contract/hook-lines.js';
import { posixReadingOfPowerShell } from '../../../core/access/powershell-line.js';
import { isJsonObject } from '../../../shared/json.js';
import { DENIAL_SOURCE, isKnownDenialKind, KEY_WRITE_REFUSAL_FRAME, KEY_WRITE_REFUSED_KIND, RULE_REFUSED_READ, RULE_REFUSED_READ_KIND, } from '../contract/denials.js';
import { AGENT_TOOL, HANDBACK_TOOL, FIELDS, TEXT_BLOCK_TYPE, THINKING_BLOCK_TYPE, TOOL_RESULT_BLOCK_TYPE } from '../contract/fields.js';
import { ASSISTANT_LINE_TYPE, USER_LINE_TYPE } from '../contract/line-types.js';
import { toolResultReferences } from '../contract/layout.js';
import { MESSAGE_MODEL_FIELD, MODEL_ID_SHAPE } from '../contract/models.js';
import { LAUNCH_NOTICE, notificationsIn } from '../contract/task-notifications.js';
import { TOOL_DEFINITIONS } from '../contract/tool-definitions.js';
import { GREP_TOOL, mcpToolOf, profileOf, WRITE_RESULT } from '../contract/tools.js';
import { contentBlocks, toolUseBlocks, wordsWithoutResult } from '../probe/transcript-line.js';
/**
 * The calls an agent made on one line: an assistant line's, as `messagesIn` reads its words. The Claude desktop app writes
 * `api-request-blob` lines holding a copy of the conversation sent to the model - 340 tool_use blocks in 29 of 930
 * transcripts, each a copy of an assistant line's id (measured 2026-10-21) - and read as calls they made each id twice,
 * so no result joined its call and four calls of one conversation said *not recorded*.
 */
export function callsIn(record) {
    if (record[FIELDS.lineType] !== ASSISTANT_LINE_TYPE)
        return [];
    return toolUseBlocks(record).flatMap((block) => {
        const id = block[FIELDS.blockId];
        const toolName = block[FIELDS.toolName];
        if (typeof id !== 'string' || typeof toolName !== 'string')
            return [];
        const raw = block[FIELDS.toolInput];
        const input = isJsonObject(raw) ? raw : {};
        const { profile, known } = profileOf(toolName);
        const mcp = mcpToolOf(toolName);
        return [
            {
                id,
                toolName,
                input,
                ...(mcp === undefined ? {} : { mcp }),
                ...addressedIn(input, profile),
                ...(profile.writes === undefined ? {} : { written: writtenIn(input, profile) }),
                ...(removedIn(input, profile).length === 0 ? {} : { removed: removedIn(input, profile) }),
                resultShape: profile.result,
                toolKnown: known,
                ...(printsMatchesIn(toolName, input) ? { printsMatches: true } : {}),
            },
        ];
    });
}
/** Whether a call's own input asks for the lines it matched, as the contract names the one tool that can. */
function printsMatchesIn(toolName, input) {
    return toolName === GREP_TOOL.name && input[GREP_TOOL.outputModeKey] === GREP_TOOL.contentMode;
}
/**
 * Where this tool states its target, split by how it must be read. For a tool the contract does not know,
 * everything it was given is treated as a path: the noisiest reading, and a visible one.
 */
function addressedIn(input, profile) {
    if (profile.searchWholeInput)
        return { targets: stringsOf(input), commands: [] };
    const commands = profile.commandKeys.flatMap((key) => stringsOf(input[key]));
    return {
        targets: profile.pathKeys.flatMap((key) => stringsOf(input[key])),
        // `2026-10-12-powershell-on-windows.md` PW1: a PowerShell line is read as the POSIX line that does the same to files.
        commands: profile.commandLanguage === 'powershell' ? commands.map(posixReadingOfPowerShell) : commands,
    };
}
/** What a call that changes a file takes out of it: the strings under its profile's `removedTextKeys` (OG2), `Edit`'s `old_string`. */
function removedIn(input, profile) {
    return (profile.writes?.removedTextKeys ?? []).flatMap((key) => stringsOf(input[key]));
}
/** What a call that writes a file puts into it: every string it was given, except its path and the text it takes out. */
function writtenIn(input, profile) {
    const skipped = new Set([...profile.pathKeys, ...(profile.writes?.removedTextKeys ?? [])]);
    return Object.entries(input).flatMap(([key, value]) => (skipped.has(key) ? [] : stringsOf(value)));
}
function stringsOf(value) {
    if (typeof value === 'string')
        return [value];
    if (Array.isArray(value))
        return value.flatMap(stringsOf);
    if (value !== null && typeof value === 'object')
        return Object.values(value).flatMap(stringsOf);
    return [];
}
/** Where each kind of the agent's own words is written: the block that holds it, and the field inside it. */
const MESSAGE_BLOCKS = [
    { type: TEXT_BLOCK_TYPE, field: FIELDS.blockText, kind: 'said' },
    { type: THINKING_BLOCK_TYPE, field: FIELDS.blockThinking, kind: 'reasoning' },
];
/**
 * What the agent wrote on this line, block by block and in the order written (`specs/2026-09-15-what-came-back.md` R1,
 * `specs/2026-09-15-why-this-call.md` R1, R4). Only an assistant line: a user line carries text blocks as well, and they are
 * someone else's words.
 */
/**
 * The model this line's reply came from, as the record names it (`contract/models.ts`): on an assistant line alone, and
 * only a value shaped like a model id - `<synthetic>`, Claude Code's own line, names none.
 */
export function modelIn(record) {
    if (record[FIELDS.lineType] !== ASSISTANT_LINE_TYPE)
        return undefined;
    const message = record[FIELDS.message];
    const model = isJsonObject(message) ? message[MESSAGE_MODEL_FIELD] : undefined;
    return typeof model === 'string' && MODEL_ID_SHAPE.test(model) ? model : undefined;
}
export function messagesIn(record) {
    if (record[FIELDS.lineType] !== ASSISTANT_LINE_TYPE)
        return [];
    return contentBlocks(record).flatMap((block) => {
        const written = MESSAGE_BLOCKS.find((kind) => block[FIELDS.blockType] === kind.type);
        if (written === undefined)
            return [];
        const text = block[written.field];
        // An empty block is kept, not dropped: in the measured session every reasoning block is empty, and a
        // report that said "nothing" of them would confuse what an agent did not write with what the record did not
        // keep. What counts as words is decided above the adapter.
        return typeof text === 'string' ? [{ kind: written.kind, text }] : [];
    });
}
/**
 * The reports delivered on this line (`specs/2026-09-15-where-the-value-went.md` R1): notifications that name a call,
 * on a user line holding no tool result. Whether the call is a delegation is the core's join. A notification naming
 * no call delivers nothing to anything, so it is left out here; the doctor counts it.
 */
export function deliveriesIn(record) {
    if (record[FIELDS.lineType] !== USER_LINE_TYPE)
        return [];
    const words = wordsWithoutResult(record);
    if (words === undefined)
        return [];
    return notificationsIn(words).flatMap(({ callId, text }) => (callId === undefined ? [] : [{ callId, text }]));
}
export function isDelegation(call) {
    return call.toolName === AGENT_TOOL.name;
}
/**
 * The report a subagent hands back through a call rather than a message (D9). The words only - which delegation
 * they answer is not in the call, and is the join the caller makes from the transcript the call sits on.
 */
export function handbackIn(call) {
    if (call.toolName !== HANDBACK_TOOL.name)
        return undefined;
    const words = call.input[HANDBACK_TOOL.reportInputKey];
    return typeof words === 'string' ? words : undefined;
}
/** The instruction a delegation carried. Raw content: what the report exists to quote, once M3 can redact it. */
export function delegationTextIn(call) {
    const prompt = call.input[AGENT_TOOL.promptInputKey];
    const description = call.input[AGENT_TOOL.descriptionInputKey];
    return {
        ...(typeof prompt === 'string' ? { prompt } : {}),
        ...(typeof description === 'string' ? { description } : {}),
    };
}
/** The results on one line: a user line's, where every one of them arrives (`callsIn`: a request's copy holds 160 more). */
export function resultsIn(record) {
    if (record[FIELDS.lineType] !== USER_LINE_TYPE)
        return { results: [], denialUnattributed: false };
    const payload = record[FIELDS.toolUseResult];
    const denialValue = record[FIELDS.denialKind];
    // A value the contract knows says who refused (WS1); any other names nobody, and stays unknown.
    const denial = typeof denialValue !== 'string' ? undefined
        : isKnownDenialKind(denialValue) ? { kind: denialValue, recognised: true, source: DENIAL_SOURCE[denialValue] }
            : { kind: denialValue, recognised: false };
    const blocks = contentBlocks(record).filter((block) => block[FIELDS.blockType] === TOOL_RESULT_BLOCK_TYPE);
    // The marker sits on the record, not on a block, so it names a call only while the record holds exactly one.
    const attributable = blocks.length === 1;
    // The payload sits on the record as well, so a launch notice is attributed on the same terms as a denial.
    const launched = isJsonObject(payload) && payload[LAUNCH_NOTICE.statusField] === LAUNCH_NOTICE.launchedStatus;
    const results = blocks.flatMap((block) => {
        const callId = block[FIELDS.resultCallId];
        if (typeof callId !== 'string')
            return [];
        const content = textOf(block[FIELDS.blockContent]) ?? textOf(payload);
        // A refusal the tool says in words sits on its own block, so it names its call however many the record holds.
        const isError = block[FIELDS.resultIsError] === true;
        const refusedByRule = isError && content?.includes(RULE_REFUSED_READ) === true;
        // WK7: agentwhy's own check, in its words on its own block - a check's stop whatever marker the line carries, never a rule's.
        const refusedWrite = isError && content !== undefined && isKeyWriteRefusal(content);
        const writtenOver = attributable && !refusedWrite ? keysWrittenOverIn(payload) : 0;
        return [
            {
                callId,
                ...(content === undefined ? {} : { content }),
                ...(refusedWrite
                    ? { denial: { kind: denial !== undefined && attributable ? denial.kind : KEY_WRITE_REFUSED_KIND, recognised: true, source: 'check' } }
                    : denial !== undefined && attributable
                        ? { denial }
                        : refusedByRule
                            ? { denial: { kind: RULE_REFUSED_READ_KIND, recognised: true, source: DENIAL_SOURCE[RULE_REFUSED_READ_KIND] } }
                            : {}),
                ...(refusedWrite ? { keyWrite: { kind: 'refused' } } : {}),
                ...(writtenOver > 0 ? { keyWrite: { kind: 'written-over', keys: writtenOver } } : {}),
                ...(launched && attributable ? { launchNotice: true } : {}),
                spilledFiles: spilledFilesIn(block[FIELDS.blockContent], payload),
            },
        ];
    });
    return { results, denialUnattributed: denial !== undefined && !attributable };
}
/** WK7: Claude Code's frame around a blocking hook's words, for a write, and `hide-keys`' refusal after it (`KEY_WRITE_REFUSAL_FRAME`). */
function isKeyWriteRefusal(content) {
    const frame = KEY_WRITE_REFUSAL_FRAME.exec(content);
    return frame !== null && content.includes(PLACEHOLDER_WRITE_OPENS, frame[0].length);
}
/**
 * WK7: how many keys a `Write` or an `Edit` that ran took out of its file, by what its payload keeps (`WRITE_RESULT`): the file
 * before it, and the file after it - a `Write`'s whole text, an `Edit`'s replacement made on the file before it. 0 for any other
 * payload, a file with no text before it (a new one, or null), and an `Edit` whose text is not in the file it names.
 */
function keysWrittenOverIn(payload) {
    if (!isJsonObject(payload))
        return 0;
    const before = payload[WRITE_RESULT.originalFile];
    if (typeof before !== 'string')
        return 0;
    const oldText = payload[WRITE_RESULT.oldString];
    const newText = payload[WRITE_RESULT.newString];
    if (typeof oldText === 'string' && typeof newText === 'string') {
        // Whether it adds one is asked first: most payloads of the kind add none, and the file is not rebuilt for them.
        if (oldText === '' || !addsPlaceholder(newText, oldText) || !before.includes(oldText))
            return 0;
        const after = payload[WRITE_RESULT.replaceAll] === true ? before.split(oldText).join(newText) : before.replace(oldText, () => newText);
        return keysWrittenOver({ newText, replaced: oldText }, before, after);
    }
    const content = payload[WRITE_RESULT.content];
    return typeof content === 'string' ? keysWrittenOver({ newText: content, replaced: undefined }, before, content) : 0;
}
/**
 * A result may be a string or a structure; either way the model holds what was written, never a summary. A list of
 * text blocks is read as its words (`specs/2026-09-15-what-came-back.md` R1b): all 15 delegating results of the measured session
 * take that form, and held encoded, a line break inside one was an escape - a report was then never found in its own
 * result, and its length was the length of the encoding. Any other structure is kept encoded, as before.
 */
function textOf(value) {
    if (value === undefined)
        return undefined;
    if (typeof value === 'string')
        return value;
    if (Array.isArray(value) && value.length > 0 && value.every(isTextBlock)) {
        return value.map((block) => block[FIELDS.blockText]).join('\n');
    }
    return JSON.stringify(value);
}
function isTextBlock(value) {
    return isJsonObject(value) && value[FIELDS.blockType] === TEXT_BLOCK_TYPE && typeof value[FIELDS.blockText] === 'string';
}
function spilledFilesIn(...positions) {
    return positions.flatMap((position) => {
        const text = textOf(position);
        return text === undefined ? [] : toolResultReferences(text);
    });
}
/**
 * `2026-11-05-a-key-in-what-it-read.md` KR6: the call one line says agentwhy's hook swapped a key in - its notice to the AI,
 * recorded beside that call. Only such a line makes a placeholder agentwhy's own: a file that merely holds the text is not this.
 */
export function keysHiddenIn(record) {
    if (record[FIELDS.lineType] !== HOOK_CONTEXT_LINE.lineType)
        return undefined;
    const attachment = record[HOOK_CONTEXT_LINE.attachment];
    if (!isJsonObject(attachment) || attachment[HOOK_CONTEXT_LINE.type] !== HOOK_CONTEXT_LINE.kind)
        return undefined;
    if (attachment[HOOK_CONTEXT_LINE.hookEvent] !== HOOK_CONTEXT_LINE.afterACall)
        return undefined;
    const id = attachment[HOOK_CONTEXT_LINE.toolUseId];
    const content = attachment[HOOK_CONTEXT_LINE.content];
    const says = Array.isArray(content) && content.some((text) => typeof text === 'string' && isKeySwapNotice(text));
    return says && typeof id === 'string' ? id : undefined;
}
/**
 * `2026-10-21-the-plan-and-the-recap.md` PN8: the tools one line describes, by name - an attachment of a kind
 * `TOOL_DEFINITIONS` names - and none for any other line.
 */
export function toolDefinitionsIn(record) {
    if (record[FIELDS.lineType] !== TOOL_DEFINITIONS.lineType)
        return [];
    const attachment = record[TOOL_DEFINITIONS.attachment];
    if (!isJsonObject(attachment))
        return [];
    const source = TOOL_DEFINITIONS.lists.find((each) => each.kind === attachment[TOOL_DEFINITIONS.attachmentType]);
    const list = source === undefined ? undefined : attachment[source.list];
    if (source === undefined || !Array.isArray(list))
        return [];
    return list.flatMap((item) => {
        const definition = 'inner' in source && isJsonObject(item) ? item[source.inner] : item;
        if (!isJsonObject(definition))
            return [];
        const name = definition[TOOL_DEFINITIONS.name];
        const description = definition[TOOL_DEFINITIONS.description];
        return typeof name === 'string' && name !== '' && typeof description === 'string' && description.trim() !== '' ? [{ name, description }] : [];
    });
}
