import { createHash } from 'node:crypto';
import {
  displayPath,
  displayPathsIn,
  insideProject,
  forSharing,
  OUTSIDE_THE_PROJECT,
  type ProjectRoot,
} from '../project-root.ts';
import { looksRandom } from './entropy.ts';
import { brand, type Redacted } from './redacted.ts';
import { CLASS_A, RULESET_VERSION } from './secret-patterns.ts';
import { ValueTrace } from './value-trace.ts';
import { isConfigName, isExcludedValue, isSensitiveName, unquote } from './value-shapes.ts';

/**
 * A stretch of text to replace, what it was recognised as, and its place in the resolution order of §5.4:
 * a known format first, then a URL password, then a value beside a sensitive name, and entropy last. The order
 * is part of the specification, not an implementation detail - a `ghp_…` inside a longer high-entropy run must
 * be reported as a GitHub token, not as an anonymous blob.
 */
interface SecretMatch {
  readonly name: string;
  /** For a class B match, the key it stood beside: what decides whether it is worth reporting (§5.4). */
  readonly key?: string;
  readonly rank: number;
  readonly start: number;
  readonly end: number;
}

const RANK = { knownFormat: 1, urlPassword: 2, sensitiveName: 3, entropy: 4 } as const;

/** Step 1: a known format. It **ignores every exclusion** - a real `ghp_…` in a `NEXT_PUBLIC_` name is the case
 * we most want to see. */
function classAMatches(text: string): SecretMatch[] {
  return CLASS_A.flatMap(({ name, pattern }) =>
    [...text.matchAll(pattern)].map((match) => {
      // A pattern may keep a prefix - `:_authToken=` stays, the token after it does not.
      const prefix = typeof match[1] === 'string' ? match[1] : '';
      return { name, rank: RANK.knownFormat, start: match.index + prefix.length, end: match.index + match[0].length };
    }),
  );
}

/**
 * Step 2: only the password of a URL, so `postgres://app:[redacted]@db/main` stays readable as a finding.
 *
 * The scheme is bounded, and the bound is the whole point. Written as `[\w+.-]*`, the run before `://` was retried
 * from every position of a line, and a transcript's lines are long - measured at about 31 KB each on real sessions.
 * That made one line quadratic: a CPU profile of a 65 MB session put **3.7 of its 4.4 seconds inside this one
 * pattern**, which is most of what `report`, `check`, `start` and the `Stop` hook were spending per run. Bounding the
 * scheme to what a scheme can be - 32 characters, against `postgres`, `mongodb+srv`, `jdbc` - took the same text from
 * 113 ms to 1 ms, with the same matches. The password itself stays unbounded: a long one is rare, it is reached only
 * after a scheme and a host have already matched, and refusing to redact it would be the wrong way to save time.
 *
 * The lookbehind is the same argument once more. A bounded scheme is still tried from every letter of a run, which
 * on 65 MB of text was another 1.3 seconds; a scheme cannot begin in the middle of a *letter* run, so those
 * positions are refused in one character each. It must be letters only, not `\w` - a scheme glued to a *digit*
 * (a timestamp, a line number) still begins right there, and excluding digits too silently dropped that password.
 * Measured on the same line: 6 ms to none at all, and the same matches for `postgres://`, `mongodb+srv://`, a
 * scheme after `=`, and one welded to a word before it.
 */
const URL_PASSWORD = /(?<![A-Za-z])([a-z][\w+.-]{0,31}:\/\/[^\s:/@]+:)([^\s@]+)(?=@)/gi;

function urlPasswords(text: string): SecretMatch[] {
  return [...text.matchAll(URL_PASSWORD)].map((match) => ({
    name: 'url-password',
    rank: RANK.urlPassword,
    start: match.index + (match[1] ?? '').length,
    end: match.index + match[0].length,
  }));
}

/**
 * Steps 3 and 4: a value beside a sensitive name, once the value-shape exclusions have had their say. The key
 * name is never touched - it is the finding (§5.4).
 */
