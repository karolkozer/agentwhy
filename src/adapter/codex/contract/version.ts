/**
 * v1 (2026-09-29): first-line recognition and identity only, X1-X5, measured on 70 frozen files (spec §2.7).
 * v2 (2026-09-29): the records a report reads - turns and their permissions, action items, messages, the cell's output
 * handed to the model, delegations and reviewers - from §2.2-§2.6 and the controlled terminal sessions of §2.8, and the
 * capability matrix they permit (`capabilities.ts`). Joins that depend on the probe's corrected session index (§2.4)
 * stay provisional: they are made by id and leave a relation unresolved where they break; XB4 is open. Every other
 * build and mode is read with its capabilities unmeasured.
 */
export const CONTRACT_VERSION = 2;

export const VERIFIED_AGAINST = {
  date: '2026-09-29',
  codex: ['0.154.0-alpha.6.2', '0.155.0-alpha.16.3', '0.155.0-alpha.9', '0.157.0'],
  files: 77,
  scope: 'session-records',
} as const;
