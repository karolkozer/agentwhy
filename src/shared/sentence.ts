// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The first sentence of a piece of writing, capped (`specs/2026-09-15-why-this-call.md` §5.1, level B). Measured on one
 * session: 311 of 315 first sentences run under 200 characters, so the cap is rarely reached - and when
 * it is, the cut is reported rather than hidden, because a truncation read as a whole thought is a lie about the
 * record.
 */
export const SENTENCE_CAP = 200;

const ENDS = /[.!?](\s|$)/;

export function firstSentence(text: string, cap: number = SENTENCE_CAP): { readonly text: string; readonly cut: boolean } {
  const written = text.trim().replace(/\s+/g, ' ');
  const line = written.split('\n')[0] ?? written;
  const end = ENDS.exec(line);
  const sentence = end === null ? line : line.slice(0, end.index + 1);

  if (sentence.length <= cap) return { text: sentence, cut: sentence.length < written.length && end === null };
  // Cut at a word, not inside one: a half word reads as a typo rather than as a cut.
  const room = sentence.slice(0, cap);
  const space = room.lastIndexOf(' ');
  return { text: (space > cap / 2 ? room.slice(0, space) : room).trimEnd(), cut: true };
}
