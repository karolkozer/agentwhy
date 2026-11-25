// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Look } from '../render/ui/status-look.ts';
import type { AnswerScope } from './answer-kinds.ts';
import type { AnswerGroup, AnswerRow, ListAnswer } from './answer-model.ts';

const GROUPS: Readonly<Record<AnswerGroup, true>> = { attention: true, fixed: true, tracked: true, stopped: true, seen: true, none: true, partly: true, failed: true };
const LOOKS: Readonly<Record<Look, true>> = {
  read: true, guard: true, fixed: true, allowed: true, opened: true, name: true, stopped: true, none: true, unchecked: true, failed: true, outside: true, checking: true,
};

type Fields = Readonly<Record<string, unknown>>;
const isFields = (value: unknown): value is Fields => value !== null && typeof value === 'object' && !Array.isArray(value);
const isCount = (value: unknown): boolean => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isText = (value: unknown): boolean => typeof value === 'string';
const isMaybe = (value: unknown, is: (one: unknown) => boolean): boolean => value === undefined || is(value);
const counts = (value: unknown, names: readonly string[]): boolean => isFields(value) && names.every((name) => isCount(value[name]));
const isEach = (value: unknown, is: (one: unknown) => boolean): boolean => Array.isArray(value) && value.every(is);

/**
 * Whether what a page server answered is a list as this agentwhy draws one, every field of it (CV17). A server may be a newer
 * agentwhy's (PF7): its answer is taken whole or not at all, never half understood.
 */
export function isListAnswer(value: unknown, scope: AnswerScope): value is ListAnswer {
  return isList(value, scope) && isMaybe((value as Fields)['beside'], (one) => isList(one, scope));
}

function isList(value: unknown, scope: AnswerScope): boolean {
  return isFields(value) && value['about'] === 'list' && value['scope'] === scope && isMaybe(value['list'], (one) => one === 'outside' || one === 'projects') &&
    isText(value['asked']) && counts(value['checked'], ['read', 'of']) && isMaybe(value['reading'], (one) => one === true) && isMaybe(value['newestRead'], isCount) && counts(value['groups'], Object.keys(GROUPS)) &&
    counts(value, ['recent', 'rowsMore', 'oftenMore', 'namedOnly']) && isEach(value['rows'], isRow) && isEach(value['often'], isOften);
}

const isRelative = (value: unknown): boolean => value === 'today' || value === 'yesterday';
const FILES: Readonly<Record<keyof AnswerRow['files'], true>> = { read: true, changed: true, unknown: true, opened: true, stopped: true, name: true };
const HELD: Readonly<Record<NonNullable<AnswerRow['held']>, true>> = { terminal: true, editor: true, desktop: true, script: true };

const isRow = (value: unknown): boolean =>
  isFields(value) && isText(value['key']) && isText(value['ref']) && typeof value['report'] === 'boolean' && isMaybe(value['title'], isText) && isText(value['provider']) &&
  counts(value['day'], ['year', 'month', 'day']) && isMaybe(value['relative'], isRelative) && isText(value['time']) && isMaybe(value['held'], (one) => Object.hasOwn(HELD, String(one))) &&
  Object.hasOwn(LOOKS, String(value['look'])) && Object.hasOwn(GROUPS, String(value['group'])) && isCount(value['read']) &&
  counts(value['files'], Object.keys(FILES)) && isMaybe(value['all'], isCount) && isCount(value['helpers']) && isMaybe(value['project'], isText);

const isOften = (value: unknown): boolean =>
  isFields(value) && isText(value['path']) && isMaybe(value['place'], (one) => one === 'outside' || one === 'elsewhere') &&
  counts(value, ['wanted', 'read', 'changed', 'opened', 'stopped', 'named', 'unknown', 'conversations']) && typeof value['tracked'] === 'boolean' && isMaybe(value['project'], isText);
