import type { Redacted } from '../../core/redaction/redacted.ts';
import type { PrivateFile, ReportModel } from '../report-model.ts';
import { filesRead } from '../flow-reads.ts';
import { RULE_NAMES } from '../rule-names.ts';

/**
 * A file whose value an agent saw. `template` marks a path named as a template - `.env.example` and its kind: the policy
 * protects it deliberately (`default-policy.ts`), and teams do leave real values in one, but "rotate this" is the wrong
 * sentence for a file meant to be committed. The fact is reported; the advice is not (R12c).
 */
export interface RotateFile {
  readonly path: Redacted;
  readonly template: boolean;
  /**
   * What was read from it held a key the scanner recognised, or was read together with another protected file so that
   * it cannot be told apart (`holdsKeys`). Such a file is not closed with "not private" or "handled" (F50): a matched
   * key is not dismissed with one click.
   */
  readonly keyed?: true;
  /**
   * What reading it left behind in this session - key formats and variable names, never a value (M1, M2) - where the
   * session read anything from it. To fix gives it to the same Fix it wizard the report page opens (to-fix spec T13).
   */
  readonly read?: FileRead;
}

/** The names a read of a private file left: which kinds of key, which lines. Never a value. */
export type FileRead = Pick<PrivateFile, 'keys' | 'names' | 'keyed' | 'mixed'>;

/** A protected path reached one way, and nothing refused it (`specs/2026-09-16-worth-running-every-day.md` R12). */
export interface OpenRoute {
  readonly path: Redacted;
  /** The tool, and for a shell the programs it ran - as the report names the route, never the command text. */
  readonly did: Redacted;
  /** The policy pattern that protects the path, so a rule can be written from it. */
  readonly pattern?: Redacted;
  readonly occurrences: number;
}

/**
 * What a person can do about one session, read from its report and from nothing else (R12). Every field is a path, a
 * route, a count or a class name that already crossed the redaction boundary, so a renderer of this cannot leak more
 * than the report it came from.
 */
export interface SessionActions {
  /** How the report names the policy it was read under. */
  readonly policy: Redacted;
  /**
   * Files a value was read from and seen by an agent: a call that reached the file and whose result carried a traced
   * value, a return that carried one, or an agent's own messages that did. Where one call printed several protected
   * files, each of them is here: the transcript does not say which one the value came from, and rotating one too many
   * is the safe side.
   */
  readonly rotate: readonly RotateFile[];
  readonly openRoutes: readonly OpenRoute[];
  /**
   * F57: private files the person asked only to be told about, which the agent reached. The agent was let read them, so
   * they are no route to close; a value read from one is still on `rotate`, since only changing the keys undoes that.
   */
  readonly told?: readonly Redacted[];
  /** Paths reached only through what a call printed, never named by a call - the motivating case's shape. */
  readonly onlyInResults: readonly Redacted[];
  /**
   * Protected paths a call named or printed and whose outcome is unknown - a missing result, a marker this version does
   * not know. `report` counts them as reached; saying nothing here would turn "cannot tell" into "nothing happened"
   * (invariant 4). Found by a review.
   */
  readonly unknown: readonly Redacted[];
  readonly refusedAttempts: number;
  /** One class name per result that carried a recognised key shape, so repetition counts. */
  readonly secretShapes: readonly Redacted[];
  /**
   * Protected paths named in what a call of an unknown tool carried - a message, a report, a question. They are not
   * counted as reached (R12b): the adapter has no profile saying where that tool names a file, so its whole input was
   * searched, and prose about `.env` is not a file that was opened. Counted so that a quiet answer is not silence.
   */
  readonly mentions: number;
}

/**
 * Whether a file read holds keys, as far as what was read says: a recognised key format, or a read shared with another
 * protected file, whose keys may be this one's (`PrivateFile.mixed`). The to-do list and the marks decide by this alone.
 */
export function holdsKeys(file: Pick<PrivateFile, 'keys' | 'mixed'>): boolean {
  return file.keys.length > 0 || file.mixed === true;
}

/** Names a file kept as an example rather than as configuration. A convention, matched on the name and nothing else. */
const TEMPLATE = /\.(example|sample|template|dist)$/;

