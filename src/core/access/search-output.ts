import { listingPathCandidates } from './listing.ts';

/**
 * The lines of a search's result that are lines of a file (`.ai/specs/2026-09-25-search-hits-are-reads.md` H1, H2). A
 * search prints `path:number:text`, or `path:text` without `-n`; with `-A`/`-B`/`-C` the lines around a hit are
 * `path-number-text`. Each such line is the text of `path` and of no other file, which is what lets a report credit it
 * to that file alone, where a `cat` of two files cannot be told apart.
 *
 * Which field is a path stays `listing.ts`'s (H4): a hit line's path is the field before its first colon, by position.
 * A context line is taken only where the same result has a hit for the same path, so a name holding a dash is never cut
 * into a path and a line number. A line with no path - `grep -h`, a single file searched - is not taken here (H3 is the
 * caller's, which knows how many files the call named).
 */
export interface HitLine {
  readonly path: string;
  readonly kind: 'hit' | 'context';
  /** The file's text on that line. **Raw content**: for the redactor, and nothing else. */
  readonly text: string;
}

const LINE_NUMBER = /^\d+[:-]/;
const CONTEXT_LINE = /^(.+)-(\d+)-(.*)$/;

export function hitLines(output: string, withContext: boolean): readonly HitLine[] {
  const lines = output.split('\n');
  const found: HitLine[] = [];
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const path = line.slice(0, colon);
    // The same rule a listing uses for the field before a hit's first colon: a path because of where it sits.
    if (!listingPathCandidates(line).some(([first]) => first?.positional === true && first.text === path)) continue;
    found.push({ path, kind: 'hit', text: line.slice(colon + 1).replace(LINE_NUMBER, '') });
  }
  if (!withContext || found.length === 0) return found;

  // A context line with a colon in its text - `.env-3-URL=https://…` - reads as a hit on a path no file has: where its
  // "path" is another hit path's line number, it is that file's context line, and is taken below as one.
  const around = (path: string): boolean => found.some((other) => other.path !== path && path.startsWith(other.path + '-') && /^\d+-/.test(path.slice(other.path.length + 1)));
  const hits = found.filter((hit) => !around(hit.path));

  const hitPaths = new Set(hits.map((hit) => hit.path));
  const context = lines.flatMap((line): HitLine[] => {
    const match = CONTEXT_LINE.exec(line);
    // The longest prefix that is a hit path: `my-file-2-x` is `my-file`'s line 2 where `my-file` had a hit.
    if (match === null || line.indexOf(':') !== -1 && hitPaths.has(line.slice(0, line.indexOf(':')))) return [];
    const path = [...hitPaths].filter((candidate) => line.startsWith(candidate + '-') && /^\d+-/.test(line.slice(candidate.length + 1)))
      .sort((one, other) => other.length - one.length)[0];
    return path === undefined ? [] : [{ path, kind: 'context', text: line.slice(path.length + 1).replace(/^\d+-/, '') }];
  });
  return [...hits, ...context];
}
