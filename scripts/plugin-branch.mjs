// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
// The plugin as a branch of the public repository (`.ai/specs/2026-11-23-the-plugin-from-the-repository.md` RP1-RP4).
// The repository's own plugin files run `dist/cli.js`, which only the npm package holds, so a directory that reads a
// plugin from GitHub - Anthropic's, aitmpl.com, awesome-copilot - meets hooks that fail. `publish.yml` runs this once npm
// has published a release: it takes `@agentwhy/cli@<version>` as npm serves it, checks the file against the registry's
// integrity, unpacks it, checks it is the plugin, points its README's links at the release's tag, and adds it as one
// commit on the branch `plugin` - which shares no history with `main` and is never written by hand - tagged
// `plugin-v<version>`. Never with force; a branch that already holds the version gets only a tag it lacks.
//
//   node scripts/plugin-branch.mjs --version 0.9.0              # in the public repository, after npm holds 0.9.0
//   node scripts/plugin-branch.mjs --version 0.9.0 --dry-run    # makes the commit, pushes nothing
//   node scripts/plugin-branch.mjs --repo <dir> --remote <name> # another repository or remote than this one's origin
//
// The tag `v<version>` must be in the repository. It needs git, npm and tar on PATH; `claude`, where it is, validates
// the folder. `AGENTWHY_PLUGIN_NPM` and `AGENTWHY_PLUGIN_CLAUDE` name other programs: the tests hand it fakes.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { DIRECTORY_SIZE_LIMIT, filesIn, githubRepository, numbersSaid, pluginNumbers, pluginProblems, readmeLinksAt } from './plugin-folder.mjs';

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PACKAGE = '@agentwhy/cli';
/** RPD6: the branch the plugin lives on, and its tags. `publish.yml`'s `v*.*.*` never matches one. */
export const BRANCH = 'plugin';
export const tagOf = (version) => `plugin-v${version}`;

const NPM = process.env.AGENTWHY_PLUGIN_NPM || 'npm';
const CLAUDE = process.env.AGENTWHY_PLUGIN_CLAUDE || 'claude';
/**
 * The job starts the moment npm accepts the release, and the registry's copy of the package's versions can lag behind
 * it, so a version npm does not name yet is asked for again: every 30 seconds for 10 minutes. The tests wait less.
 */
const RETRY_MS = Number(process.env.AGENTWHY_PLUGIN_RETRY_MS) || 30_000;
const TRIES = 20;

async function git(cwd, args, env) {
  return (await execFileAsync('git', args, { cwd, env: env ?? process.env, maxBuffer: 64 * 1024 * 1024 })).stdout.toString();
}

/** The exit code of a git command: 0, or the code it failed with. */
async function gitExit(cwd, args) {
  return git(cwd, args).then(() => 0, (error) => (typeof error.code === 'number' ? error.code : 1));
}

/** `sha512-<base64>`, the form npm's `dist.integrity` takes, of a file's bytes. */
export function integrityOf(bytes) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}

/**
 * -1, 0 or 1 for two versions of three numbers, as semver orders them: with the numbers equal, a version with no
 * pre-release part is the later one (`1.2.3-rc.1` comes before `1.2.3`), and two pre-release parts are compared field by
 * field - numbers as numbers, below words.
 */
