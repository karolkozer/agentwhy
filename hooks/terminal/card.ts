// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Payload } from './answer.js';
import { translator, type Translate } from './words.js';
import { cellsOf, clean, cut, fit, paragraph, type Line } from './cells.js';
import { frame, roomOf } from './pieces.js';
import { accentOf, files, helpers, steps, summary, todo } from './conversation.js';
import { conversations, listAccent, often, okay, partWay, rangeOf, rowsOf, whereOf } from './list.js';

export const INDENT = 2;
/** How wide the card is in a terminal of this many columns: all of it (the maintainer, 2026-11-24). */
export const cardWidth = (columns: number): number => Math.max(24, columns - INDENT - 2);

/** What a person can write next: one sentence, never the one just answered. */
function nextOf({ kind, answer, other }: Payload, t: Translate): ((room: number) => string) | undefined {
  const ask = (key: string) => (): string => t('tc.ask', { q: t('tc.q.' + key) });
  if (other !== undefined) return ask('report');
  if (answer.about === 'conversation') {
    if (kind === 'todo') return ask('report');
    if (answer.steps.n === 0) return ask('okay');
    return answer.todo.length > 0 && kind !== 'summary' ? ask('todo') : kind === 'steps' ? ask('files') : ask('steps');
  }
  if (answer.checked.of === 0) return undefined;
  if (answer.checked.read === 0) return ask('okay');
  if (kind === 'okay') return answer.groups.attention > 0 ? ask('attention') : ask('conversations');
  if (kind === 'often') return ask('report');
  const { rows } = rowsOf(answer, kind);
  const title = clean((rows.find((row) => row.group === 'attention') ?? rows.find((row) => row.title !== undefined))?.title ?? '');
  return title === '' ? ask('okay') : (room) => t('tc.more', { title: cut(title, room - cellsOf(t('tc.more', { title: '' }))) });
}

/** The whole card as lines of cells, none wider than `cardWidth(columns)`: what a test and the terminal are both given. */
export function cardLines(payload: Payload, columns: number): Line[] {
  const t = translator(payload.lang);
  const w = cardWidth(columns);
  const room = roomOf(w);
  const { kind, answer, other } = payload;
  if (answer.about === 'conversation') {
    const draw = { summary, steps, files, helpers, todo }[kind as 'summary'];
    return frame({ accent: accentOf(answer), where: other === undefined ? t('an.where.conversation') : clean(other.title ?? '') || t('an.untitled'), ask: nextOf(payload, t), body: draw(answer, t, room) }, w).map((line) => fit(line, w));
  }
  // CV15: this computer is two lists, each a card of its own with its own count.
  const lists = [answer, ...(answer.beside === undefined ? [] : [answer.beside])];
  return lists.flatMap((list, at): Line[] => {
    const said = list.checked.of === 0 ? paragraph(t('an.empty'), room, undefined, true)
      : list.checked.read === 0 ? [...paragraph(t('an.reading'), room, undefined, true), ...partWay(list, t, room)]
      : kind === 'okay' ? okay(list, t, room) : kind === 'often' ? often(list, t, room) : conversations(list, kind, payload.lang, t, room);
    const ask = at === lists.length - 1 ? nextOf(payload, t) : undefined;
    return frame({ accent: listAccent(list, kind), where: whereOf(list, t), range: rangeOf(list, t), ask, body: said }, w).map((line) => fit(line, w));
  });
}
