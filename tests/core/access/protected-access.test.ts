// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { everydayReach, protectedAccesses } from '../../../src/core/access/protected-access.ts';
import { pathTokens } from '../../../src/core/access/path-tokens.ts';
import { mainSource } from '../../../src/core/evidence.ts';
import type { ToolEvent } from '../../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../../src/core/policy/default-policy.ts';
import type { Policy } from '../../../src/core/policy/policy.ts';
import type { SessionModel } from '../../../src/core/session-model.ts';

const AGENT = 'a1';
const evidence = (record: number) => ({ source: mainSource(), record });

function event(id: string, overrides: Partial<ToolEvent> = {}): ToolEvent {
  return {
    id,
    agentId: AGENT,
    sequence: 1,
    toolName: 'Bash',
    input: {},
    targets: [],
    commands: [],
    resultShape: 'none',
    toolKnown: true,
    outcome: 'succeeded',
    evidence: evidence(1),
    completeness: 'complete',
    ...overrides,
  };
}

function model(events: readonly ToolEvent[], delegations: SessionModel['delegations'] = []): SessionModel {
  return {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 's',
    projectRoot: { kind: 'absent' },
    agents: [],
    delegations,
    events,
    messages: [],
    gaps: [],
    completeness: 'complete',
  };
}

// Found 2026-10-05: Claude ran `ls -la` in a project holding `demo.env` and a tracked `customers.csv`. Only the second was
// found - its pattern names one file - because the name `ls -l` prints last was not taken as a path by its place, and a
// wildcard pattern (`**/*.env`) never matched it.
test('a name ls -l prints last matches every pattern of the policy, a wildcard too', () => {
  const listing = ['total 16', '-rw-r--r--@  1 someone  staff   42 Oct  5 12:26 demo.env',
    '-rw-r--r--@  1 someone  staff  310 Oct  5 12:26 README.md'].join('\n');
  const accesses = protectedAccesses(model([event('ls', {
    commands: ['ls -la'], resultShape: 'listing',
    result: { stage: 'model', completeness: 'complete', content: listing, evidence: evidence(2) },
  })]), DEFAULT_POLICY);
  assert.deepEqual(accesses.map((access) => [access.path, access.source, access.pattern]), [['demo.env', 'result', '**/*.env']]);
});

