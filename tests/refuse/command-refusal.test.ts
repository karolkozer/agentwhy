// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { DirectoryEntry, DirectoryReader } from '../../src/ports/directory-reader.ts';
import { FileAccessError } from '../../src/ports/file-access-error.ts';
import { CommandRefusal } from '../../src/refuse/command-refusal.ts';

const shell = (command: string) =>
  JSON.stringify({ session_id: 's', cwd: '/work/app', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });

/** A project too large to walk: its folder holds more entries than one command may cost. */
const huge: DirectoryReader = {
  kindOf: async (path) => { throw new FileAccessError('not-found', path); },
  list: async (path): Promise<readonly DirectoryEntry[]> =>
    path === '/work/app' ? Array.from({ length: 50_001 }, (_, at) => ({ name: `f${at}.txt`, kind: 'file' as const })) : [],
  modifiedAt: async () => 0,
};

// `2026-10-11-a-folder-found-while-it-runs.md` FW3 with R20: a folder found while the line runs, in a project past the
// walk's allowance, is a command not checked - said so - never a refusal by guess and never a silent pass.
test('FW3: a folder found while the line runs, in a project too large to walk, is a command not checked', async () => {
  const refusal = new CommandRefusal({
    input: { readAll: async () => shell('d=$(find . -type d -name secrets | head -1); cat "$d"/*') },
    files: { readText: async (path) => { throw new FileAccessError('not-found', path); }, readLines: () => { throw new FileAccessError('not-found', 'x'); } },
    directories: huge,
    workingDirectory: '/work/app',
    home: '/Users/someone',
  });
  assert.deepEqual(await refusal.decide({}), { kind: 'not-checked', reason: 'search' });
});

/** A home too large to walk, as a Mac's is with `~/Library` in it, and a project folder small enough to walk whole. */
const homeTooLarge: DirectoryReader = {
  kindOf: async (path) => {
    if (path === '/Users/someone' || path === '/work/app/docs') return 'directory';
    throw new FileAccessError('not-found', path);
  },
  list: async (path): Promise<readonly DirectoryEntry[]> =>
    path === '/Users/someone' ? Array.from({ length: 50_001 }, (_, at) => ({ name: `f${at}.txt`, kind: 'file' as const }))
      : path === '/work/app/docs' ? [{ name: 'readme.md', kind: 'file' }]
        : [],
  modifiedAt: async () => 0,
};

const refusalOf = (command: string): CommandRefusal => new CommandRefusal({
  input: { readAll: async () => shell(command) },
  files: { readText: async (path) => { throw new FileAccessError('not-found', path); }, readLines: () => { throw new FileAccessError('not-found', 'x'); } },
  directories: homeTooLarge,
  workingDirectory: '/work/app',
  home: '/Users/someone',
});

// `2026-10-12-windows-paths.md` WPB13: FND9 as amended let a reading `find` from written folders be judged by its walk
// alone, and a walk past its allowance lets a command run (R20) - `find ~ -name .env | xargs cat` was refused before the
// amendment and ran after it, on a Mac's home. A walk that ran out meets the `-name` by name again.
test('WPB13: a reading find whose walk runs out is refused by the name it looks for, as before FND9 was amended', async () => {
  for (const command of ['find ~ -name .env | xargs cat', 'find ~ -name .env -exec cat {} +', 'for f in $(find ~ -name .env); do cat "$f"; done']) {
    const decision = await refusalOf(command).decide({});
    assert.equal(decision.kind, 'refuse', command);
    assert.equal(decision.kind === 'refuse' ? decision.path : undefined, '.env', command);
    assert.deepEqual(decision.kind === 'refuse' ? decision.route : undefined, { kind: 'named' }, command);
  }
});

test('WPB13: a reading find whose walk finishes is still judged as its search - a folder with no blocked file runs', async () => {
  assert.deepEqual(await refusalOf('find docs -name .env | xargs cat').decide({}), { kind: 'allow' });
});

// `2026-11-25-the-same-file-in-capitals.md` LC1, LCB1: a word in capitals, placed where the line runs, is the file there.
const inProject = (command: string, cwd: string, deny: readonly string[] = []): CommandRefusal => new CommandRefusal({
  input: { readAll: async () => JSON.stringify({ session_id: 's', cwd, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }) },
  files: {
    readText: async (path) => {
      if (deny.length > 0 && path === `${cwd}/.claude/settings.local.json`) return JSON.stringify({ permissions: { deny } });
      throw new FileAccessError('not-found', path);
    },
    readLines: () => { throw new FileAccessError('not-found', 'x'); },
  },
  directories: { kindOf: async (path) => { throw new FileAccessError('not-found', path); }, list: async () => [], modifiedAt: async () => 0 },
  workingDirectory: cwd,
  home: '/Users/someone',
});

