# What agentwhy finds, measured

**Measured:** 2026-09-29, on 28 scripted Claude Code sessions, under the built-in policy.
**Kept current:** a test fails whenever the measurement stops matching this page, so the numbers below cannot quietly go out of date.

## The result

| Question | Result |
|---|---|
| A private file's value came into the conversation: does `check` say to change that key? | **13 of 17** |
| ... of the other 4: named the file, without saying to change the key | 0 |
| ... of the other 4: only said it saw a key shape or a mention | 3 |
| ... of the other 4: said nothing | 1 |
| A key came in with no private file behind it: does `check` name a key? | **1 of 3** |
| A rule refused the read: is it reported as refused, with nothing to change? | **2 of 2** |
| Nothing private happened: does `check` stay quiet? | **3 of 6** |
| A helper agent read the file: does the report name the task it was given? | **5 of 5** |
| A helper agent read the file: does the report say rightly whether the value came back? | **5 of 5** |
| Was any 8-character run of a secret in the report, the terminal output or the page? | **0 of 28** |

## What these numbers are, and what they are not

- **They are:** what agentwhy says about routes someone wrote down, read through the whole program — the part that reads
  Claude Code's files, the part that joins agents to the tasks they were given, the report and `check`. Every session
  uses only record shapes measured on real Claude Code sessions, except the Grep tool's input (see its row).
- **They are not a detection rate on real machines.** The scenarios were written by the author of the tool, and
  include the routes it was built for. How often each route happens in real work is a different question, answered
  only by looking at real sessions.
- **They are not a promise about routes not listed here.** A route missing from the table is untested, not caught.
- The scenarios include the routes the tool is known to miss, on purpose. The corpus grows with every route someone
  reports; a new route is added with the truth of what happened, never with the answer the tool gives.

## Every scenario

**Found** means what the row asks. For a file whose value came in, found means `check` lists the file under
*Rotate*.

### A private file's value came into the conversation

| Scenario | Route | Found |
|---|---|---|
| `read-tool` | the Read tool opens `.env` | yes |
| `cat` | `cat .env` in the shell | yes |
| `grep-by-name` | `grep -rn` for a variable name prints the line of `.env.development`. The command names a variable, never a file: the shape of the incident this tool began with | yes |
| `rg-by-name` | `rg` for a variable name prints the line of `.env.local` | yes |
| `grep-tool` | the Grep tool, asked for matching lines, prints the line of `.env`. Its input is written from the tool's documentation, as no measured session holds a call of it | yes |
| `glob-cat` | `cat .env*`: a glob, and output with no file name in it | no — a key shape only |
| `python-open` | `python3 -c` opens `.env` by name. Missed at the first measurement: an interpreter's output was never read as the file's; fixed the same day, for code that names the file | yes |
| `python-built-path` | `python3 -c` builds the path `.env` while it runs | no — a key shape only |
| `dotenv-print` | a script loads `.env` through a library and prints one variable | no — nothing |
| `npmrc` | `cat ~/.npmrc` prints a registry token. Missed at the first measurement: the token line was not read as a setting; fixed the same day | yes |
| `ssh-key` | the Read tool opens a private SSH key | yes |
| `mcp-read` | a file tool from an MCP server reads `.env` | no — a mention only |
| `helper-returns-value` | a helper searches for a variable name, and its report carries the value back: the case agentwhy was built for | yes |
| `helper-returns-name` | a helper reads `.env` and reports only that the key is set | yes |
| `helper-nested` | a helper starts a helper of its own, which reads `.env.production`; the value comes back up both levels | yes |
| `helper-background` | a helper started in the background reads `.env.local`; its report arrives later as a notification | yes |
| `helper-handback` | a helper hands its report back through a handback call, as auto mode does | yes |

### A key with no private file behind it

| Scenario | Route | Found |
|---|---|---|
| `printenv-known-format` | `printenv` prints a key of a known format | yes |
| `printenv-arbitrary` | `printenv` prints an arbitrary secret | no |
| `pasted-key` | the person pastes a key of a known format into the chat | no |

### A rule refused the read

| Scenario | Route | Reported as refused |
|---|---|---|
| `read-refused` | a deny rule refuses the Read tool on `.env` | yes |
| `shell-refused` | a deny rule refuses `cat .env` in the shell | yes |

### Nothing private happened

| Scenario | Route | Quiet |
|---|---|---|
| `read-readme` | the Read tool opens `README.md` | yes |
| `grep-code` | `grep -rn` over the source code, with no hit in a private file | yes |
| `mention-in-text` | the agent writes about `.env` and opens only `package.json` | yes |
| `ls-listing` | `ls -a` lists `.env` by name, and nothing of what is inside it | no — listed as seen in a result |
| `python-checks-exists` | `python3 -c` names `.env` only to ask whether it exists: the control for `python-open` | no — listed as reached, not to rotate |
| `python-checks-exists` | A call that names a protected file and succeeds is listed as a route to close, whatever it did with the file. It is not listed to rotate: `True` is not a value. | Telling a call that opened a file from one that only asked about it |
| `env-example` | the Read tool opens `.env.example`, which holds placeholders only | no — listed as reached |

## Why each miss happens

| Scenario | Why | What would close it |
|---|---|---|
| `glob-cat` | The record holds the command `cat .env*`, not the files the shell matched. Which files existed then is not on record. | Matching a glob against the protected patterns, and saying "one of the files this matched" |
| `python-built-path` | An interpreter's output is taken for a file's content only when the code it was handed names that file. Here the path is built while the code runs, so nothing in the record names it. | Nothing in the record; only a sandbox or a secret manager |
| `dotenv-print` | A library opened the file. Neither the command nor its output names it, and the value has no known shape. | Nothing in the record; only a sandbox or a secret manager |
| `mcp-read` | agentwhy knows where each built-in tool names a file. For a tool it does not know, a path in its input is counted as a mention, not a read, so that prose about `.env` is not reported as opening it. | A profile for common MCP file tools |
| `printenv-arbitrary` | The value has no known shape and no protected file is involved; only the variable's name says it is a secret. | Treating what is printed for a variable named like a secret (`*_SECRET`, `*_KEY`) as one |
| `pasted-key` | Key shapes are looked for in what tools returned, not in what the person wrote. | Scanning the person's own messages for known key formats |
| `ls-listing` | A listing that names `.env` counts as the file seen in a result, although no line of it was printed. | Telling a listing of names from a search that printed lines |
| `python-checks-exists` | A call that names a protected file and succeeds is listed as a route to close, whatever it did with the file. It is not listed to rotate: `True` is not a value. | Telling a call that opened a file from one that only asked about it |
| `env-example` | A template is protected on purpose, since teams do leave real values in one. It is listed as reached; its own line asks whether its values are real. | Arguably right as it is; counted here as noise, because nothing private happened |

## How it works

`tests/helpers/detection-scenarios.ts` holds the scenarios. Each one is a small Claude Code session in the format
Claude Code writes, and, beside it, what happened in it: which file's contents came into an agent's context, which
read a rule refused, what a helper was asked and whether the value came back. That truth comes from the session
itself, never from the tool's answer.

The measurement writes each session to a temporary folder, reads it the way `check` and `report` do,
and compares. The secrets are invented, and those of a known format are assembled when the script runs, so the
repository holds none. The script prints counts and scenario names only.
