/**
 * What a person says they did about a file (R31; `for-people-who-build-with-ai.md` F25, F50): the keys it held were
 * replaced, a template's values are placeholders, what could be done about a file whose contents cannot be changed was
 * done, or the file holds nothing private.
 */
export const MARK_RESULTS = ['rotated', 'not-secret', 'handled', 'not-private'] as const;
export type MarkResult = (typeof MARK_RESULTS)[number];

/** A result read from a file, a flag or a request, which this version knows. */
export function isMarkResult(value: unknown): value is MarkResult {
  return (MARK_RESULTS as readonly unknown[]).includes(value);
}

/**
 * One line of a person's record of what they did about a file (`specs/2026-09-16-worth-running-every-day.md` R31-R34):
 * a mark, or the undoing of one. Paths, results, moments, session ids and the person's own note - never a value and
 * never a line of a transcript.
 */
export type MarkRecord =
  | {
      readonly kind: 'mark';
      readonly path: string;
      /** The label the file's line had when it was marked. */
      readonly label: string;
      readonly result: MarkResult;
      /** Epoch milliseconds. */
      readonly at: number;
      readonly note?: string;
      /** The session ids behind the line when it was marked. */
      readonly sessions: readonly string[];
    }
  | { readonly kind: 'unmark'; readonly path: string; readonly at: number };

export interface MarkReading {
  readonly records: readonly MarkRecord[];
  /** Lines that were not a record this version reads. Counted, and skipped. */
  readonly skipped: number;
  /** The file exists and could not be read at all. Not the same answer as "nothing was ever marked". */
  readonly failed: boolean;
}

/** One project's marks, for one person, kept outside the repository (R33). Appended to, never rewritten (R34). */
export interface MarkStore {
  read(): Promise<MarkReading>;
  /** `false` where the line could not be written; the caller says so. */
  append(record: MarkRecord): Promise<boolean>;
}
