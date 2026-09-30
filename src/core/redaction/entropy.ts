/**
 * Class C of spec §5.4: entropy alone. It **redacts and never reports** — a high-entropy string is not
 * evidence of anything, and lesson L001 measured what happens without that rule: in one session, 385 `toolu_`
 * identifiers and 1264 UUIDs, every one of them above this threshold. An unguarded class C would have produced
 * over 1600 findings, none of them real.
 *
 * The exclusion list is therefore not an optimisation; it is the only thing that makes the class usable.
 */
const THRESHOLD_BITS = 4.0;
const MINIMUM_LENGTH = 20;

const EXCLUDED: readonly RegExp[] = [
  // The tool's own identifiers - the single most important exclusion on the list (L001).
  /^toolu_[A-Za-z0-9]{20,}$/,
  /^msg_[A-Za-z0-9]{10,}$/,
  /^(agent-)?a[0-9a-f]{16}$/,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^[0-9a-f]{40}$/i,
  /^[0-9a-f]{64}$/i,
  /^sha(256|512)-[A-Za-z0-9+/=]+$/,
  /^data:[\w/+.-]+;base64,/,
  /^[\w.-]+\.(ts|js|mjs|cjs|css|map|json)$/i,
  /^https?:\/\//i,
  /^[~.]{0,2}\//,
  // A path is not a secret by shape, and a long one is random-looking enough to cross the threshold: a
  // path like `apps/web/.env.development` was once replaced by a pseudonym, which turned the finding into
  // gibberish. A slash-separated run of ordinary path characters is a path. The cost is a base64 blob that
  // happens to contain a slash and no padding, which class A and class B both still see.
  /^[\w.@+-]+(\/[\w.@+-]+)+$/,
];

export function shannonBits(text: string): number {
  const counts = new Map<string, number>();
  for (const character of text) counts.set(character, (counts.get(character) ?? 0) + 1);

  return [...counts.values()].reduce((bits, count) => {
    const probability = count / text.length;
    return bits - probability * Math.log2(probability);
  }, 0);
}

/** High entropy, long enough, and none of the shapes this tool produces by the thousand. */
export function looksRandom(token: string): boolean {
  if (token.length < MINIMUM_LENGTH) return false;
  if (EXCLUDED.some((pattern) => pattern.test(token))) return false;
  return shannonBits(token) >= THRESHOLD_BITS;
}
