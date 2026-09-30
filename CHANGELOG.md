# Changelog

All notable changes to `agentwhy` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

<!-- Add unreleased changes here. -->

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