// P32, changed 2026-10-05 by the maintainer: every file of a session is a row, so a person sees what else the AI was
// among. Read by the rules that find a protected path: a listing's name by its place, a printer's operand, a search hit;
// never a folder, a program, a pattern or a diagnostic's word, and never a protected file, which has its own row.
test('what a command shows of everyday files: the names it listed, the files it printed, never a word that is none', () => {
  const ran = (commands: string[], content: string, overrides: Partial<ToolEvent> = {}) => everydayReach(event('e', {
    commands, resultShape: 'listing', result: { stage: 'model', completeness: 'complete', content, evidence: evidence(2) }, ...overrides,
  }), DEFAULT_POLICY).map(({ path, how }) => path + ':' + how);

  const long = ['total 16', 'drwxr-xr-x   4 someone  staff  128 Oct  5 12:26 .', 'drwxr-xr-x   4 someone  staff  128 Oct  5 12:26 app',
    '-rw-r--r--@  1 someone  staff   42 Oct  5 12:26 demo.env', '-rw-r--r--@  1 someone  staff  310 Oct  5 12:26 README.md',
    '-rw-r--r--@  1 someone  staff   99 Oct  5 12:26 Makefile'].join('\n');
  assert.deepEqual(ran(['ls -la'], long), ['README.md:named', 'Makefile:named'], 'a folder, `.` and the protected demo.env are no rows here');
  assert.deepEqual(ran(['ls -1'], 'README.md\napp\nfake-key.txt\n.env'), ['README.md:named', 'fake-key.txt:named'],
    'a bare word is a folder as readily as a file, so only a name with a dot or a slash is one');
  assert.deepEqual(ran(['rg --files'], 'app/page.tsx\nREADME.md'), ['app/page.tsx:named', 'README.md:named']);
  assert.deepEqual(ran(['ls x.txt'], 'ls: x.txt: No such file or directory', { outcome: 'unknown', execution: { status: 'failed', exitCode: 1 } }),
    ['x.txt:named'], 'the word before a diagnostic\'s colon is its program');
  assert.deepEqual(ran(['cat Makefile'], 'all:', { resultShape: 'content' }), ['Makefile:read'], 'a printer\'s operand is a file by its place');
  assert.deepEqual(ran(['grep -rn TODO .'], 'app/page.tsx:3:// TODO x\nlib/util.ts:9:// TODO y'), ['app/page.tsx:read', 'lib/util.ts:read']);
  assert.deepEqual(ran(['node scripts/build.mjs --out dist'], 'done', { resultShape: 'content' }), ['scripts/build.mjs:named']);
  assert.deepEqual(ran(['echo hi'], 'see README.md for the notes', { resultShape: 'content' }), [], 'prose names nothing');
  assert.deepEqual(ran(['cat a.txt'], 'x', { toolKnown: false }), [], 'a tool with no profile names nothing (R12b)');
  // Found 2026-10-05 in a VS Code conversation: `find . -mindepth 1 -maxdepth 1 | sed 's#^./##'`, files and folders alike.
  assert.deepEqual(ran(["find . -mindepth 1 -maxdepth 1 | sed 's#^./##' | sort"], ['./.claude', '.claude', '.git', './app', 'README.md', './README.md', '.DS_Store'].join('\n')),
    ['README.md:named', '.DS_Store:named'], 'one name however written, never a folder of a tool, never a script');
  // Found the same day in Codex conversations: a count, an interpreter's code and a cell's header were rows.
  assert.deepEqual(ran(['head -n 2 notes.csv'], 'a,b\n1,2', { resultShape: 'content' }), ['notes.csv:read'], 'a count given to -n is no file');
  assert.deepEqual(ran(['python3 -c "import csv; print(csv.DictReader(open(\'notes.csv\')))"'], '3', { resultShape: 'content' }), [],
    'the code an interpreter is handed is not the line\'s words');
  assert.deepEqual(ran(['rg -n Anna notes.csv'], 'Script completed\nWall time 0.1 seconds\nOutput:\nnotes.csv:2:Anna'), ['notes.csv:read'],
    'a header\'s word before its colon is no file a search printed');
});

/*
 * SW17, found by the maintainer on 2026-10-02 in the ChatGPT/Codex app: `cat demo.env` printed a key under the `.env`
 * wildcard rule, and the bare name - no separator, no leading dot - was read as guessed text, so no file was named,
 * the key was never traced, and the line said nothing was opened. What a printing program is given to open is a file
 * by position; what `echo` is given is text, as before.
 */
test('a bare name a printing program opens meets a wildcard rule; echo\'s words stay text', () => {
  const printed = (command: string): ToolEvent => event('e1', {
    commands: [command], resultShape: 'listing',
    result: { stage: 'model', completeness: 'complete', content: 'API_TOKEN=x', evidence: evidence(2) },
  });
  const accessed = (command: string) =>
    protectedAccesses(model([printed(command)]), DEFAULT_POLICY).map((access) => [access.path, access.pattern, access.source]);

  assert.deepEqual(accessed('cat demo.env'), [['demo.env', '**/*.env', 'input']]);
  assert.deepEqual(accessed('cd apps && head -3 demo.env | grep KEY'), [['demo.env', '**/*.env', 'input']]);
  assert.deepEqual(accessed('echo demo.env && printenv'), [], 'a word echo prints is text, not a file');
  assert.deepEqual(accessed('node demo.env'), [], 'a program that may do anything keeps the conservative reading');
});

test('a path is found inside a command, inside output, and inside a grep line', () => {
  assert.ok(pathTokens('grep -rn "SECRET" apps/web').includes('apps/web'));
  assert.ok(pathTokens('apps/web/.env.development:12:SECRET=x').includes('apps/web/.env.development'));
  assert.ok(pathTokens('see apps/web/.env.').includes('apps/web/.env'));
});

