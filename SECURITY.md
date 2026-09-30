# Security policy

agentwhy reads Claude Code transcripts, which can hold live secrets, so a flaw here can matter more than in
most small command-line tools. Reports are welcome.

## Reporting a vulnerability

Please report privately, not in a public issue:
<https://github.com/karolkozer/agentwhy/security/advisories/new>

Say what you found, the version (`npm ls agentwhy`, or the version on the npm page), and the steps that
reproduce it. Do not attach a real transcript or a real secret; a small synthetic example is enough, and the
fixtures in `tests/fixtures/synthetic/` show the shape.

I will acknowledge a report as soon as I can, tell you whether I agree it is a vulnerability, and credit you in
the release notes unless you would rather not be named.

## What counts

- A secret value, or text that carried one, reaching a report, the terminal, a log or a file it should not.
- The local page served by `agentwhy start` accepting a request it should refuse (another origin, another
  host name, a missing token) or writing outside the project's settings and the tool's own files.
- A crafted transcript that makes the tool run something, write outside its output, or put script into a report.
- The published package containing something it should not.

## What does not

- A secret pattern the detector does not recognise. That is a detection gap, not a vulnerability; please open a
  normal issue with a synthetic example.
- Anything that needs the attacker to already control your account or your Claude Code settings.

## Supported versions

Only the latest release receives fixes.
