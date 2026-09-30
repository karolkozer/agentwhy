export type AssumptionStatus = 'verified' | 'unverified';

export interface Assumption {
  readonly id: string;
  readonly statement: string;
  readonly status: AssumptionStatus;
  readonly evidence: string;
}

// `verified` means checked across every instance in the measured session, not a sample of them. The measured session
// is the Claude Code 2.1.268 session that the corpus, tests/fixtures/redacted/, is a redacted copy of.
export const ASSUMPTIONS: readonly Assumption[] = [
  {
    id: 'main-transcript-path',
    statement: 'The main transcript of a session is <project>/<session-id>.jsonl.',
    status: 'verified',
    evidence: 'spec §4.0; every session inspected on 2026-09-12',
  },
  {
    id: 'session-directory',
    statement:
      'Subagent files and spilled results live under <project>/<session-id>/; a session with neither has no such directory.',
    status: 'verified',
    evidence: 'spec §4.0; present for the session with subagents, absent for the sessions without',
  },
  {
    id: 'subagent-file-pair',
    statement: 'Each subagent has agent-<id>.jsonl and agent-<id>.meta.json in subagents/, sharing <id>.',
    status: 'verified',
    evidence: '15 of 15 pairs in the measured session',
  },
  {
    id: 'spilled-tool-results',
    statement: 'Large tool results are spilled to <project>/<session-id>/tool-results/<id>.txt.',
    status: 'verified',
    evidence: '2 of 2 files in the measured session',
  },
  {
    id: 'tool-result-reference',
    statement:
      'A spilled result is referenced from a tool result — the toolUseResult field or a tool_result content block — through a tool-results/<id>.txt path.',
    status: 'verified',
    evidence:
      'doctor counts references in result positions only: 2 referenced and 0 missing against the 2 spilled files, before redaction and in the corpus alike (2026-09-13)',
  },
  {
    id: 'tool-result-reference-converse',
    statement:
      'The converse does NOT hold: not every tool-results/<id>.txt path inside a result is a spill reference. A result that merely quotes one - grep output, say - reads as a reference to a file that is missing.',
    status: 'unverified',
    evidence:
      'no instance either way in the measured session; raised by the M1 review (2026-09-13). The error runs toward UNKNOWN, which is the safe direction, and M2 measures how often it fires before anything is tightened',
  },
  {
    id: 'tool-result-block',
    statement: 'A tool result sits in a message content block of type tool_result that carries tool_use_id and content.',
    status: 'verified',
    evidence:
      '373 of 373 result lines of the corpus carry one (208 main, 165 subagent), and every tool_use_id in them joins to a call (2026-09-13)',
  },
  {
    id: 'assistant-text-block',
    statement:
      'What an agent writes sits in a message content block of type text, carrying the words under text, on an assistant line that holds no tool_use block.',
    status: 'verified',
    evidence:
      '149 of 149 assistant text blocks in the corpus carry a string text field - 129 main, 20 subagent - and none shares its line with a tool_use. User lines carry text blocks as well, 69 on 55 main lines, and are not an agent\'s words (2026-09-15)',
  },
  {
    id: 'assistant-reasoning-block',
    statement:
      'What an agent works out before it calls sits in a message content block of type thinking, carrying the words under thinking, one block to a line, beside a signature.',
    status: 'verified',
    evidence:
      '249 of 249 reasoning blocks in the corpus carry a string thinking field, one to a line, with the keys type, thinking and signature. In an unredacted session the block sits on the line immediately before a call in 276 of 276 calls that have any words before them, and one block precedes a run of up to four calls. **The field may be empty**: in the measured session before redaction, all 249 of its reasoning blocks are - 160 main, 89 subagent - while its text blocks carry words. The committed corpus cannot show that, since redaction replaces content with a marker (2026-09-15)',
  },
  {
    id: 'delegating-result-text-blocks',
    statement:
      'The result of a delegating call is a list of text blocks, and nothing else: its words are the text of those blocks.',
    status: 'verified',
    evidence:
      '15 of 15 delegating results in the measured session, counted before redaction, none holding a block of another type (2026-09-15). The committed corpus cannot show it: the block type inside a result is replaced by a marker there',
  },
  {
    id: 'delivered-task-notification',
    statement:
      'An agent started in the background reports on a user line of its own that holds no tool_result: its words carry a <task-notification> whose tool-use-id tag is the id of the delegating call. A queue-operation line queues the same words first, and is not the delivery.',
    status: 'verified',
    evidence:
      '6 of 6 task notifications in the measured session were queued by a queue-operation line and delivered on a user line, as a string; tool-use-id equals a delegating call id on 6 of 6, and task-id that call\'s agent on 6 of 6, counted before redaction (2026-09-15). The committed corpus cannot show it: the words are replaced by a marker there',
  },
  {
    id: 'file-writing-input',
    statement:
      'Edit carries file_path, old_string, new_string and replace_all, and old_string is the text it takes out; Write carries file_path and content. NotebookEdit and MultiEdit are not profiled as writing a file.',
    status: 'verified',
    evidence:
      '45 of 45 Edit calls and 7 of 7 Write calls in the corpus carry exactly those keys (2026-09-15). No NotebookEdit or MultiEdit call occurs there, so their inputs are unmeasured and a value in them is counted as a use in another call',
  },
  {
    id: 'launch-notice-status',
    statement:
      'A delegating result whose payload status is async_launched is a launch notice - the agent was started, and its report is not in the result. A result whose status is completed carries the report.',
    status: 'verified',
    evidence:
      '6 of 15 delegating results in the measured session carry status async_launched and an isAsync key, and no content, and a report was delivered for each; the other 9 carry status completed and content, counted before redaction (2026-09-15). None of the 15 calls sets run_in_background to true, so what was asked does not say which',
  },
  {
    id: 'result-join-field',
    statement:
      'The tool_use_id of the tool_result block is the join from a result to its call. toolUseResult is the payload, not a join: it is on 208 of 208 main result lines but only 10 of 165 subagent ones.',
    status: 'verified',
    evidence: '373 of 373 result lines join by it; measured on the corpus (2026-09-13). Corrects spec §4.3 rule 1',
  },
  {
    id: 'one-call-per-assistant-line',
    statement:
      'An assistant line carries exactly one tool_use block, which is what makes sourceToolAssistantUUID unambiguous as a call reference.',
    status: 'unverified',
    evidence:
      'true for all 373 assistant lines of the measured session (2026-09-13), but it is a property of this session, not of the format: nothing forbids two calls on one line. The model joins by tool_use_id and never relies on this',
  },
  {
    id: 'line-types',
    statement: 'Every parsable line has a type among 11 known values; only user and assistant carry the conversation.',
    status: 'verified',
    evidence:
      'all 1571 main-session and 711 subagent lines (2026-09-12, 10 types); all 1573 main-session and 711 subagent lines a day later (2026-09-13), where bridge-session is the eleventh',
  },
  {
    id: 'bridge-session-line',
    statement:
      'A bridge-session line carries only bridgeSessionId, lastSequenceNum, ownerAccountUuid, ownerOrganizationUuid, sessionId and type; with no message it carries no conversation and is skipped.',
    status: 'verified',
    evidence:
      '1 of 1 line in the measured session (2026-09-13); keys measured by doctor per unknown line type before classifying. It has no version, uuid or isSidechain key',
  },
  {
    id: 'history-suppression-and-mode-lines',
    statement: 'history-suppression and mode lines are not classified; doctor reports them as unknown line types.',
    status: 'unverified',
    evidence:
      'seen only in another session (Claude Code 2.1.268-2.1.270, 2026-09-13), absent from the measured one; classify after doctor measures their keys on a session that has them',
  },
  {
    id: 'version-per-line',
    statement: 'The Claude Code version belongs to each line, not to the file, and not every line type carries it.',
    status: 'verified',
    evidence:
      'another session spans 2.1.268, 2.1.269 and 2.1.270 (2026-09-13); in the measured session 1142 main-session lines carry version and 431 do not, bridge-session among them',
  },
  {
    id: 'working-directory-per-line',
    statement:
      'The session working directory is carried by cwd on the lines that hold the conversation, not by every line. One session can carry more than one value; the one that names the project is the value matching the project directory\'s name.',
    status: 'verified',
    evidence:
      'presence measured before redaction (2026-09-14): 1142 of 1573 main-session lines and 711 of 711 subagent lines, the same lines that carry version, gitBranch and userType. The committed corpus cannot measure the values: it was redacted before the redactor aliased working directories, so all 1853 of its cwd values are one flattened marker and doctor reports distinct 1 as an artefact of the fixture. Corrected 2026-09-28 (contract v12, which-project VB5): over the last megabyte of 244 real transcripts, cwd is in every one and a value matching the project directory\'s name is in every one, and 14 carry more than one value - so "one session carries one value", stated here until then, is false. Corrects 2026-09-13-agentwhy-plan.md §5 item 3, which recorded cwd as present on every line',
  },
  {
    id: 'entry-point-per-session',
    statement:
      'The lines that hold a conversation carry entrypoint, which way into Claude Code the session was started by, and one session carries one value: cli, claude-vscode or sdk-cli. Any other value is unknown, never the nearest of these.',
    status: 'verified',
    evidence:
      'which-project VB5 (2026-09-28): the last megabyte of each of 244 transcripts carries it - claude-vscode 180, cli 62, sdk-cli 2 - and no transcript, tail or whole, carries two values. The same values the hooks are given as CLAUDE_CODE_ENTRYPOINT (the-agent-tells-you B9e2). The committed corpus holds a canary marker in its place, which reads as unknown',
  },
  {
    id: 'sidechain-discriminator',
    statement: 'isSidechain is false on main-session lines and true on subagent lines, wherever it is present.',
    status: 'verified',
    evidence: '1142 of 1142 and 711 of 711 lines (2026-09-12); the same a day later (2026-09-13)',
  },
  {
    id: 'denial-marker',
    statement:
      'A blocked call is marked by toolDenialKind on its result line; the only observed value is permission-rule.',
    status: 'verified',
    evidence: '5 of 5 denials',
  },
  {
    id: 'meta-keys',
    statement:
      'Each meta.json carries agentType, description, toolUseId, spawnDepth, requestShape and requestNonInteractive.',
    status: 'verified',
    evidence: '15 of 15 files',
  },
  {
    id: 'agent-tool-input',
    statement:
      'The Agent tool_use input carries description, prompt and subagent_type on every call, and optionally run_in_background.',
    status: 'verified',
    evidence:
      'reconnaissance inspected 6 of 15 calls (2026-09-12); doctor, before redaction, counted the three keys on 15 of 15 calls and run_in_background on 9 (2026-09-13)',
  },
  {
    id: 'delegation-join',
    statement:
      'Where a subagent was started by the Agent tool, meta.json toolUseId equals that call id. It is NOT universal: a subagent started another way has no toolUseId at all.',
    status: 'verified',
    evidence:
      '15 of 15 meta files join to one of the 15 Agent calls (2026-09-13). But another session has 3 subagents of type general-purpose, spawned through the Skill tool, whose meta files carry agentType and spawnDepth and no toolUseId, and whose main transcript holds no Agent call at all (2026-09-14)',
  },
  {
    id: 'delegation-routes',
    statement:
      'An agent can be delegated to by routes other than the Agent tool - a Skill spawns one - and only the Agent route records which call started it.',
    status: 'verified',
    evidence:
      '3 of 3 subagents of a session that delegated through a Skill (2026-09-14). The consequence is that a count of Agent calls is not a count of delegations: an agent whose start is unrecorded must be reported as such, never left out',
  },
  {
    id: 'file-id-matches-line-agent-id',
    statement: 'The <id> in a subagent file name equals the agentId field on the lines inside that file.',
    status: 'verified',
    evidence:
      '15 of 15 transcripts carry exactly one agentId and it equals the file id; no line lacks it (2026-09-13, measured on the corpus, which keeps agentId since contract v3)',
  },
  {
    id: 'session-title-shape',
    statement: 'An ai-title line is {type, aiTitle, sessionId}, and aiTitle is a string.',
    status: 'verified',
    evidence: '82 of 82 ai-title lines in the corpus (2026-09-15)',
  },
  {
    id: 'handback-shape',
    statement:
      'A subagent may deliver its report as a SubagentHandback call on its own transcript, whose input is {message: string}. The call names no delegation; the report answers the call that started the agent whose transcript it is on.',
    status: 'verified',
    evidence:
      '2 of 2 SubagentHandback calls in a later session, both on sidechain lines, each with the single input key message holding a string (2026-09-19). The measured session predates the tool and has none, so both shapes are carried: a report delivered as a task-notification and one handed back through a call',
  },
  {
    id: 'line-timestamp',
    statement:
      'The lines that hold a conversation carry timestamp, when the line was written, as a string of ISO 8601 in UTC with milliseconds. Time does not follow the record: a line can be earlier than the one before it.',
    status: 'verified',
    evidence:
      'three sessions of Claude Code 2.1.280 (2026-09-23): 1826 of 1826, 596 of 596 and 1598 of 1598 lines of the types that carry it, main and subagent alike, all matching the shape and all parsing; 23 of 1825, 14 of 595 and 17 of 1600 consecutive pairs run backwards. Read for display only (the report page spec M4); a line without it, or with a value that does not parse, has no time - never a guessed one',
  },
  {
    id: 'hook-input-cwd',
    statement: 'Every hook input carries cwd, the directory the session is running in.',
    status: 'verified',
    evidence:
      '5 of 5 Stop inputs (2026-09-17, the-agent-nobody-watches B8b) and every SubagentStop input of B4 (2026-09-16). Read by `watch` to decide which project a person\'s notification choices were made for, before any of the session has been read',
  },
  {
    id: 'session-title-latest-near-end',
    statement:
      'The title a session has now is its last ai-title line, and that line lies within the last megabyte of the transcript.',
    status: 'unverified',
    evidence:
      'In the corpus the last ai-title line ends 17 KB before the end of the file and no two are more than 30 KB apart (2026-09-15). Redaction changes the length of content, so the distances are indicative, and marker values cannot show whether a later title differs from an earlier one. A session that breaks this shows no title, never a wrong one',
  },
  {
    id: 'recognition-by-first-line',
    statement:
      "A main transcript's first non-blank line is a JSON object with a string `type` and a string `sessionId` equal to the file's name, and no `payload`.",
    status: 'verified',
    evidence:
      '257 of 257 main transcripts (2026-09-29, contract v13), counted as fixed labels only. The type was a listed one in 193; so recognition rests on the id, and accepts a listed type without one for the hand-built fixtures. Tells a transcript from a Codex rollout (`2026-09-27-what-codex-wrote.md` X2)',
  },
];
