# Reference

Everything the [README](../README.md) leaves out: the commands, the flags, what the report shows, and the
limits of what this tool can tell you.

## Commands

```bash
npx @agentwhy/cli                                # every session on one page, the same as `start`
npx @agentwhy/cli menu                           # a list of the few things to do here; pick one, it runs
npx @agentwhy/cli check                          # what to act on in the last 7 days of sessions
npx @agentwhy/cli start                          # every session on one page, with a report for each
npx @agentwhy/cli report --open                  # the newest session, in the browser
npx @agentwhy/cli report --input <session-dir>   # one session, on stdout; a Codex session file or folder too
npx @agentwhy/cli report --input <id> --open --quiet  # open one session's report, saying only where it is
npx @agentwhy/cli doctor --input <session-dir>   # the record's structure, never its content
npx @agentwhy/cli init                           # set this project up, or undo it
npx @agentwhy/cli init --update                  # move this project's hooks to this version
npx @agentwhy/cli protect <path>                 # keep a place from your AI in every project on this computer
npx @agentwhy/cli notify                         # what you are told when a turn ends, and when
```

With no command and no terminal — a script, a pipe, CI — `agentwhy` opens and serves nothing: it is a usage
error, `agentwhy: missing command` and exit code 2. A flag with no command in front of it is an unknown command
there; a script that means `start` says `agentwhy start`. `menu` needs a terminal too, and ends with exit code 2
without one.

### `check`

Reads every Claude Code session of the project and prints what to act on, worst first. Codex and Copilot conversations
are on the page `start` opens, not here:

- **Rotate** — a value from these files was in an agent's context, so it went to the model provider and it is
  kept in the session records. Rotating it is the only step that undoes that.
- **Open routes** — protected paths an agent reached and nothing refused, with the route (`Read`,
  `Bash (cat)`) and the rule that would have closed it.
- **Seen only in results** — files that appeared in what a search printed. No rule on a tool call covers this.
- **Refused** — how often your deny rules held. A refused `Read` raises no hook event, so only the session
  records show these.

`check` exits 0 whatever it finds. With `--fail-on`, it exits 1 when its answer asks you to act, so a pre-commit hook
or a script can stop on it: `--fail-on rotate` on a value from a private file in an agent's context (a ROTATE or CHECK
line), `--fail-on any` on every line and on a key's shape a result carried. Either way a session in the range that
could not be read fails it too, since nothing can be said of it, and a file you marked with `--mark` does not. The last
line says why it failed. A project with no session in the range exits 0.
Like the rest of `check`, it reads Claude Code's sessions alone, so a Codex or Copilot conversation never fails it.

A mark is your own word that you dealt with a file, so `check --mark` and `check --unmark` mark nothing when your AI
runs them rather than you typing them in a terminal: an AI whose commit the hook stopped cannot pass it by marking the
file itself. It is told by the variable Claude Code, Codex or GitHub Copilot sets for the commands it runs, with no
terminal on its input; in your own terminal, on agentwhy's page and in a script, marking works as before. The hook is a
check for you, not a wall against an AI set on getting round it: `git commit --no-verify` skips any pre-commit hook.

As a Git pre-commit hook, run once in the project:

```bash
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/sh
exec npx @agentwhy/cli check --fail-on rotate
EOF
chmod +x .git/hooks/pre-commit
```

### `init`

At a terminal it asks who the setup is for, what agentwhy should do here, and what else to protect. Then it
shows the exact JSON it will add and asks before writing. It writes to `.claude/settings.local.json` — yours,
and out of the repository — unless you say the change is for everyone. The shared `.claude/settings.json` is
only read. On a computer that uses Codex (`~/.codex` exists) it also writes `refuse` and a turn-end message hook into
your own `~/.codex/hooks.json`, and approves those entries — its own and nothing else, never a folder's trust — in
`~/.codex/config.toml`, asking for that apart. Codex skips an unapproved hook without a word, and in VS Code the first
conversation starts before anything can be approved (measured on Codex 0.159), so without this a new project's first
conversation could read the blocked files; with it, Codex blocks from the first message, in the terminal and in VS
Code. Before writing, `init` runs both commands once the way Codex runs a hook, and writes nothing if either fails.
The check reads the rules of the project each command runs in, and does nothing in a project whose rules block no
files. A blocked command is explained in Codex's reply in the terminal or code editor. agentwhy's old entries in a
project's `.codex/hooks.json` are taken out on the next write. `init --remove` keeps the computer-wide check, since
other projects may block files with it; `init --remove --codex` takes it and its approvals out.