test('LC1: a blocked file named in capitals is refused in a project of a Mac', async () => {
  for (const command of ['cat .ENV', 'cat ./.Env', 'cd web && cat .ENV', 'F=.ENV; cat $F', 'cat "$PWD/.ENV"', 'cat < .ENV', 'cat ~/.SSH/id_rsa', 'cat .env']) {
    assert.equal((await inProject(command, '/Users/someone/app').decide({})).kind, 'refuse', command);
  }
});

test('LC2: in a project of Linux .ENV is another file, and an everyday file in capitals is refused nowhere', async () => {
  assert.deepEqual(await inProject('cat .ENV', '/home/someone/app').decide({}), { kind: 'allow' });
  for (const command of ['cat README.md', 'cat Makefile', 'echo $ENV', 'grep -n ENV README.md', 'npm run ENV']) {
    assert.deepEqual(await inProject(command, '/Users/someone/app').decide({}), { kind: 'allow' }, command);
  }
});

/** The settings file an installed hook names, whose rules the fake project above writes. */
const settingsOf = (cwd: string) => ({ settingsPath: `${cwd}/.claude/settings.local.json` });

// The review of 2026-11-25: a bare name in capitals passed wherever the program is no printer.
test('LC1: a rule for one file holds its bare name in capitals, whatever program is handed it', async () => {
  for (const command of ['cp CUSTOMERS.CSV /tmp/x', 'wc -l CUSTOMERS.CSV', 'sqlite3 CUSTOMERS.CSV .dump', 'cat CUSTOMERS.CSV', 'cp customers.csv /tmp/x']) {
    assert.equal((await inProject(command, '/Users/someone/app', ['Read(customers.csv)']).decide(settingsOf('/Users/someone/app'))).kind, 'refuse', command);
  }
  assert.deepEqual(await inProject('cp CUSTOMERS.CSV /tmp/x', '/home/someone/app', ['Read(customers.csv)']).decide(settingsOf('/home/someone/app')), { kind: 'allow' });
});

test('LC4: a rule for a folder refuses no everyday file of a project kept under a folder of that name', async () => {
  for (const deny of ['Read(users/**)', 'Read(documents/**)']) {
    for (const command of ['cat README.md', 'cat src/x.ts', 'cat /Users/someone/Documents/app/README.md']) {
      assert.deepEqual(await inProject(command, '/Users/someone/Documents/app', [deny]).decide(settingsOf('/Users/someone/Documents/app')), { kind: 'allow' }, `${deny} ${command}`);
    }
  }
  assert.equal((await inProject('cat documents/a.md', '/Users/someone/Documents/app', ['Read(documents/**)']).decide(settingsOf('/Users/someone/Documents/app'))).kind, 'refuse');
});

// The second review of 2026-11-25: a wildcard inside a name, a folder, and a name with no extension held what is no file
// the rule was written for - every recursive search of a project with a `SecretManager.swift`, a commit message, a variable.
test('LC4: a rule that is not for a dotted name or a file with an extension keeps its case on a Mac', async () => {
  const cwd = '/Users/someone/Documents/App';
  for (const [deny, command] of [
    ['Read(documents/*)', `cd ${cwd} && npm test`], ['Read(documents/*)', `ls ${cwd}`], ['Read(**/app/*.md)', 'cat README.md'], ['Read(app)', 'ls .'],
    ['Read(**/*secret*)', 'cat src/SecretManager.swift'], ['Read(**/credentials*)', 'git add src/CredentialsForm.tsx'], ['Read(*token*)', 'cat src/TokenList.tsx'],
    ['Read(token)', 'git commit -m Token'], ['Read(token)', 'printenv TOKEN'], ['Read(**/credentials)', 'gh secret set CREDENTIALS'], ['Read(**/credentials)', 'ls src/Credentials'],
  ] as const) {
    assert.deepEqual(await inProject(command, cwd, [deny]).decide(settingsOf(cwd)), { kind: 'allow' }, `${deny} ${command}`);
  }
  for (const [deny, command] of [['Read(**/.env*)', 'cat .ENV.LOCAL'], ['Read(*.pem)', 'cat Server.PEM'], ['Read(**/notes/plan.md)', 'cat notes/PLAN.md'], ['Read(~/.aws/**)', 'cat ~/.AWS/credentials']] as const) {
    assert.equal((await inProject(command, cwd, [deny]).decide(settingsOf(cwd))).kind, 'refuse', `${deny} ${command}`);
  }
});
