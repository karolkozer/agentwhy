/**
 * Values read from protected resources, held as salted digests of their runs and asked about other text
 * (`specs/2026-09-15-what-came-back.md` R3, R4). No value is kept and no run of one (§5.4 rule 6): what is kept is the digest
 * of each run, and the position of the value it came from in the list the trace was built from.
 *
 * **Thresholds** - spec §5.1's proposal, until the measurement closes it: a run of `RUN_ANYWHERE` characters
 * anywhere in a value, or of `RUN_AT_EDGE` characters at its start or its end, because a prefix and a suffix were
 * what leaked. A value shorter than `RUN_AT_EDGE` can therefore never be found.
 */
export const RUN_ANYWHERE = 12;
export const RUN_AT_EDGE = 6;

/**
 * The multiplier of the cheap fingerprint below. Any odd number works; 33 is the one Bernstein's string hash uses,
 * and it is picked for nothing more than being widely read.
 */
const FINGERPRINT_BASE = 33;

/**
 * A cheap, unsalted fingerprint of a run, used only to decide whether the salted digest is worth computing.
 * `Math.imul` keeps the arithmetic to 32 bits, which is what makes it rollable in constant time per position.
 */
function fingerprintOf(run: string): number {
  let hash = 0;
  for (let index = 0; index < run.length; index += 1) hash = (Math.imul(hash, FINGERPRINT_BASE) + run.charCodeAt(index)) | 0;
  return hash;
}

export class ValueTrace {
  /**
   * Digest of a run -> positions of the values it came from. Public on purpose: everything a trace holds can be
   * inspected, and a test holds it to rule 6 by inspecting it. A private field would hide from that test too.
   */
  readonly anywhere: ReadonlyMap<string, readonly number[]>;
  /** The same, for the run at a value's start and the run at its end. */
  readonly edges: ReadonlyMap<string, readonly number[]>;
  /**
   * Fingerprints of the very same runs, for the prefilter in `#scan`. Public for the same reason the maps are: a
   * number is not a run of a value, and rule 6 is checked by inspecting everything a trace holds.
   */
  readonly anywhereFingerprints: ReadonlySet<number>;
  readonly edgeFingerprints: ReadonlySet<number>;
  readonly #digest: (run: string) => string;

  /** `digest` must be salted per run; the redactor is the one place that has the salt, and builds traces. */
  constructor(values: readonly string[], digest: (run: string) => string) {
    this.#digest = digest;
    const anywhere = new Map<string, number[]>();
    const edges = new Map<string, number[]>();
    const anywhereFingerprints = new Set<number>();
    const edgeFingerprints = new Set<number>();

    values.forEach((value, index) => {
      for (let start = 0; start + RUN_ANYWHERE <= value.length; start += 1) {
        const run = value.slice(start, start + RUN_ANYWHERE);
        remember(anywhere, digest(run), index);
        anywhereFingerprints.add(fingerprintOf(run));
      }
      if (value.length >= RUN_AT_EDGE) {
        for (const run of [value.slice(0, RUN_AT_EDGE), value.slice(-RUN_AT_EDGE)]) {
          remember(edges, digest(run), index);
          edgeFingerprints.add(fingerprintOf(run));
        }
      }
    });
    this.anywhere = anywhere;
    this.edges = edges;
    this.anywhereFingerprints = anywhereFingerprints;
    this.edgeFingerprints = edgeFingerprints;
  }

  /** Which traced values have a run in `text`, as positions in the list the trace was built from. Never where. */
  foundIn(text: string): Set<number> {
    const found = new Set<number>();
    this.#scan(text, RUN_ANYWHERE, this.anywhere, this.anywhereFingerprints, found);
    this.#scan(text, RUN_AT_EDGE, this.edges, this.edgeFingerprints, found);
    return found;
  }

  /**
   * Every window of `text`, asked about. The salted digest is the answer, but computing one per position meant a
   * cryptographic hash per character of every message and result a session holds: measured at 3.6 seconds of one
   * run on a record-heavy transcript, and it grows with the session. So each window is first fingerprinted by a
   * hash that rolls in constant time, and only a window whose fingerprint belongs to a traced run is digested.
   *
   * The prefilter can only add work, never remove an answer: equal strings always fingerprint alike, so every run
   * that was there is still digested and still found. A collision costs one digest and is then refused by the map.
   */
  #scan(
    text: string,
    length: number,
    runs: ReadonlyMap<string, readonly number[]>,
    fingerprints: ReadonlySet<number>,
    found: Set<number>,
  ): void {
    if (runs.size === 0 || text.length < length) return;

    // What the leaving character contributes, so it can be taken back out: the base to the power of the window.
    let leaving = 1;
    for (let step = 1; step < length; step += 1) leaving = Math.imul(leaving, FINGERPRINT_BASE) | 0;

    let fingerprint = fingerprintOf(text.slice(0, length));
    for (let start = 0; start + length <= text.length; start += 1) {
      if (fingerprints.has(fingerprint)) {
        for (const index of runs.get(this.#digest(text.slice(start, start + length))) ?? []) found.add(index);
      }
      const next = start + length;
      if (next >= text.length) return;
      const without = (fingerprint - Math.imul(text.charCodeAt(start), leaving)) | 0;
      fingerprint = (Math.imul(without, FINGERPRINT_BASE) + text.charCodeAt(next)) | 0;
    }
  }
}

function remember(runs: Map<string, number[]>, digest: string, index: number): void {
  const known = runs.get(digest);
  if (known === undefined) runs.set(digest, [index]);
  else if (!known.includes(index)) known.push(index);
}
