export const KNOWN_DENIAL_KINDS = ['permission-rule'] as const;

export type KnownDenialKind = (typeof KNOWN_DENIAL_KINDS)[number];

// An unrecognised denial kind must surface as unknown, never be folded into a known one.
export function isKnownDenialKind(value: unknown): value is KnownDenialKind {
  return typeof value === 'string' && (KNOWN_DENIAL_KINDS as readonly string[]).includes(value);
}

/**
 * What the Read tool itself answers when a deny rule covers the file. Measured 2026-09-24 on a real session: a Read of
 * `.env` under a deny rule for every `.env` file came back as an error result holding these words, and the record carried no
 * `toolDenialKind` - that marker is written for a shell command a rule refuses, not for this. Without these words the
 * refusal read as a call that failed, and the page said "only saw a name" of a file a rule had kept out. Matched only
 * inside a result marked as an error, so a file that merely quotes the sentence is not a refusal.
 */
export const RULE_REFUSED_READ = 'File is in a directory that is denied by your permission settings.';

/** The kind a refusal recognised by its words is recorded as: the same rule, reached through another tool. */
export const RULE_REFUSED_READ_KIND: KnownDenialKind = 'permission-rule';
