// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
// What makes a folder agentwhy's plugin, in one place for the scripts that make one: the upload zip
// (`make-plugin-zip.mjs`), the branch `plugin` (`plugin-branch.mjs`) and the package check (`check-package.mjs`).
// `.ai/specs/2026-11-23-the-plugin-from-the-repository.md` RP3, RP7: a plugin directory gives an installer this folder
// and nothing else, so everything the plugin runs must be in it, and nothing that would make Claude Code install
// dependencies beside it (`.ai/specs/2026-10-15-agentwhy-as-a-plugin.md` APD2).
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/** The files that make the package a plugin (§5 of the plugin spec): without one it is a package and no plugin. */
export const PLUGIN_FILES = [
  '.claude-plugin/plugin.json',
  // `.ai/specs/2026-11-25-the-card-in-codex.md` CCX9: Codex installs this plugin too, and reads this one in place of Claude Code's.
  '.codex-plugin/plugin.json', 'hooks/hooks.json', 'skills/report/SKILL.md', 'skills/why/SKILL.md',
  // `.ai/specs/2026-11-24-talking-about-agentwhy.md` CV13: the card in the terminal, the one module `hooks.json` names and what it imports.
  ...['register.tsx', 'answer.ts', 'card.ts', 'cells.ts', 'conversation.ts', 'list.ts', 'pieces.ts', 'repository-words.ts', 'table.ts', 'words.ts'].map((file) => `hooks/terminal/${file}`),
];

/** What the plugin runs, and what a directory asks of a plugin folder beside it (a README and a licence). */
const ALSO_REQUIRED = ['dist/cli.js', 'package.json', 'README.md', 'LICENSE'];

/**
 * Any of these beside a `package.json` makes Claude Code install dependencies into its copy of the plugin, and Anthropic's
 * directory hold the plugin for a reviewer; the ones Claude Code does not install from are refused too, since a folder
 * holding one was not made by `npm pack`.
 */
const LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'bun.lock', 'bun.lockb', 'yarn.lock', 'pnpm-lock.yaml'];

/** The directory's limits for a plugin folder: files in all, and bytes for one file that is no image or font. */
export const DIRECTORY_FILE_LIMIT = 512;
export const DIRECTORY_SIZE_LIMIT = 256 * 1024;

/** Images and fonts, which the directory's size limit leaves out. An SVG is text there, so it is not one of them. */
const EXEMPT = /\.(?:png|jpe?g|gif|webp|woff2?|ttf|otf)$/i;

/** Every file under `directory`, as a path relative to it with `/` between its parts. */
export async function filesIn(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => relative(directory, join(entry.parentPath, entry.name)).split(sep).join('/'));
}

/** The version a JSON file of the folder names, and nothing when it cannot be read. */
async function versionIn(directory, path) {
  try {
    return JSON.parse(await readFile(join(directory, path), 'utf8')).version;
  } catch {
    return undefined;
  }
}

/**
 * Why `directory` is not the plugin of `@agentwhy/cli@version` as npm packs it, one line each; nothing when it is. With
 * no version, the two manifests need only agree with each other.
 */
export async function pluginProblems(directory, version) {
  const files = await filesIn(directory);
  const problems = [];
  for (const path of [...PLUGIN_FILES, ...ALSO_REQUIRED]) {
    if (!files.includes(path)) problems.push(`it holds no ${path}`);
  }
  for (const path of files.filter((file) => LOCKFILES.includes(file.split('/').pop()))) problems.push(`it holds a lockfile, ${path}`);
  if (files.some((path) => path.split('/').includes('node_modules'))) problems.push('it holds node_modules');
  const packaged = await versionIn(directory, 'package.json');
  const manifest = await versionIn(directory, '.claude-plugin/plugin.json');
  const wanted = version ?? packaged;
  if (packaged !== wanted) problems.push(`package.json says ${packaged ?? 'no version'}, not ${wanted}`);
  if (manifest !== wanted) problems.push(`.claude-plugin/plugin.json says ${manifest ?? 'no version'}, not ${wanted}`);
  return problems;
}

/** How the folder stands against the directory's limits: its file count, and its largest file that is no image or font. */
export async function pluginNumbers(directory) {
  const files = await filesIn(directory);
  let largest = { path: undefined, bytes: 0 };
  for (const path of files.filter((file) => !EXEMPT.test(file))) {
    const { size } = await stat(join(directory, path));
    if (size > largest.bytes) largest = { path, bytes: size };
  }
  return { files: files.length, largest };
}

/** The numbers in one sentence, for a person reading a release's log. */
export function numbersSaid({ files, largest }) {
  const count = files > DIRECTORY_FILE_LIMIT ? `${files} files (the directory holds a plugin of more than ${DIRECTORY_FILE_LIMIT} for a reviewer)` : `${files} files`;
  const size = largest.path === undefined ? 'no file that is no image or font' : `its largest file that is no image or font is ${largest.path}, ${largest.bytes} bytes of ${DIRECTORY_SIZE_LIMIT}`;
  return `${count}; ${size}`;
}

/** `owner/repo` from a package.json `repository`, a string or `{ url }`; nothing for a repository not on GitHub. */
export function githubRepository(repository) {
  const url = typeof repository === 'string' ? repository : repository?.url;
  return /github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url ?? '')?.slice(1, 3).join('/');
}

const PICTURE = /\.(?:png|jpe?g|gif|webp|svg)$/i;

/** One link target pointed at the repository at `ref`; a link that leaves the folder or goes elsewhere is kept. */
function linkAt(target, repository, ref) {
  if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) return target;
  const path = target.replace(/^(?:\.\/)+/, '');
  if (path === '' || path.startsWith('../')) return target;
  const bare = path.replace(/[?#].*$/, '');
  return PICTURE.test(bare)
    ? `https://raw.githubusercontent.com/${repository}/${ref}/${path}`
    : `https://github.com/${repository}/blob/${ref}/${path}`;
}

/**
 * RP4: a README whose relative links - Markdown links and pictures, and `src`, `srcset` and `href` in HTML - lead to the
 * repository at `ref` instead of the folder it sits in, which holds none of the documents or pictures it names.
 */
export function readmeLinksAt(text, repository, ref) {
  const markdown = text.replace(/(\]\()(<[^>\n]+>|[^)\s]+)/g, (_, open, target) =>
    target.startsWith('<') ? `${open}<${linkAt(target.slice(1, -1), repository, ref)}>` : `${open}${linkAt(target, repository, ref)}`);
  return markdown.replace(/(\s(?:src|href|srcset)=")([^"]*)"/g, (_, open, value) => {
    if (!open.includes('srcset')) return `${open}${linkAt(value, repository, ref)}"`;
    const candidates = value.split(',').map((candidate) => candidate.trim().replace(/^\S+/, (url) => linkAt(url, repository, ref)));
    return `${open}${candidates.join(', ')}"`;
  });
}
