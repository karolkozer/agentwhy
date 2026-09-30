import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SessionsCliCommand } from '../../../src/cli/commands/sessions-cli-command.ts';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import type { SessionListing } from '../../../src/core/session-catalogue.ts';
import type { Choice } from '../../../src/ports/chooser.ts';
import type { ReportOptions, ReportResult } from '../../../src/report/report-use-case.ts';

const LISTING: SessionListing = {
  directory: '/projects/app',
  found: true,
  searched: [{ provider: 'claude-code', directory: '/projects/app', found: true }],
  sessions: [
    { id: 'sess-new', path: '/projects/app/sess-new.jsonl', modifiedAt: 2_000_000_000_000, delegations: 3, provider: 'claude-code' },
    { id: 'sess-old', path: '/projects/app/sess-old.jsonl', modifiedAt: 1_000_000_000_000, delegations: 0, provider: 'claude-code' },
  ],
};

// A few seconds after sess-new, and about 31.7 years after sess-old: a quick range tells them apart cleanly.
const NOW = 2_000_000_010_000;

const redactor = new Redactor('test-salt');

/**
 * `chose` answers the chooser in order, one per call - the range question first when the picker runs, then the
 * session list. `calls` holds every call's heading and choices in order, so a test can tell the range question
 * from the list that follows it; most tests only care about the last one, `calls.at(-1)`.
 */
function commandWith(interactive: boolean, chose: readonly (number | undefined)[], typed?: string) {
  const calls: { heading: string; choices: readonly Choice[] }[] = [];
  const ran: ReportOptions[] = [];
  const titled: string[] = [];
  let call = 0;

  const command = new SessionsCliCommand({
    catalogue: { list: async () => LISTING },
    workingDirectory: '/projects/app',
    chooser: {
      choose: async (heading, choices) => {
        calls.push({ heading, choices });
        return chose[call++];
      },
    },
    asker: { ask: async () => typed },
    titles: {
      recognise: async (session) => {
        titled.push(session.id);
        return session.id === 'sess-new' ? { title: redactor.scan('Fix the webhook signature check') } : {};
      },
    },
    width: 100,
    report: {
      run: async (options): Promise<ReportResult> => {
        ran.push(options);
        return { outcome: 'complete', output: 'the report\n' };
      },
    },
    interactive,
    now: NOW,
  });

  return { command, calls, ran, titled };
}

test('choosing a session opens a report on it, and on no other', async () => {
  // 3 = "All sessions" on the range question, then the session at index 1 of the (unfiltered) list.
  const { command, ran } = commandWith(true, [3, 1]);

  const result = await command.execute([]);

  assert.deepEqual(ran.map((options) => options.input), ['/projects/app/sess-old.jsonl']);
  assert.equal(ran[0]?.open, true, 'choosing is asking to see it');
  assert.equal(ran[0]?.width, 100, 'and at the width the terminal it was chosen at is drawn to');
  assert.deepEqual(result, { kind: 'completed', output: 'the report\n', exitCode: 0 });
});

// Someone who opened the list and changed their mind has not failed at anything.
test('leaving the range question, or the session list, runs nothing and is not an error', async () => {
  const atRange = commandWith(true, [undefined]);
  assert.deepEqual(await atRange.command.execute([]), { kind: 'completed', output: '', exitCode: 0 });
  assert.deepEqual(atRange.ran, []);

  const atList = commandWith(true, [3, undefined]);
  assert.deepEqual(await atList.command.execute([]), { kind: 'completed', output: '', exitCode: 0 });
  assert.deepEqual(atList.ran, []);
});

test('with no terminal the table is printed and nothing is chosen, and no range is asked', async () => {
  const { command, calls, ran, titled } = commandWith(false, [0]);

  const result = await command.execute([]);

  assert.equal(calls.length, 0, 'the chooser is not reached');
  assert.deepEqual(titled, [], 'and no transcript is opened for a title nobody will see');
  assert.deepEqual(ran, []);
  assert.equal(result.kind, 'completed');
  assert.match(result.kind === 'completed' ? result.output : '', /sess-new/);
  assert.match(result.kind === 'completed' ? result.output : '', /sess-old/, 'unfiltered off a terminal, as before');
});

// R9: the table is the contract, and asking for it must work where the picker would otherwise take over.
test('--no-interactive asks for the table at a terminal too, and no range is asked', async () => {
  const { command, calls, ran } = commandWith(true, [0]);

  const result = await command.execute(['--no-interactive']);

  assert.equal(calls.length, 0);
  assert.deepEqual(ran, []);
  assert.match(result.kind === 'completed' ? result.output : '', /newest first/);
});

