import type { ResultShape } from '../../../core/event.ts';
import type { MessageKind } from '../../../core/message.ts';
import { isJsonObject, type JsonObject } from '../../../shared/json.ts';
import { isKnownDenialKind, RULE_REFUSED_READ, RULE_REFUSED_READ_KIND } from '../contract/denials.ts';
import { AGENT_TOOL, HANDBACK_TOOL, FIELDS, TEXT_BLOCK_TYPE, THINKING_BLOCK_TYPE, TOOL_RESULT_BLOCK_TYPE } from '../contract/fields.ts';
import { ASSISTANT_LINE_TYPE, USER_LINE_TYPE } from '../contract/line-types.ts';
import { toolResultReferences } from '../contract/layout.ts';
import { LAUNCH_NOTICE, notificationsIn } from '../contract/task-notifications.ts';
import { GREP_TOOL, profileOf, type ToolProfile } from '../contract/tools.ts';
import { contentBlocks, toolUseBlocks, wordsWithoutResult } from '../probe/transcript-line.ts';

/**
 * Reads one transcript record. Format knowledge only: which block holds a call, which holds a result, where the
 * ids are. Nothing here joins anything - that is the core's job (spec §9).
 */

export interface ScannedCall {
  readonly id: string;
  readonly toolName: string;
  readonly input: JsonObject;
  /** The strings that name what the call addressed, per the tool's profile in the contract. */
  readonly targets: readonly string[];
  /** Command lines the call carried; the core reads them by their own structure. */
  readonly commands: readonly string[];
  readonly resultShape: ResultShape;
  readonly toolKnown: boolean;
  /** For a tool that writes a file: the strings it puts in - never its path, never the text it takes out. */
  readonly written?: readonly string[];
  /** The tool's input asks for the lines it matched (`search-hits-are-reads` H1): the Grep tool in content mode. */
  readonly printsMatches?: true;
}

export interface ScannedResult {
  readonly callId: string;
  readonly content?: string;
  readonly denial?: { readonly kind: string; readonly recognised: boolean };
  /** The payload says the call only started work elsewhere: what that work produced is not in this result (R5). */
  readonly launchNotice?: boolean;
  /**
   * Spilled files this result points at, by name. Result positions only (lesson L009). **Known limit:** the
   * position is checked, the meaning of the text is not - a result that merely quotes such a path, `grep -r`
   * output for instance, reads as a spill reference. The error runs toward `unknown`, which is the safe
   * direction, and M2 measures how often it fires.
   */
  readonly spilledFiles: readonly string[];
}

export interface ScannedResults {
  readonly results: readonly ScannedResult[];
  /**
   * The record carries a denial marker but holds more than one result, so which call was refused cannot be
   * told. Marking them all refused would report a successful call as blocked; marking none would report a
   * refusal as success. Neither is acceptable, so the ambiguity is reported as such.
   */
  readonly denialUnattributed: boolean;
}

export function callsIn(record: JsonObject): ScannedCall[] {
  return toolUseBlocks(record).flatMap((block) => {
    const id = block[FIELDS.blockId];
    const toolName = block[FIELDS.toolName];
    if (typeof id !== 'string' || typeof toolName !== 'string') return [];

    const raw = block[FIELDS.toolInput];
    const input = isJsonObject(raw) ? raw : {};
    const { profile, known } = profileOf(toolName);

    return [
      {
        id,
        toolName,
        input,
        ...addressedIn(input, profile),
        ...(profile.writes === undefined ? {} : { written: writtenIn(input, profile) }),
        resultShape: profile.result,
        toolKnown: known,
        ...(printsMatchesIn(toolName, input) ? { printsMatches: true as const } : {}),
      },
    ];
  });
}

/** Whether a call's own input asks for the lines it matched, as the contract names the one tool that can. */
function printsMatchesIn(toolName: string, input: JsonObject): boolean {
  return toolName === GREP_TOOL.name && input[GREP_TOOL.outputModeKey] === GREP_TOOL.contentMode;
}

/**
 * Where this tool states its target, split by how it must be read. For a tool the contract does not know,
 * everything it was given is treated as a path: the noisiest reading, and a visible one.
 */
function addressedIn(input: JsonObject, profile: ToolProfile): { targets: string[]; commands: string[] } {
  if (profile.searchWholeInput) return { targets: stringsOf(input), commands: [] };

  return {
    targets: profile.pathKeys.flatMap((key) => stringsOf(input[key])),
    commands: profile.commandKeys.flatMap((key) => stringsOf(input[key])),
  };
}

/** What a call that writes a file puts into it: every string it was given, except its path and the text it takes out. */
function writtenIn(input: JsonObject, profile: ToolProfile): string[] {
  const skipped = new Set([...profile.pathKeys, ...(profile.writes?.removedTextKeys ?? [])]);
  return Object.entries(input).flatMap(([key, value]) => (skipped.has(key) ? [] : stringsOf(value)));
}

function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(stringsOf);
  return [];
}

export interface ScannedMessage {
  readonly kind: MessageKind;
  readonly text: string;
}

/** Where each kind of the agent's own words is written: the block that holds it, and the field inside it. */
const MESSAGE_BLOCKS: readonly { readonly type: string; readonly field: string; readonly kind: MessageKind }[] = [
  { type: TEXT_BLOCK_TYPE, field: FIELDS.blockText, kind: 'said' },
  { type: THINKING_BLOCK_TYPE, field: FIELDS.blockThinking, kind: 'reasoning' },
];