export function compareVersions(a, b) {
  const [left, right] = [a, b].map((version) => {
    const [numbers, pre] = version.split('+')[0].split(/-(.*)/s);
    return { numbers: numbers.split('.').map(Number), pre: pre === undefined ? undefined : pre.split('.') };
  });
  for (let index = 0; index < 3; index += 1) {
    if (left.numbers[index] !== right.numbers[index]) return left.numbers[index] < right.numbers[index] ? -1 : 1;
  }
  if (left.pre === undefined || right.pre === undefined) return left.pre === right.pre ? 0 : left.pre === undefined ? 1 : -1;
  for (let index = 0; index < Math.max(left.pre.length, right.pre.length); index += 1) {
    const [x, y] = [left.pre[index], right.pre[index]];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const [xNumber, yNumber] = [/^\d+$/.test(x), /^\d+$/.test(y)];
    if (xNumber && yNumber) return Number(x) < Number(y) ? -1 : 1;
    if (xNumber !== yNumber) return xNumber ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * The commit's words (RP1): the version, the tag and commit it was built for, the bytes npm serves - and the one file
 * that differs from them, README.md, whose links RP4 points at the tag.
 */
export function commitMessage(version, tagCommit, integrity) {
  return (
    `agentwhy ${version}\n\nBuilt for v${version} (${tagCommit}): ${PACKAGE}@${version} as npm serves it, unpacked, ` +
    `with README.md's relative links pointed at v${version}.\n\nintegrity: ${integrity}\n`
  );
}

/**
 * Whether the remote has a ref: `ls-remote --exit-code` says 2 for none. Any other failure is a remote that could not
 * be read, never taken for one without the ref - that would build a first commit for a branch that has many.
 */
async function remoteHas(repo, remote, ref) {
  const code = await gitExit(repo, ['ls-remote', '--exit-code', remote, ref]);
  if (code === 2) return false;
  if (code !== 0) throw new Error(`could not read ${remote} (git ls-remote exited ${code}); nothing was written`);
  return true;
}

/** What the branch on the remote holds: its newest commit and the version its manifest names, or nothing. */
async function branchOnRemote(repo, remote) {
  if (!(await remoteHas(repo, remote, `refs/heads/${BRANCH}`))) return undefined;
  const ref = `refs/remotes/${remote}/${BRANCH}`;
  await git(repo, ['fetch', '--quiet', '--no-tags', remote, `+refs/heads/${BRANCH}:${ref}`]);
  const commit = (await git(repo, ['rev-parse', `${ref}^{commit}`])).trim();
  const manifest = await git(repo, ['show', `${commit}:.claude-plugin/plugin.json`]).catch(() => undefined);
  let version;
  try {
    version = JSON.parse(manifest ?? '').version;
  } catch {
    version = undefined;
  }
  return { commit, version };
}

/** Whether the remote has the tag. */
async function tagOnRemote(repo, remote, tag) {
  return remoteHas(repo, remote, `refs/tags/${tag}`);
}

/** npm's answer for a version it does not name (yet): no matching version, or not found. */
const NOT_THERE = /\b(?:ETARGET|E404)\b|No matching version/;

/** `npm pack` of the spec into `work`, asked again while the registry does not name the version yet (RETRY_MS). */
async function packed(spec, work) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await execFileAsync(NPM, ['pack', spec, '--ignore-scripts', '--pack-destination', work], { cwd: work });
      return;
    } catch (error) {
      const said = `${error.stdout ?? ''}${error.stderr ?? ''}`;
      if (!NOT_THERE.test(said) || attempt >= TRIES) throw new Error(`npm pack ${spec} failed after ${attempt} ${attempt === 1 ? 'try' : 'tries'}: ${said.trim() || error.message}`);
      process.stdout.write(`npm does not name ${spec} yet; asking again in ${RETRY_MS / 1000} s (${attempt} of ${TRIES})\n`);
      await new Promise((done) => setTimeout(done, RETRY_MS));
    }
  }
}

/** The package as npm serves it, in `work`: the file and its integrity, checked against the registry's. */
async function fetchPackage(version, work) {
  const spec = `${PACKAGE}@${version}`;
  await packed(spec, work);
  const tarballs = (await readdir(work)).filter((name) => name.endsWith('.tgz'));
  if (tarballs.length !== 1) throw new Error(`npm pack ${spec} wrote ${tarballs.length} tarballs`);
  const file = join(work, tarballs[0]);
  const integrity = integrityOf(await readFile(file));
  const registry = (await execFileAsync(NPM, ['view', spec, 'dist.integrity'], { cwd: work })).stdout.toString().trim();
  if (registry !== integrity) throw new Error(`the tarball npm handed over is not the one the registry names: ${integrity} against ${registry || 'none'}`);
  return { file, integrity };
}

/** RP3: `claude plugin validate --strict`, said as skipped where `claude` is not on PATH. */
async function validated(folder) {
  return execFileAsync(CLAUDE, ['plugin', 'validate', '--strict', folder]).then(
    () => '`claude plugin validate --strict` passed it',
    (error) => {
      if (error.code === 'ENOENT') return '`claude` is not on PATH, so it was not validated';
      throw new Error(`claude plugin validate --strict refused the plugin: ${error.stdout ?? ''}${error.stderr ?? ''}`);
    },
  );
}

/** The folder as one commit whose one parent is the branch's newest, or none: a temporary index, never the work tree. */
async function commitOf(repo, folder, parent, message, work) {
  const env = { ...process.env, GIT_INDEX_FILE: join(work, 'index') };
  const gitDir = (await git(repo, ['rev-parse', '--absolute-git-dir'])).trim();
  // Run from inside the folder, which is the work tree here. `--force`: a person's own ignore rules (a global `dist/`,
  // say) must not leave a file of the package out.
  await git(folder, ['--git-dir', gitDir, '--work-tree', folder, 'add', '--all', '--force', '.'], env);
  const tree = (await git(folder, ['--git-dir', gitDir, 'write-tree'], env)).trim();
  await writeFile(join(work, 'message'), message);
  const parents = parent === undefined ? [] : ['-p', parent];
  return (await git(repo, ['commit-tree', tree, ...parents, '-F', join(work, 'message')])).trim();
}