// A list of ids and times gives a person nothing to recognise a session by.
test('a session is offered by its title, and one without a title by its id', async () => {
  const { command, calls } = commandWith(true, [3, undefined]);

  await command.execute([]);

  const list = calls.at(-1);
  assert.equal(list?.choices[0]?.label, 'Fix the webhook signature check');
  assert.match(list?.choices[0]?.detail ?? '', /sess-new/, 'the id stays beside a title, since two sessions can share one');
  assert.match(list?.choices[1]?.label ?? '', /untitled · sess-old/);
});

// The reason this question exists: there can be too many sessions to read as one list.
test('at a terminal with no --since, the range is asked before the list', async () => {
  const { command, calls } = commandWith(true, [3, undefined]);

  await command.execute([]);

  assert.equal(calls[0]?.heading, 'How far back? There can be a lot of sessions.');
  assert.match(calls[1]?.heading ?? '', /newest first\. Type to narrow the list\./, 'then the list itself');
});

test('a quick range filters the list before it is shown', async () => {
  // 1 = "Last 7 days": only sess-new (a few seconds old) is inside it, sess-old (decades old) is not.
  const { command, calls } = commandWith(true, [1, 0]);

  await command.execute([]);

  const list = calls.at(-1);
  assert.equal(list?.choices.length, 1);
  assert.equal(list?.choices[0]?.label, 'Fix the webhook signature check');
  assert.match(list?.heading ?? '', /active since 7d/);
});

test('typing a span or date does the same as a quick range', async () => {
  // 4 = "Type a date or span": the asker's answer is read next.
  const { command, calls } = commandWith(true, [4, 0], '7d');

  await command.execute([]);

  const list = calls.at(-1);
  assert.equal(list?.choices.length, 1, 'only sess-new falls inside the typed span');
  assert.match(list?.heading ?? '', /active since 7d/);
});

test('a typed span that does not parse is asked again, not silently ignored', async () => {
  const asked: { heading?: string; choices?: readonly Choice[] } = {};
  const questions: string[] = [];
  let askCall = 0;
  // First answer does not parse; the second is blank, which is how a person at a terminal gives up on the question.
  const answers = ['sometime last week', ''];

  const command = new SessionsCliCommand({
    catalogue: { list: async () => LISTING },
    workingDirectory: '/projects/app',
    chooser: {
      choose: async (heading, choices) => {
        asked.heading = heading;
        asked.choices = choices;
        return 4; // "Type a date or span"
      },
    },
    asker: {
      ask: async (question) => {
        questions.push(question);
        return answers[askCall++];
      },
    },
    titles: { recognise: async () => ({}) },
    width: 100,
    report: { run: async (): Promise<ReportResult> => ({ outcome: 'complete', output: '' }) },
    interactive: true,
    now: NOW,
  });

  const result = await command.execute([]);

  assert.deepEqual(result, { kind: 'completed', output: '', exitCode: 0 });
  assert.equal(questions.length, 2, 'a span that does not parse is asked again once, not forever');
  assert.match(questions[1] ?? '', /--since is not a calendar date|takes a span/, 'the second question says what was wrong with the first answer');
});

test('--since on the command line skips the range question entirely', async () => {
  const { command, calls } = commandWith(true, [0]);

  await command.execute(['--since', '7d']);

  assert.equal(calls.length, 1, 'only the session list was asked - the range question never ran');
  assert.equal(calls[0]?.choices.length, 1, 'the flag filtered the list before it was shown');
});

test('--since filtering everything out is said, not shown as an empty list', async () => {
  const { command } = commandWith(false, []);

  // A day after both fixture sessions, whichever "now" this file's NOW resolves to.
  const result = await command.execute(['--since', '2033-05-19', '--no-interactive']);

  assert.deepEqual(result, { kind: 'completed', output: 'No sessions of this project were active since 2033-05-19.\n', exitCode: 0 });
});

test('a bad --since is a usage error, the same as report and check give', async () => {
  const { command } = commandWith(false, []);

  const result = await command.execute(['--since', 'sometime']);

  assert.equal(result.kind, 'usage-error');
});

// worth-running-every-day R28: an empty project says why and what to do, not only where it looked.
test('no sessions stored at all says why, and the two ways forward', async () => {
  const command = new SessionsCliCommand({
    catalogue: { list: async () => ({ directory: '/nowhere', found: false, searched: [{ provider: 'claude-code', directory: '/nowhere', found: false }], sessions: [] }) },
    workingDirectory: '/nowhere',
    chooser: { choose: async () => undefined },
    asker: { ask: async () => undefined },
    titles: { recognise: async () => ({}) },
    width: 100,
    report: { run: async (): Promise<ReportResult> => ({ outcome: 'complete', output: '' }) },
    interactive: false,
    now: NOW,
  });

  const result = await command.execute([]);

  assert.equal(result.kind, 'completed');
  assert.match((result as { output: string }).output, /^No sessions are stored for this directory\./);
  assert.match((result as { output: string }).output, /agentwhy reads sessions Claude Code and Codex already keep/);
  assert.match((result as { output: string }).output, /agentwhy init/);
});
