import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from '../helpers/cli.ts';
import { GOLDEN_SESSION_ID, goldenSessionFiles } from '../helpers/golden-session.ts';
import { jsonl, writeSession } from '../helpers/synthetic-session.ts';

const FIXTURE = fileURLToPath(new URL('../fixtures/synthetic/nested-delegation/synthetic-nested', import.meta.url));
const golden = (name: string) => fileURLToPath(new URL(`../golden/report-${name}.txt`, import.meta.url));

// A fake in the shape of a real one: this key is the AWS documentation example, and it never appears in a
// committed fixture - the canary guardrail scans those for exactly this pattern.
const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';

/** The page with the other languages taken out and the English left as plain text. */
const english = (html: string): string => html
  .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>(?=<span class="i18n"|[^<]*<)/g, '')
  .replace(/<span class="i18n" lang="en">([\s\S]*?)<\/span>/g, '$1');

/** Header fields wrap, so assertions about their text are made on the unwrapped form. */
function flatten(output: string): string {
  return output.replace(/\n\s+/g, ' ');
}

/** A session where a search reaches a protected file and its output carries a key. The motivating case. */
async function leakingSession(t: Parameters<typeof writeSession>[0]): Promise<string> {
  const root = await writeSession(t, {
    'leak.jsonl': jsonl(
      {
        type: 'assistant',
        isSidechain: false,
        uuid: '11111111-1111-4111-8111-111111111111',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_01LEAKAAAAAAAAAAAAAAAAAA',
              name: 'Bash',
              input: { command: 'grep -rn "WEBHOOK_SECRET" apps --include=*.ts' },
            },
          ],
        },
      },
      {
        type: 'user',
        isSidechain: false,
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_01LEAKAAAAAAAAAAAAAAAAAA',
              content: `apps/web/.env.development:12:AWS_ACCESS_KEY_ID=${AWS_KEY}`,
            },
          ],
        },
      },
    ),
  });
  return join(root, 'leak.jsonl');
}

/** The golden session, written where the CLI can read it (findings-worth-reading criterion 10). */
async function goldenSession(t: Parameters<typeof writeSession>[0]): Promise<string> {
  return join(await writeSession(t, goldenSessionFiles()), `${GOLDEN_SESSION_ID}.jsonl`);
}

test('the summary is stable at 80 and at 120 columns', async (t) => {
  const input = await goldenSession(t);
  for (const width of [80, 120]) {
    const { code, stdout } = await runCli(['report', '--input', input, '--width', String(width)]);

    assert.equal(code, 0);
    assert.equal(
      stdout,
      await readFile(golden(String(width)), 'utf8'),
      `the report moved at ${width} columns; regenerate with npm run golden:report and read the diff`,
    );
    for (const line of stdout.split('\n')) assert.ok(line.length <= width, `a line exceeded ${width}: ${line.length}`);
  }
});

// §7.5 constraint 2: a terminal whose LANG lacks UTF-8 gets the same report, drawn with characters it has.
test('--ascii draws the same report in ASCII alone', async (t) => {
  const { code, stdout } = await runCli(['report', '--input', await goldenSession(t), '--width', '80', '--ascii']);

  assert.equal(code, 0);
  assert.equal(
    stdout,
    await readFile(golden('ascii'), 'utf8'),
    'the ascii report moved; regenerate with npm run golden:report and read the diff',
  );
  // The whole of ASCII, not one block of it: a terminal without UTF-8 garbles a check mark as surely as a corner.
  assert.doesNotMatch(stdout, /[^\x00-\x7F]/, 'nothing outside ASCII survives --ascii');
});

// R13 and criterion 8: the detail did not go anywhere, it waits behind a flag.
test('--full is stable, and prints every detailed section', async (t) => {
  const { code, stdout } = await runCli(['report', '--input', await goldenSession(t), '--width', '100', '--full']);

  assert.equal(code, 0);
  assert.equal(
    stdout,
    await readFile(golden('full'), 'utf8'),
    'the full report moved; regenerate with npm run golden:report and read the diff',
  );
  for (const section of ['What was reached', 'The session in numbers', 'Missing data', 'Everything the session did']) {
    assert.match(stdout, new RegExp(`^▍${section}$`, 'm'), `--full prints ${section}`);
  }
  assert.match(stdout, /^ {4}did {6}Bash \(grep\)/m, 'and for each file, what was run');
  // The golden once recorded `asked to asked to` as correct, so a regenerated golden is no guard for it: the label
  // is printed once, and the instruction follows it in its own words.
  assert.match(stdout, /^ {4}asked to Find why the webhook returns 500$/m, 'what the agent was asked, labelled once');
  assert.doesNotMatch(stdout, /asked to asked to/);
  for (const line of stdout.split('\n')) assert.ok(line.length <= 100, `a line exceeded 100: ${line.length}`);
});