// The motivating case, in one test. The command names the variable, not the file; the file and its value
// appear only in what came back. Every tool that reads call parameters alone walks past this.
test('a protected path that appears only in the result is found, and marked as coming from the result', () => {
  const accesses = protectedAccesses(
    model([
      event('toolu_grep', {
        input: { command: 'grep -rn "ORDERS_DB_WEBHOOK_SECRET" apps --include=*.ts' },
        commands: ['grep -rn "ORDERS_DB_WEBHOOK_SECRET" apps --include=*.ts'],
        resultShape: 'listing',
        result: { stage: 'model', completeness: 'complete', content: 'apps/web/.env.development:12:ORDERS_DB_WEBHOOK_SECRET=abc123', evidence: evidence(2) },
      }),
    ]),
    DEFAULT_POLICY,
  );

  assert.equal(accesses.length, 1);
  assert.equal(accesses[0]?.source, 'result', 'no parameter named the file');
  assert.equal(accesses[0]?.path, 'apps/web/.env.development');
  assert.equal(accesses[0]?.pattern, '**/.env*');
  assert.deepEqual(accesses[0]?.evidence, evidence(2), 'the evidence points at the result, not the call');
});

test('a path named by a parameter is an input access, and is not reported twice for its own result', () => {
  const accesses = protectedAccesses(
    model([
      event('toolu_read', {
        toolName: 'Read',
        input: { file_path: '/work/apps/web/.env' },
        targets: ['/work/apps/web/.env'],
        resultShape: 'content',
        result: { stage: 'model', completeness: 'complete', content: 'contents of /work/apps/web/.env', evidence: evidence(2) },
      }),
    ]),
    DEFAULT_POLICY,
  );

  assert.equal(accesses.length, 1);
  assert.equal(accesses[0]?.source, 'input');
});

test('a refused attempt is reported too, carrying its outcome', () => {
  const accesses = protectedAccesses(
    model([
      event('toolu_read', {
        toolName: 'Read',
        input: { file_path: '~/.ssh/id_rsa' },
        targets: ['~/.ssh/id_rsa'],
        outcome: 'blocked',
      }),
    ]),
    DEFAULT_POLICY,
  );

  assert.equal(accesses[0]?.outcome, 'blocked', 'that the policy held is worth reading as well');
});

// Reading a prompt for intent is the detector's job, and this milestone does not do it. What the delegated
// agent then did shows up through that agent's own events.
test('a delegating call is not an access, even when its prompt names a protected file', () => {
  const accesses = protectedAccesses(
    model(
      [event('toolu_agent', { toolName: 'Agent', input: { prompt: 'check apps/web/.env for the webhook secret' }, targets: [] })],
      [{ followUps: [], id: 'toolu_agent', parentAgentId: 's', reports: [], evidence: evidence(1), completeness: 'complete' }],
    ),
    DEFAULT_POLICY,
  );

  assert.deepEqual(accesses, []);
});

// The regression that forced this design. Matching every string of a call reported 316 touches of a protected
// path in the measured session: documents that mention `.env`, edits whose new text contains a deny rule, web
// searches. A mention is not a touch, and which position is which belongs to the tool.
test('a protected path mentioned in the content of a file that was read is not a touch of it', () => {
  const accesses = protectedAccesses(
    model([
      event('toolu_read_doc', {
        toolName: 'Read',
        input: { file_path: 'docs/security.md' },
        targets: ['docs/security.md'],
        resultShape: 'content',
        result: { stage: 'model', completeness: 'complete', content: 'Never read apps/web/.env or ~/.ssh/id_rsa from a subagent.', evidence: evidence(2) },
      }),
    ]),
    DEFAULT_POLICY,
  );

  assert.deepEqual(accesses, []);
});

test('what a call carries is not what it addresses: written text naming a protected path is not a touch', () => {
  const accesses = protectedAccesses(
    model([
      event('toolu_write', {
        toolName: 'Write',
        input: { file_path: 'docs/policy.md', content: 'deny Read(./.env*) and **/secrets/**' },
        targets: ['docs/policy.md'],
        resultShape: 'none',
      }),
    ]),
    DEFAULT_POLICY,
  );

  assert.deepEqual(accesses, []);
});

