// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * Evidence and limits of the contract, by subject (`.ai/specs/2026-10-05-what-copilot-wrote.md`); support for one
 * subject never grants support for another.
 */
export const ASSUMPTIONS = {
  recognition: {
    rule: 'The first line is session.start with data.producer copilot-agent, data.context and no data.vscodeVersion. A path, a folder name and an extension decide nothing.',
    measured: '17 of 17 runtime files and 8 of 8 VS Code transcripts on the measuring machine, 2026-10-09 (CP1, CP1a).',
  },
  identity: {
    rule: 'A session is its folder: events.jsonl and workspace.yaml under ~/.copilot/session-state/<id>.',
    measured: 'The folder name, session.start sessionId and workspace.yaml id were one value in 7 of 7 (§2.8). 4 of 32 folders held no events.jsonl and 2 files no user.message: no conversation (CP29).',
  },
  project: {
    rule: 'workspace.yaml cwd, which equals session.start context.cwd. A folder under ~/.copilot/chats/<day>/ is a chat, no project.',
    measured: 'cwd agreed in 7 of 7 (§2.8); 4 of 4 chats under ~/.copilot/chats/<YYYY-MM-DD>/ (CPB40). Other systems unmeasured (CPO5).',
  },
  title: {
    rule: 'workspace.yaml name; an empty name is no title. user_named says nothing of who named it.',
    measured: '8 of 8 titles equal to what the desktop app and the CLI show (CPB35).',
  },
  heldIn: {
    rule: 'client_name github/cli is the terminal and github/autopilot the desktop app; any other says nothing.',
    measured: 'Every runtime session of 2026-10-09 had one of the two (§2.8).',
  },
  calls: {
    rule: 'A call is its tool.execution_start, joined to its request and completion by toolCallId. A tool outside TOOLS is a typed unknown action.',
    measured: '28 of 28 starts joined to request and completion, arguments equal (§2.13 corpus). Each bash call has a shell of its own: a cd does not carry over (CPB46).',
  },
  results: {
    rule: 'result.content is what the call returned; for bash, less the runtime\'s <shellId: …> last line. A content opening with the spill notice is a preview, the rest a gap. view\'s detailedContent is a diff the interface draws. A hook input copy is never a second exposure.',
    measured: '19 of 19 successful calls held result.content (CPB15); a 33.7 kB output became an 889-character notice and preview (CPB26); a postToolUse copy was result.content or the elision notice, 35 of 35 (CPB42); the shell line ended 12 of 12 bash results (CPB47); view gave plain text and a diff, 16 of 16 (CPB48).',
  },
  refusals: {
    rule: 'error.code denied with the rule opening is a rule; with the check opening, agentwhy only where its own words follow (CPD12), else no source; a permission.completed cancelled on a call with no completion is a person. Any other opening is an unknown source.',
    measured: 'A check 5 times and a rule once (CPB18); a reason after the check opening 7 of 7 (CPB44); a person once, ending the turn (CPB34), and a person approving a hook\'s question once (CPB45).',
  },
  delegations: {
    rule: 'subagent.started.data.toolCallId names the task call; the subagent calls by top-level agentId and parentToolCallId; a sync task returns its work, a background one a launch notice, and read_agent the work of the agent its agent_id names.',
    measured: '3 of 3 starts and 17 of 17 calls joined, two subagents at once once (CPB17, CPB39); sync 2 and background 2, read_agent naming its agent 2 of 2 (CPB53, CPB54). A subagent of a subagent is unmeasured.',
  },
  forks: {
    rule: 'A line id two files hold is one record, read in the parent - the file whose workspace.yaml fork_count counts a fork.',
    measured: 'One CLI fork copied 62 lines of its parent with their ids (CPB36). No desktop fork.',
  },
  messages: {
    rule: 'user.message content is the person, or on a subagent\'s record its prompt; assistant.message content the agent, its phase the channel; system.message, system.notification and a compaction summary context. Reasoning is never a reason.',
    measured: 'transformedContent longer than content 44 of 44 (§2.16); reasoning encrypted, readable on some messages (CPO4).',
  },
  capabilities: {
    rule: 'Capabilities come from the measured profile of a build, which every 1.0.x build takes until its file holds a record type or a record-level key the contract does not know; a recognised header grants none.',
    measured: '1.0.94 and 1.0.95 (CLI) and 1.0.94-3 (desktop app), 2026-10-09 and 2026-10-11. The CLI updates itself (CPB52), hence CPD13.',
  },
} as const;