/**
 * What the agent wrote on this line, block by block and in the order written (`specs/2026-09-15-what-came-back.md` R1,
 * `specs/2026-09-15-why-this-call.md` R1, R4). Only an assistant line: a user line carries text blocks as well, and they are
 * someone else's words.
 */
export function messagesIn(record: JsonObject): ScannedMessage[] {
  if (record[FIELDS.lineType] !== ASSISTANT_LINE_TYPE) return [];

  return contentBlocks(record).flatMap((block) => {
    const written = MESSAGE_BLOCKS.find((kind) => block[FIELDS.blockType] === kind.type);
    if (written === undefined) return [];
    const text = block[written.field];
    // An empty block is kept, not dropped: in the measured session every reasoning block is empty, and a
    // report that said "nothing" of them would confuse what an agent did not write with what the record did not
    // keep. What counts as words is decided above the adapter.
    return typeof text === 'string' ? [{ kind: written.kind, text }] : [];
  });
}

export interface ScannedDelivery {
  /** The call the notification names, as written. */
  readonly callId: string;
  /** The notification's words. Raw content, under the rule that governs a result. */
  readonly text: string;
}

/**
 * The reports delivered on this line (`specs/2026-09-15-where-the-value-went.md` R1): notifications that name a call,
 * on a user line holding no tool result. Whether the call is a delegation is the core's join. A notification naming
 * no call delivers nothing to anything, so it is left out here; the doctor counts it.
 */
export function deliveriesIn(record: JsonObject): ScannedDelivery[] {
  if (record[FIELDS.lineType] !== USER_LINE_TYPE) return [];
  const words = wordsWithoutResult(record);
  if (words === undefined) return [];
  return notificationsIn(words).flatMap(({ callId, text }) => (callId === undefined ? [] : [{ callId, text }]));
}

export function isDelegation(call: ScannedCall): boolean {
  return call.toolName === AGENT_TOOL.name;
}

/**
 * The report a subagent hands back through a call rather than a message (D9). The words only - which delegation
 * they answer is not in the call, and is the join the caller makes from the transcript the call sits on.
 */
export function handbackIn(call: ScannedCall): string | undefined {
  if (call.toolName !== HANDBACK_TOOL.name) return undefined;
  const words = call.input[HANDBACK_TOOL.reportInputKey];
  return typeof words === 'string' ? words : undefined;
}

/** The instruction a delegation carried. Raw content: what the report exists to quote, once M3 can redact it. */
export function delegationTextIn(call: ScannedCall): { readonly prompt?: string; readonly description?: string } {
  const prompt = call.input[AGENT_TOOL.promptInputKey];
  const description = call.input[AGENT_TOOL.descriptionInputKey];

  return {
    ...(typeof prompt === 'string' ? { prompt } : {}),
    ...(typeof description === 'string' ? { description } : {}),
  };
}

export function resultsIn(record: JsonObject): ScannedResults {
  const payload = record[FIELDS.toolUseResult];
  const denialValue = record[FIELDS.denialKind];
  const denial =
    typeof denialValue === 'string'
      ? { kind: denialValue, recognised: isKnownDenialKind(denialValue) }
      : undefined;

  const blocks = contentBlocks(record).filter((block) => block[FIELDS.blockType] === TOOL_RESULT_BLOCK_TYPE);
  // The marker sits on the record, not on a block, so it names a call only while the record holds exactly one.
  const attributable = blocks.length === 1;
  // The payload sits on the record as well, so a launch notice is attributed on the same terms as a denial.
  const launched = isJsonObject(payload) && payload[LAUNCH_NOTICE.statusField] === LAUNCH_NOTICE.launchedStatus;

  const results = blocks.flatMap((block) => {
    const callId = block[FIELDS.resultCallId];
    if (typeof callId !== 'string') return [];

    const content = textOf(block[FIELDS.blockContent]) ?? textOf(payload);
    // A refusal the tool says in words sits on its own block, so it names its call however many the record holds.
    const refusedByRule = block[FIELDS.resultIsError] === true && content?.includes(RULE_REFUSED_READ) === true;
    return [
      {
        callId,
        ...(content === undefined ? {} : { content }),
        ...(denial !== undefined && attributable
          ? { denial }
          : refusedByRule
            ? { denial: { kind: RULE_REFUSED_READ_KIND, recognised: true } }
            : {}),
        ...(launched && attributable ? { launchNotice: true } : {}),
        spilledFiles: spilledFilesIn(block[FIELDS.blockContent], payload),
      },
    ];
  });

  return { results, denialUnattributed: denial !== undefined && !attributable };
}

/**
 * A result may be a string or a structure; either way the model holds what was written, never a summary. A list of
 * text blocks is read as its words (`specs/2026-09-15-what-came-back.md` R1b): all 15 delegating results of the measured session
 * take that form, and held encoded, a line break inside one was an escape - a report was then never found in its own
 * result, and its length was the length of the encoding. Any other structure is kept encoded, as before.
 */
function textOf(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0 && value.every(isTextBlock)) {
    return value.map((block) => block[FIELDS.blockText]).join('\n');
  }
  return JSON.stringify(value);
}

function isTextBlock(value: unknown): value is JsonObject & { readonly text: string } {
  return isJsonObject(value) && value[FIELDS.blockType] === TEXT_BLOCK_TYPE && typeof value[FIELDS.blockText] === 'string';
}

function spilledFilesIn(...positions: readonly unknown[]): string[] {
  return positions.flatMap((position) => {
    const text = textOf(position);
    return text === undefined ? [] : toolResultReferences(text);
  });
}
