// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
// The guardrail behind the corpus (M0 step 4). Six checks, all of them mechanical:
//
//   1. every committed fixture session carries the canary marker, so a fixture that was never redacted is caught
//   2. no committed fixture matches a class A secret pattern from spec §5.4
//   3. no `doctor` output over those fixtures contains the marker, in either format
//   4. tests/fixtures/real/ is not tracked by git
//   5. nothing but markers, identifiers and declared enumerations survives redaction
//   6. no tracked file carries a path from a real machine
//
// It prints file names, counts and pattern names. It never prints a match: a guardrail that echoes what it found
// is the leak it was meant to prevent.

import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { AGENT_TOOL, FIELDS, META_FIELD, TOOL_USE_BLOCK_TYPE } from '../src/adapter/claude-code/contract/fields.ts';
import { identifierMatches, isAgentId } from '../src/adapter/claude-code/contract/identifiers.ts';
import { LAYOUT } from '../src/adapter/claude-code/contract/layout.ts';
import { toLabel } from '../src/shared/label.ts';

const execFileAsync = promisify(execFile);

const CANARY = 'AGENTWHY_CANARY';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = join(ROOT, 'src', 'cli.ts');
const FIXTURE_ROOTS = [join(ROOT, 'tests', 'fixtures', 'redacted'), join(ROOT, 'tests', 'fixtures', 'synthetic')];
const UNTRACKED_FIXTURES = 'tests/fixtures/real';

// Check 6 guards the other kind of leak: not a secret, but whose machine this is. The repository is public, so
// an absolute path from a real machine is published the moment it is committed and survives in history and in
// forks. The rule is generic on purpose - a blocklist of real names would have to spell those names out in this
// file, which is the disclosure it exists to prevent.
const HOME_PATHS = [
  ['macOS', /\/Users\/([A-Za-z0-9._-]+)/g],
  ['Linux', /\/home\/([A-Za-z0-9._-]+)/g],
  ['Windows', /[A-Za-z]:\\Users\\([A-Za-z0-9._-]+)/g],
];
const PLACEHOLDER_USERS = new Set(['someone', 'user', 'x', 'test', 'you']);
// This file writes the patterns above literally, so it would match itself. Every other file is scanned.
const SELF = join('scripts', 'check-canary.mjs');

// Class A of spec §5.4: known formats, practically zero false positives. When the scanner itself lands (M1+),
// this list moves there and this script reads it from one place.
const SECRET_PATTERNS = [
  ['anthropic', /sk-ant-[A-Za-z0-9_-]{32,}/],
  ['openai', /sk-(proj-)?[A-Za-z0-9]{20,}/],
  ['github', /(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/],
  ['gitlab', /glpat-[A-Za-z0-9_-]{10,}/],
  ['slack', /xox[baprs]-[A-Za-z0-9-]{10,}|xapp-[A-Za-z0-9-]{10,}/],
  ['aws-access-key-id', /(AKIA|ASIA)[A-Z0-9]{16}/],
  ['google', /AIza[A-Za-z0-9_-]{35}|ya29\.[A-Za-z0-9_-]{10,}/],
  ['stripe', /(sk|rk)_live_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}/],
  ['supabase', /sbp_[A-Za-z0-9]{10,}/],
  ['npm', /npm_[A-Za-z0-9]{36}|:_authToken=/],
  ['digitalocean', /do[op]_v1_[a-f0-9]{30,}/],
  ['sendgrid', /SG\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/],
  ['pem-private-key', /-----BEGIN[A-Z ]*PRIVATE KEY-----/],
  ['jwt', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./],
];

// Check 5 asserts the redactor's whitelist from the other side. Checks 1 to 3 ask whether what was redacted
// carries a marker; they are blind to a value that was never redacted, because such a value carries no marker -
// which is exactly how nested enumerations reached the corpus. This declares the allowed positions independently
// of the redactor and reports anything else.
const ROOT_ENUM_KEYS = new Set([
  FIELDS.lineType,
  FIELDS.sidechain,
  FIELDS.toolVersion,
  FIELDS.systemSubtype,
  FIELDS.denialKind,
  META_FIELD.agentType,
  META_FIELD.spawnDepth,
  META_FIELD.requestShape,
  META_FIELD.requestNonInteractive,
]);

const SPILL_PSEUDONYM = /^spill-\d+\.txt$/;

