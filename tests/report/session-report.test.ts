import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MAIN_AGENT_TYPE } from '../../src/core/agent.ts';
import type { Redacted } from '../../src/core/redaction/redacted.ts';
import { Redactor } from '../../src/core/redaction/redactor.ts';
import type { SessionSummary } from '../../src/core/session-catalogue.ts';
import type { SessionModel } from '../../src/core/session-model.ts';
import { FileAccessError } from '../../src/ports/file-access-error.ts';
import { TextReportRenderer } from '../../src/report/render/text-report-renderer.ts';
import type { ReportOptions } from '../../src/report/report-use-case.ts';
import { SessionReport } from '../../src/report/session-report.ts';

const MODEL: SessionModel = {
  provider: 'claude-code',
  turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
  sessionId: 'sess-1',
  projectRoot: { kind: 'absent' },
  agents: [{ id: 'sess-1', type: MAIN_AGENT_TYPE, depth: 0 }],
  delegations: [],
  events: [],
  messages: [],
  gaps: [],
  completeness: 'complete',
};

const NOW = Date.parse('2026-09-14T12:00:00Z');

const OPTIONS: ReportOptions = { input: 'anywhere', ascii: false, full: false, colour: false, open: false, share: false, width: 100 };

/** Everything the use case needs, as fakes, so that what it does with a browser can be seen. */
function reportWith(open: () => Promise<boolean>, writeText: (path: string) => Promise<void>, sessions: readonly SessionSummary[] = []) {
  const read: string[] = [];
  const written: string[] = [];
  const opened: string[] = [];
  const pages: boolean[] = [];
  const titles: (string | undefined)[] = [];

  const useCase = new SessionReport({
    reader: {
      read: async (input) => {
        read.push(input);
        return { kind: 'read', model: MODEL };
      },
    },
    files: {
      readText: async (path) => {
        throw new FileAccessError('not-found', path);
      },
      readLines: () => {
        throw new FileAccessError('not-found', 'lines');
      },
      writeText: async (path) => {
        written.push(path);
        await writeText(path);
      },
      ensureDirectory: async () => undefined,
    },
    createRedactor: () => new Redactor('test'),
    createRenderer: (options) => new TextReportRenderer(options.width),
    htmlRenderer: {
      render: (page) => {
        pages.push(page.withIndexLink);
        titles.push(page.title);
        return '<!doctype html>';
      },
    },
    catalogue: { list: async () => ({ directory: '/stored/project', found: sessions.length > 0, searched: [{ provider: 'claude-code', directory: '/stored/project', found: sessions.length > 0 }], sessions }) },
    workingDirectory: '/work',
    browser: {
      open: async (path) => {
        opened.push(path);
        return open();
      },
    },
    temporaryDirectory: '/tmp-dir',
    now: NOW,
  });

  return { useCase, written, opened, pages, read, titles };
}

const succeeds = async (): Promise<boolean> => true;
const writes = async (): Promise<void> => undefined;

// `a-way-back` R8: the way back is offered by the run that wrote an index beside the report, and by no other.
test('the way back is off unless the run asks for it', async () => {
  const { useCase, pages } = reportWith(succeeds, writes);

  await useCase.run({ ...OPTIONS, htmlPath: '/out/r.html' });
  await useCase.run({ ...OPTIONS, htmlPath: '/out/r.html', withIndexLink: true });

  assert.deepEqual(pages, [false, true]);
});

// P4: the title `start` read reaches the page for "You asked" - and never a shared one, which leaves this machine.
test('the session’s title reaches the page, and never under --share', async () => {
  const { useCase, titles } = reportWith(succeeds, writes);
  const title = 'Fix the sign-up button' as Redacted;

  await useCase.run({ ...OPTIONS, htmlPath: '/out/r.html', title });
  await useCase.run({ ...OPTIONS, htmlPath: '/out/r.html', title, share: true });
  await useCase.run({ ...OPTIONS, htmlPath: '/out/r.html' });

  assert.deepEqual(titles, [title, undefined, undefined]);
});

test('--open writes the report somewhere temporary when no file was named, and shows that file', async () => {
  const { useCase, written, opened } = reportWith(succeeds, writes);

  await useCase.run({ ...OPTIONS, open: true });

  assert.deepEqual(written, ['/tmp-dir/agentwhy-sess-1.html'], 'never the directory the command was run from');
  assert.deepEqual(opened, written, 'and what is opened is what was written');
});

test('--open with --html shows the file that was asked for, and writes no other', async () => {
  const { useCase, written, opened } = reportWith(succeeds, writes);

  await useCase.run({ ...OPTIONS, open: true, htmlPath: '/chosen/report.html' });

  assert.deepEqual(written, ['/chosen/report.html']);
  assert.deepEqual(opened, ['/chosen/report.html']);
});

