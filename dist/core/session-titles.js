/**
 * How many transcripts are read for a title at once. Each read holds up to a megabyte of a transcript, and a
 * descriptor for it, until it answers; a project with hundreds of sessions asked for all of them at once would
 * hold all of that at the same moment, for a list that is one line per session.
 */
const TITLES_AT_ONCE = 8;
/**
 * What every session is recognised by, in the order given, read a few at a time. A row whose title could not be read
 * is a row a person reads one line slower, never a list that failed: `recognise` answers nothing only for the failures
 * the file system port translates, and a descriptor limit reached while reading a long list, or a read that fails part
 * way, would otherwise unwind the whole list. Found by a review: `start` read titles this way and `sessions` asked for
 * every one at once, with nothing caught.
 */
export async function recogniseAll(titles, sessions) {
    const recognised = [];
    for (let from = 0; from < sessions.length; from += TITLES_AT_ONCE) {
        const batch = sessions.slice(from, from + TITLES_AT_ONCE);
        recognised.push(...(await Promise.all(batch.map((session) => titles.recognise(session).catch(() => ({}))))));
    }
    return recognised;
}