// R5, R8, R10; criteria 6 and 9. The summary is what a reader takes in without scrolling far, gaps first.
test('the summary fits a screen, says what could not be established first, and where the rest is', async (t) => {
  const { stdout } = await runCli(['report', '--input', await goldenSession(t), '--width', '100']);
  const lines = stdout.split('\n');
  const at = (heading: string): number => lines.indexOf(`▍${heading}`);

  assert.ok(lines.length <= 60, `the summary ran to ${lines.length} lines`);
  assert.ok(at('Who ran, and what they reached') > 0, 'the graph is there');
  assert.ok(at('What could not be established') > at('Who ran, and what they reached'));
  assert.ok(at('What was reached') > at('What could not be established'), 'and the gaps come before the findings');
  assert.match(stdout, /^ {2}1 × a call has no result, so its outcome is unknown$/m, 'with the gap itself in it');
  assert.match(stdout, /^session: /m, 'the scope is there');
  assert.doesNotMatch(stdout, /^The session in numbers$/m, 'the detail waits for --full');
  assert.equal(lines.filter((line) => line.trim() !== '').at(-1), 'Every detail: add --full · the page: add --open');
});

// Criterion 10, closing getting-to-a-report criterion 8: the incident's shape, legible from the text alone.
test('a delegated agent that reached a file through its search is told apart from the text alone', async (t) => {
  const { stdout } = await runCli(['report', '--input', await goldenSession(t), '--width', '100']);

  // As the motivating case went (where-the-value-went §2): the report came back after a launch notice, and the session
  // wrote the value into a file that is not protected.
  assert.match(stdout, /^ {2}└─ Agent 1 · Explore +2 actions +1 file reached +1 refused +gave the value back$/m, 'the graph flags it');
  assert.match(stdout, /^ {2}the session itself +4 actions +1 file reached +wrote the value into files$/m, 'and the agent that wrote it on');
  assert.match(
    stdout,
    /^ {2}Agent 1 · Explore — asked to Find why the webhook returns 500\n {4}● apps\/web\/\.env\.development +in a result · 1 line printed +reached$/m,
    'and the list says who, what it was asked, and what came back',
  );
});

// The point of the whole milestone: a value that reached a result is reported as a fact and never printed.
test('a key that came back in a result is named as a finding and never shown', async (t) => {
  const input = await leakingSession(t);

  const { code, stdout } = await runCli(['report', '--input', input, '--full']);

  assert.equal(code, 0);
  assert.ok(!stdout.includes(AWS_KEY), 'the value must not appear');
  assert.match(stdout, /apps\/web\/\.env\.development/, 'the path is the finding and is shown');
  assert.match(stdout, /appeared in the result/, 'and that no call parameter named it');
  // The kind of key that came back is a fact worth reporting; which key it was is not.
  assert.match(stdout, /Recognised key formats in results/);
  assert.match(stdout, /aws-access-key-id/);
  assert.match(flatten(stdout), /1 results carried something shaped like a key — replaced, never shown/);
});

const DELEGATION_CALL = 'toolu_01DDDDDDDDDDDDDDDDDDDDDD';
const ASKED_TO = 'Find cause of the webhook 500';

/**
 * The whole shape in one session: an attempt a rule refuses, a file a call names outright, and a file that
 * only comes back in a delegated agent's search. Every count on the page has something to be wrong about.
 */