test('an exception in the policy keeps the path out of the findings', () => {
  const policy: Policy = { ...DEFAULT_POLICY, allowed: ['**/.env.example'] };
  const events = [
    event('toolu_read', { toolName: 'Read', input: { file_path: 'apps/web/.env.example' }, targets: ['apps/web/.env.example'] }),
  ];

  assert.deepEqual(protectedAccesses(model(events), policy), []);
  assert.equal(protectedAccesses(model(events), DEFAULT_POLICY).length, 1, 'and it is found without that exception');
});

test('one call reaching several protected paths yields one finding each', () => {
  const accesses = protectedAccesses(
    model([
      event('toolu_find', {
        input: { command: 'grep -rl "TOKEN" . .npmrc' },
        commands: ['grep -rl "TOKEN" . .npmrc'],
        resultShape: 'listing',
        result: { stage: 'model', completeness: 'complete', content: '/home/x/.ssh/config\nsecrets/api/key.pem', evidence: evidence(2) },
      }),
    ]),
    DEFAULT_POLICY,
  );

  assert.deepEqual(
    accesses.map((access) => [access.source, access.path]),
    [
      ['input', '.npmrc'],
      ['result', '/home/x/.ssh/config'],
      ['result', 'secrets/api/key.pem'],
    ],
  );
});

// Most of the noise was here: a plain tokeniser cuts a quoted sentence into words, and `.env` inside one then
// looks exactly like a file being opened.
test('a file named inside a quoted sentence is not a file that was opened', () => {
  const accesses = protectedAccesses(
    model([
      event('toolu_echo', {
        input: { command: 'echo "remember not to read .env in a subagent"' },
        commands: ['echo "remember not to read .env in a subagent"'],
        resultShape: 'listing',
      }),
      event('toolu_commit', {
        input: { command: 'git commit -m "fix .env handling"' },
        commands: ['git commit -m "fix .env handling"'],
        resultShape: 'listing',
      }),
    ]),
    DEFAULT_POLICY,
  );

  assert.deepEqual(accesses, []);
});

// Both found by reading a real report: `grep -n` writes `49:matched text` with no file name, and `echo` was
// having its argument read as a file it had opened.
test('a line number from grep output is not part of the path', () => {
  const accesses = protectedAccesses(
    model([
      event('toolu_grep', {
        commands: ['grep -rn TOKEN packages'],
        resultShape: 'listing',
        result: { stage: 'model', completeness: 'complete', content: '49:packages/web/.env', evidence: evidence(2) },
      }),
    ]),
    DEFAULT_POLICY,
  );

  assert.deepEqual(accesses.map((access) => access.path), ['packages/web/.env']);
});

test('a command that only prints text addresses nothing at all', () => {
  const accesses = protectedAccesses(
    model([
      event('toolu_echo', {
        commands: ['echo "--- do these keys exist in apps/web/.env (names only) ---"'],
        resultShape: 'listing',
      }),
    ]),
    DEFAULT_POLICY,
  );

  assert.deepEqual(accesses, []);
});

test('a path pattern does not match across whitespace', () => {
  const accesses = protectedAccesses(
    model([
      event('toolu_note', {
        commands: ['git commit -m "fix apps/web/.env handling"'],
        resultShape: 'none',
      }),
    ]),
    DEFAULT_POLICY,
  );

  assert.deepEqual(accesses, [], 'a sentence ending in a path is a sentence');
});

// `process.env` ends in `.env` and is not a file. It is in every TypeScript repository, and it was being
// reported as one on the measured session.
test('code that reads like a path is not a path', () => {
  const accesses = protectedAccesses(
    model([
      event('toolu_grep', {
        commands: ['grep -rn "WEBHOOK_SECRET" apps --include=*.ts'],
        resultShape: 'listing',
        result: {
          stage: 'model', completeness: 'complete',
          content: [
            'apps/web/route.ts:12:  const secret = process.env.WEBHOOK_SECRET;',
            'apps/web/env.ts:3:  export const mode = import.meta.env.MODE;',
          ].join('\n'),
          evidence: evidence(2),
        },
      }),
    ]),
    DEFAULT_POLICY,
  );

  assert.deepEqual(accesses, [], 'an identifier is not a file, whatever it ends in');
});

