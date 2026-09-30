import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runCli } from '../helpers/cli.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

// worth-running-every-day R73: without a person at a terminal, a bare `agentwhy` opens nothing and serves nothing.
// Its exit code, its empty stdout and its first line are what they were before R72; the usage under them is new.
test('with no terminal, agentwhy alone exits 2 with missing command, and lists start and menu', async (t) => {
  const home = await writeSession(t, {});

  const { code, stdout, stderr } = await runCli([], { cwd: home, env: { HOME: home } });

  assert.equal(code, 2);
  assert.equal(stdout, '');
  assert.match(stderr, /^agentwhy: missing command/);
  assert.match(stderr, /Usage: agentwhy start[\s\S]*Usage: agentwhy menu/);
});

// R73: a flag before any command is forwarded only where a person is there, so a script says `start`.
test('with no terminal, a flag in place of a command is unknown rather than forwarded to start', async (t) => {
  const home = await writeSession(t, {});

  const { code, stderr } = await runCli(['--no-open'], { cwd: home, env: { HOME: home } });

  assert.equal(code, 2);
  assert.match(stderr, /unknown command: --no-open/);
});

// R74: the list needs a terminal and says so.
test('with no terminal, menu says it needs one', async (t) => {
  const home = await writeSession(t, {});

  const { code, stderr } = await runCli(['menu'], { cwd: home, env: { HOME: home } });

  assert.equal(code, 2);
  assert.match(stderr, /^agentwhy: menu needs a terminal/);
});