/** Writes the branch for `version`; what it did, in lines for the log. Throws with a line a person can act on. */
export async function writePluginBranch({ repo, remote, version, dryRun }) {
  const said = [];
  const tagCommit = (await git(repo, ['rev-parse', '--verify', '-q', `refs/tags/v${version}^{commit}`]).catch(() => '')).trim();
  if (tagCommit === '') throw new Error(`there is no tag v${version} in ${repo}; the plugin branch is written for a release`);
  const tag = tagOf(version);
  const branch = await branchOnRemote(repo, remote);
  const tagged = await tagOnRemote(repo, remote, tag);

  if (branch?.version === version) {
    if (tagged) return [`${remote}/${BRANCH} already holds ${version}, tagged ${tag}; nothing to do`];
    if (dryRun) return [`${remote}/${BRANCH} already holds ${version}; would push the tag ${tag} at ${branch.commit}`];
    await git(repo, ['push', '--quiet', remote, `${branch.commit}:refs/tags/${tag}`]);
    return [`${remote}/${BRANCH} already holds ${version}; pushed the tag ${tag} it lacked, at ${branch.commit}`];
  }
  if (branch?.version !== undefined && compareVersions(branch.version, version) > 0) {
    throw new Error(`${remote}/${BRANCH} holds ${branch.version}, later than ${version}; a release is never put on top of a later one`);
  }
  if (tagged) throw new Error(`${remote} has the tag ${tag} already, but ${BRANCH} does not hold ${version}; look before writing anything`);

  const work = await mkdtemp(join(tmpdir(), 'agentwhy-plugin-branch-'));
  try {
    const { file, integrity } = await fetchPackage(version, work);
    await execFileAsync('tar', ['-xzf', file, '-C', work]);
    const folder = join(work, 'package');
    const problems = await pluginProblems(folder, version);
    if (problems.length > 0) throw new Error(`${PACKAGE}@${version} is not the plugin: ${problems.join('; ')}`);
    const numbers = await pluginNumbers(folder);
    if (numbers.largest.bytes >= DIRECTORY_SIZE_LIMIT) throw new Error(`${numbers.largest.path} is ${numbers.largest.bytes} bytes, at or over the directory's ${DIRECTORY_SIZE_LIMIT}`);
    said.push(`${PACKAGE}@${version} as npm serves it (${integrity}) is the plugin: ${numbersSaid(numbers)}; ${await validated(folder)}`);

    const repository = githubRepository(JSON.parse(await readFile(join(folder, 'package.json'), 'utf8')).repository);
    if (repository === undefined) throw new Error("package.json's repository is not on GitHub, so the README's links cannot be pointed at it");
    const readme = join(folder, 'README.md');
    await writeFile(readme, readmeLinksAt(await readFile(readme, 'utf8'), repository, `v${version}`));

    const commit = await commitOf(repo, folder, branch?.commit, commitMessage(version, tagCommit, integrity), work);
    const count = (await filesIn(folder)).length;
    const parent = branch === undefined ? 'the branch\'s first commit' : `on top of ${branch.commit.slice(0, 12)} (${branch.version ?? 'no version'})`;
    if (dryRun) {
      said.push(`made ${commit} - agentwhy ${version}, ${count} files, ${parent}; pushed nothing (--dry-run)`);
      said.push(`to push it: git -C ${repo} push --atomic ${remote} ${commit}:refs/heads/${BRANCH} ${commit}:refs/tags/${tag}`);
      return said;
    }
    // One push for both, so a tag never names a commit the branch does not hold; never forced, so a branch that moved
    // since it was read refuses it.
    await git(repo, ['push', '--quiet', '--atomic', remote, `${commit}:refs/heads/${BRANCH}`, `${commit}:refs/tags/${tag}`]);
    said.push(`pushed ${commit} to ${remote}/${BRANCH} - agentwhy ${version}, ${count} files, ${parent} - and the tag ${tag}`);
    return said;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function main() {
  const { values } = parseArgs({
    options: { version: { type: 'string' }, repo: { type: 'string' }, remote: { type: 'string' }, 'dry-run': { type: 'boolean' } },
  });
  const repo = resolve(values.repo ?? ROOT);
  const version = values.version ?? JSON.parse(await readFile(join(repo, 'package.json'), 'utf8')).version;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
    process.stdout.write(`FAIL: ${version} is not a version\n`);
    return 1;
  }
  try {
    for (const line of await writePluginBranch({ repo, remote: values.remote ?? 'origin', version, dryRun: values['dry-run'] === true })) {
      process.stdout.write(`${line}\n`);
    }
    return 0;
  } catch (error) {
    process.stdout.write(`FAIL: ${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main();
