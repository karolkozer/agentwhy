// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/** Evidence and limits of the contract; support for one subject never grants support for another. */
export const ASSUMPTIONS = {
  recognition: {
    rule: 'The first line is session_meta with an object payload and string id.',
    measured: '70 of 70 files on 2026-09-29 (spec §2.7) and 7 of 7 terminal sessions (§2.8); recognition is independent of the filename.',
  },
  identity: {
    rule: 'Only the first metadata id owns the file. An id held by several files joins none.',
    measured: '68 unique owners and one duplicate id held by two files on 2026-09-29.',
  },
  project: {
    rule: 'Use the recorded cwd of session_meta and of every turn_context; several are ambiguous, missing data explicit.',
    measured: 'One distinct cwd per file in all 70 measured files; no general invariant is inferred.',
  },
  tree: {
    rule: 'Join recorded parent_thread_id only through unique owners; no timestamp or folder join.',
    measured: '25 child files found their parents in the 2026-09-29 corpus; missing parents and cycles remain unresolved.',
  },
  heldIn: {
    rule: 'Where a person held the conversation comes from the first line: source exec is a script whatever the originator, an object source is a thread another agent started and says nothing, and under source vscode the originator names the app - codex-tui the terminal, codex_vscode a code editor, Codex Desktop and codex_work_desktop the desktop app. Any other originator says nothing, never the nearest of these.',
    measured: 'CXB3 over 175 rollouts on 2026-10-02: every conversation a person held is source vscode (139), a scripted run exec (32, from both codex_exec and codex_vscode), a thread another started an object (32). What the extension writes inside Cursor is unmeasured, so editor is a code editor and never VS Code.',
  },
  history: {
    rule: 'Recognise paginated and legacy; preserve unknown modes as a gap.',
    measured: '65 paginated and 5 legacy files by first metadata on 2026-09-29; 7 paginated terminal sessions (§2.8). On 2026-10-07: 58 paginated of 0.160.0, 1 paginated and 2 legacy of 0.160.1 - the VS Code panel writes legacy again on 0.160.1 (§2.13).',
  },
  actions: {
    rule: 'One event per action item, by item.id; a command line only from [shell, -lc|-c, line]; parsed_cmd never read. Where a record holds no command or change item, each command a cell wrote out as text is one event (X23a).',
    measured: 'Item joins to turn and thread in every item (§2.3, §2.8). Refused attempts and failed image views leave no item (XB7, XB1), so the action stream is never whole. The VS Code panel records no command item at all; 230 of 230 commands in 224 cells without items were written out as text (§2.11). On 0.160.1 the panel\'s legacy files hold no item of any kind, 2 of 2 (§2.13); a refused command still leaves no item (1 of 1, 0.160.1 terminal).',
  },
  access: {
    rule: 'A status says a process ran, never what it reached: only a completed write, or one reader that exited 0, or a line of output naming the file.',
    measured: 'A failed cat records its diagnostic in stdout with exit 1 (§2.8); exit codes of other programs are not profiled.',
  },
  delivery: {
    rule: 'The model receives the cell output as a whole, joined to its cell by call_id and to no item; recorded execution output is not delivered by itself, and is the model\'s only where one cell return carries it whole and alone (§2.10).',
    measured: 'XB5 on 0.157.0: forwarded markers are in the cell output, withheld ones only in the item; outputs over 1 MiB are cut with a textual notice only. On 0.160.0 paginated, of 79 non-empty command outputs 15 reached a cell whole (13 of them uniquely), 36 left one long line, 11 a first token and 17 nothing.',
  },
  messages: {
    rule: 'Assistant response messages are canonical; AgentMessage items join them by id; task_complete joins the one final answer of its turn whose text it equals (76 of 76 on 2026-10-07, 33 in turns a hook\'s block gave two). A copy no id joins - a panel item, an editor\'s agent_message event - is the one assistant message of its file whose text it equals but for whitespace at the ends (XD9); equal to none or several, it stays open.',
    measured: 'XB10 on 0.157.0 paginated: 15 of 15 id joins, 6 of 6 completion copies, 2 identical texts under distinct ids. On 2026-10-07 (§2.13): 0.160.0 terminal and exec items 75 of 75 by id; the panel\'s items 7 by id, 75 by unique text, 4 ambiguous (0.160.0) and 22 of 22 by unique text (0.162.0-alpha.2); 0.160.1 legacy agent_message events 15 of 15 by unique text over 2 files. Legacy stays unmeasured.',
  },
  delegations: {
    rule: 'spawn_agent joins its agent through SubAgentActivity started by call_id; later words through interacted; reports by agent_path, a name.',
    measured: 'One delegation in each corpus (§2.4, §2.7): provisional, XB4 open.',
  },
  reviews: {
    rule: 'A guardian thread is a review of the parent turn its turns name by root_turn_id; its verdicts are JSON with outcome allow.',
    measured: '52 root-turn references all present (§2.7); 141 of 141 verdicts allow (§2.4). No refusal seen (XB1), no reviewer action (XB9).',
  },
  permissions: {
    rule: 'turn_context records approval, reviewer, sandbox and file-system scopes: recorded settings, not a policy and not a verdict.',
    measured: '469 turns (§2.5), 7 (§2.8). Every entry allows; a granular approval policy is not read.',
  },
  capabilities: {
    rule: 'Capabilities come from the measured matrix by build and history mode; a recognised header grants none.',
    measured: 'XB2, XB5, XB7, XB10 answered for 0.157.0 terminal paginated; XB5 and XB10 for 0.160.0 paginated (§2.10, §2.13: 58 files from the terminal, the panel and exec); XB1 in part; XB3, XB4, XB6, XB8, XB9 open. 0.160.1 and 0.162.0-alpha.2 are recognised and unmeasured.',
  },
} as const;
