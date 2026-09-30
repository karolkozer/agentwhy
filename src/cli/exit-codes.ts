// Documented in each command's usage text; tests/cli/commands/doctor-usage.test.ts pins the doctor usage to it.
export const EXIT_CODE = {
  ok: 0,
  mainTranscriptMissing: 1,
  usage: 2,
  unexpected: 3,
} as const;

/**
 * What a `PreToolUse` hook exits with to block the call; the hooks reference documents that its stderr then reaches the
 * model as the reason (`specs/2026-09-16-worth-running-every-day.md` R19). The same number as a usage error, on purpose
 * named apart: one is this tool's own convention, the other is Claude Code's.
 */
export const HOOK_BLOCK_EXIT_CODE = 2;

export type ExitCode = (typeof EXIT_CODE)[keyof typeof EXIT_CODE];