/**
 * `NAME=value`, `"name": "value"`, `name: value`.
 *
 * The name must start at a boundary and hold no dots, which two failures taught: without the boundary,
 * `apps/web/.env.development:12:KEY=value` read `env.development` as the name and swallowed the rest of the
 * line as its value, and without the optional quotes a JSON key was never seen at all.
 */
const KEY_VALUE = /(^|[\s,;:{[(]["']?)([A-Za-z_][A-Za-z0-9_-]*)(["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/g;

/** What a replacement looks like. A value that is already one is not a value: re-reading it mangles the text. */
const PSEUDONYM = '[redacted:';

/**
 * C0 and C1 control characters, and DEL - everything but the tab and the newline a text legitimately carries.
 *
 * A transcript is written by the very party the report is about, and a report is read in a terminal. Left in, an
 * escape sequence of the transcript's choosing reaches that terminal and rewrites what the reader is shown: a
 * `\u001b[2K\u001b[1G` in an agent's own prose overwrites the verdict line above it. `hooks/hook-output.ts` keeps
 * the same guard over the one other channel that reaches a terminal, and for the same reason.
 *
 * A space, not nothing, so a sequence never welds the words on either side of it into one.
 */
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

function withoutControls(text: string): string {
  return text.replace(CONTROL, ' ');
}

function keyContext(text: string): SecretMatch[] {
  return [...text.matchAll(KEY_VALUE)].flatMap((match) => {
    const [, prefix = '', name = '', separator = '', value = ''] = match;
    if (value.startsWith(PSEUDONYM)) return [];
    if (!isSensitiveName(name) || isExcludedValue(value)) return [];

    // The quotes stay in the text; only what they hold is replaced.
    const bare = unquote(value);
    const start = match.index + prefix.length + name.length + separator.length + (value.length === bare.length ? 0 : 1);
    return [{ name: 'value beside a sensitive name', key: name, rank: RANK.sensitiveName, start, end: start + bare.length }];
  });
}

/**
 * Step 5: entropy. Redacts, never reports, and only after its own exclusions (lesson L001). The token may end
 * in base64 padding but may not contain `=` inside it: a token that swallows an `=` swallows a whole
 * `KEY=value` and reports the pair as one anonymous blob.
 */
const TOKEN = /[A-Za-z0-9_+/~.-]{20,}={0,2}/g;

function randomTokens(text: string): SecretMatch[] {
  return [...text.matchAll(TOKEN)]
    .filter((match) => looksRandom(match[0]))
    .map((match) => ({
      name: 'high-entropy value',
      rank: RANK.entropy,
      start: match.index,
      end: match.index + match[0].length,
    }));
}

/**
 * The boundary. Everything that reaches the report model passes through here, on the way **in** - never on the
 * way out to a file, because the next renderer would bypass that (spec §5.4, mechanics rule 5).
 *
 * Four doors, each narrow and each a decision at its call site:
 *
 * - `scan`      — free text that may hold anything.
 * - `content`   — text that came out of a protected resource: redacted **wholesale**, key names kept.
 * - `path`      — a path, shown relative to the project root where it lies under one; `--share` is next.
 * - `term`      — a tool name, a status, a pattern: vocabulary, not content.
 *
 * There is no general "trust me" door. A value never appears, a fragment of one never appears (rule 4: a prefix
 * is leakage too), and the same value always gets the same pseudonym so a reader can see it is the same one
 * without being told which (rule 3).
 */
/**
 * The two key shapes of a protected resource's lines: `KEY=value` and `"key": value`. The first group is the key with
 * what joins it to the value, the second the value. `content` replaces the second and `keysIn` reads the first, from
 * these same expressions. `[ \t]` rather than `\s`: `\s` crosses a newline, so a key with an empty value swallowed
 * the line below it and deleted the next key's name - the one thing this promises to keep.
 */
const ASSIGNED = /([A-Za-z_][A-Za-z0-9_]*[ \t]*=[ \t]*)("[^"]*"|'[^']*'|\S+)/g;
const QUOTED_KEY = /("[A-Za-z_][A-Za-z0-9_-]*"[ \t]*:[ \t]*)("[^"]*"|[^,\s]+)/g;

/**
 * Of matches that overlap, the one of highest precedence - a known format over a password in a URL over a value beside a
 * sensitive name over an entropy guess - and then by position; the result in the order the matches start. The one
 * resolution both the redaction and a count of keys use, so the two can never name the same value differently.
 */
function strongest(found: readonly SecretMatch[]): SecretMatch[] {
  const chosen: SecretMatch[] = [];
  for (const match of [...found].sort((a, b) => a.rank - b.rank || a.start - b.start || b.end - a.end)) {
    if (chosen.some((taken) => match.start < taken.end && taken.start < match.end)) continue;
    chosen.push(match);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

/** A line of a protected file whose value is a key: its name, and what the value was recognised as (`stripe-key`). */
export interface KeyedName {
  readonly name: Redacted;
  readonly key: string;
}

export class Redactor {
  readonly #salt: string;
  readonly #projectRoot: ProjectRoot;
  /** The shared view of `specs/2026-09-14-path-display-and-share.md`: nothing above the project root leaves the tool. */
  readonly #share: boolean;
  /** Hash of a value -> the pseudonym already given to it. The value itself is never kept (rule 6). */
  readonly #pseudonyms = new Map<string, string>();
  readonly #counts = new Map<string, number>();
  /** Occurrences, not distinct values: one key seen fifty times is fifty replacements in the output. */
  #replacements = 0;
  #protectedContents = 0;

  constructor(salt: string, projectRoot: ProjectRoot = { kind: 'absent' }, share = false) {
    this.#salt = salt;
    this.#projectRoot = projectRoot;
    this.#share = share;
  }

  /**
   * Free text: class A matches are replaced, everything else is left as written - except that a path inside it
   * is shown the way a path in a path field is (R8). A description that quotes an absolute path is still a
   * description carrying an absolute path.
   */
  scan(text: string): Redacted {
    const shown = displayPathsIn(withoutControls(text), this.#projectRoot);
    return brand(this.#scanText(this.#share ? forSharing(shown) : shown));
  }

  /**
   * Text that came out of a protected resource. The scanner recognises the minority of secrets, so nothing here
   * is trusted to be safe, and the decision is made **line by line**: deciding once for the whole text let a
   * single `FOO=bar` anywhere hand the rest of the file through untouched.
   *
   * A line shaped `KEY=value` or `"key": "value"` keeps its key - the key name is the finding - and loses its
   * value. A line of any other shape goes whole. A text where no line has a key shape is replaced by its size,
   * which is all that can be said about it.
   */
  content(text: string): Redacted {
    this.#protectedContents += 1;
    const lines = withoutControls(text).split('\n');
    const redacted = lines.map((line) => this.#contentLine(line));

    if (redacted.every((line, index) => line === lines[index] || line.startsWith('[redacted: line'))) {
      return brand(`[redacted: content of a protected resource — ${lines.length} lines, ${Buffer.byteLength(text)} bytes]`);
    }
    return brand(redacted.join('\n'));
  }

  /**
   * A path is the finding, not the secret, and §7.3 shows it as written. It is still scanned: these come from
   * splitting untrusted result text, so a value that happens to match a path pattern arrives through this door
   * as readily as through any other.
   */
  path(value: string): Redacted {
    const cleaned = withoutControls(value);
    // The shared view drops a location only for a path that says where it starts and is not under the root.
    // A path recorded relative to the working directory is already inside the project, and asking "did the
    // string change" instead of "is it inside" turned every one of those into a category.
    if (this.#share && !insideProject(cleaned, this.#projectRoot)) return brand(OUTSIDE_THE_PROJECT);
    // What reaches this door as a path is not always one. A command, or a fragment of quoted JSON, can be taken
    // for a candidate and still end in the file a policy protects; it does not start with a root, so it counts as
    // inside the project - and an absolute path or an identifier further along it was shown whole. Found by
    // running `start --share` on a real project. A path field is no weaker than a sentence (R8).
    const shown = displayPath(cleaned, this.#projectRoot);
    return brand(this.#scanText(this.#share ? forSharing(shown) : shown));
  }

  /**
   * A trace of values read from protected resources (`specs/2026-09-15-what-came-back.md` R3), salted with this run's salt so
   * that its digests mean nothing outside this one report (rule 6). The values are hashed here and not kept.
   */
  trace(values: readonly string[]): ValueTrace {
    return new ValueTrace(values, (run) => createHash('sha256').update(`${this.#salt}:trace:${run}`).digest('hex'));
  }

  /**
   * Vocabulary: a tool name, an outcome, a policy pattern. No value passes here - but a tool name is still read
   * out of the transcript, so the control characters go, as they do through every other door.
   */
  term(value: string): Redacted {
    return brand(withoutControls(value));
  }

  /**
   * Which known key formats appear in a piece of text, by class name and never by value. This is the `S-shape`
   * source of §5.4: a secret can be recognised in output that touched no protected path at all, and saying
   * "a key of this kind came back here" is a fact worth reporting without quoting a character of it.
   */
  classesIn(text: string): readonly string[] {
    // Entropy never issues a finding on its own (§5.4): it redacts, and it says nothing. Only what was
    // recognised - a known format, or a value beside a sensitive name - is reported.
    // The report's threshold, not redaction's: a class B match is worth stating only when the key reads as one a
    // configuration would carry. Measured on a real session: 139 matches, of which 129 stood beside names from the
    // repository's own code - `sessionId`, `key`, `secretShapes` - and 10 beside names like `WEBHOOK_SECRET`.
    return [
      ...new Set(
        [...classAMatches(text), ...urlPasswords(text), ...keyContext(text)]
          .filter((match) => match.key === undefined || isConfigName(match.key))
          .map((match) => match.name),
      ),
    ];
  }

  /**
   * The names on the keyed lines of a protected resource - `STRIPE_SECRET_KEY` of `STRIPE_SECRET_KEY=sk_…` - and never
   * their values. They are the same keys `content` keeps, read by the same two expressions, so a name given here is one
   * the redacted text already shows. Each is scanned like any other text, in case a name is itself a key.
   */
  keysIn(text: string): readonly Redacted[] {
    const names = new Set<string>();
    for (const line of withoutControls(text).split('\n')) {
      if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
      for (const match of line.matchAll(ASSIGNED)) names.add((match[1] ?? '').replace(/[ \t]*=[ \t]*$/, ''));
      for (const match of line.matchAll(QUOTED_KEY)) names.add((match[1] ?? '').replace(/^"|"[ \t]*:[ \t]*$/g, ''));
    }
    return [...names].filter((name) => name !== '').map((name) => brand(this.#scanText(name)));
  }

  /**
   * The names of the lines whose value is a key - `STRIPE_SECRET_KEY` of `STRIPE_SECRET_KEY=sk_…`, not `NODE_ENV` of
   * `NODE_ENV=development` - each with what its value was recognised as (`specs/2026-09-23-the-report-page.md` M2a):
   * the same resolution `content` redacts by, a known format first and a random value last. A random value is counted
   * here, where §5.4 lets it issue no finding, because it says only which of a protected file's lines hold a key, of a
   * file already on the list. Names only, in the order first read, once each; never a value.
   */
  keyedIn(text: string): readonly KeyedName[] {
    const found = new Map<string, string>();
    for (const line of withoutControls(text).split('\n')) {
      if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
      const secrets = strongest([...classAMatches(line), ...urlPasswords(line), ...keyContext(line), ...randomTokens(line)]
        .filter((match) => match.key === undefined || isConfigName(match.key)));
      if (secrets.length === 0) continue;
      for (const [expression, clean] of [[ASSIGNED, /[ \t]*=[ \t]*$/g], [QUOTED_KEY, /^"|"[ \t]*:[ \t]*$/g]] as const) {
        for (const match of line.matchAll(expression)) {
          const start = match.index + (match[1] ?? '').length;
          const end = start + (match[2] ?? '').length;
          const secret = secrets.find((each) => each.start < end && start < each.end);
          const name = (match[1] ?? '').replace(clean, '');
          if (secret !== undefined && name !== '' && !found.has(name)) found.set(name, secret.name);
        }
      }
    }
    return [...found].map(([name, key]) => ({ name: brand(this.#scanText(name)), key }));
  }

  /**
   * The key format of each value in a text, one class per value: where two classes match the same value - a Stripe key
   * standing beside `STRIPE_SECRET_KEY=` - the one the redaction itself would choose wins, the known format. What
   * `classesIn` lists is every class seen; this is what each key is (`specs/2026-09-23-the-report-page.md` M1), so a
   * file of Stripe keys is not also said to hold a key nobody can name. In the order the values appear, once each.
   */
  keyClassesIn(text: string): readonly string[] {
    const found = [...classAMatches(text), ...urlPasswords(text), ...keyContext(text)]
      .filter((match) => match.key === undefined || isConfigName(match.key));
    return [...new Set(strongest(found).map((match) => match.name))];
  }

  /** What the report header has to say about redaction (§5.4, versioning). */
  summary(): {
    readonly rulesetVersion: number;
    readonly redactions: number;
    readonly distinctValues: number;
    readonly protectedContents: number;
  } {
    return {
      rulesetVersion: RULESET_VERSION,
      redactions: this.#replacements,
      distinctValues: this.#pseudonyms.size,
      protectedContents: this.#protectedContents,
    };
  }

  /**
   * One pass over the text, not one pass per pattern. Replacing pattern by pattern lets a later pattern match
   * inside an earlier replacement - `:_authToken=` swallowed the `[redacted: …]` a token pattern had just
   * written, and left half of it in the output. Matches are collected first, overlaps resolved by taking the
   * one that starts earliest and reaches furthest, and the text is rebuilt once.
   */
  /** Blank lines and comments carry nothing; `=` and `:` shapes keep their key; everything else goes whole. */
  #contentLine(line: string): string {
    if (line.trim() === '' || line.trimStart().startsWith('#')) return line;

    const keyed = line
      .replace(ASSIGNED, (_, key: string, value: string) => `${key}${this.#pseudonym('value from a protected resource', value)}`)
      .replace(QUOTED_KEY, (_, key: string, value: string) => `${key}${this.#pseudonym('value from a protected resource', value)}`);

    return keyed === line ? `[redacted: line of a protected resource — ${line.length} characters]` : this.#scanText(keyed);
  }

  #scanText(text: string): string {
    const chosen = strongest([...classAMatches(text), ...urlPasswords(text), ...keyContext(text), ...randomTokens(text)]);

    let output = '';
    let taken = 0;
    for (const match of chosen) {
      output += text.slice(taken, match.start) + this.#pseudonym(match.name, text.slice(match.start, match.end));
      taken = match.end;
    }
    return output + text.slice(taken);
  }

  /**
   * The same value twice is the same pseudonym, so "this key is also in that other file" can be read off the
   * report. A per-run salt makes the hash useless outside this one report (rule 6).
   */
  #pseudonym(className: string, value: string): string {
    this.#replacements += 1;
    const digest = createHash('sha256').update(`${this.#salt}:${value}`).digest('hex');
    const known = this.#pseudonyms.get(digest);
    if (known !== undefined) return known;

    const index = (this.#counts.get(className) ?? 0) + 1;
    this.#counts.set(className, index);
    const pseudonym = `[redacted: ${className} #${index}]`;
    this.#pseudonyms.set(digest, pseudonym);
    return pseudonym;
  }
}
