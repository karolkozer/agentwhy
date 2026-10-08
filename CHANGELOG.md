# Changelog

All notable changes to `agentwhy` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

<!-- Add unreleased changes here. -->

## [0.3.3] - 2026-10-08

### Added

- A conversation's row in Conversations and in This month, and its report, now say where it was held - **terminal**,
  **code editor**, **desktop app** or **script** - beside the name of the AI, in the same grey badge. Where the record
  does not say, the badge names the AI alone. No page says *VS Code*: which editor it was is not something agentwhy has
  measured yet.

### Fixed

- A file your AI read is now **read** on every part of the report, not on its row alone. Its row said *Read - tracked*
  while the window its **See 1 file** opens said your AI had not opened any file, and the Files tab, Helpers and
  Advanced said *Name only*. A command that listed a folder and printed one file beside it was taken as a read of the
  folder too; now only the printed file is.
- In VS Code's Codex panel, a `cat`, `head`, `tail`, `nl` or `sed` of one file is now a read when the file's text was
  printed. The panel records no exit code for most commands, so such a row said **Couldn't check fully** even after the
  AI quoted the file back to you. An error message alone is still not a read, and an exit code that is recorded always
  decides.

## [0.3.2] - 2026-10-08

### Added

- A file your report says is **Blocked** or **Track** can be changed from the report itself. The badge on its row is now
  a button with a pencil: it opens a window that names the rule holding the file, says how many other files of the
  conversation that rule covers, and offers the other mode - or, under the two, stops protecting it altogether. Before
  this, a file you had already set up was a dead end on the page, and the only way to change your mind was to find it
  again in Settings.

### Changed

- The **Protect this file?** window says less. Its sentence repeated, almost word for word, what the **Block it** card
  under it already said; now it names the file once and says the choice can be undone in Settings, and each card says
  what that answer does.
- **Yes, just track it** is mint, like every other confirm in that window. It was coral, which read as a warning
  against an answer the window is there to offer.
- The report no longer says *Claude Code* where it means the AI of that conversation. Reading a report of a Codex
  session, a dozen sentences - the Fix it step, the Files tab's windows, the questions at the end - named the wrong
  app. They say **your AI**, in all three languages.

## [0.3.1] - 2026-10-05

### Added

- The **Files** tab of a report lists every file of the conversation, private or not. Before it listed the private ones
  only, so a conversation that listed a folder showed two of its eleven files: you could not see what else your AI had
  been among, nor make one of those files private from there. Each row says what your AI did with the file, and a file
  no rule marks private carries **Make it private**. Names your AI only saw, past the first 200, are counted under the
  table rather than dropped in silence.
- **In what order?**, beside the filters, puts those rows in the order your AI went. Each moment gets a heading in
  words - *First*, *Then*, *Helper 1, first* - over the files that came up then, and the choice is offered only where
  the files came up at more than one moment. The first version of this numbered the rows instead; a column of 1s said
  nothing a person could read.

### Changed

- An everyday file your AI **read** now opens the same window a private file opens: what happened to it in sentences,
  with the tool each call ran and when, the same facts as a diagram, and the full record. Before, it opened three
  answers that said neither when nor how. A file your AI only saw the name of keeps the short window, which now says at
  which moment that name came up. Where agentwhy never followed what became of a file's contents - it does that for
  private files only - the record says **not tracked** rather than *no*: never having looked is not the same as having
  found nothing.
- **Protect it** and **Make it private** now ask what should happen when your AI reaches the file: **Block it**, which
  is what they have always done, or **Track it**, which lets your AI read it and tells you every time it does. The
  sentence, the tick under it and the button follow your choice, with no script needed. Tracking a file your AI was
  being kept from is the coral button, because it takes that away; on a file nothing was keeping from it, both are
  mint. A file that is already blocked is still switched in Settings, where every rule is listed.
- Codex conversations now say what agentwhy did establish, instead of **Couldn't check fully** standing over
  everything. A conversation whose record names a private file it saw says *Only saw a name*; one that read a file you
  track says *Read - tracked*; one your block stopped says *Stopped*, which now outranks a name seen. A report whose
  only gaps are the ones Codex's own format leaves says **All good.**, as its row does. The badge still says the record
  has gaps, *Your setting* still says *Not known*, and no conversation moves out of the fold it is listed under.
