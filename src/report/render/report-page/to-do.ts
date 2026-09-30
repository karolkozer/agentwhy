import type { Redacted } from '../../../core/redaction/redacted.ts';
import { actionsOf, holdsKeys, type FileRead } from '../../check/session-actions.ts';
import { readIn } from '../../flow-reads.ts';
import type { KeyedLine, ReportModel } from '../../report-model.ts';
import { ruleKey } from './item-names.ts';
import { nameWords, providerOfName, providerOfPattern, type Provider } from './providers.ts';

/**
 * One file on the report's to-do list (`for-people-who-build-with-ai.md` F21, F45; the report page spec P6-P11): a
 * protected file whose contents reached an agent. What it is and what fixing it takes are decided from the model's
 * facts - the key formats and variable names read from it - and never from its name.
 */
export interface ToDoItem {
  readonly path: Redacted;
  /** `keys` holds a key the tool recognised; `data` holds none, so the person is asked what it holds (F49). */
  readonly kind: 'keys' | 'data';
  /** The services its keys belong to by their format (F45 row 1, F46), in the order found. A fact. */
  readonly providers: readonly Provider[];
  /** The services the names of its key lines point to (F45 row 2, O11), with those names. A guess, and said as one. */
  readonly guesses: readonly Guess[];
  /** Its key lines no format and no name could give a service (F45 row 3): listed by name, for the person to read. */
  readonly lines: readonly Redacted[];
  /** Of the lines above and the guesses' names, those named as test keys (`TEST_SECRET`): less urgent, and said so. */
  readonly tests: readonly Redacted[];
  /** Key lines named as public - shipped to every visitor's browser, or an anon or publishable key: nothing to change. */
  readonly open: readonly Redacted[];
  /** How many of its lines held a key (M2a): "here, 6 keys". */
  readonly keyCount: number;
  /** A key in it no line accounts for - a value with no name beside it - or its read was shared (`mixed`). */
  readonly unnamed: boolean;
  /** The lines to replace (P21): its key lines, or, where no line was seen to hold a key, every variable read (M2). */
  readonly names: readonly Redacted[];
  /** `names` are lines seen holding a key (M2a); false where they are every variable read, `NODE_ENV` included. */
  readonly keyedNames: boolean;
  /** A file named as a template (`.env.example`), whose values may be placeholders (R12c). */
  readonly template: boolean;
  /** A value from it went further: an agent passed it on, saved it, or wrote it in a message (F21). */
  readonly further: boolean;
  /** How many agents its contents reached: "2 AIs read the keys". */
  readonly readers: number;
  /** The protected pattern that matched it, for its human name when no provider names it. */
  readonly pattern?: Redacted;
}

/** A service a file's keys are for, read from the names of the lines they stood on. */
export interface Guess {
  readonly provider: Provider;
  readonly names: readonly Redacted[];
}

/** How urgent a key line is to change, from its format and its name - `secret` first. */
export type Urgency = 'secret' | 'test' | 'public';

/** Shapes many keys share, as against a key's own format: only a key of such a shape is judged by its line's name. */
const SHAPES = new Set(['jwt', 'high-entropy value', 'value beside a sensitive name']);
const SECRET_WORDS = new Set(['SECRET', 'SERVICE', 'PRIVATE', 'PASSWORD', 'PASS', 'PWD', 'ADMIN', 'MASTER']);
const PUBLIC_WORDS = new Set(['ANON', 'PUBLISHABLE']);
const TEST_WORDS = new Set(['TEST', 'SANDBOX']);

/**
 * A key line's urgency (the report page spec P20b). A key's own format - a live Stripe key, a private key block - is a
 * secret. So is a name that says it is one (`SERVICE_ROLE`, `SECRET`, `PASSWORD`), even under a framework's public
 * prefix, where a secret is already shown to everyone and changing it is most urgent. A name a framework ships to the
 * browser (`NEXT_PUBLIC_`, `VITE_`), or an anon, publishable or public key, is public; a test or sandbox key is less
 * urgent. From names, so a guess, and said as one.
 */
export function urgencyOf(line: KeyedLine): Urgency {
  if (!SHAPES.has(line.key)) return 'secret';
  const { words, shipped } = nameWords(line.name);
  const test = words.some((word) => TEST_WORDS.has(word));
  if (words.some((word) => SECRET_WORDS.has(word))) return test ? 'test' : 'secret';
  if (shipped || words.some((word) => PUBLIC_WORDS.has(word)) || words.join('_').includes('PUBLIC_KEY')) return 'public';
  return test ? 'test' : 'secret';
}

/**
 * The to-do list, in the order F21 gives: files a value went further from first, then files of keys, then files whose
 * contents cannot be changed; within each, in the order the session first reached them.
 */
export function toDoItems(report: ReportModel): readonly ToDoItem[] {
  const actions = actionsOf(report);
  const seen = new Map(actions.rotate.map((file) => [file.path as string, file.template]));
  const further = furtherPaths(report);
  const patternOf = new Map(report.findings.map((finding) => [finding.path as string, finding.pattern]));

  const items = report.privateFiles
    .filter((file) => seen.has(file.path))
    .map((file): ToDoItem => {
      const pattern = patternOf.get(file.path);
      return toDoItem(file.path, file, {
        template: seen.get(file.path) === true,
        further: further.has(file.path),
        readers: readersOf(report, file.path),
        ...(pattern === undefined ? {} : { pattern }),
      });
    });

  const rank = (item: ToDoItem): number => (item.further ? 0 : item.kind === 'keys' ? 1 : 2);
  return items.map((item, at) => ({ item, at })).sort((a, b) => rank(a.item) - rank(b.item) || a.at - b.at).map(({ item }) => item);
}

