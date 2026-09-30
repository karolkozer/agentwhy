/** A release version as three numbers, the way npm publishes one. */
export type PlainVersion = readonly [major: number, minor: number, patch: number];

const PLAIN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/**
 * `x.y.z` and nothing else. A pre-release (`0.3.0-beta.1`), a build (`0.0.0-dev`) or a range is not plain: no rule here
 * orders one against a release, so none is guessed (`nothing-updates-by-itself.md` U1, U2).
 */
export function plainVersion(text: string): PlainVersion | undefined {
  const match = PLAIN.exec(text);
  return match === null ? undefined : [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Whether `version` is an older release than `than`. False where either is not plain: unknown is never older. */
export function isOlder(version: string, than: string): boolean {
  const a = plainVersion(version);
  const b = plainVersion(than);
  if (a === undefined || b === undefined) return false;
  for (let part = 0; part < 3; part += 1) {
    if (a[part] !== b[part]) return (a[part] ?? 0) < (b[part] ?? 0);
  }
  return false;
}
