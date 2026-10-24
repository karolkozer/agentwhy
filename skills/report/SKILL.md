---
name: report
description: Open agentwhy's page for this conversation - the setup the first time, then what the AI read and whether a private file was reached. Use when the person types /agentwhy:report or asks what their AI read.
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" start *) Bash(npx @agentwhy/cli@0.5.0 start *)
---

!`node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" start --detach --session "${CLAUDE_SESSION_ID}" --setup-first --plugin --quiet`

The line above is agentwhy's answer: the address of a page served from this computer, or why none could be served.
Give the person the address as a link, in one sentence in their language: it opens agentwhy's page - its setup while
that is not finished, then this conversation's report. Do not say which of the two it opens now: the address decides
that each time it is opened. Do not open, read or summarise any file, and do not run anything else.

If the line above is still a command rather than an address, this skill reached you without running it. If you can run
shell commands here, run `npx @agentwhy/cli@0.5.0 start --detach --plugin --quiet` in this conversation's folder and
give the address it prints, as above. If you cannot run commands here, say in one sentence that agentwhy's page opens
from Claude Code: the desktop app's Code tab or a terminal.