| Flag | What it does |
|---|---|
| `--watch` | tells you when an agent wrote a value from a protected file into its own messages. It runs twice: when the agent finishes, to find it, and when your turn ends, to say it — one line in the conversation itself, in any interface. `--notify terminal,os` asks for the pop-up and the system notification instead, which arrive the moment the agent finishes. No channel reaches the model, and none names a path or a value. Ticked by default |
| `--refuse` | runs before every shell command and refuses one whose text names a protected path — `cat .env`. Measured once: Claude Code blocked the command before it ran, and the agent asked the user instead of working around it. It also refuses `cat .env.example` |
| `--protect <pattern>` | a path or pattern to protect, written as `Read(...)` and `Edit(...)` deny rules, so one answer covers both what Claude Code refuses and what agentwhy reads. Repeat for several |
| `--shared` | write to `.claude/settings.json`, which is committed, so the hooks run for everyone who clones |
| `--remove` | undo it. At a terminal it asks what to take out — each hook, and each deny rule by the path it protects — and removes only what is ticked. With `--watch` or `--refuse`, only that hook; deny rules then stay |
| `--unprotect <path>` | with `--remove`, off a terminal: a protected path to take the deny rules of. A rule is never removed unless it is named or ticked |
| `--codex` | alone: write and approve Codex's check, to match the `refuse` Claude Code already runs here. With `--remove`: take agentwhy's entries and their approvals out of `~/.codex` too |
| `--codex-card` | alone: name agentwhy's card server in `~/.codex/config.toml`, so Codex's desktop app shows agentwhy's answers as a card. `init --codex` names it and brings it where Codex is set up for the first time. With `--remove`: take it out. An entry named agentwhy that you added yourself is left alone |
| `--yes` | write without asking, and without asking anything else either |
| `--update` | pin the hooks that run an older release through `npx` to this version, and change nothing else. It takes no other flag but `--yes` |
| `--command <cmd>` | how the hooks run agentwhy. Default: the way the hooks already in the project run it, else the way you ran `init` - `agentwhy` where that is the `agentwhy` on `PATH`, `npx @agentwhy/cli@<this version>` otherwise, pinned so that nothing updates until `--update` (unpinned where the running agentwhy is not a release). Give the same `--command` to `--remove` |

Without rules of your own, the hooks use the built-in default: `.env*`, `*.env`, `.npmrc`, `secrets/`,
`.ssh/`, `id_rsa*`. A hook runs agentwhy the way you ran `init`, or the Settings page: through `npx` it is
`npx @agentwhy/cli`, which resolves the package on every call; installed (`npm install --global @agentwhy/cli`), it
is `agentwhy`, which is faster.

Writing deny rules moves the hooks to your local settings file and copies the shared file's file rules into
it, so nothing stops being protected. `init` says so before it writes.

Both of `watch`'s hooks run the same command line: it reads from the hook input which event it was. Measured, on
Claude Code v2.1.236: a message returned when an agent finishes is discarded, and the same message returned when the
turn ends is shown under the reply — and is not in the model's context either way.

The line looks like this:

```
  └ Stop says: agentwhy · ROTATE: a value from a protected file is in this conversation. 1 file reached.
```

`Stop says:` is how Claude Code labels a line written by a hook that runs when the agent stops; the rest is
agentwhy's. Here it means: a key from a protected file went into this chat, so change that key.

Through `npx`, the hooks are pinned to the version you ran, so agentwhy never updates by itself. When you open a
newer agentwhy, its pages offer to update this project's hooks; `npx @agentwhy/cli init --update` does the same in a
terminal.