async function threeRoutesSession(t: Parameters<typeof writeSession>[0]): Promise<string> {
  const call = (uuid: string, id: string, name: string, input: object, side = false): object => ({
    type: 'assistant',
    isSidechain: side,
    uuid,
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
  });
  const result = (id: string, content: string, extra: object = {}, side = false): object => ({
    type: 'user',
    isSidechain: side,
    ...extra,
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content }] },
  });

  const root = await writeSession(t, {
    'three.jsonl': jsonl(
      call('aaaaaaaa-1111-4111-8111-111111111111', 'toolu_01AAAAAAAAAAAAAAAAAAAAAA', 'Read', {
        file_path: 'apps/web/.env.local',
      }),
      result('toolu_01AAAAAAAAAAAAAAAAAAAAAA', 'permission denied', {
        toolDenialKind: 'permission-rule',
        sourceToolAssistantUUID: 'aaaaaaaa-1111-4111-8111-111111111111',
      }),
      call('bbbbbbbb-2222-4222-8222-222222222222', 'toolu_01BBBBBBBBBBBBBBBBBBBBBB', 'Read', {
        file_path: 'apps/web/.npmrc',
      }),
      result('toolu_01BBBBBBBBBBBBBBBBBBBBBB', 'registry set'),
      call('cccccccc-3333-4333-8333-333333333333', DELEGATION_CALL, 'Agent', {
        description: ASKED_TO,
        prompt: 'confirm what URL and secret the webhook is configured to use',
        subagent_type: 'Explore',
      }),
      result(DELEGATION_CALL, 'the agent reported back'),
    ),
    'three/subagents/agent-a1.jsonl': jsonl(
      call('dddddddd-4444-4444-8444-444444444444', 'toolu_01CCCCCCCCCCCCCCCCCCCCCC', 'Bash', {
        command: 'grep -rn "WEBHOOK_SECRET" apps --include=*.ts',
      }, true),
      result('toolu_01CCCCCCCCCCCCCCCCCCCCCC', 'apps/web/.env.development:12:WEBHOOK_SECRET=fixture-value', {}, true),
    ),
    'three/subagents/agent-a1.meta.json': JSON.stringify({
      agentType: 'Explore',
      description: ASKED_TO,
      toolUseId: DELEGATION_CALL,
      spawnDepth: 1,
    }),
  });
  return join(root, 'three.jsonl');
}

// A headline that says 30 above tiles that say 44 is read as a broken tool, and rightly - they are the same
// facts counted two ways. Every count on the page comes from one tally, and this is what pins it.
test('the page counts refused attempts apart from files reached, everywhere at once', async (t) => {
  const input = await threeRoutesSession(t);
  const file = join(await writeSession(t, {}), 'counts.html');

  const { stdout } = await runCli(['report', '--input', input, '--html', file]);
  const html = await readFile(file, 'utf8');

  // Two files were reached; the third was refused and reached nothing, so it is counted apart from them.
  assert.match(
    stdout.replace(/\s+/g, ' '),
    /2 files this policy protects were reached, 1 of them without any call ever naming it, and 1 further attempt was refused\./,
  );
  // The report page answers first with what was read, and counts the same AIs everywhere (the report page spec P6, P40).
  const page = english(html);
  assert.match(page, /Your AI opened 2 private files\./);
  assert.match(page, /AIs involved<\/div><div class="sx-value">2</);
  // The refusal keeps its own count: a row of its own in Files, never a file read.
  assert.equal((html.match(/data-did="read"/g) ?? []).length, 2);
  assert.equal((html.match(/data-did="stopped"/g) ?? []).length, 1, 'the refused file is counted apart');
  assert.match(page, /Was stopped \(1\)/);
  // The same facts are in the file in every language it offers; English is what a reader gets first.
  assert.match(html, /<html lang="en" data-lang="en">/);
  assert.match(html, /lang="pl">Twoje AI otworzyło 2 prywatne pliki\./, 'Polish is there too');
  assert.match(html, /lang="de">Deine KI hat 2 private Dateien geöffnet\./, 'and German');
  assert.doesNotMatch(html, /no rule applies/, 'the renderer cannot establish what enforcement was active');
});

