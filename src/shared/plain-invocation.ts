import { PACKAGE } from './package-name.ts';

/**
 * What separates two words: a space or a tab, the only characters a shell splits on. Found by a review: `\s` also takes
 * a non-breaking space, a line break and the like, so `npx<NBSP>@agentwhy/cli` read as two words here and ran as one
 * relative path in the shell, and a second line passed for the flags of the first.
 */
export const WORD_BREAK = '[ \\t]+';

/** `npx`, with `--yes` or `-y`, up to the package's name: what the pinned form (`hook-entries.ts`) is read after too. */
export const NPX_BEFORE_NAME = `npx(?:${WORD_BREAK}(?:--yes|-y))?${WORD_BREAK}`;

/** A version after `@`, as plain words allow one: `0.3.0`, `0.3.0-beta.1`, `latest`. */
export const VERSION = '[\\w.+-]+';

/**
 * One segment of an absolute path: no space, quote, variable, `~` or anything else a shell reads as more, and not `.`
 * or `..`, which lead back up to where a path is not what it says.
 */
const SEGMENT = '(?!\\.\\.?(?![\\w@%+=:,.-]))[\\w@%+=:,.-]+';

/**
 * Where an absolute path may start: anywhere but `/proc` and `/dev`. Found by a review: `/proc/self/cwd/…` is absolute
 * and is the working directory - on Linux, the project a hook runs in - and `/dev/fd/…` is a file already open.
 */
const ROOTED = '(?!/(?:proc|dev)/)';

/**
 * agentwhy named in plain words (`a-hook-runs-what-you-ran.md` J4, `the-agent-tells-you.md` R18), as a pattern's source
 * with no anchors: `agentwhy` or an absolute path to its bin; `npx`, with `--yes` or `-y`, before the published name or
 * the unscoped `agentwhy`, either with a version; or `node` before an absolute path to agentwhy's own entry - its bin,
 * or `dist/cli.js` or `src/cli.ts` under a folder with agentwhy in its name.
 *
 * Found by a review: any word that merely held agentwhy was taken, so a cloned project's settings could have
 * `npx @someone/agentwhy`, `npx agentwhy-helper` or `node --require=./x/agentwhy.js` repeated into the person's own
 * hooks and handed to the agent. A name is now one agentwhy publishes, and a path is absolute - a relative one runs a
 * file of the project the settings came from, and `~` a guessable one. A second review: after `node`, any absolute
 * path with agentwhy in it passed, `/tmp/agentwhy-x.js` too, and an agent can write that file itself. A shape only
 * narrows this - a folder laid out like the package passes - it does not prove the file is agentwhy's.
 */
export const PLAIN_INVOCATION_SOURCE = [
  `(?:${ROOTED}(?:/${SEGMENT})*/)?agentwhy`,
  `${NPX_BEFORE_NAME}(?:${PACKAGE}|agentwhy)(?:@${VERSION})?`,
  `node${WORD_BREAK}${ROOTED}(?:/${SEGMENT})*/(?:[\\w@%+=:,.-]*agentwhy[\\w@%+=:,.-]*(?:/${SEGMENT})*/(?:dist/cli\\.js|src/cli\\.ts)|agentwhy)`,
].join('|');

const PLAIN_INVOCATION = new RegExp(`^(?:${PLAIN_INVOCATION_SOURCE})$`);

/** Whether a command's invocation, the words before its subcommand, runs agentwhy in plain words and nothing else. */
export function isPlainInvocation(invocation: string): boolean {
  return PLAIN_INVOCATION.test(invocation);
}
