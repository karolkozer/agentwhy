// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { runNode } from '../helpers/cli.ts';

// `.ai/specs/2026-11-23-the-plugin-from-the-repository.md` RP1-RP4: the package npm serves, unpacked, as one commit on
// the branch `plugin` of the public repository, tagged `plugin-v<version>`. No test reaches npm or GitHub: `npm` is a
// fake that hands over a tarball made here, `claude` one that passes everything, and a bare repository stands in for
// GitHub.

const execFileAsync = promisify(execFile);
const SCRIPT = fileURLToPath(new URL('../../scripts/plugin-branch.mjs', import.meta.url));

interface PluginBranch {
  compareVersions(a: string, b: string): number;
}
interface PluginFolder {
  readmeLinksAt(text: string, repository: string, ref: string): string;
  githubRepository(repository: unknown): string | undefined;
  pluginProblems(directory: string, version?: string): Promise<string[]>;
  pluginNumbers(directory: string): Promise<{ files: number; largest: { path: string | undefined; bytes: number } }>;
}
// The script is plain JavaScript, which the typecheck does not read: its functions are typed here, by what they return.
const folder = (await import(new URL('../../scripts/plugin-folder.mjs', import.meta.url).href)) as PluginFolder;
const branchScript = (await import(new URL('../../scripts/plugin-branch.mjs', import.meta.url).href)) as PluginBranch;

// The fakes are shell scripts and the work is git's and tar's: the script runs in Ubuntu's CI and on a Mac, never on
// Windows, where these five would fail on the fakes alone.
const POSIX_ONLY = { skip: process.platform === 'win32' };

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await execFileAsync('git', args, { cwd })).stdout;
}

const IDENTITY = {
  GIT_AUTHOR_NAME: 'someone',
  GIT_AUTHOR_EMAIL: 'someone@example.com',
  GIT_COMMITTER_NAME: 'someone',
  GIT_COMMITTER_EMAIL: 'someone@example.com',
};

const README = [
  '# agentwhy',
  '',
  '<img src="docs/lockup-light.svg" alt="agentwhy" width="340">',
  '<source media="(prefers-color-scheme: dark)" srcset="docs/lockup-dark.svg">',
  '',
  'See [the reference](docs/reference.md#notify), [the licence](LICENSE), [below](#license) and',
  '[the site](https://agentwhy.dev).',
  '',
  '![The Conversations page](docs/screenshots/conversations.png)',
  '',
].join('\n');

/** The files of `@agentwhy/cli@<version>` as `npm pack` lays them out, under `package/`, and what a test adds. */
function packageFiles(version: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    'package.json': `${JSON.stringify({ name: '@agentwhy/cli', version, repository: { type: 'git', url: 'git+https://github.com/someone/fictional.git' } }, null, 2)}\n`,
    '.claude-plugin/plugin.json': `${JSON.stringify({ name: 'agentwhy', version })}\n`,
    '.codex-plugin/plugin.json': `${JSON.stringify({ name: 'agentwhy', hooks: {} })}\n`,
    'hooks/hooks.json': `${JSON.stringify({ hooks: {} })}\n`,
    ...Object.fromEntries(['answer.ts', 'card.ts', 'cells.ts', 'conversation.ts', 'list.ts', 'pieces.ts', 'register.tsx', 'repository-words.ts', 'table.ts', 'words.ts'].map((file) => [`hooks/terminal/${file}`, 'export {};\n'])),
    'skills/report/SKILL.md': '---\nname: report\n---\n',
    'skills/why/SKILL.md': '---\nname: why\n---\n',
    'dist/cli.js': '#!/usr/bin/env node\nconsole.log("agentwhy");\n',
    'README.md': README,
    LICENSE: 'Apache License\n',
    ...extra,
  };
}

/** A `npm` that hands over `<version>.tgz` from its folder for `pack`, and `<version>.integrity` for `view`. */
const FAKE_NPM = `
import { appendFileSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const here = new URL('.', import.meta.url);
const args = process.argv.slice(2);
appendFileSync(new URL('npm-calls.jsonl', here), JSON.stringify(args) + '\\n');
const version = args[1].split('@').pop();
if (args[0] === 'pack') {
  // <version>.missing holds how many more times the registry does not name the version yet.
  const missing = new URL(version + '.missing', here);
  const left = existsSync(missing) ? Number(readFileSync(missing, 'utf8')) : 0;
  if (left > 0) {
    writeFileSync(missing, String(left - 1));
    process.stderr.write('npm error code ETARGET\\nnpm error notarget No matching version found for @agentwhy/cli@' + version + '.\\n');
    process.exit(1);
  }
  copyFileSync(new URL(version + '.tgz', here), join(args[args.indexOf('--pack-destination') + 1], 'agentwhy-cli-' + version + '.tgz'));
} else if (args[0] === 'view') {
  process.stdout.write(readFileSync(new URL(version + '.integrity', here), 'utf8') + '\\n');
} else {
  process.exit(1);
}
`;