// The page is read top to bottom by someone who does not know what this tool is. The questions have to arrive
// in the order they are asked, and "what happened" must not open on the one thing that did not.
test('the page puts the result and next action before the folded task and evidence', async (t) => {
  const input = await threeRoutesSession(t);
  const file = join(await writeSession(t, {}), 'story.html');

  await runCli(['report', '--input', input, '--html', file]);
  const html = await readFile(file, 'utf8');
  // The report page opens on the answer and what to do (P6, P7); the task as asked and the evidence come after it,
  // in Helpers and Advanced (P30, P40).
  const at = (text: string): number => html.indexOf(text);
  assert.ok(at('Your AI opened 2 private files.') > 0);
  assert.ok(at('Your AI opened 2 private files.') < at('Start →'));
  assert.ok(at('Start →') < at(ASKED_TO), 'what to do comes before what the helper was asked');
  assert.ok(at(ASKED_TO) < at('<section id="advanced"'), 'and the task is quoted before the full record');
  assert.match(html, /“Find cause of the webhook 500”/, 'the instruction itself is quoted');
  assert.match(html, /<details class="rc-fold"><summary>/, 'the records behind each step are folded');
  assert.match(html, /<select class="sb-lang js-only" id="lang"/, 'and the language can be changed on the page');
});

test('a policy file that cannot be read stops the run instead of falling back', async (t) => {
  const input = await leakingSession(t);
  const broken = join(await writeSession(t, {}), 'policy.json');
  await writeFile(broken, JSON.stringify({ level: 'no-read', protected: [] }));

  const { code, stdout } = await runCli(['report', '--input', input, '--policy', broken]);

  assert.equal(code, 2);
  assert.match(stdout, /The policy file was refused, so nothing was analysed/);
  assert.match(stdout, /"version" must be 1/);
  assert.match(stdout, /"protected" must be a non-empty array/);
});

test('a policy file replaces the default, and the header says which was used', async (t) => {
  const input = await leakingSession(t);
  const file = join(await writeSession(t, {}), 'policy.json');
  await writeFile(file, JSON.stringify({ version: 1, level: 'no-disclose', protected: ['**/nothing-here/**'] }));

  const { code, stdout } = await runCli(['report', '--input', input, '--policy', file]);

  assert.equal(code, 0);
  assert.match(stdout, /policy: no-disclose · 1 patterns/);
  assert.match(flatten(stdout), new RegExp(`source: policy file ${file.replace(/[/\\.]/g, '\\$&')}`));
  assert.match(stdout, /No file this policy protects was reached/, 'under that policy the .env file is not protected');
});

test('deny rules stand in for a policy, with what was ignored counted', async (t) => {
  const input = await leakingSession(t);
  const settings = join(await writeSession(t, {}), 'settings.json');
  await writeFile(settings, JSON.stringify({ permissions: { deny: ['Read(./.env*)', 'Bash(cat:*.env*)'] } }));

  const { stdout } = await runCli(['report', '--input', input, '--settings', settings]);

  assert.match(flatten(stdout), /1 used, 1 ignored as command patterns/);
});

// Exiting 0 with "none reached under this policy" on a path that does not exist would read as a clean bill of
// health. doctor exits 1 on the same input, and so does this.
test('a session that cannot be read exits 1 and says so', async () => {
  const { code, stdout } = await runCli(['report', '--input', '/no/such/session']);

  assert.equal(code, 1);
  assert.match(stdout, /the session transcript itself could not be read/);
});

// The summary counts every action; a body that shows only the delegated ones leaves the reader adding up
// numbers that are not on the page.
test('what the session did itself is shown, not only what it delegated', async (t) => {
  const input = await leakingSession(t);

  const { stdout } = await runCli(['report', '--input', input, '--full']);

  assert.match(stdout, /^▍What was reached$/m);
  assert.match(stdout, /who      the session itself/);
});