### `notify`

What you are told when a turn ends. Run with nothing, it says what is set and which answer is doing the
deciding; with a choice, it writes it and the next turn uses it — no session restarted, and no settings file
touched.

| Flag | What it sets |
|---|---|
| `--on value \| reached \| refused` | which findings are said. `value` is a value from a protected file in the conversation; `reached` adds a protected file opened with no value found; `refused` adds an attempt a rule stopped, which asks for nothing and says a rule held |
| `--clean off \| once \| every-turn` | when a turn that found nothing says so. `once` is the default: the first quiet turn says the session is being watched, which is what silence cannot say. A quiet turn of a session that was not quiet says both, so a clean turn never reads as a clean session |
| `--say agent \| line` | how a value in the conversation is said. `agent`, the default: the turn is kept open and your own agent says it and offers to open the report, with the line beside it. Only in the terminal and the editor extension, never in `claude -p`. `line`: the grey line alone |
| `--notify chat,terminal,os` | where a notice is shown |
| `--everywhere` | your answer for every project, instead of this one |
| `--reset` | take this project's answers out, or with `--everywhere`, yours |

The answers are read in this order: a flag written into a hook's command line, then this project's answer, then
yours, then agentwhy's own. They are kept in `~/.agentwhy/notices.json` — outside every project, so nothing about
how you want to be told is ever written into a repository. The file holds the directories of projects you gave an
answer for, and nothing else: no path inside a project, no value, no session.

### `protect`

Your SSH keys or a cloud login are in no project folder. `npx @agentwhy/cli protect "~/.ssh/**"` - or the page, run
from your home folder - keeps that place from your AI wherever it works: Claude Code's own file tools, and the shell
commands agentwhy checks. It writes deny rules into your own `~/.claude/settings.json`, shows exactly what it will write
and asks first. The rule names the place, not just a name: a name alone, such as `"*.pem"`, is a project's rule, which
`init --protect` writes. `protect --list` shows what this computer protects today. Measured on a Mac, in Claude Code's
terminal; VS Code, the desktop apps and Windows are not measured yet.

## Which project it looks at

agentwhy looks at one project at a time: the folder you run it in. Run it in your project's folder — the one you open
in your code editor. The first page it opens for a project asks which project it is for, and names it on every page
after. Started in your home folder, it only asks which project you mean: it never changes settings there, because
Claude Code reads the settings in your home folder in every project.

It reads the conversations Claude Code keeps on this computer - from the terminal, from your code editor and from the
Claude desktop app - the ones Codex keeps in `~/.codex/sessions`, and GitHub Copilot's, in one list where each row names
its AI. A Claude desktop app conversation takes its title from the app's own record, measured on macOS; where the app
keeps that on Windows is not measured yet. It does not see Cursor's own AI or chats on claude.ai. A Codex home moved
elsewhere with `CODEX_HOME` has not been checked yet.
Codex's own conversation name is used where it has one. For measured `codex exec` records without that name, the first
prompt after its environment context identifies the row and its report; it is redacted before being shown.

