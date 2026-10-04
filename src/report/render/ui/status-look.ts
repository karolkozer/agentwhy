// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { MODE_SVG } from './mode-icon.ts';

/**
 * What a page says an AI did with private files, as one of nine looks (`for-people-who-build-with-ai.md` F16, P2).
 * `read` and the three after `allowed` are the design's; `fixed` is a read whose every file the person marked done (F16,
 * changed 2026-09-25); `allowed` is a read of only files the person chose Track for, none of which holds a key (F57a):
 * it read them, the person is told so first, and there is nothing to fix; the last three are what the model holds and the
 * design does not draw yet.
 */
export type Look = 'read' | 'fixed' | 'allowed' | 'name' | 'stopped' | 'none' | 'unchecked' | 'failed' | 'outside';

export type Tone = 'coral' | 'amber' | 'mint' | 'sand' | 'blue' | 'grey';

export interface LookStyle {
  /** The glyph inside the circle. A glyph, never an emoji (guidelines §9.3). */
  readonly glyph: string;
  /** The word key of its label. */
  readonly label: string;
  readonly tone: Tone;
  /** Whether a row in this look asks for a fix - "Fix it →": only a read, nothing else (guidelines §4). */
  readonly needsFix: boolean;
  /**
   * Whether a row in this look is put before the person - "Needs your attention", in coral, with the status bar: a read
   * still to fix, and a read of files they let the AI read (the maintainer, 2026-09-25), which asks for nothing and so
   * leads to its report, not to a fix.
   */
  readonly attention: boolean;
  /**
   * Whether the look says what the AI did at all. The last three do not: the run did not read the conversation, or
   * read a record with gaps, so it is neither something to fix nor "nothing private" - it is not known (F17, O4).
   */
  readonly known: boolean;
}

/**
 * One meaning, one look, read by every place a look is shown - a table row, a day tile, a guide card - so the same
 * fact is never drawn in two colours (`.ai/plans/2026-09-23-conversations-redesign.md`, rule 5).
 */
export const LOOKS: Readonly<Record<Look, LookStyle>> = {
  read: { glyph: '◉', label: 'look.read', tone: 'coral', needsFix: true, attention: true, known: true },
  // The glyph says what the AI did, which a mark does not undo; the colour says it is done (guidelines §2).
  fixed: { glyph: '◉', label: 'look.fixed', tone: 'mint', needsFix: false, attention: false, known: true },
  // It read them, as the person chose: Track's colour and a tick, not a read's coral ◉, since there is nothing to fix
  // (the maintainer, 2026-09-25; violet and ◉ the same morning).
  allowed: { glyph: '✓', label: 'look.allowed', tone: 'sand', needsFix: false, attention: true, known: true },
  // Blue, not amber (the maintainer, 2026-09-25): a name seen is harmless, and amber sat too near Track's sand. The eye,
  // not ○ (the maintainer, 2026-09-30): it saw the name, drawn with Settings' eye (`mode-icon.ts`).
  name: { glyph: MODE_SVG.tell, label: 'look.name', tone: 'blue', needsFix: false, attention: false, known: true },
  stopped: { glyph: '⊘', label: 'look.stopped', tone: 'mint', needsFix: false, attention: false, known: true },
  none: { glyph: '✓', label: 'look.none', tone: 'grey', needsFix: false, attention: false, known: true },
  unchecked: { glyph: '?', label: 'look.unchecked', tone: 'grey', needsFix: false, attention: false, known: false },
  failed: { glyph: '!', label: 'look.failed', tone: 'grey', needsFix: false, attention: false, known: false },
  outside: { glyph: '…', label: 'look.outside', tone: 'grey', needsFix: false, attention: false, known: false },
};
