/**
 * The directory a session ran in, and the thing every displayed path is shown relative to
 * (`specs/2026-09-14-path-display-and-share.md` §7). It is **read** from the records, never inferred from where the
 * transcript is stored or from where this tool happens to be running: a report of a copied session must
 * describe the session, not the machine reading it.
 */
export type ProjectRoot =
  | { readonly kind: 'known'; readonly path: string }
  /** No record carried one, so there is no root. Paths stay as they were written, and the report says why. */
  | { readonly kind: 'absent' }
  /** Several were carried. No single root describes the session, and picking one would be the guess R12 forbids. */
  | { readonly kind: 'ambiguous'; readonly count: number };

/**
 * One recorded directory is the root. None and several are both "no root" - but they are different answers to
 * the reader, so they stay different here rather than collapsing into `undefined`.
 */
export function projectRootOf(directories: readonly string[]): ProjectRoot {
  const distinct = [...new Set(directories)];
  const [only] = distinct;

  if (distinct.length === 1 && only !== undefined) return { kind: 'known', path: only };
  return distinct.length === 0 ? { kind: 'absent' } : { kind: 'ambiguous', count: distinct.length };
}

/** How the root itself is shown once paths are relative to it. An empty string would render as no path at all. */
export const PROJECT_ROOT_ITSELF = '.';

/** What a path outside the project becomes in a shared report: the signal kept, the location dropped (R3). */
export const OUTSIDE_THE_PROJECT = 'outside the project';

/** Either separator: a transcript recorded on Windows carries the other one, and its paths are paths too. */
const SEPARATOR = /[\\/]/;

/** The characters a path is made of. What sits next to a match decides whether the match is a path at all. */
const PATH_CHARACTER = String.raw`[\w.~@+\-\\/]`;

/**
 * Absolute means "says where it starts": at the root, at a home directory, or at a drive. Anything else was
 * recorded **relative to the working directory**, which is to say inside the project - that is what makes
 * `apps/web/.env` from a shell command a path inside the project and not one above it.
 */
function isAbsolute(value: string): boolean {
  return value.startsWith('/') || value.startsWith('~') || /^[A-Za-z]:[\\/]/.test(value);
}

/** The root without its trailing separator, whichever kind it was written with. */
function baseOf(root: { readonly path: string }): string {
  return SEPARATOR.test(root.path.slice(-1)) ? root.path.slice(0, -1) : root.path;
}

/**
 * Whether a path walks back up through a `..` segment. Comparing prefixes cannot see one: `<root>/../../.ssh/x`
 * starts with the root and is above it, and `../../.ssh/x` is relative and is above it too. Both were shown in a
 * shared report until this was written.
 *
 * A segment, never a substring: `..config` and `a..b` are names, not a climb.
 */
function climbs(value: string): boolean {
  return value.split(SEPARATOR).includes('..');
}

function escapeForPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * How a path is shown: relative to the project root where it lies under one, and exactly as written where it
 * does not (`specs/2026-09-14-path-display-and-share.md` R1-R3).
 *
 * Two things this buys beyond brevity. A reader of a monorepo sees `apps/web/.env` and `packages/widget/.env`
 * as two files rather than two identical labels. And the part that names the account, the machine and the
 * employer is not the finding, so it stops being repeated on every line of the report.
 */
export function displayPath(value: string, root: ProjectRoot): string {
  if (root.kind !== 'known') return value;

  const base = baseOf(root);
  if (value === base || (value.length === base.length + 1 && value.startsWith(base))) return PROJECT_ROOT_ITSELF;
  if (!value.startsWith(base) || !SEPARATOR.test(value.charAt(base.length))) return value;
  return value.slice(base.length + 1);
}

/**
 * Whether a path can be said to lie inside the project - the question the shared view asks before it decides
 * to drop a location.
 *
 * **Corrected 2026-09-14 after a review.** This used to be "the display path is unchanged, so it is outside",
 * and that is false for every path a transcript records relative to the working directory: a `grep` line or a
 * shell argument carries `apps/web/.env`, which no root prefix matches, so the shared view replaced the common
 * case with a category and merged unrelated files into one node.
 */
export function insideProject(value: string, root: ProjectRoot): boolean {
  // A path that climbs names something the root does not contain, whichever end it starts from. It is the one
  // case where "recorded relative to the working directory" does not mean "inside the project".
  if (climbs(value)) return false;
  if (!isAbsolute(value)) return true;
  if (root.kind !== 'known') return false;
  return displayPath(value, root) !== value;
}

/**
 * The same transformation for a path that sits **inside** free text - a delegation description, a label. Without
 * it the absolute form would simply move out of a path field and into a sentence, which is the failure L010
 * names: a rule applied to one position rather than to the thing itself.
 *
 * The root is replaced only where it **is** the start of a path. `/a/proj` sits inside `/backup/a/proj/x` as
 * text and names nothing there; replacing it produced `/backupx`, a file that exists nowhere. It is also
 * replaced when it stands alone, and to the same `.` that a path field would show - one directory cannot be
 * inside the project in one place and above it in another.
 */
export function displayPathsIn(text: string, root: ProjectRoot): string {
  if (root.kind !== 'known') return text;

  const base = escapeForPattern(baseOf(root));
  const pattern = new RegExp(`(?<!${PATH_CHARACTER})${base}(?:[\\\\/]|(?!${PATH_CHARACTER}))`, 'g');

  return text.replace(pattern, (match) => (SEPARATOR.test(match.slice(-1)) ? '' : PROJECT_ROOT_ITSELF));
}

/**
 * An absolute path, conservatively: something that says where it starts - the root, a home directory or a
 * drive - and has at least two segments. Used **only** in the shared view, and only on free text.
 *
 * The leading boundary is load-bearing. Without it the rule matched inside a path that had **already** been made
 * relative - `apps/web/.env` contains `/web/.env` - and a correct display path was destroyed by the step meant
 * to protect it.
 *
 * This is pattern-matching prose, which this project distrusts on principle - so it is pointed in the safe
 * direction. Over-matching costs a reader some detail in a report they chose to share; under-matching puts an
 * account name on a slide. A URL is over-matched on purpose rather than carved out with a second rule.
 */
const ABSOLUTE_PATH =
  /(?<![\w.~@+-])(?:[A-Za-z]:[\\/]|~|\/)[^\s"'`,;:()<>|{}[\]]*[\\/][^\s"'`,;:()<>|{}[\]]+/g;

/** Free text as a shared report may carry it: nothing above the project root survives, in any position. */
export function withoutAbsolutePaths(text: string): string {
  return text.replace(ABSOLUTE_PATH, OUTSIDE_THE_PROJECT);
}

/** What a machine-issued identifier becomes in a shared report. */
export const IDENTIFIER_NOT_SHOWN = 'id not shown';

/**
 * A UUID: how a session, a message or a request is named on the machine that recorded it. Used only in the
 * shared view, on text that is shown - the same place and the same safe direction as `ABSOLUTE_PATH`.
 */
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/**
 * Text as a shared report may carry it: no absolute path and no machine-issued identifier, in any position.
 *
 * **Added 2026-09-14 after running `start --share` on a real project.** Identifiers were already replaced where the
 * report emits them, and that was not enough: a session's own transcript can quote another session's records, and
 * a quoted `uuid` travels inside whatever text carried it.
 */
export function forSharing(text: string): string {
  return withoutAbsolutePaths(text).replace(UUID, IDENTIFIER_NOT_SHOWN);
}