function isIdentifier(text) {
  const { toolUseIds, uuids } = identifierMatches(text);
  return isAgentId(text) || [...toolUseIds, ...uuids].some((match) => match === text);
}

function childContext(object, context, key) {
  if (context === 'root' && key === FIELDS.message) return 'message';
  if (context === 'message' && key === FIELDS.messageContent) return 'block';
  if (context === 'block' && key === FIELDS.toolInput && object[FIELDS.toolName] === AGENT_TOOL.name) {
    return 'agent-input';
  }
  return 'other';
}

function allowedHere(object, key, context) {
  if (context === 'root') return ROOT_ENUM_KEYS.has(key);
  if (context === 'message') return key === FIELDS.messageRole;
  if (context === 'agent-input') return key === AGENT_TOOL.typeInputKey;
  if (context !== 'block') return false;
  return key === FIELDS.blockType || (key === FIELDS.toolName && object[FIELDS.blockType] === TOOL_USE_BLOCK_TYPE);
}

/** Findings name the position and the length of what survived there. Never the value. */
function walkValue(value, allowed, context, path, found) {
  if (typeof value === 'string') {
    if (allowed || value.startsWith(CANARY) || isIdentifier(value) || SPILL_PSEUDONYM.test(value)) return;
    found.push(`${path} (${value.length} chars)`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkValue(item, allowed, context, `${path}[${index}]`, found));
    return;
  }
  if (value !== null && typeof value === 'object') walkObject(value, context, path, found);
}

function walkObject(object, context, path, found) {
  for (const [key, value] of Object.entries(object)) {
    const here = `${path}.${key}`;
    if (toLabel(key) !== key && !key.startsWith(CANARY)) found.push(`${here} (key, ${key.length} chars)`);
    walkValue(value, allowedHere(object, key, context), childContext(object, context, key), here, found);
  }
}

/** What survived redaction in one committed file, as positions. A line that does not parse must carry the marker. */
function survivorsIn(path, text) {
  const found = [];
  if (path.endsWith(LAYOUT.toolResultSuffix)) {
    if (!text.startsWith(CANARY)) found.push('the whole file');
    return found;
  }

  const lines = path.endsWith(LAYOUT.transcriptSuffix) ? text.split('\n') : [text];
  lines.forEach((line, index) => {
    if (line.trim() === '') return;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      if (!line.includes(CANARY)) found.push(`line ${index + 1} does not parse and carries no marker`);
      return;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    walkObject(parsed, 'root', `line ${index + 1}`, found);
  });
  return found;
}

async function filesUnder(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
}

/** A session is a transcript sitting beside its own directory, never one of the subagent files inside it. */
function sessionsAmong(files) {
  return files
    .filter((path) => path.endsWith(LAYOUT.transcriptSuffix) && basename(join(path, '..')) !== LAYOUT.subagentsDir)
    .map((path) => path.slice(0, -LAYOUT.transcriptSuffix.length));
}

/**
 * A non-zero exit is a legitimate doctor outcome - a session with no main transcript exits 1 - and its output
 * still has to be checked. Rejecting here would abort the run, skip the checks that follow, and print the whole
 * failed output in the unhandled rejection.
 */
async function runDoctor(session, args) {
  try {
    return await execFileAsync(process.execPath, [CLI, 'doctor', '--input', session, ...args]);
  } catch (error) {
    return {
      stdout: typeof error?.stdout === 'string' ? error.stdout : '',
      stderr: typeof error?.stderr === 'string' ? error.stderr : '',
    };
  }
}

function report(problems, ok) {
  if (problems.length === 0) {
    process.stdout.write(`ok: ${ok}\n`);
    return 0;
  }
  for (const problem of problems) process.stdout.write(`FAIL: ${problem}\n`);
  return problems.length;
}

/**
 * Paths git tracks, or undefined when this working copy is not a repository. Checks 4 and 6 only mean
 * something against a tracked set, so a missing repository is reported as a failure rather than skipped:
 * a guard that quietly passes is worse than none, and this one crashed the whole script before.
 */
async function trackedPaths(...args) {
  try {
    const { stdout } = await execFileAsync('git', ['ls-files', ...args], { cwd: ROOT });
    return stdout.split('\n').filter((line) => line !== '');
  } catch {
    return undefined;
  }
}

