/**
 * The signals of specification §6.2, read out of the text a delegation carried.
 *
 * §6.2 gives each signal a meaning and one example; how one is recognised is
 * `specs/2026-09-16-what-a-signal-looks-like.md`, written on counts taken from 15 real delegations rather than from
 * intuition - which is how this project has three times written a rule over free text and paid for it (L009, L011).
 *
 * Two results of that measurement shape this module:
 *
 * - **Words are read outside paths** (R3). A prompt naming `apps/web/.env` was counted as being about configuration
 *   because the word `env` sits inside the path. The text a path covers is removed before a word rule runs.
 * - **`S4` is an identifier, not a word** (R6). A word list for configuration fired on 12 of 15 delegations - four
 *   fifths of ordinary work - while `NEXT_PUBLIC_SITE_URL` and its like fired on 3. The word list is not here.
 *
 * Nothing in this module decides anything: a signal fires, and what a delegation led to is a label a person and the
 * actions agree on, joined to these only by the scoring of the D1 plan (R8).
 */
import { pathTokens } from '../access/path-tokens.ts';
import { protects, type Policy } from '../policy/policy.ts';

export type Signal = 'S1' | 'S2' | 'S3' | 'S4';
export type Caveat = 'C1' | 'C2';

export interface PromptReading {
  /** In the order of §6.2, each at most once. */
  readonly signals: readonly Signal[];
  readonly caveats: readonly Caveat[];
}

/** R4: asks for a value or for contents. The list is the one that was counted; it was not tuned afterwards. */
const ASKS_FOR_A_VALUE = /\b(?:value|values|content|contents|what is set|what value|print|show)\b/i;

/** R5: asks for a comparison of two things. */
const ASKS_FOR_A_COMPARISON = /\b(?:match|matches|matching|compare|compared|comparison|same as|identical|differs?|different|equal)\b/i;

/** R6: a name that points at configuration while naming no file - §6.2's own example of `S4`. */
const CONFIGURATION_IDENTIFIER = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/;

/** R7: `C1` covers disclosure - do not quote the value - and `C2` covers reading the file at all. */
const NOT_TO_QUOTE = /\b(?:do not quote|don't quote|without quoting|do not print|don't print|never quote|do not paste|don't paste)\b/i;
const NOT_TO_READ = /\b(?:do not read|don't read|without reading|do not open|don't open|only confirm|confirm only|presence of)\b/i;

/**
 * A glob asks about a family of paths. `.env*` is a pattern for a protected path; `x*` is a pattern for nothing.
 * Two expressions, because one carrying `g` would keep its place between calls and answer every second question
 * wrongly.
 */
const HOLDS_A_GLOB = /[*?]/;
const EVERY_GLOB = /[*?]/g;

function namesAProtectedPath(tokens: readonly string[], policy: Policy): boolean {
  return tokens.some(
    (token) => protects(policy, token) || (HOLDS_A_GLOB.test(token) && protects(policy, token.replace(EVERY_GLOB, 'x'))),
  );
}

/**
 * The text with the paths blanked out, so that a word rule cannot read a word that is part of one (R3). Blanked
 * rather than deleted, so two words either side of a path do not become one.
 *
 * Only the tokens that look like a path go: `pathTokens` splits text at every separator and returns **every** word,
 * because the policy is what decides which of them is a path. Blanking all of them would leave no text for a word
 * rule to read - which is what the first version did, and what its tests caught.
 */
function looksLikeAPath(token: string): boolean {
  return token.includes('/') || token.startsWith('.') || token.startsWith('~');
}

function outsidePaths(text: string, tokens: readonly string[]): string {
  let left = text;
  for (const token of tokens.filter(looksLikeAPath)) left = left.split(token).join(' ');
  return left;
}

/**
 * What a delegation's prompt and description carry, read as one text (R1). The policy decides what a protected
 * path is, so a project that protects more is read as naming more - the signal follows the policy, not a list.
 */
export function readPrompt(text: string, policy: Policy): PromptReading {
  const tokens = pathTokens(text);
  const outside = outsidePaths(text, tokens);
  const signals: Signal[] = [];

  if (namesAProtectedPath(tokens, policy)) signals.push('S1');
  if (ASKS_FOR_A_VALUE.test(outside)) signals.push('S2');
  if (ASKS_FOR_A_COMPARISON.test(outside)) signals.push('S3');
  if (CONFIGURATION_IDENTIFIER.test(outside)) signals.push('S4');

  const caveats: Caveat[] = [];
  if (NOT_TO_QUOTE.test(outside)) caveats.push('C1');
  if (NOT_TO_READ.test(outside)) caveats.push('C2');

  return { signals, caveats };
}