- Codex conversations held in **VS Code's panel** are read as fully as the ones held in a terminal. The panel writes no
  command of its own into the record - measured over every conversation of 2026-10-02 to 10-05 - so agentwhy now reads
  the commands those cells wrote out, and what one cell returned whole is read as what the model was given. Before,
  every panel conversation said *Couldn't check fully* while the same question asked in a terminal was answered.
- Settings' second alert row is named **When my AI opens a private file, or is stopped**, and its example is the line
  agentwhy itself writes, under agentwhy's own mark. Before, the example showed your AI saying it - a speaker that
  never says this one: your AI speaks only when something was read out of a file.
- In the sidebar, **See what's missing** is white rather than coral - reading what a record misses fixes nothing - and
  two small, muted links, **Sponsor agentwhy** and **For companies**, sit over the language choice. Nothing on a page
  asks for money in coral, a card or a banner.

### Fixed

- A file your AI read through a command like `head | cut`, beside `ls` and `file` in one line, is credited as read.
  Before, the line was read as a listing, so a file you track could be read with nothing said about it.
- A record with gaps names a file you **track** that it reached, not only a blocked one. Before, a conversation that
  read a tracked file said nothing at all on its row, while the same read of a blocked file was named.
- A number given to an option, the code an interpreter is handed, the header of a cell's output, and a folder in a long
  listing are no longer taken for files of your project.

## [0.3.0] - 2026-10-05

### Changed

- The conversations agentwhy could not check fully now wait behind one line you open when you want them, instead of
  filling your week. The line still says how many there are and, in a few words, why - and the card above your calendar
  still counts them; the rows, the full reason and the command that includes them are one click away. Every Codex
  conversation lands on that list, so on a project you work on with Codex it was the longest thing on the page.
- Switch project is wider, and you can sort your other projects by name: the **Project** heading steps through newest
  first, A-Z and Z-A, and the line above the table says which order you are looking at. The line that heads the table
  also stands further from the card of the project you are in.

## [0.2.1] - 2026-10-04

### Fixed

- When you ask your AI to run agentwhy in the background and send you the link, the link now opens the welcome page in
  a project you have not set up yet - the page that blocks your private files and turns alerts on. Before, it always
  opened your conversations, so the setup was never offered to anyone who arrived this way: in the Codex app, in the
  Claude desktop app and in Claude Code at a terminal alike, because all three reach for the same background command.
  A conversation you asked for by name still opens instead, and a project you have already set up still opens your
  conversations.
- Asked to run agentwhy where there is no terminal - a background command from ChatGPT, Claude or Codex - agentwhy now
  says which command gives a page you can open, instead of only that a command is missing. Before, your AI had to guess
  it from the full list of commands, and not every one of them did: some reported that agentwhy would not run at all.
  A script still reads what it always did; nothing starts by itself.
- Where agentwhy could not serve the page and saved it as a file instead, it now says what would serve one - run it
  again outside the sandbox, or type `npx @agentwhy/cli` in a terminal. Before, only the background form said that, and
  a run started by your AI left you on a saved page where nothing can be set up and no mark is kept, with no way back.

## [0.2.0] - 2026-10-04

### Changed

- Codex now blocks your private files from the first message, in the terminal and in VS Code, with nothing to approve
  in Codex. agentwhy writes its check into your own `~/.codex/hooks.json` and approves those two entries - its own and
  nothing else, never a folder's trust - in `~/.codex/config.toml`, after trying the check once the way Codex runs it.
  Before, the check sat in the project's `.codex/hooks.json` and waited for an approval the first VS Code conversation
  never sees, so a new project's first conversation could read the blocked files. The old project copy is taken out on
  the next setup write. The check finds its project by the Claude Code settings that run `refuse` and does nothing
  where no files are blocked; `init --remove` keeps it for your other projects and says how to take it out everywhere
  (`init --remove --codex`). Where your Codex file already runs agentwhy, the way it names agentwhy is kept and reused
  - but only when that is agentwhy and nothing else. A file naming it some other way (`bunx`, `pnpm dlx`, a path
  relative to a folder) has its entry re-pinned once to the way this agentwhy runs, shown in the plan before anything
  is written; `--command` still names any way you like.
- Settings' Codex line now says only what is verified: that Codex blocks from the first message, that it may still ask
  (with one click to make it automatic), or that it is not blocked yet. Uninstall says the check stays for your other
  projects, and offers taking it out of Codex too, unticked.

### Fixed

- In Codex, agentwhy now reads the same list of private files its blocking hook reads, including a list kept in the
  shared `.claude/settings.json`. Before, a chat could be called clean over a file that list blocks.
