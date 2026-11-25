---
name: why
description: Say in this chat what agentwhy saw in this conversation - what was stopped, which private files were read and by which AI, and the task each helper was given. Use when the person types /agentwhy:why.
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" why --plugin)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" why --plugin steps)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" why --plugin folders)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" why --plugin table)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" why --plugin diagram)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" why --plugin card)
---

!`node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" why --plugin`

The block above is agentwhy's answer about this conversation, written by agentwhy from its own records. The person sees
it only as you show it. Show it exactly as printed, as Markdown and not inside a code block, so that its table and its
diagram draw. Do not shorten, summarise, reorder or add to it.

Words the person added after the command: <<$ARGUMENTS>>

If there are no such words, show the answer and add nothing about them. If they are exactly one of `steps`, `folders`,
`table`, `diagram` or `card`, run this command with that word in place of WORD, and show its answer the same way instead
of the first:
`node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" why --plugin WORD`
If they are any other words, show the first answer, run nothing, and say once which words can be added after
`/agentwhy:why`.

Then answer the person's questions about this conversation from agentwhy's answers alone. Where they do not say, say
that agentwhy's record does not say. Never call a file safe, clean or untouched where agentwhy's answer says it is not
known or could not be checked. When the person asks a question after this, answer it; do not list the words again. Do
not open or read any file to answer, and do not run anything but the commands above. A question about another conversation,
the project or this computer is answered by agentwhy's own `what_happened` tool, where you have it.

If the line at the top is still a command rather than an answer, this skill reached you without running it: say in one
sentence that agentwhy's answer could not be read here, and that `/agentwhy:report` opens agentwhy's page.