/** The patterns of the built-in rules, every one of them for passwords and keys (F45). */
const KEY_RULES: ReadonlySet<string> = new Set(RULE_NAMES.flatMap((group) => group.patterns));

/** Whether a path is named as a template (R12c): the one test the check and the report page share. */
export function isTemplate(path: string): boolean {
  return TEMPLATE.test(path);
}

export function actionsOf(report: ReportModel): SessionActions {
  const rotate = new Set<Redacted>();
  for (const flow of report.flows) {
    for (const step of flow.steps) {
      // H7: a file whose text reached the agent - a traced value, or lines a search printed - is to see to.
      if (step.kind === 'reached' && step.toolKnown && step.outcome === 'succeeded') {
        for (const file of filesRead(step)) rotate.add(file);
      }
      // X10: a value its model was handed from code it wrote, which no call of its returned, is read all the same.
      if (step.kind === 'received') for (const file of step.files) rotate.add(file);
    }
  }
  for (const statement of report.returns) {
    if (statement.strength === 'value') for (const file of statement.paths) rotate.add(file);
    for (const file of statement.writtenFrom) rotate.add(file);
  }

  const patternOf = new Map(report.findings.map((finding) => [finding.path, finding.pattern]));
  const toldPaths = new Set(report.findings.filter((finding) => finding.told === true).map((finding) => finding.path));
  const routes = new Map<string, OpenRoute>();
  const named = new Set<Redacted>();
  // A call whose tool the adapter does not know is a mention, wherever the path sat: there is no profile saying that
  // this tool addresses a file, so its text was searched for want of one. Found by running `check` on real sessions,
  // where messages between agents were reported as routes to `.env`.
  const reaching = report.stories.filter((story) => story.toolKnown);
  const mentions = new Set(report.stories.filter((story) => !story.toolKnown).map((story) => story.path));
  for (const story of reaching) {
    if (story.outcome !== 'succeeded' || story.source !== 'input' || toldPaths.has(story.path)) continue;
    named.add(story.path);
    const key = `${story.path}\u0000${story.did}`;
    const pattern = patternOf.get(story.path);
    const known = routes.get(key);
    routes.set(key, {
      path: story.path,
      did: story.did,
      ...(pattern === undefined ? {} : { pattern }),
      occurrences: (known?.occurrences ?? 0) + story.occurrences,
    });
  }

  const onlyInResults = new Set(
    reaching
      .filter((story) => story.outcome === 'succeeded' && story.source === 'result' && !named.has(story.path) && !toldPaths.has(story.path))
      .map((story) => story.path),
  );

  const keyed = new Set(report.privateFiles.filter(holdsKeys).map((file) => file.path));
  const readOf = new Map(report.privateFiles.map((file) => [file.path, readOfFile(file)]));

  return {
    policy: report.scope.policy.origin,
    // F57: a told file's contents were read because the person let them be; only keys in it still need changing - a key
    // of a known format, or any file a built-in rule for passwords and keys covers (F45: that rule is itself the fact).
    rotate: [...rotate].filter((path) => !toldPaths.has(path) || keyed.has(path) || KEY_RULES.has(patternOf.get(path) as string)).sort().map((path) => {
      const read = readOf.get(path);
      return { path, template: TEMPLATE.test(path), ...(keyed.has(path) ? { keyed: true as const } : {}), ...(read === undefined ? {} : { read }) };
    }),
    openRoutes: [...routes.values()],
    ...(toldPaths.size === 0 ? {} : { told: [...new Set(reaching.filter((story) => story.outcome === 'succeeded' && toldPaths.has(story.path)).map((story) => story.path))].sort() }),
    onlyInResults: [...onlyInResults].sort(),
    unknown: [...new Set(reaching.filter((story) => story.outcome === 'unknown').map((story) => story.path))].sort(),
    refusedAttempts: report.tally.refusedAttempts,
    secretShapes: report.secretShapes.flatMap((finding) => finding.classes),
    mentions: mentions.size,
  };
}

/** A file's read, where it left anything to name. */
function readOfFile(file: PrivateFile): FileRead | undefined {
  if (file.keys.length === 0 && file.names.length === 0 && file.keyed.length === 0 && file.mixed !== true) return undefined;
  return { keys: file.keys, names: file.names, keyed: file.keyed, ...(file.mixed === true ? { mixed: true as const } : {}) };
}