// An interpreter reads a file through an expression, and quoting leaves the whole expression as one token. It
// was being reported verbatim as the name of a file - which is both wrong and unreadable, while the read it
// describes is real and must survive.
test('a path inside an expression is lifted out of it', () => {
  const accesses = protectedAccesses(
    model([
      event('toolu_python', {
        commands: [`python3 -c "print(open('apps/web/.env.sample').read())"`],
        resultShape: 'listing',
      }),
    ]),
    DEFAULT_POLICY,
  );

  assert.deepEqual(accesses.map((access) => access.path), ['apps/web/.env.sample']);
});

// `.env*` is not the name of anything on disk. Reporting it as a file reached puts a string in the report that
// exists nowhere; whatever the shell expanded it to comes back in the output and is found there.
test('a glob is a question, not a file that was reached', () => {
  const accesses = protectedAccesses(
    model([event('toolu_ls', { commands: ['ls -la .env* apps/web/.env.all.*'], resultShape: 'listing' })]),
    DEFAULT_POLICY,
  );

  assert.deepEqual(accesses, []);
});

// `--- apps/web/.npmrc` is the banner a diff prints above a file. It sits where a path sits, so position lets
// it through the whitespace rule, and it was being reported as a file of that name.
test('a leading dash makes it a banner or a flag, not a file', () => {
  const accesses = protectedAccesses(
    model([
      event('toolu_diff', {
        commands: ['git diff'],
        resultShape: 'listing',
        result: { stage: 'model', completeness: 'complete', content: '--- apps/web/.npmrc:12:registry=https://example.invalid', evidence: evidence(2) },
      }),
    ]),
    DEFAULT_POLICY,
  );

  assert.deepEqual(accesses, []);
});

// The other side of that rule: content a command printed is not parsed the way a command is. A file that talks
// about `(.env.production)` is a file talking about it.
test('an expression in output is not taken apart looking for paths', () => {
  const accesses = protectedAccesses(
    model([
      event('toolu_grep', {
        commands: ['grep -rn "SECRET" apps'],
        resultShape: 'listing',
        result: { stage: 'model', completeness: 'complete', content: "apps/web/notes.md:9: see (.env.production) for the live values", evidence: evidence(2) },
      }),
    ]),
    DEFAULT_POLICY,
  );

  assert.deepEqual(accesses, []);
});

// The other side of the same rule: a name is addressable when it is a dotfile or carries a separator.
test('a bare dotfile and a path under a directory are both addressed', () => {
  const accesses = protectedAccesses(
    model([
      event('toolu_read', { targets: ['.env'], resultShape: 'content' }),
      event('toolu_read_deep', { targets: ['apps/web/.env.local'], resultShape: 'content' }),
    ]),
    DEFAULT_POLICY,
  );

  assert.deepEqual(accesses.map((access) => access.path), ['.env', 'apps/web/.env.local']);
});

test('a quoted path is still a path', () => {
  const accesses = protectedAccesses(
    model([event('toolu_cat', { commands: ['cat "my project/.env"'], resultShape: 'listing' })]),
    DEFAULT_POLICY,
  );

  assert.deepEqual(accesses.map((access) => access.path), ['my project/.env']);
});

// What `cat` prints is the file, not a list of places it went. Reading its output as a listing made every path
// mentioned inside a protected file look like another file that had been reached.
test('the output of a command that prints a file is content, not a listing', () => {
  const accesses = protectedAccesses(
    model([
      event('toolu_cat', {
        commands: ['cat .npmrc'],
        resultShape: 'listing',
        result: { stage: 'model', completeness: 'complete', content: 'see also ~/.ssh/config and secrets/api/key.pem', evidence: evidence(2) },
      }),
    ]),
    DEFAULT_POLICY,
  );

  assert.deepEqual(accesses.map((access) => [access.source, access.path]), [['input', '.npmrc']]);
});