const FAKE_CLAUDE = `
import { appendFileSync, existsSync } from 'node:fs';
const here = new URL('.', import.meta.url);
appendFileSync(new URL('claude-calls.jsonl', here), JSON.stringify(process.argv.slice(2)) + '\\n');
if (existsSync(new URL('claude-refuses', here))) {
  process.stdout.write('hooks/hooks.json: invalid\\n');
  process.exit(1);
}
`;

interface World {
  /** The public repository's checkout, as `publish.yml` has it. */
  repo: string;
  /** The bare repository standing in for GitHub. */
  remote: string;
  /** The fakes' folder. */
  tools: string;
  /**
   * Puts `@agentwhy/cli@<version>` on the fake registry, with the integrity it names, and tags `v<version>`; `missing`
   * is how many times `npm pack` says first that the registry does not name it yet.
   */
  release(version: string, options?: { extra?: Record<string, string>; integrity?: string; missing?: number }): Promise<void>;
  run(...args: string[]): Promise<{ code: number; stdout: string }>;
  runWith(env: Record<string, string>, ...args: string[]): Promise<{ code: number; stdout: string }>;
  claudeCalls(): Promise<string[][]>;
}

/** Everything in a directory whose name holds a space, the way a checkout's path can. */
async function withWorld(body: (world: World) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'agentwhy plugin branch '));
  try {
    const tools = join(root, 'fake tools');
    await mkdir(tools, { recursive: true });
    const fake = async (name: string, source: string): Promise<string> => {
      await writeFile(join(tools, `${name}.mjs`), source);
      const path = join(tools, name);
      await writeFile(path, `#!/bin/sh\nexec "${process.execPath}" "${join(tools, `${name}.mjs`)}" "$@"\n`);
      await chmod(path, 0o755);
      return path;
    };
    const npm = await fake('npm', FAKE_NPM);
    const claude = await fake('claude', FAKE_CLAUDE);

    const repo = join(root, 'public');
    const remote = join(root, 'github.git');
    await git(root, 'init', '-q', '--bare', '-b', 'main', remote);
    await mkdir(repo);
    await git(repo, 'init', '-q', '-b', 'main');
    await git(repo, 'config', 'user.name', 'someone');
    await git(repo, 'config', 'user.email', 'someone@example.com');
    await writeFile(join(repo, 'README.md'), '# agentwhy\n');
    await git(repo, 'add', '--all');
    await git(repo, 'commit', '-q', '-m', 'agentwhy 1.2.3');
    await git(repo, 'remote', 'add', 'origin', remote);
    await git(repo, 'push', '-q', 'origin', 'main');

    const release = async (version: string, options: { extra?: Record<string, string>; integrity?: string; missing?: number } = {}): Promise<void> => {
      const staged = join(root, `staged ${version}`);
      for (const [path, text] of Object.entries(packageFiles(version, options.extra))) {
        await mkdir(dirname(join(staged, 'package', path)), { recursive: true });
        await writeFile(join(staged, 'package', path), text);
      }
      await chmod(join(staged, 'package', 'dist', 'cli.js'), 0o755);
      const tarball = join(tools, `${version}.tgz`);
      await execFileAsync('tar', ['-czf', tarball, 'package'], { cwd: staged });
      const integrity = `sha512-${createHash('sha512').update(await readFile(tarball)).digest('base64')}`;
      await writeFile(join(tools, `${version}.integrity`), options.integrity ?? integrity);
      if (options.missing !== undefined) await writeFile(join(tools, `${version}.missing`), String(options.missing));
      await git(repo, 'commit', '-q', '--allow-empty', '-m', `agentwhy ${version}`);
      await git(repo, 'tag', `v${version}`);
    };
    const runWith = async (env: Record<string, string>, ...args: string[]) => {
      const { code, stdout, stderr } = await runNode(SCRIPT, ['--repo', repo, ...args], {
        env: { AGENTWHY_PLUGIN_NPM: npm, AGENTWHY_PLUGIN_CLAUDE: claude, AGENTWHY_PLUGIN_RETRY_MS: '10', ...IDENTITY, ...env },
      });
      return { code, stdout: stdout + stderr };
    };
    const run = (...args: string[]) => runWith({}, ...args);
    const claudeCalls = async () =>
      (await readFile(join(tools, 'claude-calls.jsonl'), 'utf8').catch(() => ''))
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line) as string[]);
    await body({ repo, remote, tools, release, run, runWith, claudeCalls });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function refs(remote: string): Promise<string> {
  return git(remote, 'for-each-ref', '--format=%(refname) %(objectname)');
}