It blocks files in Claude Code and Codex, and in GitHub Copilot once you turn it on ([Blocking](#blocking)). In Codex
the block is `refuse`, run as a Codex hook from your own `~/.codex/hooks.json` with
the rules of the project each command runs in, and approved there by agentwhy itself (measured on Codex 0.159), so it
holds from the first message, in the terminal and in VS Code. Its companion Stop hook asks
Codex to explain agentwhy's block in its reply and never to request the file or secret value in chat. It checks only
refusals from the turn that just ended. `check` remains Claude Code's.
Codex's record does not write down every step the AI took, so a Codex conversation can still be marked *Couldn't check
fully* rather than *Nothing to fix*, and its report says what the record leaves out. The row still says when its record
names a private file. A prompt to locate a key says what was asked, not whether the AI read the key's value.
[What a report tells you](#what-a-report-tells-you) lists what a Codex report can and cannot tell you, and the Codex
versions measured.

The project card in the sidebar lists your other projects and shows the one you choose in the same tab. **Choose a
folder…** opens your computer's own folder window — on macOS; the Windows version has not been tried on Windows yet.
To list your projects, agentwhy reads the end of each one's newest conversation on this computer, to learn where its
folder is and when it was last used. The title it finds there goes through the same redaction as every other title,
and the list does not show it. Nothing leaves your computer, and a page made to be shared lists no projects.

## The report

The page answers first — *2 agents saw what is inside sensitive files* — and then draws the session: who was
asked for what, what each agent reached, and which files several agents converged on. Click an agent, a file
or a row and the answer for it appears beside the graph, with what to do, and a step-by-step account behind
one button. Outcome filters count the agents behind each one, every finding keeps a durable `#event-N`
anchor, and one step takes you back where you came from.

It is a single file. It works offline, it makes no network request of any kind, and it still reads top to
bottom with JavaScript disabled. It is written in English, and a selector switches it to Polish or German;
what the record holds — paths, task descriptions, evidence — is quoted exactly as it was written, in any
language.

**A secret value is never in the report.** Values are replaced before the page is written, and the report
says where a value appeared, never what it was.

**Which model each AI ran on.** Claude Code writes down the model behind every reply, a helper's too. The report shows
it beside each AI, as recorded, not as the AI describes itself. A helper that changed model partway shows both:

```
Helper 1   claude-fable-5-1 → claude-opus-5-5
           The model changed while it worked.
Helper 2   claude-sonnet-5-5
```

For Claude Code conversations; Codex and Copilot not yet.

**Tried again after a stop.** In **Step by step**, under the first step where a rule stopped an AI from opening a file,
one line says how many more times the same AI tried that file and how those tries ended: stopped every time, or, where
one was not, what the furthest of them did with the file - or that the record can't tell. Each later try says how many times the AI had been stopped from that file before. The lines count what
the record holds; they never say what the AI meant. A helper's tries are counted in its own steps.

The same session, on the terminal:

```
 !  2 files this policy protects were reached, 1 of them without any call ever naming it, and 1
    further attempt was refused. An agent's answer carried a value from one of them back to the
    agent that started it. The same value was also written into a file that is not protected.

▍Who ran, and what they reached

  the session itself    4 actions  1 file reached             wrote the value into files
  └─ Agent 1 · Explore  2 actions  1 file reached  1 refused  gave the value back
```

## The pages, in pictures

The [README](../README.md#what-you-see) shows the Conversations page, one file's story and Step by step. The rest of a
report, on the same demo project:

**Your to-do list.** One conversation, opened: the private file your AI read, and a **Fix it** button that walks you
through making it safe.

![The to-do list of one conversation: a private .env file was opened, with a Fix it button](screenshots/to-do-list.png)

**The full record.** One file's story again, as one line for every time the file was opened:

![What happened to this file, as the full record: a table of each event with its time, tool and result](screenshots/what-happened-full-record.png)

**Files.** Everything your AI opened, with the private files on top and whether each one is blocked or tracked.

![The Files page: four files opened, one of them private](screenshots/files.png)

**How it went.** The helpers your AI brought in, and which of them saw your private files. It opens on **Step by
step**: everything your AI did in the conversation, in the order it did it. **By folder**, **Diagram** and **List**
show the same work by place, as a picture, and by AI.

![The How it went page: your AI gave work to one helper, which read the .env file](screenshots/helpers.png)

## Opening the page again

Write `open agentwhy` as a whole message in Claude Code or Codex - in Polish `otwórz agentwhy`, in German
`öffne agentwhy`. agentwhy opens the page in your browser and your AI gives you its address: your project's
conversations, or the setup while it isn't finished. `open agentwhy report` opens this conversation's report. Outside a
project you set up, it opens the page for everything on this computer. A longer message goes to your AI as it is, even
if it names agentwhy.

The hook that checks your message for keys does it, so it needs alerts on, and a setup by this release or a later one:
an older one is updated from the notice on the page, and where the hook is missing, Settings, under **Alerts**, offers to
add it. It does not work in GitHub Copilot, or in a conversation a script started. Anywhere, `npx @agentwhy/cli` in a
terminal, in your project, opens the page.

## Asking in your own words

With the [Claude Code plugin](#the-claude-code-plugin), your AI can answer questions about agentwhy from agentwhy's own
records. Ask as you would ask a person, in any language:

| Ask, for example | You get |
|---|---|
| Is everything okay? Did anything leak? | how many conversations have something to do, how many only met a block, and how many couldn't be checked fully |
| Which conversations did I have? Which had something to fix? Which read files I track? | those conversations by day, each with its time, where it was held, what happened to private files and how many |
| How many times did you want to open which file? | each private or tracked file: how often it was read, stopped, or only seen by name |
| What did you do here? What were the steps? Which files? What did your helpers do? What should I do? | this conversation, or one from the list |
| Show me the report | agentwhy's page, opened only when you ask for it |

It answers about your project; say *on my whole computer* for everything. In the Claude desktop app's Code tab the answer is
a card you can press, and in Claude Code's terminal it is drawn as a card too (measured on Claude Code 2.1.330 and 2.1.308);
anywhere else it is the same answer in words. The first answer after a while waits until
your conversations are read - about half a minute for a project of long ones - and in Claude Code's terminal shows how far it is; past about 40 seconds it
answers from those read so far and says how many they are.

In Codex's desktop app the same card is drawn once agentwhy's server is in your own `~/.codex/config.toml`: Settings' **Alerts** and
`init --codex-card` turn it on and off, setting Codex up for the first time from Settings or with `init --codex` names it and brings it, and Codex reads it the next time it starts (measured on a
Mac, ChatGPT 26.1111). In Codex's terminal no card is drawn and your AI gives you the words.

agentwhy answers with a server of the plugin's own, started and ended by Claude Code: it opens no port and no connection,
and it reads and never writes. The card in the terminal is a small part of the plugin that draws the answer and does
nothing else. The answer becomes part of your chat. A file is added to your list, marked done or unblocked on the page
alone, never by your AI.

## Each AI

Claude Code, Codex and GitHub Copilot keep different records and block in different ways. The README's short answers,
in full.

### Where it works

Claude Code - in the terminal, in code editors and in the Claude desktop app - and Codex, in the terminal, in VS
Code's panel and in the ChatGPT/Codex desktop app. GitHub Copilot's CLI and desktop app, for reports, and for blocking
once you turn it on: **Block in Copilot too** in Settings, or `agentwhy init --copilot`, adds a file of agentwhy's own to
your `~/.copilot/hooks`. Copilot in VS Code is blocked by the same file, and its conversations are in the reports, read
from the log VS Code keeps of each chat (measured on macOS) - the files VS Code itself handed Copilot included. Not
Cursor's own AI, Windsurf or chats on claude.ai. Each conversation on the page is marked with the AI that had it and,
where its record says so, where it was held: in the terminal, in a code editor or in a desktop app.

### Blocking

**Claude Code.** `init` adds rules for Claude Code's own file tools, and a check that refuses a shell command that
would read a private file - `cat .env`, `grep -r` over a folder that holds one, a glob such as `cat .env*`, a `find` or
a loop that opens the files it lists, a `cd` into the folder before the read, a command handed to another shell
(`sh -c 'cat .env'`, `echo 'cat .env' | sh`), a name printed by `echo` (`cat $(echo .env)`), or a file sent with `curl -d
@.env`. It is not a sandbox. A path built while the command runs, a script file, or code that puts a name together
(`'.e' + 'nv'`, text decoded from base64) can still get through, and that is why the main job is telling you what
actually happened.

**Codex.** The same check runs as a Codex hook, with the same list of files. When it blocks a command, a second hook
asks Codex to explain the block in its reply in the terminal or code editor, without asking you to paste a secret. The
check is written into your own `~/.codex/hooks.json` and approved by agentwhy itself in `~/.codex/config.toml` - its
own two entries and nothing else, and no folder is marked trusted - because Codex skips an unapproved hook without a
word, and in VS Code the first conversation starts before anything can be approved (measured on Codex 0.159). Before
writing it, `init` runs the check once the way Codex will, and writes nothing if that fails. So it blocks from the
first message, in the terminal and in VS Code, and it acts only in projects whose rules block files. If Codex changes
how it checks approvals, agentwhy's Settings page says the block may ask again instead of claiming it holds.

**GitHub Copilot.** In its CLI, its desktop app and VS Code, the same check runs once you turn it on - **Block in
Copilot too** in Settings, or `agentwhy init --copilot` - from a file of agentwhy's own in `~/.copilot/hooks`, which
names Node and agentwhy by their full paths, since the desktop app runs a hook without your shell's setup. It reads
Copilot's file tools as well as its shell: a read, a write, an edit, a patch or a search that would open a private file
is refused, helpers included, and the refused call carries agentwhy's reason (measured on the CLI 1.0.94 to 1.0.96, the
desktop app, and VS Code's agent mode with three models). In VS Code, a file open in the editor, or attached to a
question, is handed to Copilot by VS Code itself, with no tool call for the check to see - a blocked `.env` open in a
tab reached Copilot that way (measured 2026-10-13): close a blocked file before you ask, and the report shows such a
file as read. Copilot refuses every call whose hook fails to start, so where agentwhy cannot start the call runs
unchecked instead; where the Node or the agentwhy the file names is gone, Settings says the check needs setting up
again.

In every AI the check reads a command for what it would read: a shell command that only writes into a blocked file,
such as `echo X=1 >> .env`, still runs.

### What a report tells you

Codex writes down less than Claude Code does, and Copilot's blocking is one you turn on, so each answers different
questions:

| What the report tells you | Claude Code | Codex | Copilot |
|---|---|---|---|
| Which private files the AI opened, and with which command | yes | yes, where its record shows the file was opened - a command that finished is not enough | yes, with its own file tools and in the shell; a shell command that failed is not counted as a read |
| What a command or a search printed | yes | yes | yes; past a very large output's preview, it says it doesn't know the rest |
| Whether the AI was handed what was printed | yes | yes, where its record holds the whole output the AI was given back; where Codex cut it short, it says it doesn't know the rest | yes |
| Every step the AI took | yes | no: some steps leave no trace. Where the only gaps are the ones every Codex record has, the report answers as it does for Claude Code - **All good.** included; where a step could have reached a private file and the record doesn't show what it did, it says it could not check fully | yes. What it was thinking is kept in a form agentwhy can’t read; a conversation with nothing else missing still says **All good.** |
| A read a rule stopped | yes | yes, when agentwhy's own refusal is recorded in a code cell | yes, and who stopped it: a rule, you, or a check another tool runs - never said to be your rule |
| Which helper was asked to do what, and what it gave back | yes | yes | yes, a helper working in the background too |
| Which files the AI changed | yes | yes; a change that failed is not counted | yes |
| What Codex was allowed to do at the time | - | yes, shown apart from your own rules | - |
| Blocking a file | yes | yes, the same files, from the first message - agentwhy approves its own check in your `~/.codex` files (measured on 0.159) | yes, once you turn it on: its shell and its read, write, edit and search tools, helpers included, in the CLI, the desktop app and VS Code (measured on 1.0.94 to 1.0.96, and in VS Code's agent mode). Not the tools it connects to (MCP), a blocked file's name in a list of files, or a file VS Code hands Copilot itself - one open in the editor or attached to a question. If agentwhy can't start - after a Node upgrade, say - Copilot runs the call unchecked rather than stopping your work; where the paths it names are gone, Settings says so |
| A message in the chat after agentwhy blocks a command | yes | yes, in the terminal, in VS Code and in the ChatGPT/Codex app | no message of its own: the refused call carries agentwhy's reason, which the CLI shows on the call's line; whether the reply names agentwhy is up to the model |
| A warning when a value reached the chat | yes | yes, at the end of a reply: a key from a private file, a file you let it read, and once per chat that nothing private was opened | no |
| `check`, the short answer in the terminal | yes | no: Codex conversations are on the page `start` opens, not in `check` | no: like Codex's, on the page `start` opens |

Where a Codex record keeps no command of its own - every conversation held in VS Code's panel, and older files -
agentwhy reads the commands the code wrote out as text. One the code builds while it runs is not read, and the report
says the record has gaps. What Codex writes down was measured on macOS: `codex exec` 0.157.0, and 0.159 and 0.160 in the
terminal, in VS Code's panel and in the desktop apps. Other versions and computers are read too, and their reports say
what could not be checked.

What Copilot writes down was measured on macOS: the CLI 1.0.94 and 1.0.95 and the desktop app's 1.0.94-3, which keep
one record for both. Every 1.0 version is read the same way until its record holds something new; a later version is
read, and its report says what could not be checked.

## Keys in the chat

A key that reaches your AI is on the AI company's servers, and only a new key undoes that. agentwhy can stop two common
ways in.

### A key in a message

You paste a config block so your AI can set something up, and a live key is in it. agentwhy stops the message before
your AI reads it, and says what to do instead:

```
agentwhy blocked this message before your AI read it: it holds a Stripe key (line 6).
Put it in .env as STRIPE_SECRET_KEY, and send the name instead.
```

With the next message you send, your AI tells you agentwhy blocked the one before. agentwhy knows a key by its format,
and a password in a URL; a sample key passes. It keeps nothing of the key and rewrites nothing. It runs in Claude Code
and Codex wherever agentwhy tells you things in the chat: set up by `init`, the welcome page or the plugin. It is a
`UserPromptSubmit` hook, the same command as the chat notice.

What it does not do: Claude Code and Codex still save the blocked message, key included, in their own files on your disk
(Codex in `~/.codex/history.jsonl`). Codex's desktop app and its VS Code panel name a new chat from its first message even
when that message is blocked, so there the key may have reached a model; agentwhy then adds a line asking you to change
it. If the check itself breaks, the message goes through. Measured on a Mac: by script in Claude Code's terminal, by hand
in VS Code's Claude Code panel, Codex's terminal and Codex's desktop app. The Claude desktop app is not measured yet, and
Copilot is not covered.

### Hiding keys

A key can sit in a file you never listed. One switch in Settings, or `init --hide-keys`, swaps a key agentwhy recognises
for a placeholder before Claude Code's AI reads it, and tells the AI so. Your file stays as it is:

```
# config/payments.yml, on your disk
stripe:
  secret_key: sk_live_…

# what your AI reads
stripe:
  secret_key: [redacted by agentwhy]
```

It is a `PostToolUse` hook, `agentwhy hide-keys`, and in Claude Code it covers every tool's result: a file read, a
command's output, an MCP tool's answer, a helper's report. The AI is also told that the real value is still in the file
and not to write the placeholder into it, so an edit around the key keeps it. The welcome page turns the switch on for a
project it sets up, and Settings turns it off; with `npx`, each step of your AI then takes about half a second longer
(about 35 ms run directly). It does not cover a command that fails, a file you attach to a message, part of a key, a key
that is encoded or split, or a password of no known format, so it lowers the risk and does not remove it. Measured on a
Mac: by script in Claude Code's terminal, by hand in VS Code and the Claude desktop app.

With the switch on, a Claude Code `Write` or `Edit` that would put the placeholder over a key is refused, by a
`PreToolUse` entry of the same switch, and the AI is asked to change the file around the key. A write by a shell command
or a script is not checked, nor is Codex, nor the plugin, which runs no `hide-keys`. A report says a write that was
stopped. Where Claude Code's record still holds the file as it was before a write that put the placeholder over a key,
the report makes that write a to-do, **Put the key back**; where the switch hid the key in that record too, as it does
for what the AI read, the report cannot see the loss and says nothing of it. The check lets a write through when it
cannot read the file or fails. A switch turned on before the check existed gets it from `init --hide-keys`, from **Add
that check** on its row in Settings, or from the welcome page. Measured on Claude Code 2.1.308: five runs of `sort`
without the notice, five refused, the key kept five times; about 35 ms per write run directly, 174 ms through an
installed `npx`, and through `npx` from npm's cache each write starts one more hook, about half a second, as each step
does for the swap.

Where you use Codex, the same switch adds a hook to your own `~/.codex` and approves it, and Codex then hides a key in
what a shell command printed, in the projects where the switch is on - after a command that fails too. Codex's AI reads
such a result as an error, and the key stays in Codex's own record of the command - Codex's terminal shows you the last
lines of a command that failed, key included. Turned off in one project, the hook stays for the others; `init --remove
--hide-keys --codex` takes it out. Measured on a Mac: by script with `codex exec` 0.166.0, by hand in Codex's terminal, its
desktop app and VS Code.

## The Claude Code plugin

agentwhy is also a Claude Code plugin, so you don't have to remember the command:

- **In a terminal**, in Claude Code 2.1.275 or later: `/plugin install agentwhy --marketplace karolkozer/agentwhy`, then
  **Install for you**.
- **In the Claude desktop app**, from the **Code** tab: **Customize > Plugins > Add > Add marketplace > Add from a
  repository**, type `karolkozer/agentwhy` and **Sync**, then **Add** agentwhy under **Discover**.

Then type `/agentwhy:report` in a Claude Code conversation (in the desktop app, the Code tab). The first time it opens
the setup; after that, this conversation's report. agentwhy does not work in the desktop app's Chat tab, which runs no
plugin's hooks.

**Install for you**, and the desktop app's **Add**, mean every project on this computer. From your next conversation,
agentwhy tells you in the chat when your AI reads a private file, in any project. It blocks nothing you have not chosen
to block on its page. Turn it off or remove it where you added it: the Plugins window in the desktop app's Code tab, or
`/plugin` in a terminal.

## What it does not do

- **It does not protect files.** That is what `permissions.deny`, file permissions and sandboxing are for.
  The one thing it can refuse is a shell command whose text names a path your rules already protect — and a
  deny rule names a tool, not a file, while `refuse` matches the text of a command. A path held in a variable,
  or printed by a search, still gets through.
- **`refuse` reads the command line, not what runs.** It stops a command that names a protected file, a glob that
  expands to one (`cat .env*`), a `grep -r` or `rg` that would read one, and a listing whose names another program
  opens (`find -exec cat`, `find | xargs cat`, `for f in $(find …)`). A path held in a variable or built while the
  command runs can pass it, and so can a search it does not recognise (a script, a program it
  does not know). What actually holds is a sandbox, or keeping secrets out of files with a
  secret manager: if there is nothing on disk to read, there is nothing to expose from disk.
- **It is not an audit trail**, and it is not a security assessment of your project.
- **It does not judge intent.** It reports what the record holds, and says when the record is incomplete.

## Words used here

| Word | Meaning |
|---|---|
| **Session** / **conversation** | One chat with Claude Code or Codex, from the first message to the last. Each saves it as files on your computer. |
| **Subagent** / **helper** | A second AI the main agent starts and hands a task to. It gets only that task, not your earlier conversation, and its work is saved in a file of its own. |
| **Protected file** | A file you told agentwhy matters: by default `.env*`, `.npmrc`, `secrets/`, SSH keys. |
| **Reached** | The file's contents came into the conversation — the agent opened it, or a command printed it. |
| **Refused** | A rule stopped the read before it happened. Nothing came into the conversation. |
| **Seen in a result** | Nobody named the file, but a search printed its lines anyway, e.g. `grep -rn API_KEY .` |
| **Deny rule** | A line in Claude Code's settings that forbids its own file tools to read a path. |
| **Hook** | A command Claude Code runs at a fixed moment, e.g. before a shell command or when a turn ends. agentwhy uses hooks to refuse obvious reads and to tell you what happened. |
| **Rotate** | Replace a key with a new one at the service that issued it, so the copy that leaked stops working. The only thing that undoes a leak. |
