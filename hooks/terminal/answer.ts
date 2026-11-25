// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The answer the card is drawn from, as `src/report/answers/answer-model.ts` gives it: written out again because a plugin's module
 * holds no part of `dist/`, and held to that file by `tests/hooks/terminal-card.test.ts`. What arrives is checked whole before
 * anything is drawn of it.
 */
export const META = 'agentwhy/answer';

const CONVERSATION_KINDS = ['summary', 'steps', 'files', 'helpers', 'todo'] as const;
const LIST_KINDS = ['okay', 'conversations', 'attention', 'tracked', 'stopped', 'often'] as const;
export const KINDS = [...CONVERSATION_KINDS, ...LIST_KINDS] as const;
export type Kind = (typeof KINDS)[number];
export type Lang = 'en' | 'pl' | 'de';
export type Tone = 'coral' | 'sand' | 'amber' | 'blue' | 'mint' | 'grey';
export const ACCESS = ['read', 'changed', 'unknown', 'opened', 'stopped', 'name'] as const;
export type Access = (typeof ACCESS)[number];
const LOOKS = ['read', 'guard', 'fixed', 'allowed', 'opened', 'name', 'stopped', 'none', 'unchecked', 'failed', 'outside', 'checking'] as const;
export type Look = (typeof LOOKS)[number];
export const GROUPS = ['attention', 'fixed', 'tracked', 'stopped', 'seen', 'none', 'partly', 'failed'] as const;
export type Group = (typeof GROUPS)[number];
export const PROVIDERS = { 'claude-code': 'Claude Code', codex: 'Codex', copilot: 'Copilot' } as const;
export type Provider = keyof typeof PROVIDERS;
const HELD = ['terminal', 'editor', 'desktop', 'script'] as const;
export type Held = (typeof HELD)[number];
export interface PathOf { readonly path: string; readonly place?: 'outside' | 'elsewhere'; }
export interface FileOf extends PathOf { readonly access: Access; }
interface Moment { readonly from: number; readonly to: number; readonly tone: Tone; readonly said: string; readonly files: readonly string[]; readonly met?: readonly FileOf[]; readonly metMore?: number; readonly ran?: readonly string[]; readonly helper?: number; readonly first?: true; }
export interface Helper { readonly helper: number; readonly asked?: string; readonly unrecorded?: true; readonly files: readonly FileOf[]; readonly filesMore: number; }
export interface Conversation {
  readonly about: 'conversation';
  readonly look: Look;
  readonly numbers: Readonly<Record<Access | 'helpers', number>>;
  readonly steps: { readonly n: number; readonly leftOut: number; readonly list: readonly { readonly tone: Tone; readonly label: string; }[]; readonly moments: readonly Moment[]; readonly momentsMore: number; readonly reads: number; readonly ordinary: number; readonly helperSteps: number; readonly notKnown?: readonly string[]; };
  readonly files: readonly FileOf[];
  readonly filesMore: number;
  readonly mine?: readonly FileOf[];
  readonly mineMore?: number;
  readonly helpers: readonly Helper[];
  readonly helpersMore: number;
  readonly todo: readonly (PathOf & { readonly kind: 'keys' | 'data'; })[];
  readonly todoMore: number;
  readonly todoKeys: number;
  readonly all: number;
  readonly notChecked?: readonly string[];
}
export interface Row { readonly title?: string; readonly day: { readonly year: number; readonly month: number; readonly day: number; }; readonly relative?: 'today' | 'yesterday'; readonly time: string; readonly provider: Provider; readonly held?: Held; readonly look: Look; readonly group: Group; readonly files: Readonly<Record<Access, number>>; readonly all?: number; readonly helpers: number; readonly project?: string; }
interface Often extends PathOf { readonly wanted: number; readonly read: number; readonly changed: number; readonly opened: number; readonly stopped: number; readonly named: number; readonly unknown: number; readonly tracked: boolean; readonly conversations: number; readonly project?: string; }
export interface List {
  readonly about: 'list';
  readonly scope: 'project' | 'computer';
  readonly list?: 'outside' | 'projects';
  readonly asked: string;
  readonly checked: { readonly read: number; readonly of: number; };
  readonly reading?: true;
  readonly groups: Readonly<Record<Group, number>>;
  readonly rows: readonly Row[];
  readonly recent: number;
  readonly rowsMore: number;
  readonly often: readonly Often[];
  readonly oftenMore: number;
  readonly namedOnly: number;
  readonly beside?: List;
}
export type Answer = Conversation | List;
export interface Payload {
  readonly kind: Kind;
  readonly lang: Lang;
  readonly answer: Answer;
  /** The answer is about a conversation that is not the one being held: what it is called, where it has a title. */
  readonly other?: { readonly title?: string };
}