- A command agentwhy stopped in Codex is said again where Codex's hook input names no session.
- After your AI read a file you let it read, a later reply no longer says "earlier your AI read a key"; it says it read a
  private file you let it read.
- "Something looks like a key" on the report is no longer hidden when the key came from somewhere other than a private
  file - the environment, or another file read on the same line.
- A Codex conversation outside your projects - the desktop app keeps its quick chats in a folder of its own - no
  longer hears from agentwhy at all. Your home folder's own `.codex` configuration is never taken for a project,
  so those quick chats stay out even though they live under your home folder. Its Stop hook speaks only where a project you set up holds its hook file; a
  command agentwhy stopped is still explained wherever the hook ran.
- In the ChatGPT/Codex desktop app, the messages after a tracked read and after the first quiet reply now ask the AI
  to repeat its full answer - that app folds everything before agentwhy's bubble into "Worked for ...", so the answer you
  asked for was hidden behind a one-line confirmation. In VS Code, where nothing is folded, the short sentence stays
  and nothing is said twice. What must not be repeated - a key, private data, a stopped file - is still never asked
  back.
- A file on Track is now said as "read, as you allowed" every time your AI reads it - before, the message came only
  when agentwhy also recognised a key in what was read, and otherwise you heard "no value found" in English, or in
  the ChatGPT/Codex app nothing at all.
- A command that prints a file next to a `find` in one line - `cat x || find . -name x` - now counts what it printed,
  like `ls` beside `cat` does. Before, a key read this way was missed.
- The Settings row of a file on Track now says when Claude Code still blocks it anyway - a wider Block rule, like the
  one for all `.env` files, also covers it, and Claude Code's own rules allow no exceptions. The row names the rule
  and the two ways out: switch that rule to Track, or rename the file. In Codex, Track works as is.
- In the Codex apps, what agentwhy says once per conversation is now really once per conversation: "agentwhy is
  keeping watch" came again after later replies, and could miss the desktop app when the same conversation was open
  in VS Code too - Codex gives one conversation several session ids, and agentwhy now groups them by Codex's own
  thread index.
- After agentwhy stops a command, the sentence for the AI now says "don't try to read it another way **now**" - told
  "never", the AI refused to read the file even after you allowed it in Settings and asked again in the same chat.
- A private file read by its bare name - `cat demo.env`, with no `./` and no folder in front - is now treated like any
  other read of it: the blocking hook refuses it, and a key it printed is noticed. Before, the name slipped past both,
  and the line under the reply said nothing had been opened.
- A file you set to Track now stays allowed even when a wider Block pattern also matches it - whether it was read by
  its name or by its full path, and agentwhy's blocking hook lets it through. In Claude Code the app's own permission
  rules can still refuse such a file; that needs the wider Block row switched to Track, or the file renamed.
- A key your AI read with a command such as `cd apps && ls -la && cat .env`, and then wrote in the chat, is now noticed.
  Before, agentwhy said a private file was opened and no key was found.
- A shared report no longer folds several private files outside the project into one row.
- Opening the report from the chat waits for a project with many conversations to be ready, instead of falling back to
  files after 10 seconds, and no longer starts a second page server beside one that is busy.

### Changed

- The line under a reply when something private landed in the chat is now plain words in your language, saying what
  it was: "A key from one of them is now in this conversation — change it", "— check it" for a template's value, and
  "Private data from one of them is now in this conversation — see what to do" for a file with no key in it. What
  Claude or Codex is asked to say follows it: private data is never called a key to replace.
- Codex now hears from agentwhy as Claude Code does - in the ChatGPT/Codex app, VS Code and the terminal: at the end of
  a reply Codex says when a key from a private file is in the chat, when it read a file you let it read, and once per
  chat that nothing private was opened. What Codex is asked is short and in your language, and a command agentwhy
  stopped is said in one sentence. The Codex hook agentwhy already set up does it, so nothing needs approving again.
- Settings → General has a switch for system notifications: the notification agentwhy shows in the corner of your
  screen, on a Mac. Before, only `agentwhy notify` turned them on or off.
- When you say yes to Claude's offer to open agentwhy's report, it now opens as the live page `npx @agentwhy/cli` gives
  - at a local address, among all your conversations of this project, with "← All conversations" leading back to them,
  marks and Settings working - and the chat goes on at once. A page already open is reused, so its address stays the
  same. `agentwhy start` gains `--session <id>`, `--quiet`, and `--detach`, which serves from the background. Where
  agentwhy cannot keep running in the background, as in Codex's sandbox, the pages open as files and it says so.
