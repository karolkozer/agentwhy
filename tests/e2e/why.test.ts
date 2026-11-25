// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECTS_DIRECTORY, projectDirectoryName } from '../../src/adapter/claude-code/contract/projects.ts';
import { runCli } from '../helpers/cli.ts';
import { RETURN_SESSION_ID, RETURNED_SECRET, returnSessionFiles } from '../helpers/return-session.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

/** A project whose one stored session is the motivating case's shape, under a home of its own - as `check`'s tests have it. */
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

// `2026-11-20-ask-your-ai-why.md` AY1, AY4, the plan's step 8: `why` through the composition root - the catalogue, the
// report read as `report` reads it, the chat's renderer and the language - run the way the skill runs it.
test('why answers for a stored conversation through the whole command, and never prints a value', async (t) => {
  const { project, home } = await projectWithSession(t);
  const env = { HOME: home, LANG: 'en_US.UTF-8' };

  const answer = await runCli(['why', '--session', RETURN_SESSION_ID], { cwd: project, env });
  assert.equal(answer.code, 0, answer.stderr);
  assert.match(answer.stdout, /^\*\*agentwhy\*\* · this conversation: \*\*[^*]+\*\*$/m);
  assert.match(answer.stdout, /\nMore: `steps` · `folders` · `table` · `diagram` · `card`\n$/);

  for (const word of ['steps', 'folders', 'table', 'diagram', 'card']) {
    const view = await runCli(['why', '--session', RETURN_SESSION_ID, word], { cwd: project, env });
    assert.equal(view.code, 0, word + ': ' + view.stderr);
    assert.ok(!view.stdout.includes(RETURNED_SECRET), word + ': no value, ever');
  }
  assert.ok(!answer.stdout.includes(RETURNED_SECRET), 'no value, ever');
});

test('run by the skill, a conversation not yet written down answers in the chosen language and exits 0', async (t) => {
  const { project, home } = await projectWithSession(t);
  const plugin = await runCli(['why', '--session', 'not-written-yet', '--plugin'], { cwd: project, env: { HOME: home, LANG: 'pl_PL.UTF-8' } });
  assert.equal(plugin.code, 0, plugin.stderr);
  assert.match(plugin.stdout, /^agentwhy nie ma jeszcze zapisu tej rozmowy: /);

  const typed = await runCli(['why', '--session', 'not-written-yet'], { cwd: project, env: { HOME: home } });
  assert.equal(typed.code, 1, 'typed by a person, a missing conversation keeps its exit code');
  const word = await runCli(['why', '--session', RETURN_SESSION_ID, 'steps; echo INJECTED'], { cwd: project, env: { HOME: home } });
  assert.equal(word.code, 2);
  assert.ok(!word.stdout.includes('INJECTED') && !word.stderr.includes('INJECTED\n'), 'nothing after the word ran');
});

// AYO9, AYB13: the AI's command for a view names no conversation - its pre-approval could not name this one - and `why`
// reads it from `CLAUDE_CODE_SESSION_ID`, which Claude Code sets for every command its AI runs.
test('run by the skill for a view, the conversation is the one Claude Code says the command runs in', async (t) => {
  const { project, home } = await projectWithSession(t);
  const named = await runCli(['why', '--session', RETURN_SESSION_ID, '--plugin', 'table'], { cwd: project, env: { HOME: home } });
  const fromEnvironment = await runCli(['why', '--plugin', 'table'], { cwd: project, env: { HOME: home, CLAUDE_CODE_SESSION_ID: RETURN_SESSION_ID } });
  assert.equal(fromEnvironment.code, 0, fromEnvironment.stderr);
  assert.equal(fromEnvironment.stdout, named.stdout, 'the same answer as with the conversation named');
  assert.match(fromEnvironment.stdout, /^\| What happened \| File \| Folder \|$/m);

  const unset = await runCli(['why', '--plugin', 'table'], { cwd: project, env: { HOME: home, LANG: 'en_US.UTF-8' } });
  assert.equal(unset.code, 0);
  assert.match(unset.stdout, /^agentwhy couldn’t tell which conversation this is/);
});

// AYO7, AYD10 (measured 2026-11-22): after the AI moves into a sub-folder - or out of its project - the skill's line runs
// there. The conversation is found where Claude Code keeps it, and answered as from its project's folder.
test('run from a sub-folder or from outside the project, the conversation is found and answered as from its project', async (t) => {
  const project = await realpath(await writeSession(t, { 'package.json': '{}', 'packages/web/index.ts': 'export {};\n' }));
  const stored = join(...PROJECTS_DIRECTORY, projectDirectoryName(project));
  // The record names the project's own folder, as Claude Code's does - which is how its project is known.
  const files = Object.entries(returnSessionFiles({ carried: 'value' })).map(([path, text]) => [join(stored, path), text.split('/work/the-app').join(project)]);
  const home = await realpath(await writeSession(t, Object.fromEntries(files)));
  const elsewhere = await realpath(await writeSession(t, { 'notes.txt': 'x\n' }));
  const env = { HOME: home, LANG: 'en_US.UTF-8', CLAUDE_CODE_SESSION_ID: RETURN_SESSION_ID };

  const fromProject = await runCli(['why', '--plugin'], { cwd: project, env });
  assert.match(fromProject.stdout, /^\*\*agentwhy\*\* · this conversation: /, fromProject.stdout);
  for (const cwd of [join(project, 'packages', 'web'), elsewhere]) {
    const moved = await runCli(['why', '--plugin'], { cwd, env });
    assert.equal(moved.code, 0, moved.stderr);
    assert.equal(moved.stdout, fromProject.stdout, 'the same answer as from the project\'s folder: ' + cwd);
  }
});
