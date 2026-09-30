import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readdir, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECTS_DIRECTORY, projectDirectoryName } from '../../src/adapter/claude-code/contract/projects.ts';
import { runCli } from '../helpers/cli.ts';
import { RETURNED_SECRET, returnSessionFiles } from '../helpers/return-session.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

/** A project whose one stored session is the motivating case's shape, under a home of its own. */
async function projectWithSession(t: Parameters<typeof writeSession>[0]) {
  const project = await realpath(await writeSession(t, { 'package.json': '{}' }));
  const stored = join(...PROJECTS_DIRECTORY, projectDirectoryName(project));
  const home = await realpath(
    await writeSession(
      t,
      Object.fromEntries(Object.entries(returnSessionFiles({ carried: 'value' })).map(([path, text]) => [join(stored, path), text])),
    ),
  );
  return { project, home };
}

// worth-running-every-day R11, R12, R14, R16, run the way a person runs it.
test('check names the file to rotate and the open route, never the value, and writes nothing', async (t) => {
  const { project, home } = await projectWithSession(t);
  const before = await readdir(project);

  const { code, stdout, stderr } = await runCli(['check'], { cwd: project, env: { HOME: home } });

  assert.equal(code, 0, stderr);
  // The default view: one line per file, strongest first, no explanation before the data (R15a).
  assert.match(stdout, /^agentwhy · 1 session active since 7d, read under BUILT-IN DEFAULT/);
  assert.match(stdout, /^ {2}ROTATE {2,}apps\/web\/\.env\.development {2,}a value was in an agent's context, in 1 session$/m);
  assert.match(stdout, /^ {2}REACHED {2,}apps\/web\/\.env {2,}Read, nothing refused it, in 1 session$/m);
  assert.match(stdout, /^What each line means, and what to do: {2}agentwhy check --full$/m);
  assert.ok(!stdout.includes(RETURNED_SECRET), 'the value is never printed');
  assert.deepEqual(await readdir(project), before);
});

test('check --full explains every section, and both views keep the value out', async (t) => {
  const { project, home } = await projectWithSession(t);

  const { code, stdout } = await runCli(['check', '--full'], { cwd: project, env: { HOME: home } });

  assert.equal(code, 0);
  assert.match(stdout, /^Rotate$/m);
  assert.match(stdout, /^ {2}apps\/web\/\.env\.development {2}in 1 session$/m);
  assert.ok(!stdout.includes(RETURNED_SECRET), 'the value is never printed');
});

test('check refuses a policy it cannot read before reading any session, with exit 2', async (t) => {
  const { project, home } = await projectWithSession(t);

  const { code, stdout } = await runCli(['check', '--policy', 'missing.json'], { cwd: project, env: { HOME: home } });

  assert.equal(code, 2);
  assert.equal(stdout, 'The policy file was refused, so nothing was analysed:\n  - missing.json could not be read\n');
});

test('check on a range with no session says so, exit 0', async (t) => {
  const { project, home } = await projectWithSession(t);

  const { code, stdout } = await runCli(['check', '--since', '2099-01-01'], { cwd: project, env: { HOME: home } });

  assert.equal(code, 0);
  assert.match(stdout, /^No session of this project was active since 2099-01-01/);
});

// worth-running-every-day R28: a project with no Claude Code history yet says why, and what to do about it - a
// different message from R29's "nothing to act on" above, which already answers a range or a read that found nothing.
test('check on a project with no Claude Code history yet says why, and the two ways forward', async (t) => {
  const project = await realpath(await writeSession(t, { 'package.json': '{}' }));
  const home = await realpath(await writeSession(t, {}));

  const { code, stdout } = await runCli(['check'], { cwd: project, env: { HOME: home } });

  assert.equal(code, 0);
  assert.match(stdout, /^No sessions are stored for this directory, so there is nothing to check\./);
  assert.match(stdout, /agentwhy reads sessions Claude Code already keeps/);
  assert.match(stdout, /agentwhy init/);
});

// worth-running-every-day R31-R35, R37, the way a person does it: mark from the terminal, see it leave, see it on the page.
test('a mark is kept in the home directory, takes the file out of check and into History, and can be undone', async (t) => {
  const { project, home } = await projectWithSession(t);
  const before = await readdir(project);

  const marked = await runCli(['check', '--mark', 'rotated', 'apps/web/.env.development', '--note', 'new keys issued'], { cwd: project, env: { HOME: home } });

  assert.equal(marked.code, 0, marked.stderr);
  assert.match(marked.stdout, /^Marked apps\/web\/\.env\.development as rotated on /);
  const record = await readFile(join(home, '.agentwhy', 'projects', projectDirectoryName(project), 'marks.jsonl'), 'utf8');
  assert.match(record, /"kind":"mark","path":"apps\/web\/\.env\.development","label":"rotate","result":"rotated"/);
  assert.ok(!record.includes(RETURNED_SECRET), 'the record holds no value');
  assert.deepEqual(await readdir(project), before, 'nothing is written into the project');

  const checked = await runCli(['check'], { cwd: project, env: { HOME: home } });
  assert.doesNotMatch(checked.stdout, /ROTATE/);
  assert.match(checked.stdout, /^ {2}1 file was marked done and not reached since; History: agentwhy start --since 7d$/m);

  const out = await realpath(await writeSession(t, {}));
  const started = await runCli(['start', '--no-open', '--out', out], { cwd: project, env: { HOME: home } });
  assert.equal(started.code, 0, started.stderr);
  // What was marked is To fix's Done tab (`.ai/specs/2026-09-23-to-fix.md` T9), with the note the mark carried.
  const page = await readFile(join(out, 'to-fix.html'), 'utf8');
  assert.match(page, /<li class="tf-done-row">[\s\S]*?apps\/web\/\.env\.development[\s\S]*?<span class="tf-note">“new keys issued”<\/span>/);
  assert.match(page, /lang="en">✓ Fixed today</);

  const sharedOut = await realpath(await writeSession(t, {}));
  await runCli(['start', '--no-open', '--share', '--out', sharedOut], { cwd: project, env: { HOME: home } });
  for (const name of ['index.html', 'to-fix.html']) {
    assert.ok(!(await readFile(join(sharedOut, name), 'utf8')).includes('new keys issued'), `a shared ${name} carries no note`);
  }

  const undone = await runCli(['check', '--unmark', 'apps/web/.env.development'], { cwd: project, env: { HOME: home } });
  assert.equal(undone.code, 0);
  assert.match((await runCli(['check'], { cwd: project, env: { HOME: home } })).stdout, /^ {2}ROTATE {2,}apps\/web\/\.env\.development/m);
});

test('a mark that names no line of the check records nothing, with exit 2', async (t) => {
  const { project, home } = await projectWithSession(t);

  const { code, stdout } = await runCli(['check', '--mark', 'not-secret', 'apps/web/.env.development'], { cwd: project, env: { HOME: home } });
  const wrong = await runCli(['check', '--mark', 'rotated', 'nowhere.env'], { cwd: project, env: { HOME: home } });
  const bare = await runCli(['check', '--mark', 'rotated'], { cwd: project, env: { HOME: home } });
  const unknown = await runCli(['check', '--mark', 'deleted', 'apps/web/.env.development'], { cwd: project, env: { HOME: home } });

  assert.equal(code, 2);
  assert.match(stdout, /is a ROTATE line/);
  assert.equal(wrong.code, 2);
  assert.match(wrong.stdout, /^nowhere\.env is not a line of the check/);
  assert.equal(bare.code, 2);
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr + unknown.stdout, /--mark is rotated, not-secret, handled, not-private/);
  await assert.rejects(readdir(join(home, '.agentwhy')), 'nothing was written');
});