- In the Claude desktop app, when a key from a private file lands in the chat, Claude now says so in its own reply, as
  it already did in the terminal and in VS Code.
- In the Claude desktop app and in VS Code, after the first reply of a chat in which your AI opened no private file,
  Claude now adds one sentence from agentwhy saying it is keeping watch and nothing has been opened so far. Once per
  chat, never after every reply, and not in the terminal, where the line under the reply already says it.
- A key from a private file you let your AI read (set to Track, not Block) is now said as a read you allowed - "Your AI
  read one you let it read. Nothing to do." - and Claude's message says the same, instead of asking you to make a new
  key. The report, To fix and `agentwhy check` agree: such a file is never on the list of keys to change.
- When a key from a private file lands in the chat, Claude's message about it is now at most three short sentences in
  plain words: that agentwhy noticed it, to make a new key where it was issued, and whether to open the report. Before,
  it was three paragraphs about session records and rotating credentials.
- With system notifications turned on (`agentwhy notify --notify chat,os`), what agentwhy says at the end of a reply -
  that your AI has not opened a private file so far, or that it read a key from one - now comes as a notification too,
  not only as the line under the reply. The Claude desktop app folds that line away under "Claude Code notice", so
  until now the only notifications there were about helpers.

- Settings, the welcome page's last step and `agentwhy init` now say where to approve agentwhy in Codex: open Codex in
  a terminal in your project, and when it asks whether you trust the folder and then about agentwhy, say yes both
  times. Codex in VS Code asks neither, and skips agentwhy's block without a word until then, so a project could look
  blocked in Codex while VS Code's Codex still opened `.env`.

- On a computer where you use Codex, setting up a project blocks your private files in Codex too, from the start.
  Before, Codex was blocked only in a project that already had a Codex conversation or a `.codex` folder, so a new
  project set up on the welcome page was blocked in Claude Code alone, and the first Codex conversation in it could
  open `.env`. Codex still runs agentwhy only once you approve it in Codex, and the welcome page's last step says so.

- Where agentwhy finds no Claude Code or Codex conversations saved at all, `start`, `sessions` and `check` no longer say
  only that this folder has not been used yet. They say it may also be running where conversations are not saved - an
  AI app's sandbox or virtual machine, as the Claude desktop app's chat and the Codex app's sandbox are - and to run it
  in a terminal on your own computer in that case.

- A call Claude Code's auto mode refused is read as a call that did not run. Auto mode is Claude Code's starting
  permission mode since 2.1.283, and until now such a conversation was listed as one agentwhy could not check fully.
- `check` and the notice in the chat say who stopped an attempt. "Your rules held" counts only what a rule refused;
  what auto mode refused is said as "Auto mode stopped …", and a notice about it says the attempt "was stopped" rather
  than that a rule refused it.
- A call you turn down at Claude Code's prompt is still read as not established: that it does not run has not been
  measured yet.

### Fixed

- A private file listed by one command and read by another no longer appears twice on a report's to-do list.
- A report of a conversation that read a file you set to Track no longer shows "Something looks like a key" over a key
  that was in that file, and no longer says the file held no key when it did.
- After Claude says that a key from a private file is in the chat, agentwhy no longer adds "Nothing new now. Earlier in
  this chat your AI read a key…" right under it, in the chat and as a notification.
- "So far your AI hasn't opened any private files" is no longer said in a chat where your AI opened one. With the
  default alerts, opening a private file without reading a key from it is not announced, and the line that says
  nothing was opened was said instead.
- In the Claude desktop app, alerts no longer say "Finished agent not checked: it is not in the session's records yet"
  after many replies. There, a helper nobody asked for finishes after a reply and leaves no record at all, so there was
  never anything to check, and the "yet" was not true. agentwhy now says so once per chat, in your language, and not
  again.
- Asked by an AI app to start agentwhy, the address it sends you now opens the welcome page in a project you have
  not set up, as typing `npx @agentwhy/cli` in a terminal does. Before, it always opened your conversations, so the
  setup was never offered there.
- In a project with no AI chats yet, the pages now show what you just set up. After the welcome page's last step,
  Settings still said your private files were not blocked and alerts were off, though both had been written, and a
  change made in Settings on that page did not show either. The welcome page's last button now goes on to
  Conversations, as it does in a project with chats, instead of Settings.