// A real project sat at `/Users/someone/Projects/Client Name/app`, and every finding under it was cut at the
// space: the report named files that exist nowhere. A target is the value the tool was handed, so it is one
// path however many spaces it holds.
test('a target holding a space stays one path instead of being cut into a fragment', () => {
  const target = '/Users/someone/Projects/Client Name/app/apps/web/.env';

  const accesses = protectedAccesses(model([event('toolu_a', { toolName: 'Read', targets: [target] })]), DEFAULT_POLICY);

  assert.deepEqual(
    accesses.map((access) => access.path),
    [target],
  );
});

// findings-worth-reading criterion 4: precision is not bought with silence. The genuine grep result and the genuine
// cat are still findings, and nothing a heredoc, a here-string or an assignment carried is.
test('what a heredoc or a here-string carries is not found, and a real grep and a real cat still are', () => {
  const evidence = { source: { kind: 'main' as const }, record: 2 };
  const bash = (id: string, command: string, content: string): ToolEvent =>
    event(id, { toolName: 'Bash', commands: [command], resultShape: 'listing', result: { stage: 'model', completeness: 'complete', content, evidence } });

  const accesses = protectedAccesses(
    model([
      bash('heredoc', ["python3 - <<'PY'", 'x = {"file_path": "/a/app/.env"}', 'print("check apps/web/.env")', 'PY'].join('\n'), 'ok'),
      bash('prose', ["cat > notes.md <<'EOF'", 'see apps/web/.env.production for details', 'EOF'].join('\n'), ''),
      bash('here-string', 'grep x <<< "apps/web/.env.local"', ''),
      bash('grep', 'grep -rn SECRET apps', 'apps/web/.env:3:SECRET=x'),
      bash('cat', 'cat apps/web/.env', 'SECRET=x'),
    ]),
    DEFAULT_POLICY,
  );

  assert.deepEqual(accesses.map((access) => `${access.eventId} ${access.source} ${access.path}`).sort(), [
    'cat input apps/web/.env',
    'grep result apps/web/.env',
  ]);
});

// The same cut as a target once had, reached through a listing instead: `find` prints whole paths, and a space in
// a directory above the project turned each one into a second, shorter finding for a file that exists nowhere.
test('a listing line that is one path keeps the space in it, and is one finding', () => {
  const listed = [
    '/Users/someone/Projects/Acme/Web Portal/app/apps/web/.env',
    '/Users/someone/Projects/Acme/Web Portal/app/apps/web/.env.test',
  ];
  const accesses = protectedAccesses(
    model([
      event('toolu_find', {
        input: { command: 'find /Users/someone/Projects/Acme -name ".env*"' },
        commands: ['find /Users/someone/Projects/Acme -name ".env*"'],
        resultShape: 'listing',
        result: { stage: 'model', completeness: 'complete', content: listed.join('\n'), evidence: evidence(2) },
      }),
    ]),
    DEFAULT_POLICY,
  );

  assert.deepEqual(
    accesses.map((access) => [access.path, access.source]),
    listed.map((path) => [path, 'result']),
  );
});