/** Reports positions only - never the matched text, which would republish what the check is hiding. */
async function homePathsIn() {
  const listing = await trackedPaths();
  if (listing === undefined) return ['git is unavailable here, so no tracked file could be checked'];
  const tracked = listing.filter((path) => path.split('/').join(sep) !== SELF);

  const found = [];
  for (const path of tracked) {
    const text = await readFile(join(ROOT, path), 'utf8').catch(() => undefined);
    if (text === undefined || text.includes('\u0000')) continue;
    for (const [platform, pattern] of HOME_PATHS) {
      for (const match of text.matchAll(pattern)) {
        if (PLACEHOLDER_USERS.has(match[1])) continue;
        found.push(`${path}: a ${platform} home path at offset ${match.index}, use /Users/someone instead`);
      }
    }
  }
  return found;
}

async function main() {
  const files = (await Promise.all(FIXTURE_ROOTS.map(filesUnder))).flat();
  const sessions = sessionsAmong(files);
  let failures = 0;

  if (files.length === 0) {
    process.stdout.write('FAIL: no committed fixtures found\n');
    process.exitCode = 1;
    return;
  }

  // 1. Every session carries the marker.
  const withoutCanary = [];
  const contents = new Map();
  for (const path of files) contents.set(path, await readFile(path, 'utf8'));
  for (const session of sessions) {
    // Exactly this session's files: its transcript and its directory. A prefix match would let a session pass on
    // a sibling's marker, since `foo` is a prefix of `foo-2`.
    const belonging = files.filter(
      (path) => path === `${session}${LAYOUT.transcriptSuffix}` || path.startsWith(`${session}${sep}`),
    );
    if (!belonging.some((path) => contents.get(path).includes(CANARY))) {
      withoutCanary.push(`${relative(ROOT, session)} carries no ${CANARY} marker`);
    }
  }
  failures += report(withoutCanary, `${sessions.length} fixture sessions carry the canary marker`);

  // 2. No class A secret pattern anywhere in the corpus.
  const matches = [];
  for (const [path, text] of contents) {
    for (const [name, pattern] of SECRET_PATTERNS) {
      const found = pattern.exec(text);
      if (found !== null) matches.push(`${relative(ROOT, path)} matches ${name} at offset ${found.index}`);
    }
  }
  failures += report(matches, `no class A secret pattern in ${files.length} fixture files`);

  // 3. No doctor output carries the marker - neither a fresh run nor the committed snapshot, which is output too.
  const leaks = [];
  const snapshot = join(ROOT, 'tests', 'fixtures', 'doctor-report.snapshot.json');
  const snapshotText = await readFile(snapshot, 'utf8').catch(() => undefined);
  if (snapshotText === undefined) leaks.push(`${relative(ROOT, snapshot)} is missing; run npm run snapshot:doctor`);
  else if (snapshotText.includes(CANARY)) leaks.push(`${relative(ROOT, snapshot)} carries fixture content`);

  for (const session of sessions) {
    for (const args of [[], ['--json']]) {
      const { stdout, stderr } = await runDoctor(session, args);
      const format = args.length === 0 ? 'text' : 'json';
      if (`${stdout}${stderr}`.includes(CANARY)) leaks.push(`doctor --${format} on ${relative(ROOT, session)} printed fixture content`);
    }
  }
  failures += report(leaks, `doctor output is canary-free over ${sessions.length * 2} runs`);

  // 5. Nothing but the declared shapes survived redaction.
  const survivors = [];
  for (const [path, text] of contents) {
    if (basename(path) === 'README.md') continue;
    for (const position of survivorsIn(path, text)) survivors.push(`${relative(ROOT, path)}: ${position}`);
  }
  failures += report(survivors.slice(0, 20), `only markers, identifiers and declared enumerations survive redaction`);
  if (survivors.length > 20) process.stdout.write(`FAIL: ${survivors.length - 20} more, not listed\n`);

  // 4. The real corpus is not tracked.
  const trackedFixtures = await trackedPaths(UNTRACKED_FIXTURES);
  failures += report(
    trackedFixtures === undefined
      ? ['git is unavailable here, so it could not be verified']
      : trackedFixtures.map((path) => `${path} is tracked by git and must never be`),
    `${UNTRACKED_FIXTURES}/ is not tracked`,
  );

  // 6. No tracked file says whose machine this is.
  failures += report(await homePathsIn(), 'no real home path in a tracked file');

  process.exitCode = failures === 0 ? 0 : 1;
}

await main();