- On macOS, opening agentwhy no longer makes the system ask whether the app it runs in may read your Documents folder.
  The list of your projects looked into every project's folder to say whether it is still there and set up; a project
  in Documents, Desktop, Downloads, iCloud Drive or on another disk is now left alone until you pick it, and listed
  without a status. Folders the ChatGPT app makes for a chat with no project are no longer listed as projects.

## [0.1.0] - 2026-09-30

### Added

- A value from a protected file in the conversation is now said by your own agent, not only as a grey line. The turn
  is kept open and the agent tells you what agentwhy found, what it means and that rotating the key undoes it, in
  its own words and your language, then offers to open the report — running it only if you say yes. The line stays
  beside it, as agentwhy's own record.
  - Measured before it shipped: in eleven sessions of eleven the agent relayed it, never went back to the file,
    never repeated the value, and never ran the offered command before an answer.
  - Only where a person is reading: the terminal and the editor extension, not `claude -p`. Never inside a
    continuation it caused, and once per finding.
  - `--say line` (or the Settings view, or `agentwhy notify --say line`) keeps the grey line alone.

- `agentwhy report --quiet` says where the report is and nothing about what is in it. The summary names protected
  paths and what became of each, which is not what should land in a model's context when an agent opens the report
  because you said yes.

- Settings on the page has a third panel, "What you are told, and when": which findings are said, when a quiet turn
  says so, and where a notice is shown. A click writes it — unlike a hook, this changes what you hear and never what
  your agents may do, so there is nothing to confirm first, and choosing the other answer undoes it.
  - Each row says whose answer is deciding: this project's, yours everywhere, or agentwhy's own.
  - Opened as a file, where the page writes nothing, each row carries the `agentwhy notify` command instead.

- `agentwhy notify` says what you are told when a turn ends, and changes it: `--on` which findings, `--clean` when
  a quiet turn says so, `--notify` where it is shown, `--everywhere` for every project, `--reset` to take answers
  out. Run with nothing, it says what is set and which answer — this project's, yours, or agentwhy's own — is doing
  the deciding.
- What you want to be told is a choice you make once, not a flag in a hook's command line: `watch` reads
  `~/.agentwhy/notices.json` on every run, so a change reaches the next turn without editing a settings file or
  restarting a session. One set of answers for you, and one per project that wants its own.
  - The order is: a flag written in the hook command, then this project's answer, then yours, then the built-in one.
  - A file that cannot be read leaves the built-in answers standing. A hook that stopped watching over a settings
    file would be the worst of both.

- A quiet turn can say so. Silence could mean "nothing happened", but equally "the hook is not installed" or "it
  could not read the session", and a monitor that cannot tell those apart is not one. `watch` now says, on the first
  quiet turn of a session, that the session is being watched — once, by default. `--clean every-turn` says it after
  every reply, and `--clean off` keeps the silence there was before.
  - A quiet turn is never reported as a quiet session: where an earlier turn found something, the line says both,
    and says the earlier finding in the past tense, since a hook cannot know whether the key has been rotated since.
  - A turn that could not be read is never called quiet.

- The page says when a project has no `watch` hook, above what the run found, with a way straight to the switch
  that installs it. A monitor nobody turned on is worth nothing, and the page is where a person already is.
- `agentwhy watch --on refused` asks for one more kind of notice: an attempt a rule refused, where nothing was
  reached. It is the only notice that asks for nothing back — it says a rule held — and it is off unless asked for.

### Changed

- agentwhy is open source, under the Apache License 2.0. No version was published under the license it replaces.

### Fixed

- `init`, and the switch on the page, install `watch` on both of the events it needs. Until now only `SubagentStop`
  was written, so the hook found what a delegated agent did and had no way to say it: nothing appeared in the
  conversation, and the session's own agent — the one with no `SubagentStop` of its own — was never checked at all.
  Running `init` again adds the missing half to a project that has one.

- Reading a session is five to twenty times faster, and the gain is largest on the longest sessions: a real 65 MB
  transcript went from 4.2 s to 0.8 s, and a record-heavy 20 MB one from 15.5 s to 0.8 s. Three pieces of work inside
  the report build were the cost, and every command paid it — `report`, `check`, `start` and the `watch` hook that
  runs when a turn ends.
  - The URL-password pattern was retried from every position of a transcript line, and those lines are long: a CPU
    profile put 3.7 of one run's 4.4 seconds inside that one expression.
  - Values read from protected files were looked for by taking a cryptographic hash of every window of every text.
    Each window is now fingerprinted first, and only a window that could match is hashed.
  - Path patterns were recompiled on every comparison instead of once.

