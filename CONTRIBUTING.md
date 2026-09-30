# Contributing to agentwhy

Thank you for looking at this. agentwhy reads Claude Code transcripts to reconstruct **why** an agent
reached for protected data. That makes it a tool people point at their most sensitive local files, so
a few of the rules below are stricter than you may expect from a CLI of this size. They are here for
a reason, and the reason is written next to each one.

The project is **pre-MVP**: feasibility is verified, detection quality is not yet measured. Interfaces
still move.

## How to help right now

Issues are welcome: bug reports, sessions agentwhy misreads, and ideas. **Pull requests are not accepted
yet** — the reason is under [Licence](#licence).

Describe a problem rather than posting code for it. A patch pasted into an issue is a contribution too,
and it cannot be copied into the project any more than a pull request can be merged; the maintainer
writes the fix.

Bug reports and format variants are the most useful thing right now. If you hit a session agentwhy
misreads, `agentwhy doctor --json` describes the structure without printing content — that output is
usually safe to attach, but read it before you post it.

## Setup

    git clone <this repository>
    cd agentwhy
    npm install

Node >= 23.6 runs `.ts` files natively, so there is no build step during development — `tsc` is only
needed at publish time. Run the CLI straight from source:

    node src/cli.ts doctor --input tests/fixtures/redacted/<session>
    node src/cli.ts report --input tests/fixtures/redacted/<session>

`npm run demo:report` writes `demo.report.html` from the same fictional data. It is the safe way to
look at the HTML report without pointing the tool at a real session, and because it comes from the
product renderer, what you see is what the tool produces.

## Checking a change

If you change a local copy — to understand the code, investigate a bug or confirm a fix before you
describe it in an issue — these three must pass:

    npm run typecheck
    npm test
    npm run check:canary

A change to `package.json`, to what the CLI imports, or to the build also needs `npm run check:package`,
which installs the packed tarball in an empty project and runs it.

**Never state that a test passed unless you executed it** — this project exists
because confident output from incomplete evidence is worse than no output.

## Working with transcripts — please read this part

Real transcripts under `~/.claude/projects/` contain live secrets: API keys, tokens, `.env` contents
that an agent read and pasted into its own context.

- **Never commit a real transcript.** `tests/fixtures/real/` is gitignored and denied in
  `.claude/settings.json`. Test fixtures go in `tests/fixtures/redacted/`, redacted and carrying
  canary markers; `npm run check:canary` fails if a canary reaches tool output.
- **Never print a raw transcript line** while debugging — no `cat`, `head`, or `Read` on a real
  session file. Inspect structure with `agentwhy doctor`, or a script that prints key names and
  counts. Printing one line pulls a leaked value into your terminal, your scrollback, and — if you are
  working with an AI assistant — into its context. That is the exact incident this tool diagnoses.
- **No report generated from a real session is committed.** `.gitignore` covers `*.html` inside the
  package because a report carries paths, descriptions and identifiers from its session. No report is
  committed at all: `npm run demo:report` rebuilds one from the fixed fictional model when you need it.

## Nothing personal in the repository

Everything committed here is published, and a commit survives in history, in forks and in any
published tarball long after the file is deleted. So no file may contain:

- absolute paths from a real machine — tests use `/Users/someone/...`;
- names of real employers, clients, or private projects — use fictional ones (`Acme`, `Web Portal`);
- personal e-mail addresses, machine names, or internal URLs — use `example.com` / `example.invalid`.

`npm run check:canary` enforces the first of these mechanically: it fails on any absolute home path in a
tracked file that is not the `/Users/someone` placeholder.

Everything in the repository is written in English: code, comments, error messages, commit messages
and documents.

## How the code is organised

Comments across the code refer to design notes under `.ai/`. Those are the maintainer's working notes
and are not published; the rules they set that matter to a reader of the code are these:

- **Adapter** (`src/adapter/`) is the only layer that knows the Claude Code transcript format.
- **Core** (`src/core/`) knows no provider's field names: event model, correlation, policy, detector.
- **Output** (`src/report/`) redacts and renders. Renderers read one model, so stdout and HTML cannot
  disagree.
- I/O lives only in `src/infrastructure/`; collaborators arrive through constructors and are chosen
  only in `src/composition-root.ts`.
- There is one runtime dependency, `@clack/prompts`, used only by the session chooser in
  `src/infrastructure/`. Adding another needs a recorded reason: every package this tool loads runs with
  access to transcripts that hold live secrets.

`tests/architecture.test.ts` enforces these dependency rules, so a violation fails the suite rather
than a review.

Two invariants the tests guard and a review will not let through:

- A raw secret value never enters the report model — the `Redacted` type enforces this.
- Correlation goes by `tool_use_id`, `agent_id`, `delegation_id`, **never by timestamp**.

When the transcript format shows a variant we have not seen, mark it explicitly. Never guess: a wrong
answer given confidently is the failure mode this project is built to avoid.

## Reporting a security problem

Please do not open a public issue for a vulnerability, and never attach a transcript to one. Use
GitHub's private vulnerability reporting on this repository instead.

## Licence

agentwhy is open source, under the [Apache License 2.0](LICENSE). Anything you contribute is under the same
license, as its section 5 says.

When pull requests open, every commit in one will need a sign-off (`git commit -s`), the line
`Signed-off-by: Your Name <you@example.com>`. It certifies the
[Developer Certificate of Origin](https://developercertificate.org/): that you wrote the change, or otherwise have
the right to submit it under this license, including from an employer where it applies.

Pull requests are not accepted yet because a change cannot be merged in this repository yet. This section will
say when that changes.