test('the first release becomes the first commit of plugin, tagged, holding the package and its README pointed at the tag', POSIX_ONLY, async () => {
  await withWorld(async ({ repo, remote, release, run, claudeCalls }) => {
    await release('1.2.3');
    const { code, stdout } = await run('--version', '1.2.3');
    assert.equal(code, 0, stdout);
    assert.match(stdout, /@agentwhy\/cli@1\.2\.3 as npm serves it \(sha512-[^)]+\) is the plugin: 19 files/);
    assert.match(stdout, /`claude plugin validate --strict` passed it/);
    assert.match(stdout, /pushed [0-9a-f]{40} to origin\/plugin - agentwhy 1\.2\.3, 19 files, the branch's first commit - and the tag plugin-v1\.2\.3/);

    const branch = (await git(remote, 'rev-parse', 'refs/heads/plugin')).trim();
    assert.equal((await git(remote, 'rev-parse', 'refs/tags/plugin-v1.2.3^{commit}')).trim(), branch, 'the tag names the branch\'s commit');
    assert.equal((await git(remote, 'rev-list', '--count', branch)).trim(), '1', 'no history in common with main');
    assert.deepEqual((await git(remote, 'ls-tree', '-r', '--name-only', branch)).trim().split('\n').sort(), Object.keys(packageFiles('1.2.3')).sort());
    assert.match(await git(remote, 'ls-tree', branch, 'dist/cli.js'), /^100755 /, 'cli.js keeps its mode');

    const tagCommit = (await git(repo, 'rev-parse', 'v1.2.3^{commit}')).trim();
    const message = await git(remote, 'log', '-1', '--format=%B', branch);
    assert.match(message, new RegExp(`^agentwhy 1\\.2\\.3\\n\\nBuilt for v1\\.2\\.3 \\(${tagCommit}\\): @agentwhy/cli@1\\.2\\.3 as npm serves it, unpacked, with README\\.md's relative links pointed at v1\\.2\\.3\\.\\n\\nintegrity: sha512-`));

    const readme = await git(remote, 'show', `${branch}:README.md`);
    assert.match(readme, /src="https:\/\/raw\.githubusercontent\.com\/someone\/fictional\/v1\.2\.3\/docs\/lockup-light\.svg"/);
    assert.match(readme, /\[the reference\]\(https:\/\/github\.com\/someone\/fictional\/blob\/v1\.2\.3\/docs\/reference\.md#notify\)/);
    assert.match(readme, /\[below\]\(#license\)/);
    assert.equal(await git(remote, 'show', `${branch}:LICENSE`), 'Apache License\n');

    const validated = await claudeCalls();
    assert.equal(validated.length, 1);
    assert.deepEqual(validated[0]?.slice(0, 3), ['plugin', 'validate', '--strict']);
    assert.equal(await git(repo, 'status', '--porcelain'), '', 'the checkout is left as it was');
  });
});

test('a second run for the same release changes nothing, and pushes only a tag the branch lacks', POSIX_ONLY, async () => {
  await withWorld(async ({ remote, release, run }) => {
    await release('1.2.3');
    assert.equal((await run('--version', '1.2.3')).code, 0);
    const before = await refs(remote);

    const again = await run('--version', '1.2.3');
    assert.equal(again.code, 0, again.stdout);
    assert.match(again.stdout, /origin\/plugin already holds 1\.2\.3, tagged plugin-v1\.2\.3; nothing to do/);
    assert.equal(await refs(remote), before);

    await git(remote, 'tag', '-d', 'plugin-v1.2.3');
    const tagged = await run('--version', '1.2.3');
    assert.equal(tagged.code, 0, tagged.stdout);
    assert.match(tagged.stdout, /already holds 1\.2\.3; pushed the tag plugin-v1\.2\.3 it lacked/);
    assert.equal(await refs(remote), before);
  });
});

test('the next release goes on top of the last, and an earlier one after it is refused', POSIX_ONLY, async () => {
  await withWorld(async ({ remote, release, run }) => {
    await release('1.2.3');
    assert.equal((await run('--version', '1.2.3')).code, 0);
    const first = (await git(remote, 'rev-parse', 'refs/heads/plugin')).trim();
    await release('1.3.0', { extra: { 'dist/report.js': 'export const added = true;\n' } });

    const next = await run('--version', '1.3.0');
    assert.equal(next.code, 0, next.stdout);
    const second = (await git(remote, 'rev-parse', 'refs/heads/plugin')).trim();
    assert.equal((await git(remote, 'rev-parse', `${second}^`)).trim(), first);
    assert.match(next.stdout, new RegExp(`20 files, on top of ${first.slice(0, 12)} \\(1\\.2\\.3\\)`));
    assert.match(await git(remote, 'ls-tree', '-r', '--name-only', second), /dist\/report\.js/);

    await release('1.2.4');
    const older = await run('--version', '1.2.4');
    assert.equal(older.code, 1);
    assert.match(older.stdout, /FAIL: origin\/plugin holds 1\.3\.0, later than 1\.2\.4/);
    assert.equal((await git(remote, 'rev-parse', 'refs/heads/plugin')).trim(), second);
  });
});

test('a tarball the registry does not name, or one that is not the plugin, writes nothing', POSIX_ONLY, async () => {
  await withWorld(async ({ remote, release, run }) => {
    await release('1.2.3', { integrity: 'sha512-c29tZXRoaW5nIGVsc2U=' });
    const swapped = await run('--version', '1.2.3');
    assert.equal(swapped.code, 1);
    assert.match(swapped.stdout, /FAIL: the tarball npm handed over is not the one the registry names/);

    await release('1.2.4', { extra: { 'package-lock.json': '{}\n', '.claude-plugin/plugin.json': '{"name":"agentwhy","version":"1.2.0"}\n' } });
    const locked = await run('--version', '1.2.4');
    assert.equal(locked.code, 1);
    assert.match(locked.stdout, /FAIL: @agentwhy\/cli@1\.2\.4 is not the plugin: it holds a lockfile, package-lock\.json; \.claude-plugin\/plugin\.json says 1\.2\.0, not 1\.2\.4/);
    assert.doesNotMatch(await refs(remote), /plugin/);
  });
});

test('--dry-run makes the commit and pushes nothing; without the release\'s tag nothing is made', POSIX_ONLY, async () => {
  await withWorld(async ({ remote, release, run }) => {
    const untagged = await run('--version', '1.2.3');
    assert.equal(untagged.code, 1);
    assert.match(untagged.stdout, /FAIL: there is no tag v1\.2\.3 in .*; the plugin branch is written for a release/);

    await release('1.2.3');
    const dry = await run('--version', '1.2.3', '--dry-run');
    assert.equal(dry.code, 0, dry.stdout);
    assert.match(dry.stdout, /made [0-9a-f]{40} - agentwhy 1\.2\.3, 19 files, the branch's first commit; pushed nothing \(--dry-run\)/);
    assert.match(dry.stdout, /to push it: git -C .* push --atomic origin [0-9a-f]{40}:refs\/heads\/plugin [0-9a-f]{40}:refs\/tags\/plugin-v1\.2\.3/);
    assert.doesNotMatch(await refs(remote), /plugin/);
  });
});

test('a release npm does not name yet is asked for again; a claude that refuses, or a remote that cannot be read, writes nothing', POSIX_ONLY, async () => {
  await withWorld(async ({ remote, tools, release, run, runWith }) => {
    await release('1.2.3', { missing: 2 });
    const late = await run('--version', '1.2.3', '--dry-run');
    assert.equal(late.code, 0, late.stdout);
    assert.equal(late.stdout.split('npm does not name @agentwhy/cli@1.2.3 yet; asking again').length - 1, 2);

    await writeFile(join(tools, 'claude-refuses'), '');
    const refused = await run('--version', '1.2.3');
    assert.equal(refused.code, 1);
    assert.match(refused.stdout, /FAIL: claude plugin validate --strict refused the plugin: hooks\/hooks\.json: invalid/);
    assert.doesNotMatch(await refs(remote), /plugin/);

    const unvalidated = await runWith({ AGENTWHY_PLUGIN_CLAUDE: join(tools, 'no claude here') }, '--version', '1.2.3');
    assert.equal(unvalidated.code, 0, unvalidated.stdout);
    assert.match(unvalidated.stdout, /`claude` is not on PATH, so it was not validated/);
    assert.match(await refs(remote), /refs\/heads\/plugin /);
  });
  await withWorld(async ({ repo, release, run }) => {
    await release('1.2.3');
    await git(repo, 'remote', 'set-url', 'origin', join(repo, 'no remote here'));
    const unread = await run('--version', '1.2.3');
    assert.equal(unread.code, 1);
    assert.match(unread.stdout, /FAIL: could not read origin \(git ls-remote exited \d+\); nothing was written/);
  });
});

test('versions are ordered as semver orders them, a pre-release before its release', () => {
  const { compareVersions } = branchScript;
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.2.3-rc.1', '1.2.3'), -1);
  assert.equal(compareVersions('1.2.3', '1.2.3-rc.1'), 1);
  assert.equal(compareVersions('1.2.3-rc.2', '1.2.3-rc.10'), -1);
  assert.equal(compareVersions('1.2.3-1', '1.2.3-alpha'), -1);
  assert.equal(compareVersions('1.2.3-alpha', '1.2.3-alpha.1'), -1);
});

test('a README\'s relative links lead to the repository at the tag, and every other link is kept', () => {
  const at = (text: string) => folder.readmeLinksAt(text, 'someone/fictional', 'v1.2.3');
  assert.equal(at('[a](docs/a.md#x)'), '[a](https://github.com/someone/fictional/blob/v1.2.3/docs/a.md#x)');
  assert.equal(at('![a](./docs/a.png "title")'), '![a](https://raw.githubusercontent.com/someone/fictional/v1.2.3/docs/a.png "title")');
  assert.equal(at('[a](<docs/a b.md>)'), '[a](<https://github.com/someone/fictional/blob/v1.2.3/docs/a b.md>)');
  assert.equal(at('<img src="docs/a.gif">'), '<img src="https://raw.githubusercontent.com/someone/fictional/v1.2.3/docs/a.gif">');
  assert.equal(at('<source srcset="a.png 1x, b.png 2x">'), '<source srcset="https://raw.githubusercontent.com/someone/fictional/v1.2.3/a.png 1x, https://raw.githubusercontent.com/someone/fictional/v1.2.3/b.png 2x">');
  for (const kept of ['[a](#license)', '[a](https://agentwhy.dev)', '[a](mailto:someone@example.com)', '[a](/root.md)', '[a](../up.md)', '<a href="#top">']) {
    assert.equal(at(kept), kept);
  }
  assert.equal(folder.githubRepository({ url: 'git+https://github.com/someone/fictional.git' }), 'someone/fictional');
  assert.equal(folder.githubRepository('https://gitlab.com/someone/fictional'), undefined);
});

test('a plugin folder\'s numbers leave pictures out of the size, and its problems say each missing file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agentwhy-plugin-folder-'));
  try {
    await mkdir(join(root, 'docs'), { recursive: true });
    await writeFile(join(root, 'docs', 'big.png'), Buffer.alloc(300_000));
    await writeFile(join(root, 'docs', 'logo.svg'), Buffer.alloc(2_000));
    await writeFile(join(root, 'package.json'), '{"version":"1.0.0"}\n');
    const numbers = await folder.pluginNumbers(root);
    assert.deepEqual(numbers, { files: 3, largest: { path: 'docs/logo.svg', bytes: 2_000 } });

    const problems = await folder.pluginProblems(root, '1.0.0');
    assert.ok(problems.includes('it holds no dist/cli.js'), problems.join('\n'));
    assert.ok(problems.includes('it holds no .claude-plugin/plugin.json'), problems.join('\n'));
    assert.ok(problems.includes('.claude-plugin/plugin.json says no version, not 1.0.0'), problems.join('\n'));
    await mkdir(join(root, 'node_modules', 'x'), { recursive: true });
    await writeFile(join(root, 'node_modules', 'x', 'index.js'), '');
    assert.ok((await folder.pluginProblems(root, '1.0.0')).includes('it holds node_modules'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
