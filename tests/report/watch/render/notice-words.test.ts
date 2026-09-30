import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import { NOTICE_BUDGET, NoticeWordsRenderer, turnWords } from '../../../../src/report/watch/render/notice-words.ts';
import type { AlertLevel } from '../../../../src/report/watch/agent-alert.ts';
import type { NotChecked, WatchNotice } from '../../../../src/report/watch/watch-notice.ts';
import type { RememberedAlert } from '../../../../src/ports/alert-store.ts';

const words = new NoticeWordsRenderer();
const type = new Redactor('test').term('general-purpose');
const remembered = (level: string, count = 1): RememberedAlert[] =>
  Array.from({ length: count }, (_, index) => ({ agentId: `${level}-${index}`, level, words: `${level} ${index}` }));

const alert = (level: AlertLevel, filesReached: number | undefined, refusedAttempts: number): WatchNotice => ({
  kind: 'alert',
  alert: { level, type, refusedAttempts, ...(filesReached === undefined ? {} : { filesReached }) },
});

// R15, on the user's screenshot of B4f: a macOS notification cuts the words, and the command to run comes last.
test('every notice fits what a notification shows, with the command to run at its end', () => {
  const notices: WatchNotice[] = [
    alert('value', 12, 3),
    alert('value', undefined, 12),
    alert('reached', 12, 3),
    alert('reached', undefined, 0),
    alert('refused', undefined, 1),
    alert('refused', undefined, 12),
    ...(['arguments', 'input', 'policy', 'session', 'agent-not-found'] as NotChecked[]).map(
      (reason): WatchNotice => ({ kind: 'not-checked', reason }),
    ),
  ];
  // Not a finding, so it does not end in `Details:`; held to the same budget all the same.
  assert.ok(words.render({ kind: 'preferences-unusable' }).length <= NOTICE_BUDGET);

  for (const notice of notices) {
    const text = words.render(notice);
    assert.ok(text.length <= NOTICE_BUDGET, `${text.length} characters: ${text}`);
    assert.ok(text.endsWith('Details: agentwhy report --open'), text);
  }
});

// The action comes first, in the words `check` uses for the same two cases: a notice arrives in a frame this project
// does not draw - grey italics under a reply - and what is read first has to be what to do.
test('a value and a reach are each said in few words, what to do first, and a refusal left to the report', () => {
  assert.equal(
    words.render(alert('value', 1, 1)),
    'ROTATE: general-purpose agent wrote a value from a protected file; its answer may carry it. 1 file reached. Details: agentwhy report --open',
  );
  assert.equal(
    words.render(alert('reached', undefined, 0)),
    'CHECK: general-purpose agent reached protected files; no value found in its messages. Details: agentwhy report --open',
  );
  assert.equal(words.render({ kind: 'quiet' }), '');
});

// R2 and R3: the level a person can ask for, said as news. A rule held, so the words ask for nothing and name no one.
test('a refusal is said as good news, with the rule as its subject', () => {
  assert.equal(
    words.render(alert('refused', undefined, 2)),
    'NOTE: a rule refused 2 attempts at protected files; nothing was reached. Details: agentwhy report --open',
  );
  assert.equal(
    words.render(alert('refused', undefined, 1)),
    'NOTE: a rule refused 1 attempt at protected files; nothing was reached. Details: agentwhy report --open',
  );
});

/*
 * A refused agent reached nothing, so a turn that holds one must not count it among the agents that did. The line
 * that would be wrong here is the one that matters most: "3 agents reached protected files" about two refusals.
 */
test('a turn counts what was reached apart from what was refused', () => {
  assert.equal(
    turnWords(remembered('refused', 3)),
    'NOTE: a rule refused attempts by 3 agents; nothing was reached. Details: agentwhy report --open',
  );
  assert.equal(
    turnWords([...remembered('refused', 2), ...remembered('reached', 1)]),
    'CHECK: 1 agent reached protected files; no value found in their messages. Details: agentwhy report --open',
  );
  assert.equal(
    turnWords([...remembered('refused', 2), ...remembered('value', 2)]),
    'ROTATE: 2 agents wrote a value from a protected file; their answers may carry it. Details: agentwhy report --open',
  );
  assert.equal(
    turnWords([...remembered('refused', 1), ...remembered('value', 1), ...remembered('reached', 1)]),
    'ROTATE: 2 agents reached protected files, 1 wrote a value from one. Details: agentwhy report --open',
  );
});

test('a turn that could check nothing says so, and one that checked some says both', () => {
  assert.equal(
    turnWords(remembered('not-checked', 2)),
    'CHECK: 2 agents could not be checked. Details: agentwhy report --open',
  );
  assert.equal(
    turnWords([...remembered('refused', 2), ...remembered('not-checked', 1)]),
    'NOTE: a rule refused attempts by 2 agents; nothing was reached; 1 agent could not be checked. Details: agentwhy report --open',
  );
});

/*
 * the-agent-tells-you R29: the clean lines, in each language the page is written in, each held to the budget a
 * notification shows. A finding from an earlier turn keeps the command to run at its end.
 */
test('a clean turn is said in each language, within the budget, with the details last where there is something to see', () => {
  const none = { values: 0, reached: 0 };
  for (const lang of ['en', 'pl', 'de'] as const) {
    const lines = [
      words.render({ kind: 'clean', first: true, counts: none, lang }),
      words.render({ kind: 'clean', first: false, counts: none, lang }),
      words.render({ kind: 'clean', first: false, counts: { values: 23, reached: 0 }, lang }),
      words.render({ kind: 'clean', first: false, counts: { values: 0, reached: 12 }, lang }),
    ];
    for (const text of lines) assert.ok(text.length <= NOTICE_BUDGET, `${text.length} characters: ${text}`);
    assert.ok(lines[0]?.startsWith('✓') && lines[1]?.startsWith('✓'), lang);
    assert.ok(lines[2]?.endsWith(': agentwhy report --open') && lines[3]?.endsWith(': agentwhy report --open'), lang);
  }
});

test('Polish counts the way Polish does: 2-4 and 22-24 one way, 5-21 and 12-14 the other', () => {
  const said = (values: number): string => words.render({ kind: 'clean', first: false, counts: { values, reached: 0 }, lang: 'pl' });

  assert.match(said(1), /przeczytało klucz z/);
  assert.match(said(3), /przeczytało 3 klucze z/);
  assert.match(said(5), /przeczytało 5 kluczy z/);
  assert.match(said(12), /przeczytało 12 kluczy z/);
  assert.match(said(22), /przeczytało 22 klucze z/);
});
