// The format contract: the only code that knows the Claude Code transcript format, one subject per file in this
// directory. Everything here was measured against a real session (spec §4.0, tests/fixtures/oracle.json). When
// `agentwhy doctor` reports drift, follow .ai/skills/update-format-contract/SKILL.md instead of patching callers.

// v1 (2026-09-12): measured on a live Claude Code 2.1.268 session. v2 (2026-09-13): re-measured on a copy of it;
// `bridge-session` classified as skipped, `run_in_background` recorded as an optional Agent input key.
// v3 (2026-09-13): `role`, `subagent_type` and the subagent id recorded as structure rather than content, so the
// corpus keeps them and M1 can assert the file-id-to-agentId relation on it.
// v4 (2026-09-13): the two identifier fields the M1 join needs - a tool_use block's `id` and a tool_result
// block's `tool_use_id`, measured as present on 373 of 373 result lines.
// v5 (2026-09-14): `cwd`, the session working directory, recorded as a per-line field. It is the project root
// that the display paths of `specs/2026-09-14-path-display-and-share.md` are relative to, so where it comes from is
// contract knowledge rather than something a renderer works out.
// v6 (2026-09-15): the text block of an assistant line - what an agent writes - measured as 149 of 149 carrying a
// string `text`, never beside a tool_use; and a delegating call's result as a list of text blocks, 15 of 15 on the
// measured session. `specs/2026-09-15-what-came-back.md` R1 and R1b need both: a delegated agent's report is one of each.
// v7 (2026-09-15): the session title - `aiTitle` on the `ai-title` line - measured as a string on 82 of 82 such
// lines. `sessions` shows it, redacted, so that a person choosing a session can tell one from another.
// v8 (2026-09-15): the reasoning block of an assistant line - what an agent works out before it calls - measured
// as 249 of 249 carrying a string `thinking`, with the keys type, thinking and signature.
// `specs/2026-09-15-why-this-call.md` R1 needs it: the answer to "why this call" is written there, by the agent itself.
// v9 (2026-09-15): a report delivered late - a <task-notification> on a user line naming the delegating call by its
// tool-use-id, 6 of 6 on the measured session - and the payload status async_launched that makes a delegating result a
// launch notice, 6 of 15. `specs/2026-09-15-where-the-value-went.md` R1 and R5 need both: the motivating case's value
// came back on such a report, and was read from the notice. And which tools write a file, with the key of the text an edit takes
// out - Edit 45 of 45, Write 7 of 7 - so a value only in that text is not said to have been written (R7).
// v10 (2026-09-19): `SubagentHandback` - how a subagent hands its report back in auto mode from v2.1.271, as one
// call of its own whose input key `message` holds the words. Measured on a session of
// 2026-09-19: 2 calls, both on sidechain lines, one input key, a string of 200-999 characters. This closes the gap
// `.ai/specs/2026-09-16-when-an-agent-finishes.md` states as D9 and §6.1: until now a report delivered that way was
// read by nothing, so `what came back` measured the wrong text and a value that did reach the delegating agent was
// reported as never having left the one that read it.
// v11 (2026-09-23): `timestamp`, when a line was written, recorded as a per-line field for display only (the report page
// spec M4, Q1). Measured on three sessions of Claude Code 2.1.280: on every
// assistant, user, attachment, queue-operation, file-history-delta and system line of the main transcripts and every
// line of 2 subagent transcripts, always a string of ISO 8601 in UTC with milliseconds, all of which parse; absent on
// ai-title, atis-latch, last-prompt, cost-state and file-history-snapshot lines. 54 of 4020 consecutive pairs within
// one file run backwards in time - which is why it is shown and never used to order or join.
// v12 (2026-09-28): `entrypoint`, which way into Claude Code a session was started by, recorded with its three measured
// values (`entry-points.ts`); and `cwd` corrected - one session can carry more than one. Measured over the last megabyte
// of 244 transcripts (`.ai/specs/2026-09-27-which-project.md` VB5): `entrypoint` in all 244, one value each; `cwd` in all
// 244, a value matching the project directory's name in all 244, and more than one value in 14. The list of a person's
// projects reads both (V4, V9): the value that names the project is the matching one, never the last.
// v13 (2026-09-29): recognition by content (`recognition.ts`), so a Codex rollout is never read as a transcript
// (`.ai/specs/2026-09-27-what-codex-wrote.md` X2, XD7). Measured over the first lines of 257 main transcripts: a string
// `type` and a string `sessionId` equal to the file's name in all 257; a listed `type` in 193.
export const CONTRACT_VERSION = 13;

export const VERIFIED_AGAINST = {
  claudeCode: '2.1.268',
  session: '951c4f76-9d2a-40d2-9c76-1e57cf47ae4e',
  date: '2026-09-13',
} as const;