/** What decides an item beyond what was read from its file: the facts of the session, or of the sessions, that read it. */
export interface ItemFacts {
  readonly template: boolean;
  readonly further: boolean;
  readonly readers: number;
  readonly pattern?: Redacted;
}

/**
 * One file as the Fix it wizard draws it, from what was read from it - the report page from its session, To fix from
 * every session that read it (`FileRead`, merged).
 */
export function toDoItem(path: Redacted, file: FileRead, facts: ItemFacts): ToDoItem {
  const { providers, guesses, lines, tests, open, unnamed } = servicesOf(file);
  const kept = file.keyed.filter((line) => !open.includes(line.name));
  // F45, amended 2026-09-24: a file one of the built-in rules protects - `.env*`, `.npmrc`, `secrets/`, SSH keys - is
  // a file of passwords and keys by the rule that matched it, which is a fact. Where no known format was found in it,
  // or its text was never read as its own (a `grep`, a read of several files), its keys are ones we cannot name - it
  // is never asked "what's in this file?", a question for a file only the person's own rule protects.
  const byRule = ruleKey(facts.pattern) !== undefined;
  const keys = holdsKeys(file) || byRule;
  return {
    path,
    kind: keys ? 'keys' : 'data',
    providers,
    guesses,
    lines,
    tests,
    open,
    keyCount: file.keyed.length,
    unnamed,
    names: kept.length > 0 ? kept.map((line) => line.name) : file.names,
    keyedNames: kept.length > 0,
    template: facts.template,
    further: facts.further,
    readers: facts.readers,
    ...(facts.pattern === undefined ? {} : { pattern: facts.pattern }),
  };
}

/** Nothing was read from a file that could be named: no key format, no line. */
export const NOTHING_READ: FileRead = { keys: [], names: [], keyed: [] };

/**
 * Which services a file's keys are for (F45): by a key's format first, a fact; then, for a key line no format names, by
 * the line's variable name (O11), a guess; and a key line neither names is left to the person, by its name. A key class
 * no key line accounts for - a value that stood beside no name - is one nothing here can place. Lines are taken most
 * urgent first (P20b), and a public one is set apart - unless it is all there is, with nothing to set it apart from.
 */
function servicesOf(file: FileRead): Pick<ToDoItem, 'providers' | 'guesses' | 'lines' | 'tests' | 'open' | 'unnamed'> {
  const providers = new Map<string, Provider>();
  for (const key of file.keys) {
    const provider = providerOfPattern(key);
    if (provider !== undefined && !providers.has(provider.name)) providers.set(provider.name, provider);
  }
  const RANK: Readonly<Record<Urgency, number>> = { secret: 0, test: 1, public: 2 };
  const ranked = file.keyed.map((line, at) => ({ line, at, urgency: urgencyOf(line) }))
    .sort((a, b) => RANK[a.urgency] - RANK[b.urgency] || a.at - b.at);
  const setApart = providers.size > 0 || ranked.some((each) => each.urgency !== 'public');
  const guesses = new Map<string, { provider: Provider; names: Redacted[] }>();
  const lines: Redacted[] = [];
  const tests: Redacted[] = [];
  const open: Redacted[] = [];
  for (const { line, urgency } of ranked) {
    if (urgency === 'public' && setApart) { open.push(line.name); continue; }
    if (urgency === 'test') tests.push(line.name);
    if (providerOfPattern(line.key) !== undefined) continue;
    const provider = providerOfName(line.name);
    if (provider === undefined) lines.push(line.name);
    else if (!providers.has(provider.name)) {
      const guess = guesses.get(provider.name) ?? { provider, names: [] };
      guess.names.push(line.name);
      guesses.set(provider.name, guess);
    }
  }
  const placed = new Set(file.keyed.map((line) => String(line.key)));
  const unplaced = file.keys.some((key) => providerOfPattern(key) === undefined && !placed.has(key));
  return { providers: [...providers.values()], guesses: [...guesses.values()], lines, tests, open, unnamed: unplaced || file.mixed === true };
}

/** The paths a value went further from: a reply that carried it, a file it was written into, a use of it. */
function furtherPaths(report: ReportModel): ReadonlySet<string> {
  const paths = new Set<string>();
  for (const statement of report.returns) {
    if (statement.strength === 'value') for (const path of statement.paths) paths.add(path);
    for (const path of statement.writtenFrom) paths.add(path);
  }
  for (const use of report.uses) for (const path of use.files) paths.add(path);
  return paths;
}

/** The agents whose own steps carried a value read from this file. */
function readersOf(report: ReportModel, path: string): number {
  const agents = new Set<number>();
  for (const flow of report.flows) {
    for (const step of flow.steps) {
      if ((step.kind === 'reached' && readIn(step, path)) || (step.kind === 'received' && step.files.map(String).includes(path))) agents.add(flow.agentIndex);
    }
  }
  return Math.max(agents.size, 1);
}