type Json = { readonly [key: string]: unknown };
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isText = (value: unknown): value is string => typeof value === 'string' && value.length <= 4000;
const isOneOf = <T extends string>(all: readonly T[], value: unknown): value is T => (all as readonly unknown[]).includes(value);
const isList = (value: unknown, each: (one: unknown) => boolean, most = 2000): boolean => Array.isArray(value) && value.length <= most && value.every(each);
const maybe = (value: unknown, is: (one: unknown) => boolean): boolean => value === undefined || is(value);
const counts = (value: unknown, keys: readonly string[]): boolean => isObject(value) && keys.every((key) => isCount(value[key]));
const isRelative = (value: unknown): boolean => value === 'today' || value === 'yesterday';
const TONES = ['coral', 'sand', 'amber', 'blue', 'mint', 'grey'] as const;
const isPath = (value: unknown): value is Json => isObject(value) && isText(value['path']) && maybe(value['place'], (one) => one === 'outside' || one === 'elsewhere');
const isFile = (value: unknown): boolean => isPath(value) && isOneOf(ACCESS, value['access']);

function isConversation(value: Json): boolean {
  const steps = value['steps'];
  return value['about'] === 'conversation' && isOneOf(LOOKS, value['look']) && counts(value['numbers'], [...ACCESS, 'helpers'])
    && isObject(steps) && counts(steps, ['n', 'leftOut', 'momentsMore', 'reads', 'ordinary', 'helperSteps']) && maybe(steps['notKnown'], (one) => isList(one, isText))
    && isList(steps['list'], (one) => isObject(one) && isOneOf(TONES, one['tone']), 100_000)
    && isList(steps['moments'], (one) => isObject(one) && isCount(one['from']) && isCount(one['to']) && isOneOf(TONES, one['tone']) && isText(one['said']) && maybe(one['helper'], isCount) && maybe(one['met'], (met) => isList(met, isFile)) && maybe(one['metMore'], isCount) && maybe(one['ran'], (ran) => isList(ran, isText)))
    && isList(value['files'], isFile) && isCount(value['filesMore'])
    && maybe(value['mine'], (mine) => isList(mine, isFile)) && maybe(value['mineMore'], isCount)
    && isList(value['helpers'], (one) => isObject(one) && isCount(one['helper']) && maybe(one['asked'], isText) && maybe(one['unrecorded'], (value) => value === true) && isList(one['files'], isFile) && isCount(one['filesMore']))
    && isCount(value['helpersMore'])
    && isList(value['todo'], (one) => isPath(one) && (one['kind'] === 'keys' || one['kind'] === 'data')) && counts(value, ['todoMore', 'todoKeys', 'all'])
    && maybe(value['notChecked'], (one) => isList(one, isText));
}

function isListAnswer(value: Json): boolean {
  return isOneList(value) && maybe(value['beside'], (one) => isObject(one) && isOneList(one));
}

function isOneList(value: Json): boolean {
  return value['about'] === 'list' && (value['scope'] === 'project' || value['scope'] === 'computer')
    && maybe(value['list'], (one) => one === 'outside' || one === 'projects') && isText(value['asked'])
    && counts(value['checked'], ['read', 'of']) && maybe(value['reading'], (one) => one === true) && counts(value['groups'], GROUPS)
    && isList(value['rows'], (one) => isObject(one) && maybe(one['title'], isText) && counts(one['day'], ['year', 'month', 'day'])
      && maybe(one['relative'], isRelative) && isText(one['time']) && Object.hasOwn(PROVIDERS, String(one['provider'])) && maybe(one['held'], (held) => isOneOf(HELD, held)) && isOneOf(LOOKS, one['look']) && isOneOf(GROUPS, one['group']) && counts(one['files'], ACCESS) && maybe(one['all'], isCount) && isCount(one['helpers']) && maybe(one['project'], isText))
    && isCount(value['recent']) && isCount(value['rowsMore'])
    && isList(value['often'], (one) => isPath(one) && counts(one, ['wanted', 'read', 'changed', 'opened', 'stopped', 'named', 'unknown', 'conversations']) && typeof one['tracked'] === 'boolean' && maybe(one['project'], isText))
    && counts(value, ['oftenMore', 'namedOnly']);
}

function asPayload(value: unknown): Payload | undefined {
  if (!isObject(value) || !isOneOf(KINDS, value['about'])) return undefined;
  const ofConversation = isOneOf(CONVERSATION_KINDS, value['about']);
  const answer = value[ofConversation ? 'conversation' : 'list'];
  if (!isObject(answer) || !(ofConversation ? isConversation(answer) : isListAnswer(answer))) return undefined;
  const other = value['other'];
  if (!maybe(other, (one) => isObject(one) && maybe(one['title'], isText))) return undefined;
  return {
    kind: value['about'],
    lang: isOneOf(['en', 'pl', 'de'] as const, value['lang']) ? value['lang'] : 'en',
    answer: answer as unknown as Answer,
    ...(other === undefined ? {} : { other: other as { readonly title?: string } }),
  };
}

/** The answer in a tool's result as the hook is handed it: on a text block's own `_meta`, which the model is not sent. */
export function payloadOf(output: unknown): Payload | undefined {
  if (!Array.isArray(output)) return undefined;
  for (const block of output) {
    const found = isObject(block) && isObject(block['_meta']) ? asPayload(block['_meta'][META]) : undefined;
    if (found !== undefined) return found;
  }
  return undefined;
}
