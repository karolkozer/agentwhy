import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ClaudeCodeProjectCatalogue } from '../../../../src/adapter/claude-code/discovery/claude-code-project-catalogue.ts';
import { projectDirectoryName } from '../../../../src/adapter/claude-code/contract/projects.ts';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { jsonl, writeSession } from '../../../helpers/synthetic-session.ts';

const files = new NodeFileSystem();
const catalogueIn = (home: string) => new ClaudeCodeProjectCatalogue({ directories: files, transcripts: files, redactor: new Redactor('test-salt'), home });

const talked = (cwd: string, entrypoint = 'claude-vscode') => ({ type: 'user', isSidechain: false, cwd, entrypoint, message: { role: 'user', content: 'go on' } });
const title = (aiTitle: string) => ({ type: 'ai-title', aiTitle, sessionId: 'sess' });

/** A transcript in the directory Claude Code keeps a project's conversations in, last changed `at` seconds in. */
async function transcript(home: string, directory: string, name: string, lines: readonly object[], at: number): Promise<void> {
  const kept = join(home, '.claude', 'projects', directory);
  await mkdir(kept, { recursive: true });
  const path = join(kept, `${name}.jsonl`);
  await writeFile(path, jsonl(...lines));
  await utimes(path, at, at);
}

async function world(t: TestContext) {
  const home = await writeSession(t, {});
  const shop = await writeSession(t, {});
  const admin = join(shop, 'admin');
  await mkdir(admin);
  const gone = '/Users/someone/Projects/old-landing';
  return { home, shop, admin, gone };
}

// which-project V9, V10: one row per project whose folder its conversations say, newest conversation first.
test('projects are listed newest first, with the folder their conversations say, and whether it is still there', async (t) => {
  const { home, shop, admin, gone } = await world(t);
  await transcript(home, projectDirectoryName(shop), 'older', [talked(shop, 'cli')], 1_000);
  await transcript(home, projectDirectoryName(shop), 'newer', [talked(shop), title('Fix the checkout button')], 3_000);
  await transcript(home, projectDirectoryName(admin), 'only', [talked(admin, 'cli')], 2_000);
  await transcript(home, projectDirectoryName(gone), 'last', [talked(gone)], 500);

  const listing = await catalogueIn(home).list();

  assert.equal(listing.unreadable, 0);
  assert.deepEqual(listing.projects.map((project) => [project.path, project.exists, project.conversations]), [
    [shop, true, 2],
    [admin, true, 1],
    [gone, false, 1],
  ]);
  assert.deepEqual(listing.projects[0]?.newest, { modifiedAt: 3_000_000, title: 'Fix the checkout button', entryPoint: 'editor' });
  assert.deepEqual(listing.projects[1]?.newest, { modifiedAt: 2_000_000, entryPoint: 'terminal' });
  assert.equal(listing.projects[0]?.id, projectDirectoryName(shop), 'a project is named by its directory, never by its path');
});

// Contract v12: one conversation can carry more than one working directory - the agent moves into a folder of the project.
test('the folder is the working directory that matches the project, never the last one', async (t) => {
  const { home, shop } = await world(t);
  await transcript(home, projectDirectoryName(shop), 'moved', [talked(shop), talked(join(shop, 'src')), talked(join(shop, 'src'))], 1_000);

  const [project] = (await catalogueIn(home).list()).projects;
  assert.equal(project?.path, shop);
});

// The path is never decoded from the directory's name (§13.2 pitfall 6): a directory whose conversations do not say it is
// counted, and not listed.
test('a project whose conversations do not say its folder is counted, not guessed, and a directory with none is no project', async (t) => {
  const { home, shop } = await world(t);
  await transcript(home, '-srv-quiet', 'sess', [{ type: 'user', isSidechain: false, message: { role: 'user', content: 'hi' } }], 1_000);
  await transcript(home, '-srv-a', 'sess', [talked('/srv/b')], 1_000);
  await mkdir(join(home, '.claude', 'projects', '-srv-empty'), { recursive: true });
  await transcript(home, projectDirectoryName(shop), 'sess', [talked(shop)], 1_000);

  const listing = await catalogueIn(home).list();
  assert.equal(listing.unreadable, 2);
  assert.deepEqual(listing.projects.map((project) => project.path), [shop]);
});

test('a newest conversation that does not say the folder yet leaves it to the ones before it, and keeps its own title', async (t) => {
  const { home, shop } = await world(t);
  await transcript(home, projectDirectoryName(shop), 'before', [talked(shop, 'cli')], 1_000);
  await transcript(home, projectDirectoryName(shop), 'begun', [title('Just begun')], 2_000);

  const [project] = (await catalogueIn(home).list()).projects;
  assert.equal(project?.path, shop);
  assert.deepEqual(project?.newest, { modifiedAt: 2_000_000, title: 'Just begun' });
});

// Invariant 1, and VD7: another project's title is shown on a page, so it passes the redactor first.
test('a title passes the redactor before it is listed', async (t) => {
  const { home, shop } = await world(t);
  const token = `ghp_${'A'.repeat(36)}`;
  await transcript(home, projectDirectoryName(shop), 'sess', [talked(shop), title(`Rotate ${token} now`)], 1_000);

  const shown = (await catalogueIn(home).list()).projects[0]?.newest.title ?? '';
  assert.ok(!shown.includes('ghp_A'), 'the value is gone');
  assert.match(shown, /^Rotate .+ now$/);
});

test('a computer with no conversations kept has no projects, and that is not a failure', async (t) => {
  const home = await writeSession(t, {});
  assert.deepEqual(await catalogueIn(home).list(), { projects: [], unreadable: 0 });
});
