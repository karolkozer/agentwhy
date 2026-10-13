// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { dayName, dayOf, monthName, rangeName, tileName, weekdayNames } from '../../../../src/report/render/ui/local-date.ts';

// The formatters of `local-date.ts` are made once and kept (2026-10-13: making one for every name was a third of the time
// the computer's pages took to be drawn again). Kept or not, a name is what a formatter made for it alone would say -
// asked here against one made on the spot, in each language, and asked twice, since the second answer is the kept one's.
const DAY = 86_400_000;
const LOCALES = { en: 'en-US', pl: 'pl-PL', de: 'de-DE' } as const;
const monday = dayOf(Math.floor(Date.UTC(2026, 8, 21) / DAY));
const nextWeek = dayOf(monday.number + 9);
const date = (number: number): Date => new Date(number * DAY);

test('a day, a tile, a range and a month are written as a formatter made for each would write them, however often asked', () => {
  for (const lang of ['en', 'pl', 'de'] as const) {
    const fresh = (options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => new Intl.DateTimeFormat(LOCALES[lang], { timeZone: 'UTC', ...options });
    for (const round of [1, 2]) {
      assert.equal(dayName(monday, lang), fresh({ weekday: 'short', month: 'short', day: 'numeric' }).format(date(monday.number)), `${lang}, asked ${round}`);
      const tile = fresh({ weekday: 'short', day: 'numeric' }).formatToParts(date(monday.number));
      assert.equal(tileName(monday, lang), tile.find((part) => part.type === 'weekday')?.value + ' ' + tile.find((part) => part.type === 'day')?.value);
      assert.equal(rangeName(monday, nextWeek, lang), fresh({ month: 'short', day: 'numeric' }).formatRange(date(monday.number), date(nextWeek.number)));
      const month = fresh({ month: 'long', year: 'numeric' }).format(date(monday.number));
      assert.equal(monthName(monday, lang), month.charAt(0).toLocaleUpperCase(LOCALES[lang]) + month.slice(1));
      assert.deepEqual(weekdayNames(lang), Array.from({ length: 7 }, (_unused, offset) => fresh({ weekday: 'short' }).format(new Date(Date.UTC(2024, 0, 1 + offset)))));
    }
  }
  // And in the words the pages are read in.
  assert.equal(dayName(monday, 'en'), 'Mon, Sep 21');
  assert.equal(tileName(monday, 'en'), 'Mon 21');
  assert.equal(monthName(monday, 'en'), 'September 2026');
  assert.deepEqual(weekdayNames('en'), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.equal(monthName(monday, 'pl').charAt(0), 'W', 'a month standing alone begins with a capital in Polish too');
  // One language's kept formatter is never handed to another.
  assert.notEqual(dayName(monday, 'pl'), dayName(monday, 'en'));
  assert.notEqual(dayName(monday, 'de'), dayName(monday, 'pl'));
});
