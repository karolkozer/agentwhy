/**
 * A private file by the strongest thing that happened to it, as the page's own rows rank it: what is not known and what was stopped
 * before what was written. A list counts by it and a conversation's card too (TK4).
 */
export const accessOfCount = (count) => count.read > 0 ? 'read' : count.unknown > 0 ? 'unknown' : count.opened > 0 ? 'opened' : count.stopped > 0 ? 'stopped' : count.changed > 0 ? 'changed' : 'name';
/** The page's own answer, but for a file an AI wrote and nothing more: its row has no word for that and says the name was seen. */
export const accessOfRow = (row, counts) => row.access === 'name' && (counts.get(row.path)?.changed ?? 0) > 0 ? 'changed' : row.access;
