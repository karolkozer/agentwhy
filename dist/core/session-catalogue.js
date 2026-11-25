/**
 * Whether no AI's store of conversations was there at all, where this listing looked: then "not used here yet" is not
 * the likely reason, and running somewhere conversations are not saved is (R28, amended 2026-10-01).
 */
export function noStoreAnywhere(listing) {
    return listing.searched.length > 0 && listing.searched.every((place) => place.store === 'missing');
}
/**
 * What names a session wherever two AIs' sessions meet - a row, a file, a cached report, `report --input`: its id where
 * Claude Code wrote it, as it always was, and the id after its AI's name otherwise, so equal ids never overwrite each
 * other (`.ai/plans/2026-09-29-what-codex-wrote.md` step 5). A Claude Code id is a UUID and never starts with an AI's name.
 * Where two projects' sessions meet, a key the listing gave is that (`SessionSummary.key`).
 */
export function sessionKey(session) {
    if (session.key !== undefined)
        return session.key;
    return session.provider === 'claude-code' ? session.id : `${session.provider}-${session.id}`;
}
/** Every AI whose name `sessionKey` puts before an id: a record, so that an AI added to `Provider` must be named here. */
const NAMED_IN_KEY = { codex: true, copilot: true };
/**
 * The id a key was made from. A short form is cut from it, not from the key: the key of every Codex session starts with
 * the same `codex-`, and so, for minutes at a time, does a UUIDv7 - its first characters are a timestamp. Anything that
 * is no key, like a `--share` position, is returned as it is.
 */
export function idInKey(key) {
    const named = Object.keys(NAMED_IN_KEY).find((provider) => key.startsWith(`${provider}-`));
    return named === undefined ? key : key.slice(named.length + 1);
}
