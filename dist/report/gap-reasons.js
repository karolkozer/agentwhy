/**
 * Questions no finding about a file rests on: what the AI was thinking, and the permission settings its runtime recorded.
 * A format that never answers them - Copilot's (`what-copilot-wrote` CP16, CP32) - leaves nothing about a file unknown,
 * so a row gives no reason for them and a page answers as over a whole record; Advanced still says them.
 */
export const NO_FINDING_RESTS_ON = new Set(['reasoning', 'permissions']);
/** A gap of the format's own on a question no finding rests on: nothing of this conversation's, and nothing to tell. */
export function silentTrait(gap) {
    return (gap.kind === 'capability-absent' || gap.kind === 'capability-unmeasured') && gap.question !== undefined && NO_FINDING_RESTS_ON.has(gap.question);
}
/**
 * Whether a gap is a trait of the AI's format rather than something missing from this conversation: a capability record
 * names the source whose format never writes the answer down, or was never measured to, and is true of every
 * conversation that source holds. `capabilityGaps` is their only producer and always names the source; a gap this
 * conversation left - a call whose end its record does not establish, say - names none.
 *
 * Found 2026-10-08: without the distinction a Codex conversation whose every command was established still said "1
 * command ran…", counting the format's own `access` record as if a command of its own were unaccounted for.
 *
 * An `actions` question left `unmeasured` is not a trait (2026-10-10): no profile of a known history mode declares it,
 * and the reader adds it only where this file held an unnamed part, an interrupted turn or a command it could not read
 * (`capability-records.ts`, `#cellCommands`). Since a record whose gaps are its format's alone now says "Nothing private"
 * (F17 as amended that day), it is counted as the conversation's own, as the report page's `nothingUnknown` always did.
 */
function isFormatTrait(gap) {
    if (gap.kind === 'capability-unmeasured' && gap.question === 'actions')
        return false;
    return (gap.kind === 'capability-absent' || gap.kind === 'capability-unmeasured') && gap.source !== undefined;
}
/** The reasons of a record's gaps; `undefined` where it has none. */
export function gapReasons(all) {
    const gaps = all.filter((gap) => !silentTrait(gap));
    if (gaps.length === 0)
        return undefined;
    const ownGaps = gaps.filter((gap) => !isFormatTrait(gap));
    const count = (test) => ownGaps.filter(test).length;
    const reasons = {
        unread: count((gap) => gap.kind === 'capability-absent' && gap.question === 'access'),
        steps: count((gap) => gap.kind === 'capability-unmeasured' && gap.question === 'actions'),
        unsure: count((gap) => gap.kind === 'result-incomplete'),
        noResult: count((gap) => gap.kind === 'result-missing' || gap.kind === 'spilled-result-missing'),
        damaged: count((gap) => gap.kind === 'record-damaged' || gap.kind === 'source-missing' || gap.kind === 'outcome-unrecognised'),
        unlinked: count((gap) => gap.kind === 'relation-unresolved'),
    };
    const own = Object.fromEntries(Object.entries(reasons).filter(([, n]) => n > 0));
    return Object.keys(own).length > 0 ? own : { format: true };
}