// §7.5, hard constraints: one self-contained file, no outbound traffic of any kind, and no way to reveal a
// value in the browser - a toggle would mean the value is in the file, and someone will send that file on.
test('the HTML report is one file that can reach nowhere and reveals nothing', async (t) => {
  const input = await leakingSession(t);
  const file = join(await writeSession(t, {}), 'report.html');

  const { code, stdout } = await runCli(['report', '--input', input, '--html', file]);
  const html = await readFile(file, 'utf8');

  assert.equal(code, 0);
  // One line that marks the page as scripted, and the page's one script; neither carries anything of the session.
  assert.equal((html.match(/<script>/g) ?? []).length, 2, 'the marker and one inline enhancement script');
  assert.match(html, /connect-src 'none'/, 'CSP prohibits outbound connections');
  // The one <link> is the tab's icon, and its href is the page's own bytes.
  assert.doesNotMatch(html, /<script[^>]+src=|<link(?![^>]*\brel="icon"[^>]*\bhref="data:)|<iframe|<img|\bon\w+=/i, 'no external assets or event-handler attributes');
  assert.match(html, /<dialog class="pp pp-wide" id="story-0"/, 'the finding is in the page before any script runs');
  assert.doesNotMatch(html, /<section id="\w+" data-view hidden/, 'every view is readable with JavaScript disabled');
  assert.match(html, /<a class="dt-link" href="#story-0"/, 'and the table links to it without a script');
  assert.ok(!/https?:\/\//.test(html), 'no CDN, no font, no external resource');
  // The script can post a mark only on a page `start` serves (P43); written on its own it says it is not served, and its
  // policy above forbids every connection whatever the script holds.
  assert.match(html, /id="wizard-words" data-served="false"/, 'and it knows it is not served, so it never tries');
  assert.ok(!html.includes(AWS_KEY), 'the value that came back in a result is not in the file');
  assert.match(html, /apps\/web\/\.env\.development/, 'the path is the finding and is shown');
  const page = english(html);
  assert.match(page, /Saw the keys in what a command printed/, 'said in words, not only drawn - a .env file is read as keys');
  assert.match(page, /No command asked for this file\./, 'and what makes it worth reading is said too');
  // The stdout summary appears whatever else was asked for, so --html does not rob CI of its output.
  assert.match(stdout, /^▍What could not be established$/m);
  assert.match(stdout, new RegExp(`HTML report written to ${file.replace(/[/\\.]/g, '\\$&')}`));
});

// "Not established" has to be visible, not merely written: a broken chain must look broken.
test('a state that could not be established is drawn as such', async (t) => {
  const file = join(await writeSession(t, {}), 'unresolved.html');
  const fixture = fileURLToPath(
    new URL('../fixtures/synthetic/agent-without-delegation/synthetic-no-delegation', import.meta.url),
  );

  await runCli(['report', '--input', fixture, '--html', file]);
  const page = english(await readFile(file, 'utf8'));

  assert.match(page, /Helpers with no known start/, 'the agent nothing asked for is named');
  assert.match(page, /The record doesn’t say what it was asked to do\./, 'and its missing cause is said in words');
  assert.match(page, /Brought in to help/, 'and nothing says who brought it in');
});

test('an HTML file that cannot be written is said out loud, and the analysis still stands', async (t) => {
  const input = await leakingSession(t);

  const { code, stdout } = await runCli(['report', '--input', input, '--html', '/no/such/directory/report.html']);

  assert.equal(code, 0, 'the report itself succeeded');
  assert.match(stdout, /^▍What could not be established$/m);
  assert.match(stdout, /The HTML report could not be written to/);
});

test('usage errors are usage errors, and --help is help', async () => {
  const badWidth = await runCli(['report', '--input', FIXTURE, '--width', 'wide']);

  assert.equal(badWidth.code, 2);
  assert.match(badWidth.stderr, /--width must be a whole number/);
  assert.equal((await runCli(['report', '--help'])).code, 0);
});

// Typing `--input ~/.claude/projects/-Users-someone-Projects-app/<uuid>` is not a tool anyone reaches for.
// Standing in a repository and asking for the report is.
test('the session can be found rather than typed', async () => {
  const sessions = await runCli(['sessions']);
  const report = await runCli(['report', '--width', '80']);

  assert.equal(sessions.code, 0);
  // Each of the three answers `sessions` gives, as it writes them. The second is what a clean checkout gets, and the
  // pattern once missed it by case - so the test passed only where Claude Code had stored sessions for the directory.
  assert.match(sessions.stdout, /sessions?, newest first|^No sessions are stored for this directory\.|has no sessions yet/m);
  assert.notEqual(report.code, 2, 'a missing --input is no longer a usage error');
  assert.match(`${report.stdout}${report.stderr}`, /session: |No session of this project/);
});

test('sessions takes no positional argument, and says so', async () => {
  const result = await runCli(['sessions', 'yesterday']);

  assert.equal(result.code, 2);
  assert.match(result.stderr, /does not take positional arguments/);
});

// R8: a command that behaves differently when it is being watched is not scriptable. runCli gives it no
// terminal, so this is the piped case, and it must be the table whatever else the flag would have done.
test('sessions prints the table when its output is not a terminal, flag or no flag', async () => {
  const piped = await runCli(['sessions']);
  const asked = await runCli(['sessions', '--no-interactive']);

  assert.equal(piped.code, 0);
  assert.equal(asked.code, 0);
  assert.equal(piped.stdout, asked.stdout, 'the flag changes nothing where there is no terminal to change');
});

// A project whose own path holds a space and an account name - the shape every real one has.
const PROJECT_ROOT = '/Users/someone/Projects/Client Name/the-app';

/**
 * A session that reached one file inside its project and two above it, in a macOS and a Linux home. `null` records
 * no working directory.
 */
async function rootedSession(t: Parameters<typeof writeSession>[0], cwd: string | null = PROJECT_ROOT): Promise<string> {
  const read = (id: string, path: string) => [
    {
      type: 'assistant',
      isSidechain: false,
      ...(cwd === null ? {} : { cwd }),
      message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Read', input: { file_path: path } }] },
    },
    {
      type: 'user',
      isSidechain: false,
      ...(cwd === null ? {} : { cwd }),
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'PORT=3000' }] },
    },
  ];
  const root = await writeSession(t, {
    'rooted.jsonl': jsonl(
      ...read('toolu_01INSIDEAAAAAAAAAAAAAAAA', `${PROJECT_ROOT}/apps/web/.env`),
      ...read('toolu_01OUTSIDEAAAAAAAAAAAAAAA', '/Users/someone/.ssh/id_rsa'),
      ...read('toolu_01LINUXHOMEAAAAAAAAAAAAA', '/home/someone/.ssh/id_ed25519'),
    ),
  });
  return join(root, 'rooted.jsonl');
}

