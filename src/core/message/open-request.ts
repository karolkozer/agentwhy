// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { PastedLines } from './keys-to-tell.ts';

/** What a person who wrote the phrase asked for: agentwhy's page, or this conversation's report on it. */
export type OpenRequest = 'page' | 'report';

/** Longer than any phrase on the list: past it, nothing is matched at all. */
const LONGEST = 80;

/** The marks a person copies with a phrase that stood in quotes or as code, whichever two they end up with: one before, one after. */
const OPENS = '"\'`“”„‘‚«»';
const CLOSES = '"\'`”“‘’»«';

const NAME = '[$/]?agent ?why';

/**
 * RO1's closed list, one expression per language, anchored to the whole message. The group `report` stands for the
 * conversation's report; every other way of saying it asks for the page. Text reaching these is lower case.
 */
const PHRASES: readonly RegExp[] = [
  new RegExp(`^(?:(?:open|show|start|run|launch)(?: me)?(?: the)? )?${NAME}(?:(?:'s)? (?:(?<report>report)|page|dashboard))?(?: please)?$`),
  new RegExp(`^(?:otwórz|otworz|pokaż|pokaz|uruchom|włącz|wlacz)(?: mi)? (?:(?:(?<before>raport)|stronę|strone|dashboard|panel) )?${NAME}(?: (?:(?<report>raport)|stronę|strone|dashboard|panel))?(?: (?:proszę|prosze))?$`),
  new RegExp(`^(?:öffne|oeffne|zeig|zeige|starte)(?: mir)? (?:den |die |das )?(?:(?:(?<before>bericht)|seite|dashboard) von )?${NAME}(?: (?:(?<report>bericht)|seite|dashboard))?(?: bitte)?$`),
];

/**
 * Whether a message, whole, asks to open agentwhy (`2026-11-24-open-agentwhy-from-the-chat.md` RO1): one of a closed list
 * of phrases, in any of the three languages. A mention of agentwhy inside a longer message is work on it or a question
 * about it, and goes to the AI untouched (ROD2); so does anything the app says was pasted.
 */
export function openRequest(text: string, pastes: readonly PastedLines[]): OpenRequest | undefined {
  if (pastes.length > 0 || text.length > LONGEST * 2) return undefined;
  const said = plain(text);
  if (said.length > LONGEST || said.includes('\n')) return undefined;
  for (const phrase of PHRASES) {
    const found = phrase.exec(said);
    if (found !== null) return found.groups?.['report'] !== undefined || found.groups?.['before'] !== undefined ? 'report' : 'page';
  }
  return undefined;
}

/** The message as the list is written: composed, lower case, one space, with no quotes around it and no closing mark. */
function plain(text: string): string {
  const unquoted = withoutQuotes(withoutEnd(text.normalize('NFC').trim()));
  return withoutEnd(unquoted).replaceAll('’', "'").replace(/[^\S\n]+/g, ' ').trim().toLowerCase();
}

const withoutEnd = (text: string): string => text.replace(/[.!?]$/, '').trimEnd();

function withoutQuotes(text: string): string {
  const quoted = text.length > 1 && OPENS.includes(text.charAt(0)) && CLOSES.includes(text.charAt(text.length - 1));
  return quoted ? text.slice(1, -1).trim() : text;
}
