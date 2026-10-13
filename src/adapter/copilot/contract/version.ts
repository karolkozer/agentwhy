// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * v1 (2026-10-09): the runtime's own record - `~/.copilot/session-state/<uuid>/events.jsonl`, written alike by the
 * desktop app and the CLI - from `.ai/specs/2026-10-05-what-copilot-wrote.md` §2.8-§2.16 (CPB13-CPB42), measured on the
 * sessions of one fictional project. VS Code's transcript is not this contract's: it is recognised as neither (CP1a)
 * until CPD2 is decided.
 * v2 (2026-10-11): §2.17 (CPB43-CPB52) - the CLI's `1.0.95`, which it updated itself to mid-round, measured with the same
 * shapes; the line the runtime ends every `bash` result with (`results.ts`); a person's answer to a hook's question
 * (`refusals.ts`); `list_bash`, a tool with no measured meaning.
 * v3 (2026-10-12): §2.18 (CPB53-CPB57), read for the reader - how a `task` ran and what its result is, `read_agent` naming
 * its agent, a background agent's `system.notification`, a message's phase, how `rg` printed; agentwhy's own words after a
 * hook's opening (CPD12, `who-stopped-it` WS9); the `1.0.x` line the measured profile covers (CPD13).
 * v4 (2026-10-12): a call that ran and failed - `error.code` `failure` (CPB58), seen in the maintainer's test round of the
 * built reader; until then every `success: false` measured had been a refusal.
 * v5 (2026-10-12): `copilot-blocks-too` §2a - the search tool named `grep` as well as `rg`, `search_code_subagent`, and the
 * runtime's words for a hook that errored (CPB60, CPB61).
 * v6 (2026-10-12): `search_code_subagent` is a delegation, and its subagent's own tools - `read_file`, `grep_search`,
 * `file_search` - are read by their measured keys (CPB62).
 */
export const CONTRACT_VERSION = 6;

export const VERIFIED_AGAINST = {
  date: '2026-10-12',
  /** `copilotVersion` as `session.start` spells it: the CLI's, then the desktop app's runtime. */
  copilot: ['1.0.94', '1.0.94-3', '1.0.95'],
  files: 32,
  scope: 'session-records',
} as const;