test('without --open nothing is shown, and without --html nothing is written', async () => {
  const { useCase, written, opened } = reportWith(succeeds, writes);

  const result = await useCase.run({ ...OPTIONS, htmlPath: '/chosen/report.html' });

  assert.deepEqual(written, ['/chosen/report.html']);
  assert.deepEqual(opened, [], 'writing a file is not asking to be shown it');
  assert.equal(result.outcome, 'complete');
});

// A machine with no opener still has the file, and its path has already been printed.
test('a machine that opens nothing is told so, and the report still succeeds', async () => {
  const { useCase } = reportWith(async () => false, writes);

  const result = await useCase.run({ ...OPTIONS, open: true });

  assert.equal(result.outcome, 'complete');
  assert.match(result.output, /Nothing on this machine opened it/);
});

// Opening a file that was not written would open whatever happened to be there before.
test('a report that could not be written is not opened', async () => {
  const { useCase, opened } = reportWith(succeeds, async (path) => {
    throw new FileAccessError('not-found', path);
  });

  const result = await useCase.run({ ...OPTIONS, open: true });

  assert.deepEqual(opened, []);
  assert.match(result.output, /could not be written/);
});

// Review finding: the temporary file was named after the session and its absolute path printed - in the one view
// that promises to show neither.
test('a shared report opened from a temporary file names no session and prints no location', async () => {
  const { useCase, written } = reportWith(succeeds, writes);

  const result = await useCase.run({ ...OPTIONS, open: true, share: true });

  assert.equal(written.length, 1);
  assert.ok(!written[0]?.includes('sess-1'), `the file is not named after the session: ${written[0]}`);
  assert.ok(!result.output.includes('sess-1'), 'the id is not printed');
  assert.ok(!result.output.includes('/tmp-dir'), 'nor where the file went');
});

test('whether the HTML is on disk is reported apart from the sentence about it', async () => {
  const fails = async (path: string): Promise<void> => {
    throw new FileAccessError('not-found', path);
  };

  assert.equal((await reportWith(succeeds, writes).useCase.run({ ...OPTIONS, htmlPath: '/x/r.html' })).htmlWritten, true);
  assert.equal((await reportWith(succeeds, fails).useCase.run({ ...OPTIONS, htmlPath: '/x/r.html' })).htmlWritten, false);
  assert.equal((await reportWith(succeeds, writes).useCase.run(OPTIONS)).htmlWritten, undefined, 'none was asked for');
});


// `agentwhy sessions` tells a person to run `report --input <the id above>`, so an id of this project names its session.
test('an id listed for this project is read as that session, and anything else as a path', async () => {
  const stored = { id: '5a904bc9-393e-4b58-8d5c-e0a15de9d243', path: '/stored/project/5a904bc9-393e-4b58-8d5c-e0a15de9d243.jsonl', modifiedAt: NOW, delegations: 3, provider: 'claude-code' as const };
  const { useCase, read } = reportWith(succeeds, writes, [stored]);

  await useCase.run({ ...OPTIONS, input: stored.id });
  await useCase.run({ ...OPTIONS, input: stored.id.slice(0, 8) });
  await useCase.run({ ...OPTIONS, input: './sessions/other.jsonl' });

  assert.deepEqual(read, [stored.path, stored.id.slice(0, 8), './sessions/other.jsonl']);
});

// A key names a session: a Claude Code id is its own key, so it is that session; a Codex id is named by `codex-…`. Two
// Codex rollouts holding one id - a copied file - share their key too, so only a path tells them apart.
test('a bare id held twice is never picked: two of one AI are named by their paths', async () => {
  const id = '01a0ec9c-0000-7000-8000-000000000001';
  const codex = (path: string) => ({ id, path, modifiedAt: NOW, delegations: 0, provider: 'codex' as const });
  const copied = reportWith(succeeds, writes, [codex('/a/rollout.jsonl'), codex('/b/rollout.jsonl')]);

  const result = await copied.useCase.run({ ...OPTIONS, input: id });
  assert.equal(result.output, `2 sessions hold the id ${id}.\nName it by its path.\n`);
  assert.deepEqual(copied.read, []);

  const both = reportWith(succeeds, writes, [codex('/a/rollout.jsonl'), { ...codex('/c/session.jsonl'), provider: 'claude-code' as const }]);
  await both.useCase.run({ ...OPTIONS, input: id });
  assert.deepEqual(both.read, ['/c/session.jsonl'], 'the Claude Code session is the one its own key names');
});