/** The report a run writes, as stdout and as the HTML file beside it. */
async function reportOf(t: Parameters<typeof writeSession>[0], input: string, flags: readonly string[] = []) {
  const htmlPath = join(await writeSession(t, {}), 'report.html');
  const { code, stdout } = await runCli(['report', '--input', input, '--width', '100', ...flags, '--html', htmlPath]);
  return { code, stdout, html: await readFile(htmlPath, 'utf8') };
}

const NO_TRACE = { macOS: 0, linux: 0, windows: 0, home: 0, account: 0 };

/**
 * Every way a path can say whose machine it came from (spec §11, criterion 1), counted and never quoted: on a real
 * session a failure message that printed what it found would carry the path out with it.
 */
function homeTraces(text: string, accounts: readonly string[]): typeof NO_TRACE {
  const count = (pattern: RegExp): number => (text.match(pattern) ?? []).length;
  const occurrences = (value: string): number => text.split(value).length - 1;
  return {
    macOS: count(/\/Users\//g),
    linux: count(/\/home\//g),
    windows: count(/\b[A-Za-z]:\\/g),
    home: occurrences(homedir()),
    account: accounts.reduce((sum, account) => sum + occurrences(account), 0),
  };
}

// Criteria 4 and 6: the location is kept where the view keeps it, and the detail says it whole.
test('the full view keeps the absolute path of a file above the project, and relativises the rest', async (t) => {
  const input = await rootedSession(t);

  const { code, stdout, html } = await reportOf(t, input);

  assert.equal(code, 0);
  assert.match(stdout, /^\s+[●○?] apps\/web\/\.env(\s|$)/m, 'a file inside the project is shown relative to it');
  assert.ok(stdout.includes('/Users/someone/.ssh/id_rsa'), 'a file above it keeps the path that says where it is');
  assert.ok(stdout.includes('/home/someone/.ssh/id_ed25519'), 'on any system');
  // The count the shared view is held to finds what this view keeps, so its zeros there mean something.
  const traces = homeTraces(stdout, ['someone']);
  assert.ok(traces.macOS > 0 && traces.linux > 0 && traces.account > 0, 'the count sees a home in the full view');
  assert.equal(homeTraces('C:\\Users\\someone', []).windows, 1, 'and a drive, which no session here records');
  for (const path of ['/Users/someone/.ssh/id_rsa', '/home/someone/.ssh/id_ed25519']) {
    assert.ok(
      html.includes('<span class="sw-fact-value sw-mono">' + path + '</span>'),
      'the page’s detail holds the absolute path',
    );
  }
  assert.match(english(html), /Shown in full/, 'and the page says which view it is');
});

// Criteria 1, 4 and 8.
test('the shared view lets no absolute path into any output it produces', async (t) => {
  const input = await rootedSession(t);

  const { code, stdout, html } = await reportOf(t, input, ['--share']);

  assert.equal(code, 0);
  for (const [name, text] of [['stdout', stdout], ['the HTML file', html]] as const) {
    assert.deepEqual(homeTraces(text, ['someone']), NO_TRACE, `${name} says nothing of whose machine it came from`);
    assert.ok(!text.includes('Client Name'), `${name} carries nothing from above the project root`);
    assert.ok(text.includes('apps/web/.env'), `${name} still names what is inside the project`);
    assert.ok(text.includes('outside the project'), `${name} keeps the signal of what is above it, without the location`);
  }
  assert.match(flatten(stdout), /paths: SHARED — relative to the project root, nothing above it appears/, 'stdout names the view');
  assert.match(english(html), /This is a shared report\./, 'and so does the page');
});

// Criterion 1 names a real session, and no real session is committed: this runs only when pointed at one.
const REFERENCE_SESSION = process.env.AGENTWHY_REFERENCE_SESSION;

test(
  'a shared report of the unredacted session says nothing of whose machine it came from',
  { skip: REFERENCE_SESSION === undefined && 'set AGENTWHY_REFERENCE_SESSION to the session the corpus was made from' },
  async (t) => {
    assert.ok(REFERENCE_SESSION);

    const { code, stdout, html } = await reportOf(t, REFERENCE_SESSION, ['--share']);

    assert.equal(code, 0);
    assert.deepEqual(homeTraces(stdout, [userInfo().username]), NO_TRACE, 'stdout, by count');
    assert.deepEqual(homeTraces(html, [userInfo().username]), NO_TRACE, 'the HTML file, by count');
  },
);

// Criterion 5, in both renderers.
test('a session that records no working directory says so, and shortens no path', async (t) => {
  const input = await rootedSession(t, null);

  const { stdout, html } = await reportOf(t, input);

  assert.match(flatten(stdout), /project root: NOT established — no record carried one/);
  assert.ok(stdout.includes(`${PROJECT_ROOT}/apps/web/.env`), 'with no root, a path is shown exactly as written');
  assert.match(english(html), /Exactly as written: the record doesn’t say which folder the project is in\./);
  assert.ok(html.includes(`${PROJECT_ROOT}/apps/web/.env`), 'on the page too');
});

// Criterion 9: the canary of M3 and M4 - the value that came back in a result - is in neither view.
test('the value that came back is in no output of either view', async (t) => {
  const input = await leakingSession(t);

  for (const flags of [[], ['--share']]) {
    const { code, stdout, html } = await reportOf(t, input, flags);

    assert.equal(code, 0);
    assert.ok(!stdout.includes(AWS_KEY), `stdout ${flags.join(' ')}`);
    assert.ok(!html.includes(AWS_KEY), `the HTML file ${flags.join(' ')}`);
    assert.ok(html.includes('apps/web/.env.development'), 'the finding itself is there, so the file was not empty');
  }
});

/*
 * `the-agent-tells-you` R19: the one caller that is not a person reading a terminal. When an agent opens the report
 * because the person said yes, everything this command prints lands in the model's context - and the summary names
 * protected paths and what became of each, which is the thing this tool works to keep out of there.
 */
test('--quiet says where the report is and nothing about what is in it', async (t) => {
  const file = join(await writeSession(t, {}), 'quiet.html');
  const input = await leakingSession(t);

  const quiet = await runCli(['report', '--input', input, '--html', file, '--quiet']);
  const loud = await runCli(['report', '--input', input, '--html', file]);

  assert.equal(quiet.code, 0);
  assert.equal(quiet.stdout, `HTML report written to ${file}\n`);
  assert.ok(!quiet.stdout.includes('.env'), 'no path of the session');
  assert.ok(!quiet.stdout.includes(AWS_KEY));
  // The file is the same one either way: what is quiet is the terminal, never the report.
  assert.match(loud.stdout, /^▍/m, 'the summary is still what a person gets');
  assert.match(await readFile(file, 'utf8'), /apps\/web\/\.env\.development/);
});
