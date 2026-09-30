import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { movedPage } from '../../../../src/report/start/projects/moved-page.ts';

const en = (text: string): string => `<span class="i18n" lang="en">${text}</span>`;

// which-project V14, amended 2026-09-28: what a page of a project shown earlier says, reached with "Back".
test('a page of the project before says which it was and which is shown now, with the way back and the way on', () => {
  const html = movedPage({ name: 'shop', place: '~/Projects/shop' }, { name: 'blog' }, 'http://127.0.0.1:43123/tok/index.html');
  assert.ok(html.includes(en('This page was for <strong>shop</strong>.')) && html.includes(en('agentwhy now shows <strong>blog</strong>. It shows one project at a time.')));
  assert.match(html, /<span class="js-only"><button type="button" class="pill pill-light pill-lg" data-moved-back>/, 'the way back needs a script');
  assert.match(html, /<a class="pill pill-outline pill-lg" href="http:\/\/127\.0\.0\.1:43123\/tok\/index\.html">.*Go to blog/, 'the way on is a link');
  assert.ok(html.includes(en('Turn on scripts in your browser to show shop again from here.')));
  assert.ok(html.includes('<span class="i18n" lang="pl">Ta strona była dla projektu <strong>shop</strong>.</span>'));
  assert.match(html, /fetch\('api\/switch-back'/, 'asked at the page’s own address');
});

test('a project’s name is escaped wherever the page writes it', () => {
  const html = movedPage({ name: '<img src=x>' }, { name: '"><b>' }, 'x');
  assert.doesNotMatch(html, /<img src=x>|"><b>/);
});
