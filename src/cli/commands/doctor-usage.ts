// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
export const DOCTOR_USAGE = `Usage: agentwhy doctor --input <session-dir | session.jsonl | rollout.jsonl | rollout-folder> [--json]

Reports the structure of one Claude Code session - its sources, line types, tools,
denials and meta fields - or of Codex rollouts: their versions, history modes, record
kinds, joins and what they can answer. The format is told by content, not by name.
Prints counts and identifiers only, never transcript content.

Exit codes:
  0  report printed
  1  no session found: the main transcript is missing, or the input is no Claude Code
     or Codex session
  2  usage error
  3  unexpected error
`;
