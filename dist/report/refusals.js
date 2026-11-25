/** Counted from what refused each attempt. An attempt with no source on record is a rule's: only a rule leaves none. */
export function refusedByOthers(refused) {
    return others(refused.filter((attempt) => attempt.refusedBy === 'reviewer').length, refused.filter((attempt) => attempt.refusedBy === 'person').length, refused.filter((attempt) => attempt.refusedBy === 'check').length);
}
/** The same, over several counts: attempts add up, so their sources do. */
export function sumRefusedByOthers(counts) {
    return others(counts.reduce((sum, count) => sum + (count?.reviewer ?? 0), 0), counts.reduce((sum, count) => sum + (count?.person ?? 0), 0), counts.reduce((sum, count) => sum + (count?.check ?? 0), 0));
}
/** How many of a total a rule refused: what "Your rules held" may count (WS4). */
export function refusedByRule(total, byOthers) {
    return Math.max(0, total - (byOthers?.reviewer ?? 0) - (byOthers?.person ?? 0) - (byOthers?.check ?? 0));
}
function others(reviewer, person, check) {
    if (reviewer === 0 && person === 0 && check === 0)
        return undefined;
    return check === 0 ? { reviewer, person } : { reviewer, person, check };
}