// 2026-09-15-paths-not-fragments.md criteria 1-5, as accesses: what a script's own text and a program's prose say
// is not a file reached, and every real read of the same shape still is.
test('a fragment of inline code or of a line of output is no file, and a real path still is', () => {
  const evidence = { source: { kind: 'main' as const }, record: 2 };
  const bash = (id: string, command: string, content: string): ToolEvent =>
    event(id, { toolName: 'Bash', commands: [command], resultShape: 'listing', result: { stage: 'model', completeness: 'complete', content, evidence } });
  const printed = [
    '/Users/someone/.ssh/id_rsa in a result · succeeded · 2×',
    '/Users/someone/.ssh/id_rsa -> outside the project',
    '[apps/web/.env,',
    '{file_path:/a/app/.env}',
    '/Users/someone/Client Name/app/apps/web/.env',
    'app/[locale]/secrets/key',
    'apps/web/.env.local:3:PORT=1',
  ].join('\n');

  const accesses = protectedAccesses(
    model([
      bash('inline-noise', `node -e "log('check apps/web/.env')"`, ''),
      bash('inline-object', 'node -e "x({file_path:/a/app/.env})"', ''),
      bash('inline-read', `python3 -c "print(open('apps/api/.env').read())"`, ''),
      bash('quoted', 'cat "my project/.env"', ''),
      bash('shell', 'bash -c "cat apps/web/.env"', ''),
      bash('output', 'node scripts/show.mjs', printed),
    ]),
    DEFAULT_POLICY,
  );

  assert.deepEqual(accesses.map((access) => `${access.eventId} ${access.source} ${access.path}`).sort(), [
    'inline-read input apps/api/.env',
    'output result /Users/someone/Client Name/app/apps/web/.env',
    'output result app/[locale]/secrets/key',
    'output result apps/web/.env.local',
    'quoted input my project/.env',
    'shell input cat apps/web/.env',
  ]);
});

// Measured 2026-09-24: a rule naming `customers.csv` did not see `cat customers.csv`, nor the hit `customers.csv:6:…`
// that `grep -r` printed with a customer's details in it, because a bare name is taken as a file only when it is a
// dotfile. A name a rule was written for, and a name where a search hit puts its file, are files.
test('a bare file name is a file where a rule names it exactly, or where a search hit puts it', () => {
  const policy: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/customers.csv' }] };
  const accesses = protectedAccesses(
    model([
      event('toolu_cat', { commands: ['cat customers.csv'], resultShape: 'listing' }),
      event('toolu_grep', {
        commands: ['grep -rn Magdalena .'],
        resultShape: 'listing',
        result: { stage: 'model', completeness: 'complete', content: 'customers.csv:6:5,Magdalena,Kaminska', evidence: evidence(2) },
      }),
      // A wildcard rule still does not make an identifier a file: `*.env` was not written for `process.env`.
      event('toolu_code', { commands: ['grep -rn process.env src'], resultShape: 'listing' }),
    ]),
    policy,
  );

  assert.deepEqual(
    accesses.map((access) => [access.eventId, access.source, access.path]),
    [['toolu_cat', 'input', 'customers.csv'], ['toolu_grep', 'result', 'customers.csv']],
  );
});

// search-hits-are-reads H1-H3, H12: a search's hit lines are the file's text; a name-only search's are not.
test('a search that printed a protected file’s lines credits it with how many, and one that printed names or did not end does not', () => {
  const policy: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/customers.csv' }] };
  const search = (id: string, command: string, content: string, outcome: ToolEvent['outcome'] = 'succeeded') =>
    event(id, { commands: [command], resultShape: 'listing', outcome, result: { stage: 'model', completeness: 'complete', content, evidence: evidence(9) } });
  const accesses = protectedAccesses(model([
    search('toolu_rows', 'grep -rniI -e "Ada" .', 'customers.csv:6:5,Ada,Lovelace,ada@example.test\ncustomers.csv:9:8,Ada,Byron,x@example.test\nsrc/a.ts:1:ok'),
    search('toolu_names', 'grep -rl Ada .', 'customers.csv\nsrc/a.ts'),
    search('toolu_failed', 'grep -rn Ada .', 'customers.csv:6:5,Ada', 'unknown'),
    search('toolu_one', 'grep KEY .env', 'KEY=abc\nKEY_TWO=def'),
  ]), policy);

  const lines = (id: string) => accesses.filter((access) => access.eventId === id).map((access) => [access.path, access.source, access.lines]);
  assert.deepEqual(lines('toolu_rows'), [['customers.csv', 'result', 2]]);
  assert.deepEqual(lines('toolu_names'), [['customers.csv', 'result', undefined]], 'a list of names is a name');
  assert.deepEqual(lines('toolu_failed'), [['customers.csv', 'result', undefined]], 'a search whose end is unknown reads nothing');
  assert.deepEqual(lines('toolu_one'), [['.env', 'input', 2]], 'one file named, no path on its lines: all of them are its');
});
