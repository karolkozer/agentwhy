/**
 * The paths a listing could be naming.
 *
 * A listing has structure too. `grep` writes `path:line:matched text`, `find` and `ls -1` write one path per
 * line, `ls -l` writes the name last after a permission string. So a path counts by **where it sits**, not by
 * being somewhere in the line.
 *
 * The difference is not cosmetic: a matched line is arbitrary file content, and taking every word of it made a
 * document that mentions a file read as a file that was reached. **Measured across seven sessions
 * (2026-09-15):** of 125 findings that came from a result, 71 had the path inside a line of prose - a table, a
 * numbered list, an arrow in someone's notes - against 52 where the line was the path and 2 search hits. Taking
 * the last field of any line, and the whole of any line, is where those 71 came from, and both are gone.
 *
 * **And a line taken whole is a path only when the whole of it is one**
 * (`specs/2026-09-15-paths-not-fragments.md` R2, added 2026-09-15). Position says where a path would sit; it does not
 * say that a program wrote one there. `…/id_rsa -> outside the project` and `…/id_rsa in a result · succeeded · 2×`
 * sit where a path sits and are sentences about a file; `[apps/web/.env,` is one line of a printed array. Measured
 * on nine sessions: six such findings, and no line with words before its path, which is why a field keeps its words.
 */
import { holdsCodePunctuation, shapedLikePath } from './path-shape.ts';

export interface ListingCandidate {
  readonly text: string;
  /**
   * True when position alone says this is a path - the field before the first colon of a search hit. Such a
   * candidate may hold a space: `…/Web Portal/apps/web/.env` is a real path, and rejecting it left the tool
   * reporting the fragment after the space instead.
   */
  readonly positional: boolean;
}

/** Where a path written out in full starts: the root, the home directory, or the directory the command ran in. */
const PATH_START = /^(?:\/|~\/|\.\.?\/)/;

/** How `ls -l` opens a line, and nothing else does: a file type and nine permission characters. */
const LONG_LISTING = /^[-dlbcps][rwxSsTt-]{9}[ @+]/;

/** A field of a line is where a path sits; punctuation of code in it says a program printed an expression (R2). */
const asField = (text: string): string => (text !== '' && !holdsCodePunctuation(text) ? text : '');

/** A line taken whole, and a line of one word, name a file only when the whole of the line is a path (R2). */
const asWholeLine = (text: string): string => (shapedLikePath(text) ? text : '');

export function listingPathCandidates(text: string): ListingCandidate[][] {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === '') return [];

      // `grep -n` without a file name writes `49:matched text`, and that leading number is not part of a path.
      // Dropping it is what stops `49:packages/app/.env` from being reported as a file.
      const withoutLineNumber = trimmed.replace(/^\d+:/, '');
      const colon = withoutLineNumber.indexOf(':');
      const fields = withoutLineNumber.split(/\s+/);
      // In order of preference. A whole grep line matches a pattern as readily as the path that starts it, so
      // the narrower candidate is offered first and only the first match of a line is taken: one line of a
      // listing names one file.
      const candidates: ListingCandidate[] = [
        { text: asField(colon === -1 ? '' : withoutLineNumber.slice(0, colon)), positional: true },
        // `find` prints whole paths, one per line. A line with no search hit's colon that starts where a path starts
        // is that path because of where it sits, space in a directory name and all. Offered before the final field,
        // which cut `…/Web Portal/app/.env` into `Portal/app/.env`: a second finding, for a file that exists nowhere.
        { text: colon === -1 && PATH_START.test(withoutLineNumber) ? asWholeLine(withoutLineNumber) : '', positional: true },
        // A line that is one word is that word: `ls -1` and `git status --porcelain` write listings like that.
        { text: fields.length === 1 ? asWholeLine(withoutLineNumber) : '', positional: true },
        // `ls -l` writes the name last, after a permission string that nothing else begins with.
        { text: LONG_LISTING.test(withoutLineNumber) ? asField(fields[fields.length - 1] ?? '') : '', positional: false },
      ];
      return candidates.filter((candidate) => candidate.text !== '');
    })
    .filter((candidates) => candidates.length > 0);
}
