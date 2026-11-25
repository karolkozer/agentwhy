// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { MODE_SVG } from './mode-icon.js';
/** An arc three quarters round, still: a reading under way, where a glyph would say a fact (PR3). */
const CHECKING_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 2.5a5.5 5.5 0 1 1-5.5 5.5"/></svg>';
/**
 * One meaning, one look, read by every place a look is shown - a table row, a day tile, a guide card - so the same
 * fact is never drawn in two colours (`.ai/plans/2026-09-23-conversations-redesign.md`, rule 5).
 */
export const LOOKS = {
    read: { glyph: '◉', label: 'look.read', tone: 'coral', needsFix: true, attention: true, known: true },
    // The AI-changed-its-own-guard plan step 4: protection taken away is coral as a read is - something to see to - and its own glyph.
    guard: { glyph: '!', label: 'look.guard', tone: 'coral', needsFix: true, attention: true, known: true },
    // The glyph says what the AI did, which a mark does not undo; the colour says it is done (guidelines §2).
    fixed: { glyph: '◉', label: 'look.fixed', tone: 'mint', needsFix: false, attention: false, known: true },
    // It read them, as the person chose: Track's colour and a tick, not a read's coral ◉, since there is nothing to fix
    // (the maintainer, 2026-09-25; violet and ◉ the same morning).
    allowed: { glyph: '✓', label: 'look.allowed', tone: 'sand', needsFix: false, attention: true, known: true },
    /*
     * Decided by the maintainer 2026-10-07: a program opened the file and printed a fact about it - `wc -l` a count,
     * `stat` a size, a checksum its digest - so neither of the two words before it was true. "Read it" would claim what
     * is inside reached the AI, and "Only saw a name" would claim the file was never opened. Blue, with a name seen,
     * because nothing of the file came back and there is nothing to fix; a half-filled circle beside the read's filled
     * ◉, since half of what a read does happened. A dotted ring (◌) was tried first and read as a smudge at 12px
     * (the maintainer, 2026-10-07).
     */
    opened: { glyph: '◐', label: 'look.opened', tone: 'blue', needsFix: false, attention: false, known: true },
    // Blue, not amber (the maintainer, 2026-09-25): a name seen is harmless, and amber sat too near Track's sand. The eye,
    // not ○ (the maintainer, 2026-09-30): it saw the name, drawn with Settings' eye (`mode-icon.ts`).
    name: { glyph: MODE_SVG.tell, label: 'look.name', tone: 'blue', needsFix: false, attention: false, known: true },
    stopped: { glyph: '⊘', label: 'look.stopped', tone: 'mint', needsFix: false, attention: false, known: true },
    none: { glyph: '✓', label: 'look.none', tone: 'grey', needsFix: false, attention: false, known: true },
    unchecked: { glyph: '?', label: 'look.unchecked', tone: 'grey', needsFix: false, attention: false, known: false },
    failed: { glyph: '!', label: 'look.failed', tone: 'grey', needsFix: false, attention: false, known: false },
    outside: { glyph: '…', label: 'look.outside', tone: 'grey', needsFix: false, attention: false, known: false },
    // `2026-10-14-the-page-first.md` PR3: in range and not read yet - the page came first, and this row takes its look soon.
    checking: { glyph: CHECKING_SVG, label: 'look.checking', tone: 'grey', needsFix: false, attention: false, known: false },
};
