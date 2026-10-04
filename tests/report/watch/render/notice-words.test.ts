// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
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
  // `when-an-agent-finishes` R4a: a helper that left no record is not in the report either, so it sends no one there.
  for (const lang of ['en', 'pl', 'de'] as const) {
    const noRecord = words.render({ kind: 'no-record', lang });
    assert.ok(noRecord.length <= NOTICE_BUDGET, `${noRecord.length} characters: ${noRecord}`);
    assert.ok(noRecord !== '' && !noRecord.includes('Details') && !noRecord.includes('Szczegóły'), noRecord);
  }
  assert.match(words.render({ kind: 'no-record', lang: 'pl' }), /^Zakończył się pomocnik, który nie zostawił zapisu/);
  // `the-chat-says-what-the-report-says` §5, `told`: a read the person allowed, with nothing to do and the details last.
  for (const lang of ['en', 'pl', 'de'] as const) {
    const told = words.render({ kind: 'told', lang });
    assert.ok(told.length <= NOTICE_BUDGET, `${told.length} characters: ${told}`);
    assert.ok(told.endsWith(': agentwhy report --open') && !told.includes('ROTATE'), told);
  }
  // S8, §5: what a read file held, in agentwhy's voice and the person's language, what to do before the command (S8),
  // and no data said as a key (S10).
  for (const lang of ['en', 'pl', 'de'] as const) {
    for (const what of ['keys', 'template', 'data'] as const) {
      const read = words.render({ kind: 'read', what, lang });
      assert.ok(read.length <= NOTICE_BUDGET, `${read.length} characters: ${read}`);
      assert.ok(read.endsWith(': agentwhy report --open') && !/ROTATE|CHECK|protected|value/.test(read), read);
    }
    assert.ok(!/key|Klucz|Schlüssel|change|zmień|ändere/i.test(words.render({ kind: 'read', what: 'data', lang })), lang);
  }
  assert.equal(words.render({ kind: 'read', what: 'keys', lang: 'pl' }),
    'Pilnuję twoich prywatnych plików. Klucz z jednego z nich jest teraz w tej rozmowie — zmień go. Szczegóły: agentwhy report --open');

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

// `.ai/specs/2026-10-01-who-stopped-it.md` WS5: a rule is named only where a rule refused them all.
test('an attempt auto mode or the person stopped is said as stopped, by nobody\'s rule', () => {
  const stopped = (refusedAttempts: number): WatchNotice => ({
    kind: 'alert',
    alert: { level: 'refused', type, refusedAttempts, refusedByOthers: { reviewer: 1, person: 0 } },
  });

  assert.equal(words.render(alert('refused', undefined, 2)), 'NOTE: a rule refused 2 attempts at protected files; nothing was reached. Details: agentwhy report --open');
  assert.equal(words.render(stopped(1)), 'NOTE: 1 attempt at protected files was stopped; nothing was reached. Details: agentwhy report --open');
  assert.equal(words.render(stopped(3)), 'NOTE: 3 attempts at protected files were stopped; nothing was reached. Details: agentwhy report --open');
  assert.ok(words.render(stopped(12)).length <= NOTICE_BUDGET);

  const [first, second] = remembered('refused', 2);
  assert.ok(first !== undefined && second !== undefined);
  assert.equal(
    turnWords([first, { ...second, notByRule: true }]),
    'NOTE: attempts by 2 agents at protected files were stopped; nothing was reached. Details: agentwhy report --open',
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
      words.render({ kind: 'clean', first: false, counts: { values: 0, reached: 0, told: 24 }, lang }),
    ];
    for (const text of lines) assert.ok(text.length <= NOTICE_BUDGET, `${text.length} characters: ${text}`);
    assert.ok(lines[0]?.startsWith('✓') && lines[1]?.startsWith('✓'), lang);
    for (const earlier of lines.slice(2)) assert.ok(earlier.endsWith(': agentwhy report --open'), `${lang}: ${earlier}`);
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

// S1: private data read earlier is said as data, after a key and before a file only opened.
test('an earlier read of private data is said as data, never as a key', () => {
  const earlier = (counts: { values: number; reached: number; data?: number }): string => words.render({ kind: 'clean', first: false, counts, lang: 'en' });

  assert.match(earlier({ values: 0, reached: 1, data: 1 }), /Earlier in this chat your AI read private data from a private file\./);
  assert.match(earlier({ values: 0, reached: 0, data: 3 }), /read private data from 3 private files\./);
  assert.match(earlier({ values: 1, reached: 0, data: 1 }), /read a key/, 'a key still said first');
  assert.match(words.render({ kind: 'clean', first: false, counts: { values: 0, reached: 0, data: 1 }, lang: 'pl' }), /prywatne dane z prywatnego pliku\./);
});

// F57a: a read the person allowed is never said as a key, and Polish agrees the allowing with the count too.
test('an earlier read the person allowed is said as allowed', () => {
  const told = (count: number, lang: 'en' | 'pl'): string => words.render({ kind: 'clean', first: false, counts: { values: 0, reached: 0, told: count }, lang });

  assert.match(told(1, 'en'), /Earlier in this chat your AI read a private file you let it read\./);
  assert.match(told(1, 'pl'), /przeczytało prywatny plik, na który mu pozwoliłeś\./);
  assert.match(told(3, 'pl'), /przeczytało 3 prywatne pliki, na które mu pozwoliłeś\./);
  assert.match(words.render({ kind: 'clean', first: false, counts: { values: 1, reached: 0, told: 1 }, lang: 'en' }), /read a key/, 'a key still said first');
});
